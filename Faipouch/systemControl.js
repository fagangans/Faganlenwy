// Kontrol sistem laptop: buka aplikasi, cek statistik, atur volume.
// Fokus utama: Windows (SendKeys via PowerShell untuk volume, "start" untuk buka app).
// macOS/Linux disediakan sebagai best-effort fallback.

import { exec } from "child_process";
import os from "os";

function execAsync(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { windowsHide: true }, (err, stdout, stderr) => {
      if (err) return reject(err);
      resolve(stdout || stderr);
    });
  });
}

// Alias nama aplikasi yang sering diucapkan → command yang dikenali OS
const APP_ALIASES = {
  chrome: "chrome",
  "google chrome": "chrome",
  notepad: "notepad",
  "catatan": "notepad",
  kalkulator: "calc",
  calculator: "calc",
  explorer: "explorer",
  "file explorer": "explorer",
  spotify: "spotify",
  cmd: "cmd",
  terminal: "cmd",
  powershell: "powershell",
  word: "winword",
  excel: "excel",
  paint: "mspaint",
  edge: "msedge",
};

// Buka aplikasi berdasarkan nama yang diucapkan user
export async function openApp(appName) {
  const key = appName.trim().toLowerCase();
  const resolved = APP_ALIASES[key] || key;
  const platform = os.platform();

  try {
    if (platform === "win32") {
      await execAsync(`start "" ${resolved}`);
    } else if (platform === "darwin") {
      await execAsync(`open -a "${resolved}"`);
    } else {
      await execAsync(`xdg-open ${resolved} || ${resolved} &`);
    }
    return { ok: true, message: `Membuka ${appName}.` };
  } catch (err) {
    return { ok: false, message: `Tidak bisa membuka ${appName}. Pastikan aplikasi terinstall.` };
  }
}

// Kontrol volume — simulasikan tombol media (VK_VOLUME_UP=175, DOWN=174, MUTE=173)
export async function controlVolume(action) {
  const platform = os.platform();

  if (platform === "win32") {
    const keyMap = { up: 175, down: 174, mute: 173 };
    const key = keyMap[action];
    if (!key) return { ok: false, message: "Perintah volume tidak dikenali." };

    const steps = action === "mute" ? 1 : 3; // beberapa kali biar perubahan terasa
    const cmd = `powershell -NoProfile -Command "$w = New-Object -ComObject WScript.Shell; 1..${steps} | ForEach-Object { $w.SendKeys([char]${key}) }"`;

    try {
      await execAsync(cmd);
      const labels = { up: "Volume dinaikkan.", down: "Volume diturunkan.", mute: "Suara di-mute." };
      return { ok: true, message: labels[action] };
    } catch (err) {
      return { ok: false, message: "Gagal mengatur volume." };
    }
  }

  if (platform === "darwin") {
    const cmdMap = {
      up: "osascript -e 'set volume output volume ((output volume of (get volume settings)) + 15)'",
      down: "osascript -e 'set volume output volume ((output volume of (get volume settings)) - 15)'",
      mute: "osascript -e 'set volume output muted true'",
    };
    try {
      await execAsync(cmdMap[action]);
      return { ok: true, message: "Volume diatur." };
    } catch {
      return { ok: false, message: "Gagal mengatur volume." };
    }
  }

  // Linux best-effort via amixer
  const cmdMap = {
    up: "amixer -D pulse sset Master 15%+",
    down: "amixer -D pulse sset Master 15%-",
    mute: "amixer -D pulse sset Master mute",
  };
  try {
    await execAsync(cmdMap[action]);
    return { ok: true, message: "Volume diatur." };
  } catch {
    return { ok: false, message: "Kontrol volume tidak didukung di sistem ini." };
  }
}

// Ambil statistik sistem: CPU load, RAM, uptime
export function getSystemStats() {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;

  const startTimes = os.cpus().map((c) => ({ ...c.times }));

  return new Promise((resolve) => {
    setTimeout(() => {
      const endTimes = os.cpus().map((c) => ({ ...c.times }));

      let totalIdle = 0;
      let totalTick = 0;
      startTimes.forEach((start, i) => {
        const end = endTimes[i];
        const idleDiff = end.idle - start.idle;
        const totalDiff = Object.keys(end).reduce((sum, k) => sum + (end[k] - start[k]), 0);
        totalIdle += idleDiff;
        totalTick += totalDiff;
      });

      const cpuLoad = totalTick > 0 ? Math.round(100 - (totalIdle / totalTick) * 100) : 0;

      resolve({
        cpuLoad,
        cpuCount: os.cpus().length,
        totalMemGB: (totalMem / 1e9).toFixed(1),
        usedMemGB: (usedMem / 1e9).toFixed(1),
        memPercent: Math.round((usedMem / totalMem) * 100),
        uptimeMin: Math.round(os.uptime() / 60),
        platform: os.platform(),
        hostname: os.hostname(),
      });
    }, 300); // sampel 2x dengan jeda 300ms untuk hitung load CPU akurat
  });
}
