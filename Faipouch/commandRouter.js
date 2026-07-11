// Router perintah — mendeteksi apakah kalimat user adalah perintah sistem
// (buka app, cek statistik, atur volume, reminder, cari file, screenshot)
// atau obrolan biasa untuk diteruskan ke AI.
//
// Ai4Chat tidak punya tool-calling asli, jadi deteksi ini pakai pattern matching
// (regex), bukan reasoning AI. Ini kompromi yang disepakati dari awal.

const UNIT_MS = { detik: 1000, menit: 60000, jam: 3600000 };

const PATTERNS = [
  {
    type: "reminder",
    regex: /\b(?:ingatkan|reminder)\b(?:\s+saya)?\s+(?:dalam\s+)?(\d+)\s*(detik|menit|jam)(?:\s+lagi)?\s*(?:untuk|buat|bahwa|kalau)?\s*(.*)/i,
    extract: (m) => ({
      delayMs: parseInt(m[1], 10) * UNIT_MS[m[2].toLowerCase()],
      amount: m[1],
      unit: m[2],
      message: m[3]?.trim() || "waktunya!",
    }),
  },
  {
    type: "search_file",
    regex: /\b(?:cari|temukan)\s+(?:file|dokumen)\s+(.+)/i,
    extract: (m) => m[1].trim(),
  },
  {
    type: "screenshot_analyze",
    regex: /\b(?:lihat|analisis|jelaskan|cek)\s*(?:layar|screen|screenshot)\b|^\s*screenshot\s*$/i,
  },
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
