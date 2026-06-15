// Metadata
export const info = {
  name: "Cek Jodoh",

  menu: ["Cekjodoh", "Cekganteng", "Cekcantik"],
  case: ["cekjodoh", "cekganteng", "cekcantik", "cekgombal"],

  description: "Cek persentase (iseng/hiburan)",
  hidden: false,

  owner: false,
  premium: false,
  group: false,
  private: false,
  admin: false,
  botAdmin: false,

  allowPrivate: true,
};

const GOMBAL = [
  "Kamu pasti capek ya? Soalnya dari tadi muter-muter di pikiranku.",
  "Apa kamu tukang parkir? Soalnya kamu bikin jantungku berhenti.",
  "Namamu pasti Google ya? Karena kamu punya semua yang aku cari.",
  "Kalau jadian itu pelajaran, aku mau jadi murid terajin.",
  "Kamu bukan gravitasi, tapi kok aku jatuh terus ke kamu?",
];

// Handler
export default async function handler(leni) {
  const { command, q, pushname, LenwyText } = leni;

  if (command === "cekgombal") {
    const g = GOMBAL[Math.floor(Math.random() * GOMBAL.length)];
    return LenwyText(`💘 *Gombalan Receh*\n\n${g}`);
  }

  const persen = Math.floor(Math.random() * 101);
  const bar =
    "█".repeat(Math.round(persen / 10)) +
    "░".repeat(10 - Math.round(persen / 10));

  if (command === "cekjodoh") {
    if (!q)
      return LenwyText("💑 *Contoh:* .cekjodoh Andi & Siti");
    return LenwyText(
      `💑 *Cek Jodoh*\n\n${q.trim()}\n\n${bar} *${persen}%*\n\n_Hasil iseng & hiburan 😄_`,
    );
  }

  const label = command === "cekganteng" ? "Kegantengan" : "Kecantikan";
  const nama = q?.trim() || pushname || "Kamu";
  await LenwyText(
    `✨ *Cek ${label}*\n\n👤 ${nama}\n${bar} *${persen}%*\n\n_Hasil iseng & hiburan 😄_`,
  );
}
