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
import { askFastest, cleanForTTS, textToSpeech } from "../WhatsApp/lib/voiceAI.js";
import { openApp, controlVolume, getSystemStats } from "./systemControl.js";
import { parseCommand } from "./commandRouter.js";

const PORT = process.env.FAIPOUCH_PORT || 5000;
const app = express();
app.use(express.json());

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
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

  if (cmd.type !== "chat") {
    // Perintah sistem — eksekusi langsung, tidak lewat AI
    console.log(`[Faipouch] Terdeteksi perintah: ${cmd.type}`);
    answer = await handleSystemCommand(cmd);
  } else {
    // Obrolan biasa — teruskan ke AI
    const startAI = Date.now();
    try {
      answer = await askFastest(question);
    } catch (err) {
      return res.status(502).json({ ok: false, error: err.message });
    }
    console.log(`[Faipouch] Jawaban AI (${Date.now() - startAI}ms)`);
  }

  console.log(`[Faipouch] Respons: "${answer.slice(0, 80)}..."`);

  try {
    const audioBuffer = await textToSpeech(cleanForTTS(answer), voice, rate);

    res.set({
      "Content-Type": "audio/mpeg",
      "X-Answer": encodeURIComponent(answer.slice(0, 500)),
      "X-Type": cmd.type,
    });
    res.send(audioBuffer);
  } catch (err) {
    console.error("[Faipouch] TTS gagal:", err.message);
    res.status(500).json({ ok: false, error: "Gagal membuat suara: " + err.message });
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

  .core-wrap { position: relative; width: 260px; height: 260px; margin-bottom: 32px; }

  .dragon-svg { position: absolute; width: 360px; height: 360px; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 0; pointer-events: none; overflow: visible; }
  .dragon-flow { stroke-dasharray: 18 10; animation: dragonFlow 2.4s linear infinite; }
  @keyframes dragonFlow { to { stroke-dashoffset: -280; } }
  .dragon-head { animation: headBob 4s ease-in-out infinite; transform-origin: 150px 10px; }
  @keyframes headBob { 0%, 100% { transform: translateY(0) rotate(0deg); } 50% { transform: translateY(-5px) rotate(3deg); } }
  .dragon-eye { animation: eyePulse 1.6s ease-in-out infinite; }
  @keyframes eyePulse { 0%, 100% { opacity: 0.55; } 50% { opacity: 1; } }
  .wing-left, .wing-right { transform-origin: 150px 10px; }
  .wing-left { animation: flapLeft 1.4s ease-in-out infinite; }
  .wing-right { animation: flapRight 1.4s ease-in-out infinite; }
  @keyframes flapLeft { 0%, 100% { transform: scaleY(1) rotate(0deg); } 50% { transform: scaleY(0.55) rotate(10deg); } }
  @keyframes flapRight { 0%, 100% { transform: scaleY(1) rotate(0deg); } 50% { transform: scaleY(0.55) rotate(-10deg); } }
  .dragon-spark { animation: sparkPulse 1.8s ease-in-out infinite; }
  @keyframes sparkPulse { 0%, 100% { opacity: 0; transform: scale(0.4); } 50% { opacity: 0.9; transform: scale(1.1); } }

  .ring { position: absolute; border-radius: 50%; border: 1px solid #0d5f73; top: 0; left: 0; right: 0; bottom: 0; z-index: 1; }
  .ring1 { animation: spin 12s linear infinite; border-top-color: #00d9ff; border-right-color: #00d9ff; }
  .ring2 { inset: 20px; animation: spin 8s linear infinite reverse; border-bottom-color: #00d9ff; }
  .ring3 { inset: 40px; animation: spin 16s linear infinite; border-left-color: #00d9ff; border-top-color: #00d9ff; }
  @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

  .core {
    position: absolute; inset: 70px; border-radius: 50%; z-index: 2;
    background: radial-gradient(circle, #00d9ff 0%, #007a99 40%, #001a22 90%);
    box-shadow: 0 0 40px #00d9ff, 0 0 80px #0099bb inset;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; transition: all .3s;
  }
  .core.listening { animation: pulse 0.8s infinite; box-shadow: 0 0 60px #00ffcc, 0 0 100px #00d9ff inset; }
  .core.thinking { background: radial-gradient(circle, #ffaa00 0%, #995500 40%, #221100 90%); box-shadow: 0 0 60px #ffaa00; }
  @keyframes pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.06); } }
  .core-icon { font-size: 2.5rem; }

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

  /* Panel pengaturan di sisi kanan */
  .side-panel {
    flex: 0 0 220px; background: rgba(0, 20, 26, 0.45); border: 1px solid #0d5f73;
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
  button { width: 100%; padding: 9px; background: rgba(0,217,255,0.12); color: #7ee8ff; border: 1px solid #0d5f73; border-radius: 6px; font-size: 0.78rem; cursor: pointer; transition: background .2s; }
  button:hover { background: rgba(0,217,255,0.25); }

  audio { display: none; }

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

    <div class="core-wrap">
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

        <path class="wing-left" d="M150,10 C108,-24 55,-14 34,18 C66,7 110,13 141,34 Z" fill="url(#dragonGrad)" opacity="0.45" filter="url(#dragonGlow)"/>
        <path class="wing-right" d="M150,10 C192,-24 245,-14 266,18 C234,7 190,13 159,34 Z" fill="url(#dragonGrad)" opacity="0.45" filter="url(#dragonGlow)"/>

        <path class="dragon-flow" d="M150,10 C230,10 275,55 270,120 C265,190 210,235 145,238 C80,241 35,200 40,145 C45,95 85,55 140,60 C175,63 200,90 195,120"
              fill="none" stroke="url(#dragonGrad)" stroke-width="4" stroke-linecap="round" filter="url(#dragonGlow)"/>

        <circle class="dragon-spark" cx="195" cy="122" r="5" fill="#00ffcc" filter="url(#dragonGlow)"/>

        <g class="dragon-head">
          <path d="M150,10 L136,-16 L150,-4 L164,-16 Z" fill="url(#dragonGrad)" filter="url(#dragonGlow)"/>
          <circle cx="150" cy="10" r="11" fill="#001a22" stroke="url(#dragonGrad)" stroke-width="2" filter="url(#dragonGlow)"/>
          <circle class="dragon-eye" cx="150" cy="8" r="3" fill="#00ffee" filter="url(#dragonGlow)"/>
        </g>
      </svg>

      <div class="ring ring1"></div>
      <div class="ring ring2"></div>
      <div class="ring ring3"></div>
      <div class="core" id="core" onclick="toggleListen()">
        <span class="core-icon" id="coreIcon">🎙️</span>
      </div>
    </div>

    <div class="status-text" id="status">Klik core untuk berbicara</div>

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
    addTranscript('ai', answerText);

    const blob = await res.blob();
    player.src = URL.createObjectURL(blob);
    player.play();

    setStatus('✅ Klik core untuk bicara lagi');
  } catch (err) {
    setStatus('❌ ' + err.message, true);
  } finally {
    resetCore();
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
