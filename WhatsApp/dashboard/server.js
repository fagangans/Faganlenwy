// =====================================================================
//  Lenwy Dashboard — panel kontrol bot via browser
//  Jalankan terpisah:  node WhatsApp/dashboard/server.js
//  Buka:               http://localhost:3000
//  Password aksi:      set DASHBOARD_PASS di .env (default "lenwy")
//  Port:               set DASHBOARD_PORT di .env (default 3000)
// =====================================================================

import express from "express";
import fs from "fs";
import path from "path";

const ROOT = path.join(process.cwd(), "WhatsApp", "database");
const PLAYERS = path.join(ROOT, "game", "players.json");
const KNOWLEDGE = path.join(ROOT, "system", "knowledge.json");
const PREMIUM = path.join(ROOT, "premium.json");
const CREATOR = path.join(ROOT, "creator.json");
const LOG = path.join(ROOT, "system", "command.log");

const PASS = process.env.DASHBOARD_PASS || "lenwy";
const PORT = process.env.DASHBOARD_PORT || 3000;

const app = express();
app.use(express.json());

// ---- util baca/tulis JSON ----
const readJSON = (p, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return fallback;
  }
};
const writeJSON = (p, data) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
};
const toJid = (num) =>
  `${String(num).replace(/\D/g, "")}@s.whatsapp.net`;

const auth = (req, res) => {
  if ((req.body?.pass || "") !== PASS) {
    res.status(401).json({ ok: false, error: "Password salah." });
    return false;
  }
  return true;
};

// ---- API: statistik ----
app.get("/api/stats", (req, res) => {
  const players = readJSON(PLAYERS, {});
  const knowledge = readJSON(KNOWLEDGE, []);
  const premium = readJSON(PREMIUM, []);
  const creator = readJSON(CREATOR, []);

  const top = Object.entries(players)
    .map(([id, p]) => ({ id, ...p }))
    .sort((a, b) => (b.xp || 0) - (a.xp || 0))
    .slice(0, 10);

  let recentLogs = [];
  try {
    recentLogs = fs
      .readFileSync(LOG, "utf8")
      .trim()
      .split("\n")
      .slice(-20)
      .reverse();
  } catch {}

  res.json({
    ok: true,
    counts: {
      players: Object.keys(players).length,
      premium: premium.length,
      creator: creator.length,
      knowledge: knowledge.length,
    },
    top,
    knowledge,
    premium,
    recentLogs,
  });
});

// ---- API: premium ----
app.post("/api/premium/add", (req, res) => {
  if (!auth(req, res)) return;
  const num = req.body?.number;
  if (!num) return res.json({ ok: false, error: "Nomor kosong." });
  const list = readJSON(PREMIUM, []);
  const jid = toJid(num);
  if (!list.includes(jid)) list.push(jid);
  writeJSON(PREMIUM, list);
  res.json({ ok: true });
});

app.post("/api/premium/remove", (req, res) => {
  if (!auth(req, res)) return;
  const jid = toJid(req.body?.number);
  let list = readJSON(PREMIUM, []).filter((x) => x !== jid);
  writeJSON(PREMIUM, list);
  res.json({ ok: true });
});

// ---- API: knowledge ----
app.post("/api/knowledge/add", (req, res) => {
  if (!auth(req, res)) return;
  const text = (req.body?.text || "").trim();
  if (!text) return res.json({ ok: false, error: "Teks kosong." });
  const list = readJSON(KNOWLEDGE, []);
  list.push(text);
  writeJSON(KNOWLEDGE, list);
  res.json({ ok: true });
});

app.post("/api/knowledge/remove", (req, res) => {
  if (!auth(req, res)) return;
  const i = parseInt(req.body?.index, 10);
  const list = readJSON(KNOWLEDGE, []);
  if (i >= 1 && i <= list.length) list.splice(i - 1, 1);
  writeJSON(KNOWLEDGE, list);
  res.json({ ok: true });
});

// ---- Halaman dashboard ----
app.get("/", (req, res) => {
  res.type("html").send(PAGE);
});

app.listen(PORT, () => {
  console.log(`\n  🌐 Lenwy Dashboard aktif di http://localhost:${PORT}`);
  console.log(`  🔑 Password aksi: ${PASS} (ubah via DASHBOARD_PASS)\n`);
});

