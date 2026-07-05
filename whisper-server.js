// =====================================================================
//  FaiWand Voice AI Server
//
//  Jalankan:  node whisper-server.js
//  Port:      WHISPER_PORT di .env (default 4000)
//
//  Endpoint:
//    POST /api/chat         — teks → Ai4Chat → jawab dengan audio (tanpa API key)
//    GET  /api/health       — cek status server
//    GET  /                 — halaman voice chat (browser, pakai Web Speech API)
// =====================================================================

import "dotenv/config";
import express from "express";
import axios from "axios";
import Ai4Chat from "./WhatsApp/scrape/Ai4Chat.js";

// Fallback AI kalau Ai4Chat down (dipakai juga oleh ai4chat.js di bot WhatsApp)
async function askPublicAI(q) {
  const url = `https://api.fromscratch.web.id/v1/api/ai/publicai?query=${encodeURIComponent(q)}`;
  const { data } = await axios.get(url, { timeout: 20000 });
  return data?.data?.response || null;
}

const PORT = process.env.WHISPER_PORT || 4000;
const app = express();
app.use(express.json());

// CORS
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// Bersihkan markdown WhatsApp sebelum TTS
function cleanForTTS(text) {
  return text
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/_(.*?)_/g, "$1")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`(.*?)`/g, "$1")
    .replace(/[➤•►→━]/g, "")
    .replace(/\n{3,}/g, "\n")
    .trim()
    .slice(0, 1000);
}

// Pecah teks jadi potongan <=200 karakter di batas kata (limit Google Translate TTS)
function splitIntoChunks(text, maxLen = 200) {
  const chunks = [];
  let remaining = text.trim();

  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }
    let cut = remaining.slice(0, maxLen);
    const lastBreak = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf(", "), cut.lastIndexOf(" "));
    if (lastBreak > 0) cut = remaining.slice(0, lastBreak + 1);
    chunks.push(cut.trim());
    remaining = remaining.slice(cut.length).trim();
  }

  return chunks;
}

