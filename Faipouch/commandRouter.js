// Router perintah — mendeteksi apakah kalimat user adalah perintah sistem
// (buka app, cek statistik, atur volume) atau obrolan biasa untuk diteruskan ke AI.
//
// Ai4Chat tidak punya tool-calling asli, jadi deteksi ini pakai pattern matching
// (regex), bukan reasoning AI. Ini kompromi yang disepakati dari awal.

const PATTERNS = [
  {
    type: "open_app",
    regex: /\b(?:buka|jalankan|nyalakan|start)\s+(.+)/i,
    extract: (m) => m[1].trim(),
  },
  {
    type: "system_stats",
    regex: /\b(?:cek|lihat|tampilkan|berapa)\s*(?:statistik|status)?\s*(?:cpu|ram|memori|memory|sistem|laptop)\b/i,
  },
  {
    type: "volume_up",
    regex: /\b(?:naikkan|tambah|perbesar|kencangkan)\s*(?:volume|suara)\b/i,
  },
  {
    type: "volume_down",
    regex: /\b(?:turunkan|kecilkan|kurangi|pelankan)\s*(?:volume|suara)\b/i,
  },
  {
    type: "volume_mute",
    regex: /\b(?:mute|senyapkan|matikan suara|bisukan)\b/i,
  },
];

// Mengembalikan { type, payload } — type "chat" berarti diteruskan ke AI biasa
export function parseCommand(text) {
  for (const pattern of PATTERNS) {
    const match = text.match(pattern.regex);
    if (match) {
      return {
        type: pattern.type,
        payload: pattern.extract ? pattern.extract(match) : null,
      };
    }
  }
  return { type: "chat", payload: null };
}
