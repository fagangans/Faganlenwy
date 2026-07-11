// Generate gambar robot JARVIS untuk dashboard Faipouch — jalankan SEKALI di komputer
// kamu (bukan di sandbox ini, karena sandbox tidak punya akses ke image generator).
//
// Cara pakai:
//   node Faipouch/generateRobot.js
//
// Kalau hasilnya kurang cocok, jalankan lagi (tiap run dapat variasi baru karena
// tidak pakai seed tetap) sampai ketemu yang pas, atau edit PROMPT di bawah.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { generateImageWithFallback } from "../WhatsApp/scrape/ImageGen.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, "public");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "robot.png");

const PROMPT =
  "detailed futuristic AI robot head and upper chest, JARVIS style holographic assistant, " +
  "glowing cyan blue circuit accents, dark sleek metallic armor, front facing, centered portrait, " +
  "symmetrical, dark background, cinematic dramatic lighting, high detail, digital art";

async function main() {
  console.log("🤖 Generating robot image...");
  console.log(`Prompt: ${PROMPT}\n`);

  try {
    const buffer = await generateImageWithFallback(PROMPT, "realism", {
      width: 768,
      height: 768,
    });

    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    fs.writeFileSync(OUTPUT_FILE, buffer);

    console.log(`✅ Berhasil! Gambar disimpan di: ${OUTPUT_FILE}`);
    console.log(`   Ukuran: ${Math.round(buffer.length / 1024)} KB`);
    console.log(`\nRestart Faipouch server (node Faipouch/server.js) untuk melihat hasilnya.`);
    console.log(`Kurang cocok? Jalankan lagi: node Faipouch/generateRobot.js`);
  } catch (err) {
    console.error("❌ Gagal generate gambar:", err.message);
    console.error("Coba lagi dalam beberapa detik, atau cek koneksi internet.");
    process.exit(1);
  }
}

main();