// TTS via Google Translate (gratis, tanpa API key, terbukti jalan — dipakai juga oleh .tts command)
// lang: "id" untuk Indonesia, "en" untuk Inggris
async function fetchGoogleTTSChunk(text, lang = "id") {
  const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${lang}&client=tw-ob`;
  const { data } = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 15000,
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  return Buffer.from(data);
}

// TTS teks panjang: pecah jadi beberapa potongan, gabung jadi satu buffer mp3
async function textToSpeech(text, voice = "id") {
  const lang = voice === "en" || voice === "Brian" ? "en" : "id";
  const chunks = splitIntoChunks(text, 200);

  const buffers = [];
  for (const chunk of chunks) {
    if (!chunk) continue;
    const buf = await fetchGoogleTTSChunk(chunk, lang);
    buffers.push(buf);
  }

  return Buffer.concat(buffers);
}

// ---- GET /api/health ----
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", ai: "Ai4Chat + PublicAI (tanpa API key)", tts: "Google Translate TTS (tanpa API key)" });
});

// ---- POST /api/chat ----
// Body JSON: { question: "...", voice: "id-ID-ArdiNeural" }
// Response: audio/mpeg langsung
app.post("/api/chat", async (req, res) => {
  const { question, voice = "id-ID-ArdiNeural" } = req.body || {};

  if (!question?.trim()) {
    return res.status(400).json({ ok: false, error: "Field 'question' wajib diisi." });
  }

  console.log(`[FaiWand] Pertanyaan: "${question}"`);

  // Step 1: tanya AI (Ai4Chat, fallback ke PublicAI)
  let answer = null;
  try {
    answer = await Ai4Chat(question);
  } catch (err) {
    console.error("[FaiWand] Ai4Chat gagal:", err.response?.status || "", err.message);
  }

  if (!answer) {
    try {
      answer = await askPublicAI(question);
    } catch (err) {
      console.error("[FaiWand] PublicAI fallback gagal:", err.response?.status || "", err.message);
    }
  }

  if (!answer) {
    return res.status(502).json({ ok: false, error: "Semua sumber AI (Ai4Chat & PublicAI) sedang tidak merespons." });
  }

  console.log(`[FaiWand] Jawaban: "${answer.slice(0, 80)}..."`);

  // Step 2: jawaban → audio (TTS)
  try {
    const audioBuffer = await textToSpeech(cleanForTTS(answer), voice);

    res.set({
      "Content-Type": "audio/mpeg",
      "X-Answer": encodeURIComponent(answer.slice(0, 300)),
    });
    res.send(audioBuffer);
  } catch (err) {
    console.error("[FaiWand] TTS gagal:", err.response?.status || "", err.message);
    res.status(500).json({ ok: false, error: "Gagal membuat suara (TTS): " + err.message });
  }
});

// ---- GET / — halaman voice chat ----
app.get("/", (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>FaiWand Voice AI</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #0a0a0a; color: #e0e0e0; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 16px; }
    .card { background: #161616; border: 1px solid #2a2a2a; border-radius: 16px; padding: 32px; width: 100%; max-width: 480px; }
    h1 { font-size: 1.4rem; color: #fff; margin-bottom: 4px; }
    .sub { font-size: 0.82rem; color: #666; margin-bottom: 28px; }
    .mic-btn { width: 120px; height: 120px; border-radius: 50%; border: none; background: #1e1e1e; color: #fff; font-size: 2.5rem; cursor: pointer; display: block; margin: 0 auto 20px; transition: all .2s; border: 2px solid #333; }
    .mic-btn.recording { background: #dc2626; border-color: #dc2626; animation: pulse 1s infinite; }
    .mic-btn.thinking { background: #854d0e; border-color: #854d0e; }
    @keyframes pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.08)} }
    .status { text-align: center; font-size: 0.85rem; color: #888; margin-bottom: 20px; min-height: 20px; }
    .status.error { color: #ef4444; }
    select { width: 100%; padding: 10px 12px; background: #1e1e1e; color: #ccc; border: 1px solid #333; border-radius: 8px; margin-bottom: 16px; font-size: 0.9rem; }
    audio { width: 100%; margin-top: 12px; display: none; }
    .answer { margin-top: 16px; background: #1e1e1e; border-radius: 8px; padding: 14px; font-size: 0.85rem; color: #bbb; line-height: 1.6; display: none; }
    .hint { text-align: center; font-size: 0.75rem; color: #444; margin-top: 20px; }
  </style>
</head>
<body>
<div class="card">
  <h1>🪄 FaiWand Voice AI</h1>
  <p class="sub">Klik mic → bicara → AI jawab dengan suara · Tanpa API key</p>

  <button class="mic-btn" id="micBtn" onclick="toggleListen()">🎤</button>

  <div class="status" id="status">Klik mic dan mulai bicara</div>

  <select id="voiceSelect">
    <option value="id">Suara Indonesia</option>
    <option value="en">Suara Inggris</option>
  </select>

  <audio id="player" controls></audio>
  <div class="answer" id="answer"></div>

  <p class="hint">Gunakan Chrome/Edge · Web Speech API hanya support browser desktop</p>
</div>

<script>
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition, isListening = false;

function setStatus(msg, isError = false) {
  const el = document.getElementById('status');
  el.textContent = msg;
  el.className = 'status' + (isError ? ' error' : '');
}

function toggleListen() {
  if (!SpeechRecognition) {
    setStatus('❌ Browser tidak support. Gunakan Chrome/Edge.', true);
    return;
  }
  isListening ? stopListen() : startListen();
}

function startListen() {
  recognition = new SpeechRecognition();
  recognition.lang = 'id-ID';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    isListening = true;
    document.getElementById('micBtn').className = 'mic-btn recording';
    document.getElementById('micBtn').textContent = '⏹';
    setStatus('🔴 Mendengarkan... klik stop jika selesai');
  };

  recognition.onresult = async (e) => {
    const question = e.results[0][0].transcript;
    setStatus('💭 "' + question + '"');
    await askAI(question);
  };

  recognition.onerror = (e) => {
    setStatus('❌ Error mikrofon: ' + e.error, true);
    resetMic();
  };

  recognition.onend = () => { if (isListening) stopListen(); };

  recognition.start();
}

function stopListen() {
  isListening = false;
  recognition?.stop();
  resetMic();
}

function resetMic() {
  isListening = false;
  document.getElementById('micBtn').className = 'mic-btn';
  document.getElementById('micBtn').textContent = '🎤';
}

async function askAI(question) {
  const btn = document.getElementById('micBtn');
  btn.className = 'mic-btn thinking';
  btn.textContent = '⏳';
  setStatus('🤖 AI sedang menjawab...');

  const voice = document.getElementById('voiceSelect').value;
  const player = document.getElementById('player');
  const answerEl = document.getElementById('answer');

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, voice })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Server error');
    }

    const answerText = decodeURIComponent(res.headers.get('X-Answer') || '');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);

    player.src = url;
    player.style.display = 'block';
    player.play();

    answerEl.textContent = answerText;
    answerEl.style.display = 'block';

    setStatus('✅ Selesai! Klik mic untuk tanya lagi');
  } catch (err) {
    setStatus('❌ ' + err.message, true);
  } finally {
    resetMic();
  }
}
</script>
</body>
</html>`);
});

app.listen(PORT, () => {
  console.log(`\n🪄  FaiWand Voice AI jalan di http://localhost:${PORT}`);
  console.log(`🤖  Ai4Chat (tanpa API key) + StreamElements TTS`);
  console.log(`💬  POST http://localhost:${PORT}/api/chat`);
});
