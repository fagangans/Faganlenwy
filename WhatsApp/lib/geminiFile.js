// Gemini multimodal untuk analisis file — gambar (screenshot) & dokumen (PDF, dll).
// Sama seperti GeminiWhisper.js tapi generik untuk teks output biasa, bukan transkripsi JSON.

import axios from "axios";

const API_KEY = process.env.GEMINI_API_KEY || "";
const MODEL = "gemini-2.5-flash";
const MAX_INLINE_BYTES = 15 * 1024 * 1024; // 15 MB — di atas ini butuh Files API (belum didukung di sini)

// Analisis satu file (gambar/PDF/dokumen) dengan prompt tertentu, kembalikan teks jawaban
export async function analyzeFile(buffer, mimeType, prompt) {
  if (!API_KEY) throw new Error("GEMINI_API_KEY tidak ditemukan di environment");
  if (buffer.length >= MAX_INLINE_BYTES) {
    throw new Error("File terlalu besar (maks 15 MB untuk saat ini)");
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

  const { data } = await axios.post(
    url,
    {
      contents: [
        {
          parts: [
            { inline_data: { mime_type: mimeType, data: buffer.toString("base64") } },
            { text: prompt },
          ],
        },
      ],
      generationConfig: { temperature: 0.4, maxOutputTokens: 2048 },
    },
    { timeout: 60000 },
  );

  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  return text || null;
}
