// =====================================================================
//  Lenwy Whisper Server — REST API transkripsi audio/video via Gemini AI
//
//  Jalankan:  node whisper-server.js
//  Port:      WHISPER_PORT di .env (default 4000)
//
//  Endpoint:
//    POST /api/transcribe   — upload file audio/video, dapat transkripsi + timestamp
//    GET  /api/health       — cek status server
//    GET  /                 — halaman test upload (browser)
// =====================================================================

import "dotenv/config";
import express from "express";
import multer from "multer";
import { transcribeAudio } from "./WhatsApp/scrape/GeminiWhisper.js";

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
  <h1>🎙️ Lenwy Whisper AI</h1>
  <p>Transkripsi audio/video menggunakan Gemini AI · Max 200 MB</p>

  <label>Pilih file audio atau video:</label>
  <input type="file" id="fileInput" accept="audio/*,video/*">
  <button id="btn" onclick="transcribe()">Mulai Transkripsi</button>
  <div id="status"></div>
  <div id="result"></div>
</div>

<script>
async function transcribe() {
  const file = document.getElementById('fileInput').files[0];
  if (!file) return alert('Pilih file dulu!');

  const btn = document.getElementById('btn');
  const status = document.getElementById('status');
  const result = document.getElementById('result');

  btn.disabled = true;
  result.style.display = 'none';
  status.textContent = '⏳ Mengunggah dan memproses... (mungkin 30-120 detik untuk file panjang)';

  const form = new FormData();
  form.append('file', file);

  try {
    const res = await fetch('/api/transcribe', { method: 'POST', body: form });
    const data = await res.json();

    if (!data.ok) throw new Error(data.error);

    status.textContent = \`✅ Selesai · \${data.segments?.length || 0} segment · Bahasa: \${data.language} · Durasi: \${data.duration ? data.duration.toFixed(1) + 's' : 'N/A'}\`;

    let html = \`<div class="full">\${data.full_text}</div>\`;
    (data.segments || []).forEach(s => {
      const start = s.start?.toFixed(1) ?? '?';
      const end = s.end?.toFixed(1) ?? '?';
      html += \`<div class="seg"><div class="time">\${start}s — \${end}s</div><div class="text">\${s.text}</div></div>\`;
    });

    result.innerHTML = html;
    result.style.display = 'block';
  } catch (err) {
    status.textContent = '❌ Error: ' + err.message;
  } finally {
    btn.disabled = false;
  }
}
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
  console.log(`\n🎙️  Lenwy Whisper Server jalan di http://localhost:${PORT}`);
  console.log(`📡  POST http://localhost:${PORT}/api/transcribe`);
  console.log(`🔍  GET  http://localhost:${PORT}/api/health`);
  if (!process.env.GEMINI_API_KEY) {
    console.warn(`\n⚠️  PERINGATAN: GEMINI_API_KEY tidak ditemukan di .env!\n`);
  }
});
