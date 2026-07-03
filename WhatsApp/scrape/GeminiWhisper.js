// Whisper AI menggunakan Gemini multimodal — transkripsi audio/video ke teks dengan timestamp.
// Mendukung: mp3, mp4, wav, m4a, webm, ogg, flac, mpeg, aac
// File < 15MB: dikirim inline (base64)
// File >= 15MB: upload dulu via Gemini Files API, lalu referensikan

import axios from "axios";
import fs from "fs";
import path from "path";
import FormData from "form-data";

const API_KEY = process.env.GEMINI_API_KEY || "";
const MODEL = "gemini-2.5-flash";
const MAX_INLINE_BYTES = 15 * 1024 * 1024; // 15 MB

const MIME_MAP = {
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".webm": "video/webm",
  ".ogg": "audio/ogg",
  ".flac": "audio/flac",
  ".aac": "audio/aac",
  ".mpeg": "audio/mpeg",
  ".mkv": "video/x-matroska",
};

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_MAP[ext] || "audio/mpeg";
}

// Upload file ke Gemini Files API (untuk file besar >= 15MB)
async function uploadToGeminiFiles(buffer, mimeType, displayName = "audio") {
  const uploadUrl = `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${API_KEY}`;

  // Step 1: initiate resumable upload
  const initRes = await axios.post(
    uploadUrl,
    { file: { display_name: displayName } },
    {
      headers: {
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": buffer.length,
        "X-Goog-Upload-Header-Content-Type": mimeType,
        "Content-Type": "application/json",
      },
    }
  );

  const uploadSessionUrl = initRes.headers["x-goog-upload-url"];
  if (!uploadSessionUrl) throw new Error("Gagal mendapat upload session URL dari Gemini Files API");

  // Step 2: upload binary
  const uploadRes = await axios.post(uploadSessionUrl, buffer, {
    headers: {
      "X-Goog-Upload-Command": "upload, finalize",
      "X-Goog-Upload-Offset": "0",
      "Content-Type": mimeType,
    },
  });

  const fileUri = uploadRes.data?.file?.uri;
  if (!fileUri) throw new Error("Upload berhasil tapi tidak dapat file URI");

  return fileUri;
}

// Prompt ke Gemini untuk menghasilkan transkripsi berformat JSON dengan timestamp
const TRANSCRIBE_PROMPT = `Transkripsi seluruh audio/video ini secara lengkap dan akurat.

Kembalikan HANYA JSON murni (tanpa markdown, tanpa \`\`\`json) dengan format berikut:
{
  "language": "id",
  "full_text": "seluruh teks transkripsi di sini",
  "duration": 120.5,
  "segments": [
    { "start": 0.0, "end": 3.2, "text": "kalimat pertama" },
    { "start": 3.2, "end": 7.8, "text": "kalimat berikutnya" }
  ]
}

Aturan:
- Deteksi bahasa otomatis (id untuk Indonesia, en untuk Inggris, dll)
- Timestamp dalam satuan DETIK (desimal)
- Setiap segment berisi 1 kalimat atau 1 jeda bicara alami
- Jika ada beberapa pembicara, tulis saja teksnya tanpa label pembicara
- Jangan tambahkan komentar, penjelasan, atau teks apapun di luar JSON`;

// Fungsi utama: transkripsi file audio/video, kembalikan { language, full_text, duration, segments }
export async function transcribeAudio(input, mimeTypeOverride = null) {
  if (!API_KEY) throw new Error("GEMINI_API_KEY tidak ditemukan di environment");

  let buffer;
  let mimeType;

  // Terima Buffer langsung atau path file
  if (Buffer.isBuffer(input)) {
    buffer = input;
    mimeType = mimeTypeOverride || "audio/mpeg";
  } else if (typeof input === "string") {
    buffer = fs.readFileSync(input);
    mimeType = mimeTypeOverride || getMimeType(input);
  } else {
    throw new Error("Input harus berupa Buffer atau path file string");
  }

  let contentPart;

  if (buffer.length < MAX_INLINE_BYTES) {
    // Inline (base64) untuk file kecil
    contentPart = {
      inline_data: {
        mime_type: mimeType,
        data: buffer.toString("base64"),
      },
    };
  } else {
    // Files API untuk file besar
    const fileUri = await uploadToGeminiFiles(buffer, mimeType);
    contentPart = {
      file_data: {
        mime_type: mimeType,
        file_uri: fileUri,
      },
    };
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

  const { data } = await axios.post(
    url,
    {
      contents: [
        {
          parts: [contentPart, { text: TRANSCRIBE_PROMPT }],
        },
      ],
      generationConfig: {
        temperature: 0.1, // rendah supaya output konsisten dan akurat
        maxOutputTokens: 8192,
      },
    },
    { timeout: 120000 } // 2 menit untuk file panjang
  );

  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) throw new Error("Gemini tidak mengembalikan hasil transkripsi");

  // Parse JSON — bersihkan kalau ada sisa markdown
  const cleaned = rawText.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();

  let result;
  try {
    result = JSON.parse(cleaned);
  } catch {
    // Kalau gagal parse, kembalikan sebagai full_text tanpa segments
    result = {
      language: "unknown",
      full_text: rawText,
      duration: null,
      segments: [],
    };
  }

  return result;
}
