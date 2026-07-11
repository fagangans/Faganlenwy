// =====================================================================
//  Faipouch — JARVIS-style AI Dashboard (Iron Man HUD)
//
//  Jalankan:  node Faipouch/server.js
//  Port:      FAIPOUCH_PORT di .env (default 5000)
//  Buka:      http://localhost:5000
//
//  Endpoint:
//    POST /api/jarvis   — teks → deteksi perintah sistem ATAU tanya AI → jawab dengan audio
//    GET  /api/stats    — statistik sistem (CPU/RAM/uptime) untuk HUD real-time
//    GET  /api/health   — cek status server
// =====================================================================

import "dotenv/config";
import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { askFastest, cleanForTTS, textToSpeech } from "../WhatsApp/lib/voiceAI.js";
import { analyzeFile } from "../WhatsApp/lib/geminiFile.js";
import { openApp, controlVolume, getSystemStats } from "./systemControl.js";
import { searchFiles } from "./fileSearch.js";
import { parseCommand } from "./commandRouter.js";
import { getHistory, addMessage, getLastDocument, setLastDocument } from "./memory.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROBOT_IMAGE_PATH = path.join(__dirname, "public", "robot.png");

const PORT = process.env.FAIPOUCH_PORT || 5000;
const app = express();
app.use(express.json());
app.use("/public", express.static(path.join(__dirname, "public")));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB, sama seperti batas Gemini inline
});

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Expose-Headers", "X-Answer, X-Type, X-Reminder-Delay, X-Reminder-Message");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// ---- GET /api/health ----
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", name: "Faipouch", ai: "Ai4Chat + PublicAI", tts: "Edge Neural TTS" });
});

