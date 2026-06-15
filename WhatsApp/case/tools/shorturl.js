import axios from "axios";

// Metadata
export const info = {
  name: "Short URL",

  menu: ["Short"],
  case: ["short", "shorturl", "pendekkan"],

  description: "Perpendek link panjang",
  hidden: false,

  owner: false,
  premium: false,
  group: false,
  private: false,
  admin: false,
  botAdmin: false,

  allowPrivate: true,
};

// Handler — sumber: tinyurl (gratis, tanpa API key)
export default async function handler(leni) {
  const { q, LenwyText, LenwyWait } = leni;

  if (!q) return LenwyText("☘️ *Contoh:* .short https://link-panjang.com/abc");

  if (!/^https?:\/\//i.test(q.trim()))
    return LenwyText("❌ Link harus diawali http:// atau https://");

  LenwyWait();

  try {
    const { data } = await axios.get(
      `https://tinyurl.com/api-create.php?url=${encodeURIComponent(q.trim())}`,
      { timeout: 15000 },
    );

    await LenwyText(`🔗 *Short URL*\n\n${data}`);
  } catch (err) {
    console.error("ShortURL Error:", err?.message || err);
    LenwyText("❌ Gagal memperpendek link.");
  }
}
