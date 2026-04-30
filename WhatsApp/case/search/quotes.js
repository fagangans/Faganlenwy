import axios from "axios";

async function translateToID(text) {
  try {
    const res = await axios.get("https://api.mymemory.translated.net/get", {
      params: {
        q: text,
        langpair: "en|id",
        de: "emailmu@gmail.com", // Opsional
      },
    });
    return res.data?.responseData?.translatedText || text;
  } catch {
    return text;
  }
}

export const info = {
  name: "Quotes",
  menu: ["quotes"],
  case: ["quotes", "motivation",],
  description: "Mengambil Kutipan Motivasi Acak",
  hidden: false,
  owner: false,
  premium: false,
  group: false,
  private: false,
  admin: false,
  botAdmin: false,
  allowPrivate: false,
};

export default async function handler(leni) {
  const {
    command,
    lenwyreply,
    m,
  } = leni;

  switch (command) {
    case "motivation":
    case "quotes":
      {
        try {
          const response = await axios.get("https://motivational-spark-api.vercel.app/api/quotes/random");
          const data = response.data;

          const originalQuote = data.quote;
          const originalAuthor = data.author;

          const translatedQuote = await translateToID(originalQuote);
          
          const message = `*Quote of the Day*\n\n` + `"${translatedQuote}"\n@${originalAuthor}`;

          lenwyreply(message, m);
        } catch (error) {
          console.error(error);
          lenwyreply("⚠️ Maaf, gagal mengambil atau menerjemahkan quotes. Coba lagi nanti.", m);
        }
      }
      break;
  }
}
