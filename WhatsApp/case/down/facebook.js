import axios from "axios";

// Metadata
export const info = {
  name: "Facebook Downloader",

  menu: ["Fb"],
  case: ["fb", "fbdl", "facebook"],

  description: "Download video Facebook",
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
  const { q, LenwyText, LenwyWait, LenwyVideo } = leni;

  const fbRegex = /(facebook\.com|fb\.watch|fb\.com)\//i;

  if (!q) return LenwyText("⚠ *Mana Link Facebook-nya?*");
  if (!fbRegex.test(q)) return LenwyText("❌ *Link Facebook Tidak Valid.*");

  LenwyWait();

  try {
    const apiUrl = `https://api.fromscratch.web.id/v1/api/down/facebook?url=${encodeURIComponent(
      q,
    )}`;
    const { data: response } = await axios.get(apiUrl, { timeout: 45000 });

    const d = response?.data || {};
    const videoUrl =
      d.hd || d.sd || d.download_url || d.url || (Array.isArray(d) && d[0]?.url);

    if (!videoUrl) return LenwyText("❌ *Gagal mengunduh video.*");

    await LenwyVideo(videoUrl, "🎁 *Lenwy Facebook Downloader*");
  } catch (error) {
    console.error("FB Error:", error?.message || error);
    LenwyText("❌ Gagal mengunduh dari Facebook.");
  }
}
