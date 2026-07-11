// Memori percakapan Faipouch — disimpan ke file JSON supaya AI tetap "ingat"
// obrolan sebelumnya walau server di-restart (beda dari memori WhatsApp bot yang cuma di RAM).

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_DIR = path.join(__dirname, "database");
const HISTORY_FILE = path.join(DB_DIR, "history.json");
const DOC_FILE = path.join(DB_DIR, "document.json");

const MAX_MESSAGES = 16; // simpan 16 pesan terakhir (~8 giliran tanya-jawab)

function readJSON(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJSON(filePath, data) {
  fs.mkdirSync(DB_DIR, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

export function getHistory() {
  return readJSON(HISTORY_FILE, []);
}

export function addMessage(role, text) {
  const messages = getHistory();
  messages.push({ role, text });
  writeJSON(HISTORY_FILE, messages.slice(-MAX_MESSAGES));
}

export function clearHistory() {
  writeJSON(HISTORY_FILE, []);
}

// Ringkasan dokumen terakhir yang di-upload user (PDF/gambar/dll) — supaya bisa
// ditanya lanjutan ("apa isi dokumen tadi?") tanpa upload ulang.
export function getLastDocument() {
  return readJSON(DOC_FILE, null);
}

export function setLastDocument(fileName, summary) {
  writeJSON(DOC_FILE, { fileName, summary, uploadedAt: Date.now() });
}
