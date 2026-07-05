// Metadata
export const info = {
  name: "List Semua Fitur",

  menu: ["List"],
  case: ["list", "fiturbot", "bantuan"],

  description: "Tampilkan semua fitur bot secara lengkap",
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
  const { LenwyText } = leni;

  const text =
    `📋 *DAFTAR LENGKAP FITUR BOT*\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `🤖 *AI (Kecerdasan Buatan)*\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `➤ .ai [pertanyaan] — Tanya AI apapun\n` +
    `➤ .aisuara [pertanyaan] — Tanya AI, jawaban dikirim teks + voice note\n` +
    `➤ .resetai — Reset memori percakapan AI\n` +
    `➤ .imagine [deskripsi] — Generate gambar dari teks dengan AI\n` +
    `➤ .imagine list — Lihat semua gaya (anime, realis, 3d, dll)\n` +
    `➤ .publicai [pertanyaan] — AI alternatif\n` +
    `➤ .webpilot [pertanyaan] — AI + pencarian web\n` +
    `➤ .remini — HD-kan foto dengan AI\n` +
    `➤ .tambahdata [teks] — Ajari AI data baru (Owner)\n` +
    `➤ .listdata — Lihat data yang diajarkan ke AI\n` +
    `➤ .hapusdata [nomor] — Hapus data AI\n` +
    `➤ .aimodel [model] — Pilih model AI (gemini-flash/gemini-pro/groq-llama/groq-fast/default)\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `📥 *DOWNLOAD*\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `➤ .tiktok [link] — Download video TikTok\n` +
    `➤ .ig [link] — Download video/foto Instagram\n` +
    `➤ .fb [link] — Download video Facebook\n` +
    `➤ .yt [link] — Download video YouTube\n` +
    `➤ .ytmp3 [link] — Download audio YouTube\n` +
    `➤ .yts [judul] — Cari video YouTube\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `🛠️ *TOOLS*\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `➤ .calc [ekspresi] — Kalkulator pintar\n` +
    `➤ .cuaca [kota] — Info cuaca real-time\n` +
    `➤ .kurs [mata uang] — Konversi kurs\n` +
    `➤ .tts [teks] — Text to speech (voice note)\n` +
    `➤ .tr [kode bahasa] [teks] — Terjemahan\n` +
    `➤ .remind [waktu] [pesan] — Pengingat\n` +
    `➤ .qr [teks/link] — Buat QR code\n` +
    `➤ .short [link] — Perpendek URL\n` +
    `➤ .jadwalsholat [kota] — Jadwal sholat\n` +
    `➤ .ss [link] — Screenshot website\n` +
    `➤ .removebg — Hapus background foto\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `🛍️ *CUSTOMER SERVICE*\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `➤ .produk / .katalog — Lihat katalog produk\n` +
    `➤ .order / .pesan — Mulai pesan produk lewat chat\n` +
    `➤ .tambahproduk [nama|harga|stok|deskripsi] — Tambah produk (Owner)\n` +
    `➤ .hapusproduk [nama] — Hapus produk (Owner)\n` +
    `➤ .editstok [nama|stok] — Ubah stok produk (Owner)\n` +
    `➤ .listpesanan — Lihat pesanan masuk (Owner)\n` +
    `➤ .detailpesanan [id] — Detail satu pesanan (Owner)\n` +
    `➤ .updatepesanan [id|status] — Ubah status pesanan (Owner)\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `🎮 *GAME*\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `➤ .gamemenu — Lihat daftar lengkap game\n` +
    `➤ .math — Kuis matematika\n` +
    `➤ .tebakkata — Tebak kata\n` +
    `➤ .tekateki — Teka-teki klasik\n` +
    `➤ .asahotak — Asah otak\n` +
    `➤ .caklontong — Kuis Cak Lontong\n` +
    `➤ .susunkata — Susun huruf acak\n` +
    `➤ .tictactoe — Main TicTacToe\n` +
    `➤ .suit — Batu gunting kertas\n` +
    `➤ .sambungkata — Sambung kata\n` +
    `➤ .siapakahaku — Tebak siapakah aku\n` +
    `➤ .family100 — Family 100\n` +
    `➤ .truth / .dare — Truth or Dare\n` +
    `➤ .profile — Profil game kamu\n` +
    `➤ .leaderboard — Top pemain\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `😄 *FUN*\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `➤ .khodam [nama] — Cek khodam\n` +
    `➤ .kerang [pertanyaan] — Kerang ajaib\n` +
    `➤ .cekjodoh [nama & nama] — Cek jodoh\n` +
    `➤ .cekganteng [nama] — Cek kegantengan\n` +
    `➤ .cekcantik [nama] — Cek kecantikan\n` +
    `➤ .cekgombal — Gombalan receh\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `🔄 *CONVERT*\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `➤ .sticker — Buat sticker dari foto/video\n` +
    `➤ .toimage — Ubah sticker jadi gambar\n` +
    `➤ .brat — Buat brat sticker\n` +
    `➤ .emojimix — Gabungkan 2 emoji\n` +
    `➤ .quote — Quote sticker\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `🔍 *SEARCH*\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `➤ .pin [kata kunci] — Cari gambar Pinterest\n` +
    `➤ .waifu — Random waifu\n` +
    `➤ .charinfo [nama] — Biodata karakter anime\n` +
    `➤ .quotes — Kutipan motivasi acak\n` +
    `➤ .preset — Random preset Alight Motion\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `👥 *GROUP (Admin)*\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `➤ .tagall — Mention semua anggota\n` +
    `➤ .hidetag [pesan] — Tag tersembunyi\n` +
    `➤ .kick — Keluarkan anggota\n` +
    `➤ .add [nomor] — Tambah anggota\n` +
    `➤ .promote — Jadikan admin\n` +
    `➤ .demote — Cabut admin\n` +
    `➤ .open / .close — Buka/tutup grup\n` +
    `➤ .antilink on/off — Anti link grup\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `ℹ️ *LAINNYA*\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `➤ .ping — Cek status bot\n` +
    `➤ .menu — Daftar kategori menu\n` +
    `➤ .allmenu — Semua perintah\n` +
    `➤ .gamemenu — Daftar game lengkap\n\n` +
    `💡 *Tips:* Kirim pesan tanpa prefix untuk langsung dijawab AI!\n` +
    `☘️ *Lenwy From Scratch*`;

  await LenwyText(text);
}
