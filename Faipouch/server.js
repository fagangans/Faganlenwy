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
import { askFastest, cleanForTTS, textToSpeech } from "../WhatsApp/lib/voiceAI.js";
import { analyzeFile } from "../WhatsApp/lib/geminiFile.js";
import { openApp, controlVolume, getSystemStats } from "./systemControl.js";
import { searchFiles } from "./fileSearch.js";
import { parseCommand } from "./commandRouter.js";
import { getHistory, addMessage, getLastDocument, setLastDocument } from "./memory.js";

const PORT = process.env.FAIPOUCH_PORT || 5000;
const app = express();
app.use(express.json());

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

  /* Seluruh badan naga bergoyang pelan, sinkron dengan gelombang badan supaya terasa satu gerakan yang halus */
  .dragon-orbit { transform-origin: 150px 150px; animation: dragonSway 4.6s ease-in-out infinite; }
  @keyframes dragonSway { 0%, 100% { transform: rotate(-3deg) scale(1); } 50% { transform: rotate(3deg) scale(1.015); } }

  .dragon-flow { stroke-dasharray: 22 14; animation: dragonDash 2.4s linear infinite; }
  @keyframes dragonDash { to { stroke-dashoffset: -360; } }

  /* Kepala + leher menoleh jelas ke kanan dan ke kiri, bukan cuma naik-turun */
  .dragon-headturn { transform-origin: 150px 40px; animation: headTurn 4.6s ease-in-out infinite; }
  @keyframes headTurn { 0%, 100% { transform: translateX(-20px) rotate(-8deg); } 50% { transform: translateX(20px) rotate(8deg); } }
  .dragon-eye { animation: eyePulse 1.4s ease-in-out infinite; }
  @keyframes eyePulse { 0%, 100% { opacity: 0.55; } 50% { opacity: 1; } }

  /* Sayap besar mengepak dengan gerak rotate+scale supaya terlihat mengembang-melipat, bukan sekadar naik-turun */
  .wing-left, .wing-right { transform-origin: 150px 40px; }
  .wing-left { animation: flapLeft 1.1s ease-in-out infinite; }
  .wing-right { animation: flapRight 1.1s ease-in-out infinite; }
  @keyframes flapLeft { 0%, 100% { transform: rotate(0deg) scaleY(1); } 50% { transform: rotate(20deg) scaleY(0.45); } }
  @keyframes flapRight { 0%, 100% { transform: rotate(0deg) scaleY(1); } 50% { transform: rotate(-20deg) scaleY(0.45); } }

  .dragon-spike { animation: spikeGlow 2.2s ease-in-out infinite; }
  @keyframes spikeGlow { 0%, 100% { opacity: 0.65; } 50% { opacity: 1; } }

  /* Garis highlight bergerak sepanjang badan — kesan permukaan mengkilap/3D */
  .dragon-highlight { animation: dragonDash 2.4s linear infinite reverse; }

  /* Sisik berkedip halus, tiap sisik punya delay beda (inline style) supaya berkilau bergantian */
  .dragon-scale { animation: scaleShimmer 3s ease-in-out infinite; }
  @keyframes scaleShimmer { 0%, 100% { opacity: 0.35; } 50% { opacity: 0.85; } }

  .dragon-tail { transform-origin: 131px 42px; animation: tailSwish 2.4s ease-in-out infinite; }
  @keyframes tailSwish { 0%, 100% { transform: rotate(0deg); } 50% { transform: rotate(14deg); } }

  .dragon-spark { animation: sparkPulse 1.8s ease-in-out infinite; }
  @keyframes sparkPulse { 0%, 100% { opacity: 0; transform: scale(0.4); } 50% { opacity: 0.9; transform: scale(1.1); } }

  .stage-row { display: flex; align-items: center; justify-content: center; gap: 20px; width: 100%; margin-bottom: 24px; }

  .dragon-stage { position: relative; width: min(560px, 74vw); height: min(560px, 74vw); }
  .ambient-glow { position: absolute; inset: 16%; border-radius: 50%; background: radial-gradient(circle, rgba(0,217,255,0.28) 0%, rgba(0,217,255,0.06) 60%, transparent 80%); filter: blur(6px); z-index: 0; }
  .dragon-svg { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 1; pointer-events: none; overflow: visible; }

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

      <div class="dragon-stage">
        <div class="ambient-glow"></div>
        <svg class="dragon-svg" viewBox="0 0 300 300" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="dragonGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#00ffe1"/>
              <stop offset="50%" stop-color="#00aaff"/>
              <stop offset="100%" stop-color="#0055ff"/>
            </linearGradient>
            <filter id="dragonGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="blur"/>
              <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          </defs>

          <g class="dragon-orbit">
            <!-- glow bawah untuk kedalaman -->
            <path class="dragon-underglow" fill="none" stroke="url(#dragonGrad)" stroke-width="30" stroke-linecap="round" opacity="0.22" filter="url(#dragonGlow)"
                  d="M150,40 C210.75,40 260,89.25 260,150 C260,210.75 210.75,260 150,260 C89.25,260 40,210.75 40,150 C40,95 95,35 131,42">
              <animate attributeName="d" dur="4.6s" repeatCount="indefinite" calcMode="spline" keySplines="0.45 0 0.55 1;0.45 0 0.55 1"
                       values="M150,40 C210.75,40 260,89.25 260,150 C260,210.75 210.75,260 150,260 C89.25,260 40,210.75 40,150 C40,95 95,35 131,42;
                               M150,32 C216,32 268,84 268,150 C268,216 216,268 150,268 C84,268 32,216 32,150 C32,90 90,30 128,38;
                               M150,40 C210.75,40 260,89.25 260,150 C260,210.75 210.75,260 150,260 C89.25,260 40,210.75 40,150 C40,95 95,35 131,42"/>
            </path>

            <!-- badan utama — digemukin jadi badan bertubuh (bukan garis tipis) yang benar-benar berombak -->
            <path class="dragon-flow" fill="none" stroke="url(#dragonGrad)" stroke-width="17" stroke-linecap="round" filter="url(#dragonGlow)"
                  d="M150,40 C210.75,40 260,89.25 260,150 C260,210.75 210.75,260 150,260 C89.25,260 40,210.75 40,150 C40,95 95,35 131,42">
              <animate attributeName="d" dur="4.6s" repeatCount="indefinite" calcMode="spline" keySplines="0.45 0 0.55 1;0.45 0 0.55 1"
                       values="M150,40 C210.75,40 260,89.25 260,150 C260,210.75 210.75,260 150,260 C89.25,260 40,210.75 40,150 C40,95 95,35 131,42;
                               M150,32 C216,32 268,84 268,150 C268,216 216,268 150,268 C84,268 32,216 32,150 C32,90 90,30 128,38;
                               M150,40 C210.75,40 260,89.25 260,150 C260,210.75 210.75,260 150,260 C89.25,260 40,210.75 40,150 C40,95 95,35 131,42"/>
            </path>

            <!-- garis highlight bergerak di badan — kesan permukaan silinder mengkilap -->
            <path class="dragon-highlight" fill="none" stroke="#c8fbff" stroke-width="3" stroke-linecap="round" opacity="0.55" stroke-dasharray="26 70"
                  d="M150,40 C210.75,40 260,89.25 260,150 C260,210.75 210.75,260 150,260 C89.25,260 40,210.75 40,150 C40,95 95,35 131,42">
              <animate attributeName="d" dur="4.6s" repeatCount="indefinite" calcMode="spline" keySplines="0.45 0 0.55 1;0.45 0 0.55 1"
                       values="M150,40 C210.75,40 260,89.25 260,150 C260,210.75 210.75,260 150,260 C89.25,260 40,210.75 40,150 C40,95 95,35 131,42;
                               M150,32 C216,32 268,84 268,150 C268,216 216,268 150,268 C84,268 32,216 32,150 C32,90 90,30 128,38;
                               M150,40 C210.75,40 260,89.25 260,150 C260,210.75 210.75,260 150,260 C89.25,260 40,210.75 40,150 C40,95 95,35 131,42"/>
            </path>

            <!-- sisik di sepanjang badan -->
            <g class="dragon-scales" fill="url(#dragonGrad)" filter="url(#dragonGlow)">
              <polygon class="dragon-scale" points="-5,0 0,-9 5,0 0,9" transform="translate(262,170) rotate(10)" style="animation-delay:0s"/>
              <polygon class="dragon-scale" points="-5,0 0,-9 5,0 0,9" transform="translate(243,215) rotate(35)" style="animation-delay:.2s"/>
              <polygon class="dragon-scale" points="-5,0 0,-9 5,0 0,9" transform="translate(207,249) rotate(60)" style="animation-delay:.4s"/>
              <polygon class="dragon-scale" points="-5,0 0,-9 5,0 0,9" transform="translate(111,257) rotate(110)" style="animation-delay:.6s"/>
              <polygon class="dragon-scale" points="-5,0 0,-9 5,0 0,9" transform="translate(69,231) rotate(135)" style="animation-delay:.8s"/>
              <polygon class="dragon-scale" points="-5,0 0,-9 5,0 0,9" transform="translate(43,189) rotate(160)" style="animation-delay:1s"/>
              <polygon class="dragon-scale" points="-5,0 0,-9 5,0 0,9" transform="translate(51,93) rotate(210)" style="animation-delay:1.2s"/>
              <polygon class="dragon-scale" points="-5,0 0,-9 5,0 0,9" transform="translate(85,57) rotate(235)" style="animation-delay:1.4s"/>
            </g>

            <!-- duri tulang belakang di sepanjang lingkaran badan -->
            <polygon class="dragon-spike" points="252,100 268,116 250,122" fill="url(#dragonGrad)" filter="url(#dragonGlow)"/>
            <polygon class="dragon-spike" points="150,278 142,258 162,266" fill="url(#dragonGrad)" filter="url(#dragonGlow)"/>
            <polygon class="dragon-spike" points="20,150 40,142 30,166" fill="url(#dragonGrad)" filter="url(#dragonGlow)"/>
            <polygon class="dragon-spike" points="82,36 100,52 74,50" fill="url(#dragonGrad)" filter="url(#dragonGlow)"/>

            <!-- sirip ekor pendek, tetap dekat lingkaran -->
            <path class="dragon-tail" d="M131,42 C124,34 114,36 110,46 C118,50 126,49 131,42 Z" fill="url(#dragonGrad)" opacity="0.8" filter="url(#dragonGlow)"/>
            <circle class="dragon-spark" cx="110" cy="46" r="4" fill="#00ffcc" filter="url(#dragonGlow)"/>

            <!-- kaki depan dengan cakar -->
            <g class="dragon-leg">
              <path d="M118,66 C100,82 82,96 68,118" fill="none" stroke="url(#dragonGrad)" stroke-width="11" stroke-linecap="round" filter="url(#dragonGlow)"/>
              <polygon points="58,114 68,116 60,128" fill="url(#dragonGrad)" filter="url(#dragonGlow)"/>
              <polygon points="66,122 76,122 70,134" fill="url(#dragonGrad)" filter="url(#dragonGlow)"/>
              <polygon points="74,116 84,114 78,128" fill="url(#dragonGrad)" filter="url(#dragonGlow)"/>
            </g>
            <g class="dragon-leg">
              <path d="M182,66 C200,82 218,96 232,118" fill="none" stroke="url(#dragonGrad)" stroke-width="11" stroke-linecap="round" filter="url(#dragonGlow)"/>
              <polygon points="242,114 232,116 240,128" fill="url(#dragonGrad)" filter="url(#dragonGlow)"/>
              <polygon points="234,122 224,122 230,134" fill="url(#dragonGrad)" filter="url(#dragonGlow)"/>
              <polygon points="226,116 216,114 222,128" fill="url(#dragonGrad)" filter="url(#dragonGlow)"/>
            </g>

            <!-- sayap besar dengan tulang sayap, terpasang di pangkal leher -->
            <g class="wing-left">
              <path d="M150,40 C96,-4 34,10 8,52 C50,36 108,43 141,66 Z" fill="url(#dragonGrad)" opacity="0.5" filter="url(#dragonGlow)"/>
              <path class="wing-bone" d="M148,42 L60,26" fill="none" stroke="#c8fbff" stroke-width="1.4" opacity="0.5"/>
              <path class="wing-bone" d="M146,46 L38,44" fill="none" stroke="#c8fbff" stroke-width="1.4" opacity="0.5"/>
              <path class="wing-bone" d="M144,52 L24,64" fill="none" stroke="#c8fbff" stroke-width="1.4" opacity="0.5"/>
            </g>
            <g class="wing-right">
              <path d="M150,40 C204,-4 266,10 292,52 C250,36 192,43 159,66 Z" fill="url(#dragonGrad)" opacity="0.5" filter="url(#dragonGlow)"/>
              <path class="wing-bone" d="M152,42 L240,26" fill="none" stroke="#c8fbff" stroke-width="1.4" opacity="0.5"/>
              <path class="wing-bone" d="M154,46 L262,44" fill="none" stroke="#c8fbff" stroke-width="1.4" opacity="0.5"/>
              <path class="wing-bone" d="M156,52 L276,64" fill="none" stroke="#c8fbff" stroke-width="1.4" opacity="0.5"/>
            </g>

            <!-- kepala — bentuk tegas & besar dengan gigi, lubang hidung, alis; menoleh kanan & kiri -->
            <g class="dragon-headturn">
              <path d="M122,40 C110,10 122,-26 150,-52 C178,-26 190,10 178,40 Z" fill="url(#dragonGrad)" filter="url(#dragonGlow)"/>
              <path d="M136,-30 L118,-60 L142,-36 Z" fill="url(#dragonGrad)" filter="url(#dragonGlow)"/>
              <path d="M164,-30 L182,-60 L158,-36 Z" fill="url(#dragonGrad)" filter="url(#dragonGlow)"/>
              <line x1="130" y1="-42" x2="126" y2="-52" stroke="#001a22" stroke-width="1.2"/>
              <line x1="170" y1="-42" x2="174" y2="-52" stroke="#001a22" stroke-width="1.2"/>

              <!-- gigi di garis rahang -->
              <polygon points="128,40 132,49 136,40" fill="#001a22"/>
              <polygon points="140,40 144,50 148,40" fill="#001a22"/>
              <polygon points="152,40 156,50 160,40" fill="#001a22"/>
              <polygon points="164,40 168,49 172,40" fill="#001a22"/>

              <!-- lubang hidung -->
              <ellipse cx="141" cy="-45" rx="2.4" ry="4" fill="#001a22" transform="rotate(-15 141 -45)"/>
              <ellipse cx="159" cy="-45" rx="2.4" ry="4" fill="#001a22" transform="rotate(15 159 -45)"/>

              <!-- alis -->
              <path d="M122,-26 Q134,-36 146,-26" fill="none" stroke="#001a22" stroke-width="2"/>
              <path d="M154,-26 Q166,-36 178,-26" fill="none" stroke="#001a22" stroke-width="2"/>

              <circle class="dragon-eye" cx="134" cy="-18" r="6" fill="#00ffee" filter="url(#dragonGlow)"/>
              <circle class="dragon-eye" cx="166" cy="-18" r="6" fill="#00ffee" filter="url(#dragonGlow)"/>
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
