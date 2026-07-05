// =====================================================================
//  Lenwy Whisper Server — REST API transkripsi audio/video via Gemini AI
//
//  Jalankan:  node whisper-server.js
//  Port:      WHISPER_PORT di .env (default 4000)
//
//  Endpoint:
//    POST /api/voice-chat   — kirim audio → Ai4Chat → jawab dengan audio (FaiWand)
//    POST /api/transcribe   — upload file audio/video, dapat transkripsi + timestamp
//    GET  /api/health       — cek status server
//    GET  /                 — halaman test voice chat (browser)
// =====================================================================

import "dotenv/config";
import express from "express";
import multer from "multer";
import axios from "axios";
import { transcribeAudio } from "./WhatsApp/scrape/GeminiWhisper.js";
import Ai4Chat from "./WhatsApp/scrape/Ai4Chat.js";

const PORT = process.env.WHISPER_PORT || 4000;
const app = express();

// Simpan file di memory (tidak perlu disk, langsung proses)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 }, // maks 200 MB
  fileFilter: (req, file, cb) => {
    const allowed = [
      "audio/mpeg", "audio/mp3", "audio/wav", "audio/mp4",
      "audio/ogg", "audio/flac", "audio/aac", "audio/webm",
      "video/mp4", "video/webm", "video/x-matroska",
    ];
    if (allowed.includes(file.mimetype) || file.originalname.match(/\.(mp3|mp4|wav|m4a|webm|ogg|flac|aac|mkv)$/i)) {
      cb(null, true);
    } else {
      cb(new Error(`Format file tidak didukung: ${file.mimetype}`));
    }
  },
});

// CORS — izinkan request dari web app manapun
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// ---- GET /api/health ----
app.get("/api/health", (req, res) => {
  const hasKey = !!process.env.GEMINI_API_KEY;
  res.json({
    status: "ok",
    gemini_key: hasKey ? "tersedia" : "TIDAK ADA — set GEMINI_API_KEY di .env",
    model: "gemini-2.5-flash (Whisper via Gemini)",
    max_file_size: "200 MB",
  });
});

// ---- POST /api/transcribe ----
// Body: multipart/form-data
//   file  — file audio/video (wajib)
//   lang  — (opsional) hint bahasa, mis. "id" atau "en"
//
// Response JSON:
//   { ok: true, language, full_text, duration, segments: [{start, end, text}] }
app.post("/api/transcribe", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ ok: false, error: "Tidak ada file yang diunggah. Gunakan field 'file'." });
  }

  const mimeType = req.file.mimetype || "audio/mpeg";
  const fileName = req.file.originalname || "audio";
  const sizeKB = Math.round(req.file.size / 1024);

  console.log(`[Whisper] Memproses: ${fileName} (${sizeKB} KB, ${mimeType})`);

  try {
    const result = await transcribeAudio(req.file.buffer, mimeType);

    console.log(`[Whisper] Selesai: ${result.segments?.length || 0} segment, bahasa: ${result.language}`);

    res.json({
      ok: true,
      file: fileName,
      size_kb: sizeKB,
      ...result,
    });
  } catch (err) {
    console.error("[Whisper] Error:", err.message);
    res.status(500).json({
      ok: false,
      error: err.message || "Transkripsi gagal",
    });
  }
});

// ---- helper: bersihkan markdown WhatsApp sebelum TTS ----
function cleanForTTS(text) {
  return text
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/_(.*?)_/g, "$1")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`(.*?)`/g, "$1")
    .replace(/[➤•►→━]/g, "")
    .replace(/\n{3,}/g, "\n")
    .trim()
    .slice(0, 800); // batas aman TTS
}

// ---- helper: TTS via StreamElements (gratis, support bahasa Indonesia) ----
async function textToSpeech(text, voice = "id-ID-ArdiNeural") {
  const url = `https://api.streamelements.com/kappa/v2/speech?voice=${voice}&text=${encodeURIComponent(text)}`;
  const { data } = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 20000,
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  return Buffer.from(data);
}

