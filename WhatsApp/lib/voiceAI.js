// Shared voice-AI pipeline: teks → jawaban AI (Ai4Chat/PublicAI) → audio (Edge Neural TTS).
// Dipakai oleh whisper-server.js (FaiWand) dan Faipouch/server.js (JARVIS dashboard)
// supaya logic AI + TTS tidak diduplikasi di banyak tempat.

import axios from "axios";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import Ai4Chat from "../scrape/Ai4Chat.js";

// Fallback AI kalau Ai4Chat down
async function askPublicAI(q) {
  const url = `https://api.fromscratch.web.id/v1/api/ai/publicai?query=${encodeURIComponent(q)}`;
  const { data } = await axios.get(url, { timeout: 20000 });
  return data?.data?.response || null;
}

// Panggil Ai4Chat & PublicAI BERSAMAAN, pakai jawaban siapa pun yang datang duluan.
export function askFastest(question) {
  return new Promise((resolve, reject) => {
    const sources = [
      { name: "Ai4Chat", fn: () => Ai4Chat(question) },
      { name: "PublicAI", fn: () => askPublicAI(question) },
    ];

    let resolved = false;
    let settledCount = 0;

    sources.forEach(({ name, fn }) => {
      fn()
        .then((result) => {
          if (!resolved && result) {
            resolved = true;
            resolve(result);
          }
        })
        .catch((err) => {
          console.error(`[VoiceAI] ${name} gagal:`, err.response?.status || "", err.message);
        })
        .finally(() => {
          settledCount++;
          if (settledCount === sources.length && !resolved) {
            reject(new Error("Semua sumber AI (Ai4Chat & PublicAI) sedang tidak merespons."));
          }
        });
    });
  });
}

// Bersihkan markdown WhatsApp sebelum TTS
export function cleanForTTS(text) {
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

// Nama suara neural Microsoft Edge (kualitas jauh lebih natural dari Google TTS)
export const EDGE_VOICES = {
  id: "id-ID-ArdiNeural",           // pria Indonesia
  "id-female": "id-ID-GadisNeural", // wanita Indonesia
  en: "en-US-AriaNeural",           // wanita Inggris
};

// TTS utama — Microsoft Edge Neural Voice, gratis tanpa API key.
async function edgeTextToSpeech(text, voiceName, rate = "+15%") {
  const tts = new MsEdgeTTS();
  await tts.setMetadata(voiceName, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);

  const { audioStream } = tts.toStream(text, { rate });

  return new Promise((resolve, reject) => {
    const chunks = [];
    audioStream.on("data", (chunk) => chunks.push(chunk));
    audioStream.on("close", () => {
      tts.close();
      resolve(Buffer.concat(chunks));
    });
    audioStream.on("error", (err) => {
      tts.close();
      reject(err);
    });
  });
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

// TTS via Google Translate (gratis, tanpa API key) — fallback bila Edge TTS gagal
async function fetchGoogleTTSChunk(text, lang = "id") {
  const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${lang}&client=tw-ob`;
  const { data } = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 15000,
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  return Buffer.from(data);
}

async function googleTTSFallback(text, lang = "id") {
  const chunks = splitIntoChunks(text, 200).filter(Boolean);
  const buffers = await Promise.all(chunks.map((chunk) => fetchGoogleTTSChunk(chunk, lang)));
  return Buffer.concat(buffers);
}

// Fungsi utama: coba Edge Neural TTS dulu (natural), fallback ke Google TTS kalau gagal
// rate: kecepatan bicara, mis. "+0%" (normal), "+15%" (cepat, default), "+30%" (sangat cepat)
export async function textToSpeech(text, voice = "id", rate = "+15%") {
  const voiceName = EDGE_VOICES[voice] || EDGE_VOICES.id;
  const fallbackLang = voice === "en" ? "en" : "id";

  try {
    return await edgeTextToSpeech(text, voiceName, rate);
  } catch (err) {
    console.error("[VoiceAI] Edge TTS gagal, fallback ke Google TTS:", err.message);
    return await googleTTSFallback(text, fallbackLang);
  }
}
