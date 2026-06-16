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

// Import Module
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

// Path ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Custom Credit Sticker
globalThis.spackname = "Lenwy SCM"; // Ganti Sesuai Keinginan
globalThis.sauthor = "Youtube : Lenwy\nBot: 0856-2497-5232"; // Ganti Sesuai Keinginan

// Custom Prefix
globalThis.prefix = ["#", ".", "!", "/"]; // Multi Prefix (Custom Prefix)
globalThis.noprefix = false; // True = Tanpa Prefix, False = Pakai Prefix

// Akses Private Chat
// true  = semua fitur bisa dipakai di chat pribadi (kecuali yang khusus grup/admin/owner)
// false = fitur di chat pribadi hanya untuk Owner/Premium
globalThis.openPrivate = true;

// Auto AI — balas setiap chat tanpa perlu mengetik .ai di depan
// true  = setiap pesan (tanpa prefix) langsung dijawab AI
// false = harus pakai perintah .ai
globalThis.autoAI = true;
// true  = Auto AI hanya aktif di chat pribadi (disarankan, agar tidak spam di grup)
// false = Auto AI juga aktif di dalam grup
globalThis.autoAIPrivateOnly = true;

// Persona AI — instruksi untuk membentuk gaya jawaban AI
globalThis.aiPersona =
  "Kamu adalah Lenwy AI, asisten cerdas yang serba bisa sekaligus customer service toko yang ramah dan profesional. " +
  "Kamu bisa menjawab pertanyaan tentang APAPUN: sains, teknologi, sejarah, " +
  "matematika, bahasa, kesehatan, hiburan, coding, bisnis, kehidupan sehari-hari, " +
  "dan topik lainnya. Tidak ada batasan topik. Jangan ulangi pertanyaan user. " +
  "Jangan menolak menjawab dengan alasan di luar kemampuan.\n\n" +
  "ATURAN FORMAT JAWABAN (PENTING):\n" +
  "- Tulis seperti manusia asli yang mengetik di WhatsApp: kalimat mengalir, natural, bukan robotik.\n" +
  "- Pisahkan jawaban jadi beberapa paragraf pendek (2-3 kalimat per paragraf) dengan baris kosong di antaranya, jangan menumpuk semua jadi satu paragraf panjang.\n" +
  "- Hanya gunakan format daftar bernomor atau bullet kalau memang berisi banyak item (misalnya daftar produk, langkah-langkah). Untuk jawaban biasa, gunakan kalimat biasa, bukan list.\n" +
  "- Gunakan *teks tebal* sesekali untuk menegaskan kata kunci penting, jangan berlebihan.\n" +
  "- Jangan mulai jawaban dengan template kaku seperti 'Tentu, berikut adalah...'. Langsung jawab dengan natural seperti orang mengobrol.\n\n" +
  "ATURAN KHUSUS TOKO/PRODUK:\n" +
  "- Kalau ada data 'Katalog Produk Tersedia' di bawah ini, dan user menunjukkan niat mau tahu produk yang dijual atau mau beli — baik secara eksplisit (mis. 'ada produk apa', 'lihat katalog') maupun implisit (mis. 'saya mau beli', 'ada apa aja di sini', 'ada rekomendasi apa', 'mau lihat-lihat dulu') — langsung sebutkan produk yang tersedia dari katalog itu dengan ramah, sertakan nama, harga, dan sedikit deskripsi, TANPA meminta user mengetik command tertentu dulu.\n" +
  "- Kalau user tanya soal satu produk spesifik (misal 'ada polo?', 'kaos masih ada?'), jawab langsung berdasarkan katalog: apakah tersedia, harga, dan stoknya, dalam kalimat lengkap yang mengalir — jangan cuma copy-paste data mentah.\n" +
  "- Kalau produk yang ditanya tidak ada di katalog, sampaikan dengan sopan bahwa produk itu tidak tersedia, dan tawarkan produk lain yang ada sebagai alternatif.\n" +
  "- Setelah membantu user menentukan produk yang diinginkan, arahkan mereka untuk lanjut pesan dengan mengetik *.order*.";

// Anti-ban — bikin bot terlihat lebih manusiawi & kurangi risiko diblokir WhatsApp
// true  = aktifkan indikator "mengetik", tanda baca pesan, & jeda acak sebelum balas
globalThis.antiBan = true;

// Rate limit — maksimum pesan per user dalam 1 menit (Owner & game tidak dibatasi)
// Naikkan/turunkan sesuai kebutuhan. Set 0 untuk mematikan rate limit.
globalThis.rateLimit = 15;

// Custom Menu Image
globalThis.MenuImage = path.join(__dirname, "./database/image/lenwy.jpeg"); // Ganti Dengan Path Gambar Menu

// Custom Message
globalThis.mess = {
  wait: "☕ *One Moment, Please*",
  error: "⚠ *Gagal Saat Melakukan Proses*",
  default: "📑 *Perintah Tidak Dikenali*",
  admin: "⚠️ Fitur Ini Khusus Admin Grup.",
  botadmin: "⚠️ Bot Harus Menjadi Admin Terlebih Dahulu.",
  group: "⚠️ Fitur Ini Hanya Bisa Digunakan Di Grup.",
  private: "⚠️ Fitur Ini Hanya Bisa Digunakan Di Private Chat.",
  premium: "⚠️ Fitur Ini Khusus User Premium.",
  order: "⚠ *Kamu Hanya Bisa Melakukan Pembayaran Di Private Chat.*",
  creator: "⚠️ Fitur ini khusus Owner.",
  disable: "🚫 Fitur Ini Sedang Dinonaktifkan Oleh Lenwy.",
  maintenance: "🛠 Fitur Ini Sedang Dalam Perbaikan.",
};