// ---- POST /api/voice-chat ----
// Kirim audio → transkripsi → Ai4Chat → jawaban audio
// Body: multipart/form-data
//   file  — file audio pertanyaan (mp3/wav/ogg/webm/m4a)
//   voice — (opsional) suara TTS: id-ID-ArdiNeural (pria,default) / id-ID-GadisNeural (wanita) / Brian (en)
//
// Response: audio/mpeg (file suara jawaban AI langsung bisa diputar)
app.post("/api/voice-chat", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ ok: false, error: "Tidak ada file audio. Gunakan field 'file'." });
  }

  const voice = req.body?.voice || "id-ID-ArdiNeural";
  const mimeType = req.file.mimetype || "audio/mpeg";

  console.log(`[VoiceChat] Audio masuk: ${req.file.originalname} (${Math.round(req.file.size / 1024)} KB)`);

  try {
    // Step 1: Audio → teks (Gemini Whisper)
    const transcription = await transcribeAudio(req.file.buffer, mimeType);
    const question = transcription.full_text?.trim();

    if (!question) {
      return res.status(422).json({ ok: false, error: "Tidak dapat mendeteksi suara dalam audio." });
    }

    console.log(`[VoiceChat] Pertanyaan: "${question}"`);

    // Step 2: Teks → jawaban AI (Ai4Chat)
    const answer = await Ai4Chat(question);

    if (!answer) {
      return res.status(502).json({ ok: false, error: "Ai4Chat tidak merespons." });
    }

    console.log(`[VoiceChat] Jawaban AI: "${answer.slice(0, 80)}..."`);

    // Step 3: Jawaban → audio (TTS)
    const audioBuffer = await textToSpeech(cleanForTTS(answer), voice);

    // Kembalikan langsung file audio agar bisa diputar/disimpan
    res.set({
      "Content-Type": "audio/mpeg",
      "Content-Disposition": "inline; filename=answer.mp3",
      "X-Question": encodeURIComponent(question),
      "X-Answer": encodeURIComponent(answer.slice(0, 200)),
    });
    res.send(audioBuffer);

  } catch (err) {
    console.error("[VoiceChat] Error:", err.message);
    res.status(500).json({ ok: false, error: err.message || "Gagal memproses voice chat." });
  }
});