// ---- GET /api/stats — dipoll HUD tiap beberapa detik untuk gauge CPU/RAM ----
app.get("/api/stats", async (req, res) => {
  try {
    const stats = await getSystemStats();
    res.json({ ok: true, ...stats });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Susun teks jawaban untuk setiap jenis perintah sistem
async function handleSystemCommand(cmd) {
  switch (cmd.type) {
    case "open_app": {
      const result = await openApp(cmd.payload);
      return result.message;
    }
    case "volume_up":
      return (await controlVolume("up")).message;
    case "volume_down":
      return (await controlVolume("down")).message;
    case "volume_mute":
      return (await controlVolume("mute")).message;
    case "system_stats": {
      const s = await getSystemStats();
      return `CPU sedang di ${s.cpuLoad} persen, RAM terpakai ${s.usedMemGB} dari ${s.totalMemGB} gigabyte, sekitar ${s.memPercent} persen. Sistem sudah menyala ${s.uptimeMin} menit.`;
    }
    case "search_file": {
      const results = searchFiles(cmd.payload);
      if (!results.length) return `Tidak ketemu file yang mengandung "${cmd.payload}" di folder Documents, Downloads, atau Desktop.`;
      const names = results.map((p) => p.split(/[\\/]/).pop());
      return `Ketemu ${results.length} file: ${names.join(", ")}.`;
    }
    case "reminder": {
      const { amount, unit } = cmd.payload;
      return `Baik, saya akan ingatkan dalam ${amount} ${unit}.`;
    }
    default:
      return null;
  }
}

// ---- POST /api/jarvis ----
// Body JSON: { question: "...", voice: "id", rate: "+15%" }
// Response: audio/mpeg langsung, header X-Answer = teks jawaban, X-Type = jenis perintah
app.post("/api/jarvis", async (req, res) => {
  const { question, voice = "id", rate = "+15%" } = req.body || {};

  if (!question?.trim()) {
    return res.status(400).json({ ok: false, error: "Field 'question' wajib diisi." });
  }

  console.log(`[Faipouch] Input: "${question}"`);

  const cmd = parseCommand(question);
  let answer;

  if (cmd.type === "screenshot_analyze") {
    // Screenshot cuma bisa diambil dari browser (getDisplayMedia) — server cuma
    // kasih tahu client untuk memicu capture, analisisnya terjadi di /api/screenshot.
    answer = "Baik, saya lihat layarnya sekarang.";
  } else if (cmd.type !== "chat") {
    // Perintah sistem — eksekusi langsung, tidak lewat AI
    console.log(`[Faipouch] Terdeteksi perintah: ${cmd.type}`);
    answer = await handleSystemCommand(cmd);
  } else {
    // Obrolan biasa — teruskan ke AI, dengan konteks memori persisten + dokumen terakhir
    const startAI = Date.now();
    const history = getHistory();
    const lastDoc = getLastDocument();

    let context = "";
    if (history.length) {
      context = "\n\nRiwayat percakapan sebelumnya:\n" +
        history.map((h) => `${h.role === "user" ? "User" : "Kamu"}: ${h.text}`).join("\n") + "\n\n";
    }
    if (lastDoc) {
      context += `Dokumen yang baru saja di-upload user ("${lastDoc.fileName}"):\n${lastDoc.summary}\n\n`;
    }

    try {
      answer = await askFastest(context + question);
    } catch (err) {
      return res.status(502).json({ ok: false, error: err.message });
    }
    addMessage("user", question);
    addMessage("assistant", answer);
    console.log(`[Faipouch] Jawaban AI (${Date.now() - startAI}ms)`);
  }

  console.log(`[Faipouch] Respons: "${answer.slice(0, 80)}..."`);

  try {
    const audioBuffer = await textToSpeech(cleanForTTS(answer), voice, rate);

    const headers = {
      "Content-Type": "audio/mpeg",
      "X-Answer": encodeURIComponent(answer.slice(0, 500)),
      "X-Type": cmd.type,
    };

    if (cmd.type === "reminder") {
      headers["X-Reminder-Delay"] = String(cmd.payload.delayMs);
      headers["X-Reminder-Message"] = encodeURIComponent(cmd.payload.message);
    }

    res.set(headers);
    res.send(audioBuffer);
  } catch (err) {
    console.error("[Faipouch] TTS gagal:", err.message);
    res.status(500).json({ ok: false, error: "Gagal membuat suara: " + err.message });
  }
});

// ---- POST /api/speak — teks langsung jadi audio, TANPA lewat AI ----
// Dipakai untuk baca clipboard verbatim & bunyikan reminder saat waktunya tiba.
// Body JSON: { text: "...", voice: "id", rate: "+15%" }
app.post("/api/speak", async (req, res) => {
  const { text, voice = "id", rate = "+15%" } = req.body || {};

  if (!text?.trim()) {
    return res.status(400).json({ ok: false, error: "Field 'text' wajib diisi." });
  }

  try {
    const audioBuffer = await textToSpeech(cleanForTTS(text), voice, rate);
    res.set({ "Content-Type": "audio/mpeg", "X-Answer": encodeURIComponent(text.slice(0, 500)) });
    res.send(audioBuffer);
  } catch (err) {
    console.error("[Faipouch] Speak gagal:", err.message);
    res.status(500).json({ ok: false, error: "Gagal membuat suara: " + err.message });
  }
});

// ---- POST /api/screenshot — gambar layar (dari getDisplayMedia) → dianalisis Gemini Vision ----
app.post("/api/screenshot", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: "Tidak ada gambar yang dikirim." });

  const { voice = "id", rate = "+15%" } = req.body || {};

  try {
    const description = await analyzeFile(
      req.file.buffer,
      req.file.mimetype || "image/png",
      "Jelaskan apa yang terlihat di screenshot ini secara singkat dan natural dalam Bahasa Indonesia, seolah kamu asisten yang sedang melihat layar user. Fokus ke hal yang paling relevan/menonjol, maksimal 4 kalimat."
    );

    if (!description) return res.status(502).json({ ok: false, error: "Gemini tidak memberikan hasil analisis." });

    addMessage("user", "[Screenshot layar]");
    addMessage("assistant", description);

    const audioBuffer = await textToSpeech(cleanForTTS(description), voice, rate);
    res.set({ "Content-Type": "audio/mpeg", "X-Answer": encodeURIComponent(description.slice(0, 500)) });
    res.send(audioBuffer);
  } catch (err) {
    console.error("[Faipouch] Screenshot analysis gagal:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---- POST /api/upload — PDF/gambar/dokumen → diringkas Gemini, disimpan sebagai konteks ----
app.post("/api/upload", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: "Tidak ada file yang di-upload." });

  const { voice = "id", rate = "+15%" } = req.body || {};
  const fileName = req.file.originalname || "dokumen";
  const mimeType = req.file.mimetype || "application/octet-stream";

  console.log(`[Faipouch] Upload: ${fileName} (${mimeType}, ${Math.round(req.file.size / 1024)} KB)`);

  try {
    const summary = await analyzeFile(
      req.file.buffer,
      mimeType,
      "Ringkas isi dokumen/file ini dalam Bahasa Indonesia secara jelas dan padat (maksimal 6 kalimat), supaya bisa dipakai sebagai konteks untuk menjawab pertanyaan lanjutan tentang dokumen ini."
    );

    if (!summary) return res.status(502).json({ ok: false, error: "Gemini tidak bisa membaca file ini." });

    setLastDocument(fileName, summary);

    const spoken = `File "${fileName}" sudah saya baca. ${summary}`;
    addMessage("user", `[Upload file: ${fileName}]`);
    addMessage("assistant", spoken);

    const audioBuffer = await textToSpeech(cleanForTTS(spoken), voice, rate);
    res.set({ "Content-Type": "audio/mpeg", "X-Answer": encodeURIComponent(spoken.slice(0, 500)) });
    res.send(audioBuffer);
  } catch (err) {
    console.error("[Faipouch] Upload analysis gagal:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---- GET / — dashboard HUD ----
app.get("/", (req, res) => {
  res.send(HTML_PAGE);
});

const HTML_PAGE = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Faipouch</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Segoe UI', system-ui, sans-serif;
    background: radial-gradient(ellipse at center, #051318 0%, #000806 70%, #000 100%);
    color: #7ee8ff;
    min-height: 100vh;
    overflow-x: hidden;
    display: flex;
    justify-content: center;
    padding: 24px 16px;
  }

  .app-layout { display: flex; gap: 28px; width: 100%; max-width: 900px; align-items: flex-start; justify-content: center; flex-wrap: wrap; }
  .main-stage { flex: 1 1 480px; max-width: 560px; display: flex; flex-direction: column; align-items: center; }

  .title { font-size: 1.6rem; letter-spacing: 6px; color: #7ee8ff; text-shadow: 0 0 12px #00d9ff; margin-bottom: 4px; }
  .subtitle { font-size: 0.75rem; letter-spacing: 3px; color: #2a7a8c; margin-bottom: 32px; text-transform: uppercase; }

  .stage-row { display: flex; align-items: center; justify-content: center; gap: 20px; width: 100%; margin-bottom: 24px; }

  .robot-stage { position: relative; width: min(480px, 68vw); height: min(480px, 68vw); display: flex; align-items: center; justify-content: center; }
  .ambient-glow { position: absolute; inset: 8%; border-radius: 50%; background: radial-gradient(circle, rgba(0,217,255,0.28) 0%, rgba(0,217,255,0.06) 60%, transparent 80%); filter: blur(6px); z-index: 0; }

  /* Bingkai potret robot — hasil gambar AI (statis), cuma "napas" pelan */
  .robot-frame {
    position: relative; width: 78%; height: 78%; border-radius: 50%; overflow: hidden; z-index: 1;
    border: 2px solid #0d9fc2; box-shadow: 0 0 40px rgba(0,217,255,0.4), 0 0 0 8px rgba(0,217,255,0.06);
    animation: robotBreathe 4.5s ease-in-out infinite;
  }
  @keyframes robotBreathe { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.02); } }
  .robot-frame img { width: 100%; height: 100%; object-fit: cover; display: block; }

  .robot-fallback {
    width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center;
    background: rgba(0, 20, 26, 0.6); text-align: center; padding: 20px;
  }
  .fallback-icon { font-size: 3rem; margin-bottom: 12px; }
  .fallback-text { font-size: 0.72rem; color: #7ee8ff; line-height: 1.6; }
  .fallback-text code { background: rgba(0,217,255,0.15); padding: 2px 6px; border-radius: 4px; font-size: 0.68rem; }

  /* Lengan hologram — proyeksi vector di samping potret, gerak nyata saat AI menjelaskan/menjawab */
  .holo-arm { position: absolute; width: 42%; height: 42%; z-index: 2; pointer-events: none; opacity: 0.5; transition: opacity .4s; }
  .holo-arm-right { right: -4%; bottom: 6%; }
  .holo-arm-group { transform-origin: 20px 150px; transition: transform .4s ease-out; }
  .holo-forearm { transform-origin: 80px 110px; transition: transform .4s ease-out; }

  .robot-stage.speaking .holo-arm-right { opacity: 1; }
  .robot-stage.speaking .holo-arm-right .holo-arm-group { animation: gestureArm 1.6s ease-in-out infinite; }
  .robot-stage.speaking .holo-arm-right .holo-forearm { animation: gestureForearm 1.6s ease-in-out infinite; }
  @keyframes gestureArm { 0%, 100% { transform: rotate(0deg); } 50% { transform: rotate(-14deg); } }
  @keyframes gestureForearm { 0%, 100% { transform: rotate(0deg); } 50% { transform: rotate(-20deg); } }

  /* Mic kecil di samping kiri — cuma untuk trigger bicara, panggung utama tetap naga */
  .core {
    flex: 0 0 auto; width: 64px; height: 64px; border-radius: 50%;
    background: radial-gradient(circle, #00d9ff 0%, #007a99 40%, #001a22 90%);
    box-shadow: 0 0 22px #00d9ff, 0 0 30px #0099bb inset;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; transition: all .3s;
  }
  .core.listening { animation: pulse 0.8s infinite; box-shadow: 0 0 34px #00ffcc, 0 0 40px #00d9ff inset; }
  .core.thinking { background: radial-gradient(circle, #ffaa00 0%, #995500 40%, #221100 90%); box-shadow: 0 0 60px #ffaa00; }
  @keyframes pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.06); } }
  .core-icon { font-size: 1.5rem; }

  .status-text { font-size: 0.85rem; color: #7ee8ff; margin-bottom: 24px; min-height: 20px; text-align: center; text-shadow: 0 0 6px #00d9ff; }
  .status-text.error { color: #ff5566; text-shadow: 0 0 6px #ff5566; }

  .hud-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; width: 100%; margin-bottom: 20px; }
  .hud-panel {
    background: rgba(0, 30, 40, 0.4); border: 1px solid #0d5f73; border-radius: 8px;
    padding: 12px 16px; backdrop-filter: blur(4px);
  }
  .hud-label { font-size: 0.65rem; color: #4a9bb0; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 6px; }
  .hud-value { font-size: 1.3rem; color: #00d9ff; text-shadow: 0 0 8px #00d9ff; font-weight: 300; }
  .hud-bar { height: 4px; background: #0d2a30; border-radius: 2px; margin-top: 8px; overflow: hidden; }
  .hud-bar-fill { height: 100%; background: linear-gradient(90deg, #00d9ff, #00ffcc); transition: width .5s; }

  .transcript {
    width: 100%; max-height: 200px; overflow-y: auto;
    background: rgba(0, 15, 20, 0.5); border: 1px solid #0d5f73; border-radius: 8px; padding: 14px;
    font-size: 0.82rem; line-height: 1.6; color: #a8dcea;
  }
  .transcript .you { color: #00ffcc; }
  .transcript .ai { color: #7ee8ff; }

  /* Panel pengaturan — dipatok ke tepi kanan layar, terpisah dari stage utama */
  .side-panel {
    width: 220px; background: rgba(0, 20, 26, 0.45); border: 1px solid #0d5f73;
    border-radius: 10px; padding: 18px; backdrop-filter: blur(4px);
  }
  .side-panel h3 { font-size: 0.72rem; letter-spacing: 2px; color: #4a9bb0; text-transform: uppercase; margin-bottom: 16px; }
  .setting-group { margin-bottom: 18px; }
  .setting-group label { display: block; font-size: 0.72rem; color: #7ee8ff; margin-bottom: 6px; }
  .setting-group select, .setting-group input[type=range] { width: 100%; }
  .toggle-row { display: flex; align-items: center; justify-content: space-between; }
  .toggle-row label { margin-bottom: 0; }

  select, input[type=range] { background: rgba(0,20,26,0.6); color: #7ee8ff; border: 1px solid #0d5f73; border-radius: 6px; padding: 8px; font-size: 0.8rem; }
  input[type=checkbox] { width: 18px; height: 18px; accent-color: #00d9ff; }
  input[type=file] { width: 100%; font-size: 0.7rem; color: #7ee8ff; background: rgba(0,20,26,0.6); border: 1px dashed #0d5f73; border-radius: 6px; padding: 8px; }
  .feature-hint { font-size: 0.65rem; color: #4a9bb0; margin-top: 6px; line-height: 1.4; }
  button { width: 100%; padding: 9px; background: rgba(0,217,255,0.12); color: #7ee8ff; border: 1px solid #0d5f73; border-radius: 6px; font-size: 0.78rem; cursor: pointer; transition: background .2s; margin-top: 8px; }
  button:hover { background: rgba(0,217,255,0.25); }

  audio { display: none; }

  @media (min-width: 821px) {
    .side-panel { position: fixed; top: 50%; right: 24px; transform: translateY(-50%); z-index: 5; }
  }

  @media (max-width: 820px) {
    .app-layout { flex-direction: column; align-items: center; }
    .side-panel { width: 100%; max-width: 560px; }
  }
</style>
</head>
<body>

<div class="app-layout">
  <div class="main-stage">
    <div class="title">F A I P O U C H</div>
    <div class="subtitle">Personal AI Interface</div>

    <div class="stage-row">
      <div class="core" id="core" onclick="toggleListen()">
        <span class="core-icon" id="coreIcon">🎙️</span>
      </div>

      <div class="robot-stage" id="robotStage">
        <div class="ambient-glow"></div>

        <div class="robot-frame">
          <img src="/public/robot.png" alt="Faipouch Robot" id="robotImg"
               onerror="this.style.display='none'; document.getElementById('robotFallback').style.display='flex';">
          <div class="robot-fallback" id="robotFallback" style="display:none;">
            <div class="fallback-icon">🤖</div>
            <div class="fallback-text">Gambar robot belum ada.<br>Jalankan sekali:<br><code>node Faipouch/generateRobot.js</code></div>
          </div>
        </div>

        <!-- lengan hologram — bergerak nyata saat AI sedang menjelaskan/menjawab -->
        <svg class="holo-arm holo-arm-right" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="holoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#00ffe1"/>
              <stop offset="100%" stop-color="#0055ff"/>
            </linearGradient>
            <filter id="holoGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2.5" result="blur"/>
              <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          </defs>

          <g class="holo-arm-group">
            <circle cx="20" cy="150" r="6" fill="url(#holoGrad)" filter="url(#holoGlow)"/>
            <line x1="20" y1="150" x2="80" y2="110" stroke="url(#holoGrad)" stroke-width="10" stroke-linecap="round" filter="url(#holoGlow)" opacity="0.75"/>

            <g class="holo-forearm">
              <circle cx="80" cy="110" r="5" fill="url(#holoGrad)" filter="url(#holoGlow)"/>
              <line x1="80" y1="110" x2="130" y2="70" stroke="url(#holoGrad)" stroke-width="8" stroke-linecap="round" filter="url(#holoGlow)" opacity="0.75"/>
              <circle cx="130" cy="70" r="7" fill="url(#holoGrad)" filter="url(#holoGlow)" opacity="0.8"/>
              <line x1="130" y1="70" x2="150" y2="58" stroke="url(#holoGrad)" stroke-width="3" stroke-linecap="round" filter="url(#holoGlow)" opacity="0.7"/>
              <line x1="130" y1="70" x2="152" y2="68" stroke="url(#holoGrad)" stroke-width="3" stroke-linecap="round" filter="url(#holoGlow)" opacity="0.7"/>
              <line x1="130" y1="70" x2="148" y2="80" stroke="url(#holoGrad)" stroke-width="3" stroke-linecap="round" filter="url(#holoGlow)" opacity="0.7"/>
            </g>
          </g>
        </svg>
      </div>
    </div>

    <div class="status-text" id="status">Klik mic untuk berbicara</div>

    <div class="hud-grid">
      <div class="hud-panel">
        <div class="hud-label">CPU Load</div>
        <div class="hud-value" id="cpuVal">--%</div>
        <div class="hud-bar"><div class="hud-bar-fill" id="cpuBar" style="width:0%"></div></div>
      </div>
      <div class="hud-panel">
        <div class="hud-label">Memory</div>
        <div class="hud-value" id="ramVal">--%</div>
        <div class="hud-bar"><div class="hud-bar-fill" id="ramBar" style="width:0%"></div></div>
      </div>
      <div class="hud-panel">
        <div class="hud-label">Uptime</div>
        <div class="hud-value" id="uptimeVal">-- min</div>
      </div>
    </div>

    <div class="transcript" id="transcript">
      <span class="ai">Faipouch online. Menunggu perintah...</span>
    </div>
  </div>

  <aside class="side-panel">
    <h3>Pengaturan</h3>

    <div class="setting-group">
      <label>Suara AI</label>
      <select id="voiceSelect">
        <option value="id">Pria Indonesia</option>
        <option value="id-female">Wanita Indonesia</option>
        <option value="en">Inggris</option>
      </select>
    </div>

    <div class="setting-group">
      <label>Kecepatan Bicara: <span id="rateVal">+15%</span></label>
      <input type="range" id="rateSlider" min="0" max="50" value="15" step="5" oninput="document.getElementById('rateVal').textContent = '+' + this.value + '%'">
    </div>

    <div class="setting-group">
      <label>Bahasa Mikrofon</label>
      <select id="langSelect">
        <option value="id-ID">Indonesia</option>
        <option value="en-US">English</option>
      </select>
    </div>

    <div class="setting-group toggle-row">
      <label>Percakapan Berkelanjutan</label>
      <input type="checkbox" id="continuousToggle">
    </div>

    <div class="setting-group">
      <button onclick="clearTranscript()">Bersihkan Log</button>
    </div>

    <h3 style="margin-top: 8px;">Fitur</h3>

    <div class="setting-group">
      <label>Upload Dokumen (PDF/Gambar)</label>
      <input type="file" id="fileInput" accept=".pdf,image/*,.txt,.doc,.docx" onchange="uploadFile()">
      <div class="feature-hint" id="uploadHint">Tanya AI setelah upload, mis. "apa isi dokumennya?"</div>
    </div>

    <div class="setting-group">
      <button onclick="captureScreenshot()">📷 Lihat Layar (Screenshot)</button>
    </div>

    <div class="setting-group">
      <button onclick="readClipboard()">📋 Bacakan Clipboard</button>
    </div>
  </aside>
</div>

<audio id="player"></audio>

<script>
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition, isListening = false;

function setStatus(msg, isError = false) {
  document.getElementById('status').textContent = msg;
  document.getElementById('status').className = 'status-text' + (isError ? ' error' : '');
}

function setCoreState(state) {
  const core = document.getElementById('core');
  const icon = document.getElementById('coreIcon');
  core.className = 'core' + (state ? ' ' + state : '');
  icon.textContent = state === 'listening' ? '🔴' : state === 'thinking' ? '⚡' : '🎙️';
}

function addTranscript(who, text) {
  const box = document.getElementById('transcript');
  const line = document.createElement('span');
  line.className = who === 'you' ? 'you' : 'ai';
  line.style.display = 'block';
  line.style.marginBottom = '10px';
  line.textContent = (who === 'you' ? '> ' : '⚡ ') + text;
  box.appendChild(line);
  box.scrollTop = box.scrollHeight;
}

function clearTranscript() {
  document.getElementById('transcript').innerHTML = '<span class="ai">Log dibersihkan.</span>';
}

function toggleListen() {
  if (!SpeechRecognition) { setStatus('❌ Browser tidak support. Gunakan Chrome/Edge.', true); return; }
  isListening ? stopListen() : startListen();
}

function startListen() {
  recognition = new SpeechRecognition();
  recognition.lang = document.getElementById('langSelect').value;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    isListening = true;
    setCoreState('listening');
    setStatus('🔴 Mendengarkan...');
  };

  recognition.onresult = async (e) => {
    const question = e.results[0][0].transcript;
    addTranscript('you', question);
    await askJarvis(question);
  };

  recognition.onerror = (e) => { setStatus('❌ Error mikrofon: ' + e.error, true); resetCore(); };
  recognition.onend = () => { if (isListening) resetCore(); };

  recognition.start();
}

function stopListen() { isListening = false; recognition?.stop(); resetCore(); }
function resetCore() { isListening = false; setCoreState(''); }

async function askJarvis(question) {
  setCoreState('thinking');
  setStatus('⚡ Memproses...');

  const voice = document.getElementById('voiceSelect').value;
  const rate = '+' + document.getElementById('rateSlider').value + '%';
  const player = document.getElementById('player');

  try {
    const res = await fetch('/api/jarvis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, voice, rate })
    });

    if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Server error'); }

    const answerText = decodeURIComponent(res.headers.get('X-Answer') || '');
    const type = res.headers.get('X-Type');
    addTranscript('ai', answerText);

    const blob = await res.blob();
    player.src = URL.createObjectURL(blob);
    player.play();

    if (type === 'reminder') {
      const delayMs = parseInt(res.headers.get('X-Reminder-Delay') || '0', 10);
      const message = decodeURIComponent(res.headers.get('X-Reminder-Message') || 'waktunya!');
      if (delayMs > 0) scheduleReminder(delayMs, message);
    }

    if (type === 'screenshot_analyze') {
      player.addEventListener('ended', () => captureScreenshot(), { once: true });
    }

    setStatus('✅ Klik core untuk bicara lagi');
  } catch (err) {
    setStatus('❌ ' + err.message, true);
  } finally {
    resetCore();
  }
}

// Jadwalkan reminder — timer berjalan di browser, bunyi lewat /api/speak saat waktunya tiba.
// Catatan: tab Faipouch harus tetap terbuka supaya reminder ini bunyi.
function scheduleReminder(delayMs, message) {
  addTranscript('ai', '⏰ Reminder dijadwalkan: "' + message + '" dalam ' + Math.round(delayMs / 1000) + ' detik.');
  setTimeout(async () => {
    addTranscript('ai', '⏰ ' + message);
    await speakText('Waktunya! ' + message);
  }, delayMs);
}

// Bunyikan teks langsung tanpa lewat AI (dipakai reminder & baca clipboard)
async function speakText(text) {
  const voice = document.getElementById('voiceSelect').value;
  const rate = '+' + document.getElementById('rateSlider').value + '%';
  const player = document.getElementById('player');

  const res = await fetch('/api/speak', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice, rate })
  });

  if (!res.ok) return;
  const blob = await res.blob();
  player.src = URL.createObjectURL(blob);
  player.play();
}

// Baca isi clipboard dengan suara (butuh izin browser saat pertama kali dipakai)
async function readClipboard() {
  try {
    const text = await navigator.clipboard.readText();
    if (!text?.trim()) { setStatus('📋 Clipboard kosong.', true); return; }
    addTranscript('you', '[Baca clipboard]');
    addTranscript('ai', text.slice(0, 300));
    await speakText(text);
  } catch (err) {
    setStatus('❌ Tidak bisa akses clipboard: ' + err.message, true);
  }
}

// Ambil screenshot layar (browser akan minta izin pilih layar/window) lalu kirim ke AI Vision
async function captureScreenshot() {
  setStatus('📷 Pilih layar/jendela yang mau di-screenshot...');
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    const track = stream.getVideoTracks()[0];
    const capture = new ImageCapture(track);
    const bitmap = await capture.grabFrame();
    track.stop();

    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d').drawImage(bitmap, 0, 0);

    setCoreState('thinking');
    setStatus('⚡ Menganalisis layar...');

    canvas.toBlob(async (blob) => {
      const form = new FormData();
      form.append('file', blob, 'screenshot.png');
      form.append('voice', document.getElementById('voiceSelect').value);
      form.append('rate', '+' + document.getElementById('rateSlider').value + '%');

      const res = await fetch('/api/screenshot', { method: 'POST', body: form });
      resetCore();

      if (!res.ok) { const err = await res.json(); setStatus('❌ ' + err.error, true); return; }

      const answerText = decodeURIComponent(res.headers.get('X-Answer') || '');
      addTranscript('you', '[Screenshot]');
      addTranscript('ai', answerText);

      const audioBlob = await res.blob();
      const player = document.getElementById('player');
      player.src = URL.createObjectURL(audioBlob);
      player.play();
      setStatus('✅ Klik core untuk bicara lagi');
    }, 'image/png');
  } catch (err) {
    resetCore();
    setStatus('❌ Screenshot dibatalkan atau gagal: ' + err.message, true);
  }
}

// Upload dokumen (PDF/gambar/dll), diringkas AI dan disimpan sebagai konteks obrolan
async function uploadFile() {
  const input = document.getElementById('fileInput');
  const file = input.files[0];
  if (!file) return;

  setCoreState('thinking');
  setStatus('⚡ Membaca "' + file.name + '"...');

  const form = new FormData();
  form.append('file', file);
  form.append('voice', document.getElementById('voiceSelect').value);
  form.append('rate', '+' + document.getElementById('rateSlider').value + '%');

  try {
    const res = await fetch('/api/upload', { method: 'POST', body: form });
    resetCore();

    if (!res.ok) { const err = await res.json(); setStatus('❌ ' + err.error, true); return; }

    const answerText = decodeURIComponent(res.headers.get('X-Answer') || '');
    addTranscript('you', '[Upload: ' + file.name + ']');
    addTranscript('ai', answerText);

    const audioBlob = await res.blob();
    const player = document.getElementById('player');
    player.src = URL.createObjectURL(audioBlob);
    player.play();
    setStatus('✅ Dokumen siap ditanya. Klik core untuk bertanya.');
  } catch (err) {
    resetCore();
    setStatus('❌ Upload gagal: ' + err.message, true);
  } finally {
    input.value = '';
  }
}

// Mode percakapan berkelanjutan: setelah AI selesai bicara, mikrofon otomatis aktif lagi
document.getElementById('player').addEventListener('ended', () => {
  if (document.getElementById('continuousToggle').checked) {
    startListen();
  }
});

// Lengan hologram bergerak selama AI sedang bicara (menjelaskan/menjawab)
const robotStageEl = document.getElementById('robotStage');
document.getElementById('player').addEventListener('play', () => robotStageEl.classList.add('speaking'));
document.getElementById('player').addEventListener('pause', () => robotStageEl.classList.remove('speaking'));
document.getElementById('player').addEventListener('ended', () => robotStageEl.classList.remove('speaking'));

async function refreshStats() {
  try {
    const res = await fetch('/api/stats');
    const s = await res.json();
    if (!s.ok) return;
    document.getElementById('cpuVal').textContent = s.cpuLoad + '%';
    document.getElementById('cpuBar').style.width = s.cpuLoad + '%';
    document.getElementById('ramVal').textContent = s.memPercent + '%';
    document.getElementById('ramBar').style.width = s.memPercent + '%';
    document.getElementById('uptimeVal').textContent = s.uptimeMin + ' min';
  } catch {}
}

refreshStats();
setInterval(refreshStats, 5000);
</script>
</body>
</html>`;

app.listen(PORT, () => {
  console.log(`\n⚡ Faipouch JARVIS Dashboard jalan di http://localhost:${PORT}`);
  console.log(`🤖 Ai4Chat + PublicAI (tanpa API key) + Edge Neural TTS`);
  console.log(`🖥️  Kontrol sistem: buka app, cek CPU/RAM, atur volume`);
});
