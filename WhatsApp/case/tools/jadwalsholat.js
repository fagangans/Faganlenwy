import axios from "axios";

// Metadata
export const info = {
  name: "Jadwal Sholat",

  menu: ["Jadwalsholat"],
  case: ["jadwalsholat", "sholat", "jadwal"],

  description: "Jadwal sholat kota di Indonesia",
  hidden: false,

  owner: false,
  premium: false,
  group: false,
  private: false,
  admin: false,
  botAdmin: false,

  allowPrivate: true,
};

// Handler — sumber: api.myquran.com (gratis, tanpa API key)
export default async function handler(leni) {
  const { q, LenwyText, LenwyWait } = leni;

  if (!q) return LenwyText("🕌 *Contoh:* .jadwalsholat Jakarta");

  LenwyWait();

  try {
    // 1) Cari ID kota
    const { data: kota } = await axios.get(
      `https://api.myquran.com/v2/sholat/kota/cari/${encodeURIComponent(
        q.trim(),
      )}`,
      { timeout: 15000 },
    );

    const found = kota?.data?.[0];
    if (!found) return LenwyText("❌ Kota tidak ditemukan. Coba nama lain.");

    // 2) Ambil jadwal hari ini
    const now = new Date();
    const tgl = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
      2,
      "0",
    )}-${String(now.getDate()).padStart(2, "0")}`;

    const { data: jadwalRes } = await axios.get(
      `https://api.myquran.com/v2/sholat/jadwal/${found.id}/${tgl}`,
      { timeout: 15000 },
    );

    const j = jadwalRes?.data?.jadwal;
    if (!j) return LenwyText("❌ Gagal mengambil jadwal.");

    await LenwyText(
      `🕌 *Jadwal Sholat ${found.lokasi}*\n📅 ${j.tanggal}\n\n` +
        `🌄 Imsak: ${j.imsak}\n` +
        `🌅 Subuh: ${j.subuh}\n` +
        `☀️ Terbit: ${j.terbit}\n` +
        `🌤️ Dhuha: ${j.dhuha}\n` +
        `🕛 Dzuhur: ${j.dzuhur}\n` +
        `🌇 Ashar: ${j.ashar}\n` +
        `🌆 Maghrib: ${j.maghrib}\n` +
        `🌙 Isya: ${j.isya}`,
    );
  } catch (err) {
    console.error("JadwalSholat Error:", err?.message || err);
    LenwyText("❌ Gagal mengambil jadwal sholat.");
  }
}
