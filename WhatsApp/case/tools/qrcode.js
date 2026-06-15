import QRCode from "qrcode";

// Metadata
export const info = {
  name: "QR Code Generator",

  menu: ["Qr"],
  case: ["qr", "qrcode"],

  description: "Buat QR code dari teks/link",
  hidden: false,

  owner: false,
  premium: false,
  group: false,
  private: false,
  admin: false,
  botAdmin: false,

  allowPrivate: true,
};

// Handler
export default async function handler(leni) {
  const { q, lenwy, replyJid, LenwyText } = leni;

  if (!q) return LenwyText("☘️ *Contoh:* .qr https://youtube.com/@Lenwy");

  try {
    const buffer = await QRCode.toBuffer(q.trim(), {
      width: 512,
      margin: 2,
    });

    await lenwy.sendMessage(replyJid, {
      image: buffer,
      caption: `🔳 *QR Code*\n\n📝 ${q.trim()}`,
    });
  } catch (err) {
    console.error("QR Error:", err?.message || err);
    LenwyText("❌ Gagal membuat QR code.");
  }
}
