import axios from "axios";

// Metadata
export const info = {
  name: "Instagram Downloader",

  menu: ["Ig"],
  case: ["ig", "igdl", "instagram"],

  description: "Download video/foto Instagram",
  hidden: false,

  owner: false,
  premium: false,
  group: false,
  private: false,
  admin: false,
  botAdmin: false,

  allowPrivate: false,
};

// Ambil URL media dari berbagai kemungkinan bentuk respons API
function pickMedia(data) {
  if (!data) return [];
  if (Array.isArray(data))
    return data.map((d) => d?.url || d?.download_url || d).filter(Boolean);
  if (data.url) return [data.url];
  if (data.download_url) return [data.download_url];
  if (Array.isArray(data.media))
    return data.media.map((m) => m?.url || m).filter(Boolean);
  if (Array.isArray(data.result))
    return data.result.map((m) => m?.url || m).filter(Boolean);
  return [];
}

// Handler
export default async function handler(leni) {
  const { q, lenwy, replyJid, LenwyText, LenwyWait } = leni;

  const igRegex = /instagram\.com\/(p|reel|reels|tv)\//i;

  if (!q) return LenwyText("⚠ *Mana Link Instagram-nya?*");
  if (!igRegex.test(q)) return LenwyText("❌ *Link Instagram Tidak Valid.*");

  LenwyWait();

  try {
    const apiUrl = `https://api.fromscratch.web.id/v1/api/down/instagram?url=${encodeURIComponent(
      q,
    )}`;
    const { data: response } = await axios.get(apiUrl, { timeout: 45000 });

    const medias = pickMedia(response?.data);
    if (!medias.length) return LenwyText("❌ *Gagal mengambil media.*");

    for (const url of medias.slice(0, 5)) {
      const isVideo = /\.mp4|video/i.test(url);
      if (isVideo) {
        await lenwy.sendMessage(replyJid, {
          video: { url },
          caption: "🎁 *Lenwy Instagram Downloader*",
        });
      } else {
        await lenwy.sendMessage(replyJid, {
          image: { url },
          caption: "🎁 *Lenwy Instagram Downloader*",
        });
      }
    }
  } catch (error) {
    console.error("IG Error:", error?.message || error);
    LenwyText("❌ Gagal mengunduh dari Instagram.");
  }
}
