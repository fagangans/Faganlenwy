/*

  Made By Lenwy
  Base : Lenwy
  WhatsApp : wa.me/6283829814737
  Telegram : t.me/ilenwy
  Youtube : @Lenwy

  Channel : https://whatsapp.com/channel/0029VaGdzBSGZNCmoTgN2K0u

  Copy Code?, Recode?, Rename?, Reupload?, Reseller? Taruh Credit Ya :D

  Mohon Untuk Tidak Menghapus Watermark Di Dalam Kode Ini

*/

import axios from "axios";
import { getAIAnswer } from "./ai4chat.js";
import { getHistory, addMessage } from "../../lib/aiMemory.js";

export const info = {
  name: "AI Suara",

  menu: ["AI"],
  case: ["aisuara", "aisay", "aivoice"],

  description: "Tanya AI, jawaban dikirim sebagai teks + voice note",
  hidden: false,

  owner: false,
  premium: false,
  group: false,
  private: false,
  admin: false,
  botAdmin: false,

  allowPrivate: true,
};

// Daftar suara yang tersedia (StreamElements)
// id-ID-ArdiNeural = pria Indonesia, id-ID-GadisNeural = wanita Indonesia
const VOICES = {
  pria: "id-ID-ArdiNeural",
  wanita: "id-ID-GadisNeural",
  en: "Brian",         // Inggris pria
  default: "id-ID-ArdiNeural",
};

// Bersihkan teks dari format WhatsApp sebelum di-TTS
// (hapus *bold*, _italic_, tanda baca berlebih, dll)
function cleanForTTS(text) {
  return text
    .replace(/\*(.*?)\*/g, "$1")   // *bold* → bold
    .replace(/_(.*?)_/g, "$1")     // _italic_ → italic
    .replace(/~(.*?)~/g, "$1")     // ~coret~ → coret
    .replace(/```[\s\S]*?```/g, "") // hapus code block
    .replace(/`(.*?)`/g, "$1")     // `inline code` → teks
    .replace(/[➤•►→]/g, "")        // hapus bullet symbol
    .replace(/\n{3,}/g, "\n\n")    // max 2 baris kosong
    .replace(/━+/g, "")            // hapus garis pemisah
    .trim();
}

// Potong teks ke maks N karakter di batas kata (bukan tengah kata)
function truncateAtWord(text, maxLen) {
  if (text.length <= maxLen) return text;
  const cut = text.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut) + "...";
}

// Ambil audio dari StreamElements TTS, kembalikan Buffer
async function fetchTTS(text, voice = VOICES.default) {
  const encoded = encodeURIComponent(text);
  const url = `https://api.streamelements.com/kappa/v2/speech?voice=${voice}&text=${encoded}`;

  const { data } = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 20000,
    headers: { "User-Agent": "Mozilla/5.0" },
  });

  return Buffer.from(data);
}

// Fallback: Google Translate TTS (maks 200 karakter)
async function fetchGoogleTTS(text) {
  const short = text.slice(0, 200);
  const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(short)}&tl=id&client=tw-ob`;

  const { data } = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 15000,
    headers: { "User-Agent": "Mozilla/5.0" },
  });

  return Buffer.from(data);
}

export default async function handler(leni) {
  const { command, q, args, lenwy, len, replyJid, LenwyText, LenwyWait, normalizedSender, commands } = leni;

  // .aisuara list — tampilkan daftar suara
  if (args[0] === "list") {
    return LenwyText(
      `🔊 *Daftar Suara Tersedia:*\n\n` +
      `• *pria* — Suara pria Indonesia (default)\n` +
      `• *wanita* — Suara wanita Indonesia\n` +
      `• *en* — Suara pria Inggris\n\n` +
      `Cara pakai:\n*.aisuara [suara] [pertanyaan]*\n` +
      `Contoh: *.aisuara wanita siapa presiden Indonesia?*`
    );
  }

  if (!q) {
    return LenwyText(
      `🎙️ *AI Suara — Tanya AI, dapat jawaban + voice note*\n\n` +
      `*Cara pakai:*\n` +
      `➤ .aisuara [pertanyaan]\n` +
      `➤ .aisuara wanita [pertanyaan]\n` +
      `➤ .aisuara en [pertanyaan]\n\n` +
      `Ketik *.aisuara list* untuk semua pilihan suara.`
    );
  }

  // Cek apakah arg pertama adalah nama suara
  let voice = VOICES.default;
  let question = q;

  if (VOICES[args[0]?.toLowerCase()]) {
    voice = VOICES[args[0].toLowerCase()];
    question = args.slice(1).join(" ").trim();
    if (!question) return LenwyText("⚠️ Tulis pertanyaan setelah nama suara.");
  }

  LenwyWait();

  // Ambil jawaban AI
  const answer = await getAIAnswer(question, normalizedSender, commands);
  if (!answer) {
    return LenwyText("⚠️ Semua sumber AI sedang tidak merespon. Coba lagi nanti.");
  }

  // Kirim jawaban teks dulu
  await LenwyText(answer);

  // Bersihkan teks untuk TTS
  const cleanText = cleanForTTS(answer);

  // TTS dibatasi 800 karakter supaya tidak timeout
  const ttsText = truncateAtWord(cleanText, 800);

  // Coba StreamElements, fallback ke Google TTS
  let audioBuffer = null;
  try {
    audioBuffer = await fetchTTS(ttsText, voice);
  } catch (err) {
    console.error("StreamElements TTS gagal, fallback ke Google:", err?.message);
    try {
      audioBuffer = await fetchGoogleTTS(ttsText);
    } catch (err2) {
      console.error("Google TTS juga gagal:", err2?.message);
    }
  }

  if (audioBuffer) {
    await lenwy.sendMessage(
      replyJid,
      {
        audio: audioBuffer,
        mimetype: "audio/mpeg",
        ptt: true, // kirim sebagai voice note
      },
      { quoted: len }
    );
  }
  // Kalau TTS gagal, jawaban teks sudah terkirim — tidak perlu error message tambahan
}
