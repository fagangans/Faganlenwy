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

import { generateImageWithFallback, IMAGE_MODELS } from "../../scrape/ImageGen.js";

export const info = {
  name: "AI Generate Gambar",

  menu: ["AI"],
  case: ["imagine", "buatgambar", "imgai"],

  description: "Generate gambar dari deskripsi teks menggunakan AI",
  hidden: false,

  owner: false,
  premium: false,
  group: false,
  private: false,
  admin: false,
  botAdmin: false,

  allowPrivate: true,
};

// Petakan kata kunci gaya di prompt ke model yang tepat
const STYLE_MAP = [
  { keywords: ["anime", "manga", "cartoon", "kartun"], model: "anime" },
  { keywords: ["realis", "realist", "foto", "photo", "portrait", "potret", "nyata", "real"], model: "realism" },
  { keywords: ["3d", "render", "blender", "cgi"], model: "3d" },
  { keywords: ["cepat", "quick", "fast", "simple"], model: "fast" },
];

function detectModel(prompt) {
  const lower = prompt.toLowerCase();
  for (const { keywords, model } of STYLE_MAP) {
    if (keywords.some((k) => lower.includes(k))) return model;
  }
  return "default";
}

export default async function handler(leni) {
  const { command, q, args, lenwy, len, replyJid, LenwyText, LenwyWait } = leni;

  // .imagine list — tampilkan daftar model
  if (command === "imagine" && args[0] === "list") {
    const modelList = IMAGE_MODELS.map((m) => `• *${m}*`).join("\n");
    return LenwyText(
      `🎨 *Model AI Gambar Yang Tersedia:*\n\n${modelList}\n\n` +
      `Cara pakai dengan model tertentu:\n` +
      `*.imagine [model] [deskripsi]*\n` +
      `Contoh: *.imagine anime kucing lucu memakai topi*`
    );
  }

  if (!q) {
    return LenwyText(
      `🖼️ *Cara Pakai:*\n\n` +
      `*.imagine [deskripsi gambar]*\n\n` +
      `Contoh:\n` +
      `➤ *.imagine kucing anime lucu memakai hoodie di bawah hujan*\n` +
      `➤ *.imagine sunset pantai bali gaya realis*\n` +
      `➤ *.imagine robot 3d futuristik di kota cyberpunk*\n\n` +
      `Ketik *.imagine list* untuk lihat semua gaya tersedia.`
    );
  }

  // Cek apakah arg pertama adalah nama model (explicit override)
  let modelKey = "default";
  let prompt = q;

  if (IMAGE_MODELS.includes(args[0]?.toLowerCase())) {
    modelKey = args[0].toLowerCase();
    prompt = args.slice(1).join(" ").trim();
    if (!prompt) return LenwyText(`⚠️ Tulis deskripsi gambar setelah nama model.\nContoh: *.imagine ${modelKey} kucing lucu*`);
  } else {
    // Auto-deteksi gaya dari konten prompt
    modelKey = detectModel(q);
  }

  LenwyWait();

  try {
    const imageBuffer = await generateImageWithFallback(prompt, modelKey);

    const modelLabel = modelKey === "default" ? "FLUX" : modelKey.toUpperCase();

    await lenwy.sendMessage(
      replyJid,
      {
        image: imageBuffer,
        caption:
          `🎨 *AI Image Generator*\n\n` +
          `📝 *Prompt:* ${prompt}\n` +
          `🤖 *Model:* ${modelLabel}\n\n` +
          `_Powered by Pollinations AI_`,
        mimetype: "image/jpeg",
      },
      { quoted: len }
    );
  } catch (err) {
    console.error("ImageGen Error:", err?.message || err);
    return LenwyText(
      `❌ Gagal generate gambar.\n\n` +
      `Kemungkinan penyebab:\n` +
      `• Server AI sedang sibuk, coba lagi dalam beberapa detik\n` +
      `• Prompt terlalu panjang, coba persingkat\n\n` +
      `Contoh prompt yang bagus: *.imagine kucing anime lucu*`
    );
  }
}
