import axios from "axios";

// Metadata
export const info = {
  name: "YouTube MP3",

  menu: ["Ytmp3"],
  case: ["ytmp3", "yta", "ytaudio"],

  description: "Download audio (MP3) dari YouTube",
  hidden: false,

  owner: false,
  premium: false,
  group: false,
  private: false,
  admin: false,
  botAdmin: false,

  allowPrivate: false,
};

// Handler
export default async function handler(leni) {
  const { q, lenwy, replyJid, LenwyText, LenwyWait } = leni;

  const youtubeRegex = /(?:youtu\.be\/|v=|v\/|embed\/|shorts\/)([\w-]{11})/i;

  if (!q) return LenwyText("⚠ *Mana Link YouTube-nya?*");
  if (!youtubeRegex.test(q)) return LenwyText("❌ *Link YouTube Tidak Valid.*");

  LenwyWait();

  try {
    const apiUrl = `https://api.fromscratch.web.id/v1/api/down/youtube?url=${encodeURIComponent(
      q,
    )}&type=mp3`;
    const { data: response } = await axios.get(apiUrl, { timeout: 60000 });

    if (response.status !== 200 || !response.data?.download_url)
      return LenwyText("❌ *Gagal mengunduh audio.*");

    const { title, download_url } = response.data;

    const audioRes = await axios.get(download_url, {
      responseType: "arraybuffer",
      timeout: 60000,
      headers: { "User-Agent": "Mozilla/5.0" },
    });

    await lenwy.sendMessage(replyJid, {
      audio: Buffer.from(audioRes.data),
      mimetype: "audio/mpeg",
      fileName: `${title || "audio"}.mp3`,
    });
  } catch (error) {
    console.error("YTMP3 Error:", error?.message || error);
    LenwyText("❌ Gagal mengunduh audio YouTube.");
  }
}