// =====================================================================
//  HTML (single page, vanilla JS)
// =====================================================================
const PAGE = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Lenwy Dashboard</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; font-family: system-ui, sans-serif; }
  body { background: #0f1117; color: #e6e6e6; padding: 20px; }
  h1 { font-size: 22px; margin-bottom: 4px; }
  .sub { color: #888; font-size: 13px; margin-bottom: 20px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 24px; }
  .card { background: #1a1d27; border: 1px solid #262a36; border-radius: 12px; padding: 16px; }
  .card .n { font-size: 28px; font-weight: 700; color: #4ade80; }
  .card .l { color: #999; font-size: 13px; margin-top: 4px; }
  .panel { background: #1a1d27; border: 1px solid #262a36; border-radius: 12px; padding: 16px; margin-bottom: 20px; }
  .panel h2 { font-size: 15px; margin-bottom: 12px; color: #cbd5e1; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 8px; border-bottom: 1px solid #262a36; }
  th { color: #888; font-weight: 500; }
  input, button { padding: 8px 10px; border-radius: 8px; border: 1px solid #333; background: #0f1117; color: #eee; font-size: 13px; }
  button { background: #2563eb; border: none; cursor: pointer; }
  button:hover { background: #1d4ed8; }
  button.del { background: #dc2626; padding: 4px 8px; }
  .row { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
  .row input { flex: 1; min-width: 120px; }
  .logs { font-family: monospace; font-size: 11px; color: #94a3b8; max-height: 240px; overflow-y: auto; white-space: pre-wrap; line-height: 1.6; }
  li { list-style: none; padding: 6px 0; border-bottom: 1px solid #262a36; display: flex; justify-content: space-between; gap: 8px; font-size: 13px; }
</style>
</head>
<body>
  <h1>🤖 Lenwy Dashboard</h1>
  <div class="sub">Panel kontrol bot WhatsApp — statistik & manajemen</div>

  <div class="grid" id="counts"></div>

  <div class="panel">
    <h2>🏆 Top 10 Pemain (XP)</h2>
    <table id="leaderboard"><thead><tr><th>#</th><th>Nama</th><th>Level</th><th>XP</th><th>Balance</th><th>Menang</th></tr></thead><tbody></tbody></table>
  </div>

  <div class="panel">
    <h2>⭐ Premium User</h2>
    <div class="row">
      <input id="premNum" placeholder="Nomor (mis. 628xxx)" />
      <input id="premPass" type="password" placeholder="Password" />
      <button onclick="addPremium()">Tambah</button>
    </div>
    <ul id="premList"></ul>
  </div>

  <div class="panel">
    <h2>📚 Knowledge Base AI</h2>
    <div class="row">
      <input id="kbText" placeholder="Data baru (mis. Toko buka 08-21)" />
      <input id="kbPass" type="password" placeholder="Password" />
      <button onclick="addKnowledge()">Tambah</button>
    </div>
    <ul id="kbList"></ul>
  </div>

  <div class="panel">
    <h2>📜 Log Terbaru</h2>
    <div class="logs" id="logs"></div>
  </div>

<script>
async function load() {
  const r = await fetch('/api/stats');
  const d = await r.json();

  document.getElementById('counts').innerHTML = [
    ['Pemain', d.counts.players],
    ['Premium', d.counts.premium],
    ['Owner', d.counts.creator],
    ['Data AI', d.counts.knowledge],
  ].map(([l,n]) => '<div class="card"><div class="n">'+n+'</div><div class="l">'+l+'</div></div>').join('');

  document.querySelector('#leaderboard tbody').innerHTML = d.top.map((p,i) =>
    '<tr><td>'+(i+1)+'</td><td>'+(p.name||'-')+'</td><td>'+(p.level||1)+'</td><td>'+(p.xp||0)+'</td><td>'+(p.balance||0)+'</td><td>'+(p.wins||0)+'</td></tr>'
  ).join('') || '<tr><td colspan=6>Belum ada data</td></tr>';

  document.getElementById('premList').innerHTML = d.premium.map(j =>
    '<li><span>'+j.split('@')[0]+'</span><button class="del" onclick="rmPremium(\\''+j.split('@')[0]+'\\')">Hapus</button></li>'
  ).join('') || '<li>Belum ada premium</li>';

  document.getElementById('kbList').innerHTML = d.knowledge.map((t,i) =>
    '<li><span>'+(i+1)+'. '+t+'</span><button class="del" onclick="rmKnowledge('+(i+1)+')">Hapus</button></li>'
  ).join('') || '<li>Belum ada data</li>';

  document.getElementById('logs').textContent = d.recentLogs.join('\\n') || 'Belum ada log';
}

async function post(url, body) {
  const r = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
  const d = await r.json();
  if (!d.ok) alert(d.error || 'Gagal');
  return d.ok;
}

async function addPremium() {
  const number = document.getElementById('premNum').value;
  const pass = document.getElementById('premPass').value;
  if (await post('/api/premium/add', { number, pass })) { document.getElementById('premNum').value=''; load(); }
}
async function rmPremium(number) {
  const pass = prompt('Password:');
  if (pass && await post('/api/premium/remove', { number, pass })) load();
}
async function addKnowledge() {
  const text = document.getElementById('kbText').value;
  const pass = document.getElementById('kbPass').value;
  if (await post('/api/knowledge/add', { text, pass })) { document.getElementById('kbText').value=''; load(); }
}
async function rmKnowledge(index) {
  const pass = prompt('Password:');
  if (pass && await post('/api/knowledge/remove', { index, pass })) load();
}

load();
setInterval(load, 10000);
</script>
</body>
</html>`;
