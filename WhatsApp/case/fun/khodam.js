// Metadata
export const info = {
  name: "Cek Khodam",

  menu: ["Khodam"],
  case: ["khodam", "cekkhodam"],

  description: "Cek khodam (iseng/hiburan)",
  hidden: false,

  owner: false,
  premium: false,
  group: false,
  private: false,
  admin: false,
  botAdmin: false,

  allowPrivate: true,
};

const KHODAM = [
  "Kucing Oren Sat-set",
  "Naga Api Sakti",
  "Macan Putih Selatan",
  "Ular Kobra Emas",
  "Burung Hantu Bijak",
  "Singa Padang Pasir",
  "Buaya Darat (Awas!)",
  "Kodok Ngorek",
  "Tikus Got Lincah",
  "Ayam Jago Petarung",
  "Gajah Bengkak",
  "Semut Rangrang Pekerja",
  "Lele Sangkuriang",
  "Kambing Gunung",
  "Bebek Goyang",
  "Harimau Sumatera",
  "Elang Jawa Gagah",
  "Kupu-Kupu Malam",
  "Sapi Perah Rajin",
  "Monyet Kayang",
  "Panda Pemalas",
  "Beruang Madu",
  "Rusa Berlari",
  "Komodo Purba",
];

// Handler
export default async function handler(leni) {
  const { q, msg, lenwy, replyJid, pushname, LenwyText } = leni;

  const ctx = msg.message?.extendedTextMessage?.contextInfo;
  const target = ctx?.mentionedJid?.[0] || ctx?.participant;

  const nama = q?.trim() || (target ? `@${target.split("@")[0]}` : pushname || "Kamu");
  const khodam = KHODAM[Math.floor(Math.random() * KHODAM.length)];

  await lenwy.sendMessage(replyJid, {
    text:
      `🔮 *CEK KHODAM*\n\n` +
      `👤 Nama: ${nama}\n` +
      `✨ Khodam: *${khodam}*\n\n` +
      `_Hasil 100% iseng & hiburan 😄_`,
    mentions: target ? [target] : [],
  });
}
