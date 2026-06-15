import axios from "axios";

// Metadata
export const info = {
  name: "Translate",

  menu: ["Translate"],
  case: ["tr", "translate", "terjemah"],

  description: "Terjemahkan teks (mis. .tr en Selamat pagi)",
  hidden: false,

  owner: false,
  premium: false,
  group: false,
  private: false,
  admin: false,
  botAdmin: false,

  allowPrivate: true,
};

// Handler — sumber: Google Translate (gratis, tanpa API key)
export default async function handler(leni) {
  const { args, LenwyText, LenwyWait } = leni;

  if (!args.length)
    return LenwyText(
      "🌐 *Translate*\n\n*Contoh:*\n.tr en Selamat pagi\n.tr id Good morning\n.tr ja Terima kasih",
    );

  // Arg pertama = kode bahasa tujuan bila berupa 2 huruf, sisanya = teks.
  let target = "id";
  let text;

  if (/^[a-z]{2}$/i.test(args[0])) {
    target = args[0].toLowerCase();
    text = args.slice(1).join(" ");
  } else {
    text = args.join(" ");
  }

  if (!text) return LenwyText("❌ Masukkan teks yang ingin diterjemahkan.");

  LenwyWait();

  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${target}&dt=t&q=${encodeURIComponent(
      text,
    )}`;
    const { data } = await axios.get(url, { timeout: 15000 });

    const translated = (data?.[0] || [])
      .map((part) => part?.[0])
      .filter(Boolean)
      .join("");

    if (!translated) return LenwyText("❌ Gagal menerjemahkan.");

    await LenwyText(`🌐 *Translate → ${target.toUpperCase()}*\n\n${translated}`);
  } catch (err) {
    console.error("Translate Error:", err?.message || err);
    LenwyText("❌ Gagal menerjemahkan teks.");
  }
}
