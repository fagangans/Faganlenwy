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

import axios from "axios";
import Ai4Chat from "../../scrape/Ai4Chat.js";

export const info = {
  name: "AI4Chat",

  menu: ["AI"],
  case: ["ai"],

  description: "Tanyakan Apa Saja!",
  hidden: false,

  owner: false,
  premium: false,
  group: false,
  private: false,
  admin: false,
  botAdmin: false,

  allowPrivate: true,
};

// Sumber AI cadangan bila Ai4Chat sedang down
async function askPublicAI(q) {
  const url = `https://api.fromscratch.web.id/v1/api/ai/publicai?query=${encodeURIComponent(q)}`;
  const { data } = await axios.get(url, { timeout: 20000 });
  return data?.data?.response || null;
}

// Fungsi AI yang bisa dipakai ulang (oleh perintah .ai maupun mode Auto AI).
// Mencoba beberapa sumber berurutan agar lebih andal.
export async function getAIAnswer(q) {
  let answer = null;

  try {
    answer = await Ai4Chat(q);
  } catch (err) {
    console.error("Ai4Chat gagal:", err.message);
  }

  if (!answer) {
    try {
      answer = await askPublicAI(q);
    } catch (err) {
      console.error("PublicAI gagal:", err.message);
    }
  }

  return answer;
}

export default async function handler(lenwy) {
  const { command, q, LenwyText, LenwyWait } = lenwy;

  if (command !== "ai") return;
  if (!q) return LenwyText("☘️ *Contoh:* .ai Apa itu JavaScript?");

  LenwyWait();

  const answer = await getAIAnswer(q);

  if (!answer) {
    return LenwyText("⚠️ Semua sumber AI sedang tidak merespon. Coba lagi nanti.");
  }

  await LenwyText(`*Lenwy AI*\n\n${answer}`);
}
