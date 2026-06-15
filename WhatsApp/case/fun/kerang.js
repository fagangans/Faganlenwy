// Metadata
export const info = {
  name: "Kerang Ajaib",

  menu: ["Kerang"],
  case: ["kerang", "8ball", "tanyakerang"],

  description: "Tanya apa saja ke kerang ajaib",
  hidden: false,

  owner: false,
  premium: false,
  group: false,
  private: false,
  admin: false,
  botAdmin: false,

  allowPrivate: true,
};

const JAWABAN = [
  "Ya, pasti!",
  "Tidak.",
  "Mungkin saja.",
  "Coba lagi nanti.",
  "Sudah pasti iya!",
  "Jangan harap.",
  "Tentu saja!",
  "Tidak mungkin.",
  "Bisa jadi.",
  "Aku rasa tidak.",
  "Yakin banget, iya!",
  "Sepertinya tidak deh.",
  "100% benar!",
  "Lupakan saja.",
];

// Handler
export default async function handler(leni) {
  const { q, LenwyText } = leni;

  if (!q)
    return LenwyText("🐚 *Contoh:* .kerang Apakah aku akan kaya?");

  const jawab = JAWABAN[Math.floor(Math.random() * JAWABAN.length)];

  await LenwyText(`🐚 *Kerang Ajaib*\n\n❓ ${q.trim()}\n💬 *${jawab}*`);
}