// ---- GET / — halaman test sederhana di browser ----
app.get("/", (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>Lenwy Whisper AI</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #0f0f0f; color: #e0e0e0; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .card { background: #1a1a1a; border: 1px solid #333; border-radius: 12px; padding: 32px; width: 100%; max-width: 560px; }
    h1 { font-size: 1.4rem; margin-bottom: 4px; color: #fff; }
    p { font-size: 0.85rem; color: #888; margin-bottom: 24px; }
    label { display: block; font-size: 0.8rem; color: #aaa; margin-bottom: 6px; }
    input[type=file] { width: 100%; padding: 10px; border: 1px dashed #444; border-radius: 8px; background: #111; color: #ccc; cursor: pointer; margin-bottom: 16px; }
    button { width: 100%; padding: 12px; background: #4f46e5; color: #fff; border: none; border-radius: 8px; font-size: 0.95rem; cursor: pointer; transition: background .2s; }
    button:hover { background: #4338ca; }
    button:disabled { background: #333; cursor: not-allowed; }
    #status { margin-top: 16px; font-size: 0.82rem; color: #888; }
    #result { margin-top: 20px; background: #111; border: 1px solid #333; border-radius: 8px; padding: 16px; max-height: 400px; overflow-y: auto; display: none; }
    .seg { margin-bottom: 10px; }
    .time { font-size: 0.75rem; color: #4f46e5; font-weight: 600; margin-bottom: 2px; }
    .text { font-size: 0.9rem; color: #ddd; }
    .full { font-size: 0.85rem; color: #aaa; line-height: 1.6; margin-bottom: 16px; border-bottom: 1px solid #333; padding-bottom: 12px; }
  </style>
</head>
<body>
<div class="card">
  <h1>🎙️ FaiWand Voice AI</h1>
  <p>Bicara → AI dengar → AI jawab dengan suara · Powered by Ai4Chat + Gemini</p>

  <div style="display:flex;gap:8px;margin-bottom:12px;">
    <button id="btnRec" onclick="toggleRecord()" style="flex:1;background:#dc2626;">⏺ Rekam Suara</button>
    <button id="btnSend" onclick="sendVoice()" style="flex:1;" disabled>📤 Kirim ke AI</button>
  </div>

  <div style="margin-bottom:12px;">
    <label>Atau upload file audio:</label>
    <input type="file" id="fileInput" accept="audio/*">
  </div>

  <label>Suara jawaban AI:</label>
  <select id="voiceSelect" style="width:100%;padding:8px;background:#111;color:#ccc;border:1px solid #444;border-radius:8px;margin-bottom:16px;">
    <option value="id-ID-ArdiNeural">Pria Indonesia (default)</option>
    <option value="id-ID-GadisNeural">Wanita Indonesia</option>
    <option value="Brian">Pria Inggris</option>
  </select>

  <div id="status" style="margin-bottom:12px;"></div>
  <audio id="audioPlayer" controls style="width:100%;display:none;margin-top:8px;"></audio>
  <div id="transcript" style="margin-top:12px;font-size:0.82rem;color:#888;display:none;"></div>
</div>

<script>
let mediaRecorder, audioChunks = [], audioBlob = null;

async function toggleRecord() {
  const btn = document.getElementById('btnRec');
  const btnSend = document.getElementById('btnSend');

  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
    btn.textContent = '⏺ Rekam Suara';
    btn.style.background = '#dc2626';
    return;
  }

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  audioChunks = [];
  mediaRecorder = new MediaRecorder(stream);
  mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
  mediaRecorder.onstop = () => {
    audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
    btnSend.disabled = false;
    document.getElementById('status').textContent = '✅ Rekaman siap · Klik "Kirim ke AI"';
    stream.getTracks().forEach(t => t.stop());
  };
  mediaRecorder.start();
  btn.textContent = '⏹ Stop Rekam';
  btn.style.background = '#16a34a';
  document.getElementById('status').textContent = '🔴 Merekam... klik Stop jika selesai';
  btnSend.disabled = true;
}

async function sendVoice() {
  const fileInput = document.getElementById('fileInput').files[0];
  const blob = fileInput || audioBlob;
  if (!blob) return alert('Rekam suara atau pilih file audio dulu!');

  const voice = document.getElementById('voiceSelect').value;
  const status = document.getElementById('status');
  const player = document.getElementById('audioPlayer');
  const transcript = document.getElementById('transcript');

  document.getElementById('btnSend').disabled = true;
  player.style.display = 'none';
  transcript.style.display = 'none';
  status.textContent = '⏳ AI sedang mendengar dan berpikir... (5-20 detik)';

  const form = new FormData();
  form.append('file', blob, 'voice.webm');
  form.append('voice', voice);

  try {
    const res = await fetch('/api/voice-chat', { method: 'POST', body: form });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Server error');
    }

    const question = decodeURIComponent(res.headers.get('X-Question') || '');
    const answer = decodeURIComponent(res.headers.get('X-Answer') || '');

    const audioData = await res.arrayBuffer();
    const audioUrl = URL.createObjectURL(new Blob([audioData], { type: 'audio/mpeg' }));

    player.src = audioUrl;
    player.style.display = 'block';
    player.play();

    status.textContent = '✅ AI sudah menjawab!';
    if (question || answer) {
      transcript.innerHTML = \`<b>Pertanyaan:</b> \${question}<br><b>Jawaban:</b> \${answer}\${answer.length >= 200 ? '...' : ''}\`;
      transcript.style.display = 'block';
    }
  } catch (err) {
    status.textContent = '❌ Error: ' + err.message;
  } finally {
    document.getElementById('btnSend').disabled = false;
  }
}

// Kirim juga kalau pilih file manual
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('fileInput').addEventListener('change', e => {
    if (e.target.files[0]) {
      audioBlob = null;
      document.getElementById('btnSend').disabled = false;
      document.getElementById('status').textContent = \`File dipilih: \${e.target.files[0].name}\`;
    }
  });
});
</script>
</body>
</html>`);
});

// Error handler multer
app.use((err, req, res, next) => {
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ ok: false, error: "File terlalu besar (maks 200 MB)" });
  }
  res.status(400).json({ ok: false, error: err.message });
});

app.listen(PORT, () => {
  console.log(`\n🎙️  FaiWand Voice AI Server jalan di http://localhost:${PORT}`);
  console.log(`🤖  POST http://localhost:${PORT}/api/voice-chat  ← audio in, audio out`);
  console.log(`📡  POST http://localhost:${PORT}/api/transcribe`);
  console.log(`🔍  GET  http://localhost:${PORT}/api/health`);
  if (!process.env.GEMINI_API_KEY) {
    console.warn(`\n⚠️  PERINGATAN: GEMINI_API_KEY tidak ditemukan di .env!\n`);
  }
});
