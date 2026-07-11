// Cari file berdasarkan nama di folder umum (Documents, Downloads, Desktop).
// Dibatasi kedalaman folder & jumlah hasil supaya tidak scan seluruh disk (lambat/berat).

import fs from "fs";
import path from "path";
import os from "os";

const MAX_DEPTH = 3;
const MAX_RESULTS = 8;
const SKIP_DIRS = new Set(["node_modules", ".git", "AppData", "$Recycle.Bin", "System Volume Information"]);

function getSearchRoots() {
  const home = os.homedir();
  return [
    path.join(home, "Documents"),
    path.join(home, "Downloads"),
    path.join(home, "Desktop"),
  ].filter((p) => fs.existsSync(p));
}

function walk(dir, query, depth, results) {
  if (depth > MAX_DEPTH || results.length >= MAX_RESULTS) return;

  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return; // folder tidak bisa diakses (permission dll), lewati saja
  }

  for (const entry of entries) {
    if (results.length >= MAX_RESULTS) return;
    if (SKIP_DIRS.has(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      walk(fullPath, query, depth + 1, results);
    } else if (entry.name.toLowerCase().includes(query)) {
      results.push(fullPath);
    }
  }
}

// Cari file yang namanya mengandung `query`, kembalikan array path (maks MAX_RESULTS)
export function searchFiles(query) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];

  const results = [];
  for (const root of getSearchRoots()) {
    if (results.length >= MAX_RESULTS) break;
    walk(root, normalized, 0, results);
  }

  return results;
}
