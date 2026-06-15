/*  

  Made By Lenwy
  Base : Lenwy
  WhatsApp : wa.me/6283829814737
  Telegram : t.me/ilenwy
  Youtube : @Lenwy

  Channel : https://whatsapp.com/channel/0029VaGdzBSGZNCmoTgN2K0u

  Copy Code?, Recode?, Rename?, Reupload?, Reseller? Taruh Credit Ya :D

  Mohon Untuk Tidak Menghapus Watermark Di Dalam Kode Ini

*/

// [ ===== Import File ===== ]
import "./len.js";
import "./database/Menu/LenwyMenu.js";
import { getAIAnswer } from "./case/ai/ai4chat.js";

// [ ===== Import Pustaka ===== ]
import fs from "fs";
import mime from "mime-types";
import { jidNormalizedUser } from "@whiskeysockets/baileys";
import path from "path";
import chalk from "chalk";
import { fileURLToPath } from "url";
import { dirname } from "path";

// Track Messages
const processedMessages = new Set();
const groupMetadataCache = new Map();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Read Json File
function readJSONSync(pathFile) {
  try {
    return JSON.parse(fs.readFileSync(pathFile, "utf8"));
  } catch {
    return [];
  }
}

const pluginStatePath = path.join(
  process.cwd(),
  "WhatsApp",
  "database",
  "system",
  "plugins.json",
);

if (!fs.existsSync(pluginStatePath)) {
  fs.mkdirSync(path.dirname(pluginStatePath), { recursive: true });
  fs.writeFileSync(
    pluginStatePath,
    JSON.stringify({ disable: [], maintenance: [] }, null, 2),
  );
}

function readPluginState() {
  try {
    return JSON.parse(fs.readFileSync(pluginStatePath));
  } catch {
    return { disable: [], maintenance: [] };
  }
}

fs.watchFile(pluginStatePath, { interval: 1000 }, async () => {
  console.log(chalk.yellow.bold("[+] Plugins.json Berubah, Reloading State"));

  try {
    await loadPlugins();
    console.log(
      chalk.green.bold(`[+] Reload Selesai (${commands.size} Commands)`),
    );
  } catch (err) {
    console.error(chalk.red("❌ Gagal reload plugins.json:"), err);
  }
});

const caseDir = path.join(__dirname, "case");

let plugins = [];
let commands = new Map();
let categories = new Map();

async function loadPlugins() {
  plugins = [];
  commands.clear();
  categories.clear();

  const state = readPluginState();
  const disableList = state.disable || [];
  const maintenanceList = state.maintenance || [];

  const folders = fs.readdirSync(caseDir);

  for (let folder of folders) {
    const folderPath = path.join(caseDir, folder);
    if (!fs.statSync(folderPath).isDirectory()) continue;

    categories.set(folder.toLowerCase(), []);

    const files = fs.readdirSync(folderPath);

    for (let file of files) {
      if (!file.endsWith(".js")) continue;

      const module = await import(
        `./case/${folder}/${file}?update=${Date.now()}`
      );

      const plugin = module.default;
      const info = module.info;

      if (!plugin || !info) continue;

      const mainCommand = info.menu?.[0]?.toLowerCase();

      if (mainCommand) {
        info.enabled = !disableList.includes(mainCommand);
        info.maintenance = maintenanceList.includes(mainCommand);
      } else {
        info.enabled = true;
        info.maintenance = false;
      }

      plugins.push(plugin);

      for (let cmd of info.case) {
        commands.set(cmd.toLowerCase(), {
          execute: plugin,
          info,
          category: folder.toLowerCase(),
        });
      }

      categories.get(folder.toLowerCase()).push(info);
    }
  }
}

await loadPlugins();
globalThis.commands = commands;

let reloadTimeout;

function watchPlugins() {
  fs.watch(caseDir, { recursive: true }, (eventType, filename) => {
    if (!filename || !filename.endsWith(".js")) return;

    clearTimeout(reloadTimeout);

    reloadTimeout = setTimeout(async () => {
      console.log(chalk.yellow.bold(`[+] Reloading Plugins`));

      try {
        await loadPlugins();
        console.log(
          chalk.green.bold(`[+] Reload Selesai (${commands.size} Commands)`),
        );
      } catch (err) {
        console.error(chalk.red("❌ Gagal reload:"), err);
      }
    }, 500);
  });
}

watchPlugins();

// Export Handler
export default async (lenwy, m, meta) => {
  const { body, mediaType, sender: originalSender, pushname } = meta;
  const msg = m.messages[0];
  if (!msg.message) return;

  const replyJid = msg.key.remoteJid;

  let authJid = originalSender;

  const key = msg.key;
  if (key.participantAlt) {
    authJid = key.participantAlt;
  } else if (key.remoteJidAlt) {
    authJid = key.remoteJidAlt;
  }

  const sender = authJid;
  const normalizedSender = jidNormalizedUser(sender);

  const senderJid = sender
    ? sender.split(":")[0].split("@")[0] // Ambil Nomor Saja
    : null;

  // console.log(chalk.yellow(`[DEBUG JID] Sender Original: ${originalSender}`));
  // console.log(chalk.yellow(`[DEBUG JID] Sender Auth (PN): ${sender}`));
  // console.log(chalk.green(`[DEBUG JID] Sender Normal: ${normalizedSender}`));

  if (msg.key.fromMe) return;

  // Anti Double
  if (processedMessages.has(msg.key.id)) return;
  processedMessages.add(msg.key.id);
  setTimeout(() => processedMessages.delete(msg.key.id), 30000);

  // Quote balasan memakai pesan asli user agar valid & tampil benar di HP penerima.
  // (Quote palsu sebelumnya membuat sebagian pesan gagal dirender meski sudah terkirim.)
  const len = msg;

  // Pengirim pesan aman: tanpa quoted palsu yang bikin pesan gagal tampil di HP,
  // sekaligus mencatat status kirim di terminal.
  const safeSend = async (content) => {
    try {
      await lenwy.sendMessage(replyJid, content);
      console.log(chalk.green.bold(`[✔] Terkirim → ${replyJid}`));
    } catch (err) {
      console.error(
        chalk.red.bold("[✘] Gagal Kirim Pesan:"),
        err?.message || err,
      );
    }
  };

  // Custom Reply
  const lenwyreply = (teks) => safeSend({ text: teks });

  // Gambar Menu
  const MenuImage = fs.readFileSync(globalThis.MenuImage);

  // Deteksi Grup & Admin
  const isGroup = replyJid.endsWith("@g.us");

  // Bot Admin
  let isAdmin = false;
  let isBotAdmin = false;

  const GROUP_CACHE_TTL = 10 * 1000; // 10 Detik

  if (isGroup) {
    let metadataData = groupMetadataCache.get(replyJid);

    if (!metadataData || Date.now() - metadataData.time > GROUP_CACHE_TTL) {
      try {
        const metadata = await lenwy.groupMetadata(replyJid);
        groupMetadataCache.set(replyJid, { data: metadata, time: Date.now() });
        metadataData = groupMetadataCache.get(replyJid);
      } catch (e) {
        console.error("Gagal mengambil metadata grup:", e);
      }
    }

    const metadata = metadataData?.data;

    if (metadata) {
      const participants = metadata.participants;

      // Deteksi Format JID
      const isLidGroup = participants.some((p) => p.id.endsWith("@lid"));

      const normalizeJid = (jid) => {
        if (!jid) return "";
        return jid.split(":")[0].split("@")[0] + "@s.whatsapp.net";
      };

      let botJidForSearch;

      if (isLidGroup) {
        const rawLid = lenwy.user?.lid ?? lenwy.user?.id;
        botJidForSearch = rawLid.split(":")[0].split("@")[0] + "@lid";
      } else {
        botJidForSearch = normalizeJid(lenwy.user.id);
      }

      const senderJidClean = msg.key.participant ?? "";
      const userParticipant = participants.find((p) => p.id === senderJidClean);

      if (userParticipant) {
        isAdmin =
          userParticipant.admin === "admin" ||
          userParticipant.admin === "superadmin";
      }

      const botParticipant = participants.find((p) => p.id === botJidForSearch);

      isBotAdmin =
        botParticipant?.admin === "admin" ||
        botParticipant?.admin === "superadmin" ||
        false;

      // console.log("[BOT SEARCH JID]", botJidForSearch);
      // console.log("[BOT PARTICIPANT]", botParticipant);
      // console.log("[IS BOT ADMIN]", isBotAdmin);
    }
  }

  // Cocokkan identitas berdasarkan digit nomor agar tahan format @lid / @s.whatsapp.net
  // dan device-id (mis. "628xxx:12@s.whatsapp.net").
  const onlyDigits = (val) =>
    (val || "").toString().split("@")[0].split(":")[0].replace(/\D/g, "");
  const idCandidates = [normalizedSender, sender, originalSender, senderJid]
    .map(onlyDigits)
    .filter(Boolean);
  const matchesList = (list) =>
    Array.isArray(list) &&
    list.some((u) => idCandidates.includes(onlyDigits(u)));

  // Premium
  const premiumPath = path.join(
    process.cwd(),
    "WhatsApp",
    "database",
    "premium.json",
  );
  const premiumUsers = readJSONSync(premiumPath);
  const isPremium = matchesList(premiumUsers);

  // Creator
  const CreatorPath = path.join(
    process.cwd(),
    "WhatsApp",
    "database",
    "creator.json",
  );
  const isCreatorArray = readJSONSync(CreatorPath);
  const isLenwy = matchesList(isCreatorArray);

  // Tampilkan JID pengirim agar gampang didaftarkan ke creator.json / premium.json bila perlu
  console.log(
    chalk.cyan.bold("[JID]"),
    chalk.white(normalizedSender || sender || originalSender || "unknown"),
  );

  // Delete Message
  async function deleteMessage(msgKey, tag = "DELETE") {
    if (!msgKey) return;
    try {
      await lenwy.sendMessage(replyJid, {
        delete: {
          remoteJid: replyJid,
          fromMe: msgKey.fromMe ?? true,
          id: msgKey.id,
          participant: msgKey.participant || undefined,
        },
      });
      console.log(chalk.red.bold(`[${tag}]`), `Pesan Dihapus (${msgKey.id})`);
    } catch (err) {
      console.error(`[${tag}] Gagal hapus pesan:`, err);
    }
  }

  let usedPrefix = null;
  for (const pre of globalThis.prefix) {
    if (body.startsWith(pre)) {
      usedPrefix = pre;
      break;
    }
  }

  // [ Auto AI ]
  // Pesan TANPA prefix langsung dijawab AI (tanpa perlu mengetik .ai di depan).
  // Perintah biasa (mis. .ping, .menu) tetap pakai prefix seperti biasa.
  if (!usedPrefix) {
    const autoAllowed =
      globalThis.autoAI &&
      body.trim() &&
      (!isGroup || globalThis.autoAIPrivateOnly === false);

    if (autoAllowed) {
      console.log(chalk.magenta.bold("[AUTO-AI]"), chalk.white(body.trim()));
      const answer = await getAIAnswer(body.trim());
      if (answer) return lenwyreply(`*Lenwy AI*\n\n${answer}`);
      return lenwyreply("⚠️ AI sedang tidak merespon. Coba lagi sebentar lagi.");
    }

    // Tanpa prefix & Auto AI nonaktif → abaikan (kecuali mode noprefix)
    if (!globalThis.noprefix) return;
  }

  const args = usedPrefix
    ? body.slice(usedPrefix.length).trim().split(" ")
    : body.trim().split(" ");

  const command = args.shift().toLowerCase();
  const q = args.join(" ");

  // Helper
  const LenwyText = (text) => safeSend({ text });

  const LenwyWait = () => safeSend({ text: globalThis.mess.wait });

  // Send Video
  const LenwyVideo = (url, caption = "") => safeSend({ video: { url }, caption });

  // Send Image
  const LenwyImage = (url, caption = "") => safeSend({ image: { url }, caption });

  // Send Audio
  const LenwyAudio = (url, ptt = false) =>
    safeSend({ audio: { url }, mimetype: "audio/mpeg", ptt });

  // Send File
  const LenwyFile = (buffer, fileName, mime) =>
    safeSend({ document: buffer, fileName, mimetype: mime });

  // Label Menu
  function getLabel(info) {
    if (info.owner) return "Owner";
    if (info.premium) return "Premium";
    if (info.admin) return "Admin";
    if (info.botAdmin) return "BotAdmin";
    if (info.group) return "Group";
    if (info.private) return "Private";
    return "Public";
  }

  const labelPriority = {
    Public: 0,
    Owner: 1,
    Premium: 2,
    Admin: 3,
    BotAdmin: 4,
    Group: 5,
    Private: 6,
  };

  // All Menu
  if (command === "allmenu") {
    let text = globalThis.lenwymenu;

    for (let [cat, list] of categories) {
      const visible = list.filter((i) => !i.hidden);
      if (visible.length === 0) continue;

      text += `\n*[ ${cat.toUpperCase()} ]*\n`;

      visible
        .sort((a, b) => {
          const labelA = getLabel(a);
          const labelB = getLabel(b);

          const priorityDiff = labelPriority[labelA] - labelPriority[labelB];

          if (priorityDiff !== 0) return priorityDiff;

          return a.name.localeCompare(b.name);
        })
        .forEach((item) => {
          const label = getLabel(item);
          let tag = label !== "Public" ? ` [${label}]` : "";

          if (item.maintenance) tag += " [Main]";
          if (item.enabled === false) tag += " [Off]";

          item.menu
            .sort((a, b) => a.localeCompare(b))
            .forEach((cmd) => {
              text += `*[+] .${cmd}${tag}*\n`;
            });
        });
    }

    await safeSend({
      image: MenuImage,
      caption: `${text}\n☘️ *Lenwy From Scratch*`,
      mentions: [normalizedSender],
    });
  }

  // Category Menu
  if (command === "menu") {
    let casePath = path.join(__dirname, "case");
    let folders = fs
      .readdirSync(casePath)
      .filter((v) => fs.statSync(path.join(casePath, v)).isDirectory());

    let text = globalThis.lenwymenu || "*📂 Daftar Menu*\n";

    text += "\n*[ Available Categories ]*\n";

    folders
      .sort((a, b) => a.localeCompare(b))
      .forEach((folder) => {
        text += `*[+] ${folder.toUpperCase()}MENU*\n`;
      });

    await safeSend({
      image: MenuImage,
      caption: `${text}\n☘️ *Lenwy From Scratch*`,
      mentions: [normalizedSender],
    });
  }

  // Category Menu Dynamic
  if (command.endsWith("menu") && command !== "allmenu") {
    const fs = await import("fs");
    const path = await import("path");

    const casePath = path.join(process.cwd(), "WhatsApp", "case");

    const folders = fs
      .readdirSync(casePath)
      .filter((f) => fs.statSync(path.join(casePath, f)).isDirectory());

    const kategori = command.replace("menu", "").toLowerCase();

    if (!folders.includes(kategori)) return;

    let text = `*[ ${kategori.toUpperCase()} MENU ]*\n`;

    const list = categories.get(kategori) || [];

    const visible = list.filter((i) => !i.hidden);

    visible
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((item) => {
        const label = getLabel(item);
        let tag = label !== "Public" ? ` [${label}]` : "";

        if (item.maintenance) tag += " [Main]";
        if (item.enabled === false) tag += " [Off]";

        item.menu
          .sort((a, b) => a.localeCompare(b))
          .forEach((cmd) => {
            text += `*[+] .${cmd}${tag}*\n`;
          });
      });

    await lenwyreply(`${text}\n☘️ *Lenwy From Scratch*`);
  }

  if (!commands.has(command)) return;

  const pluginData = commands.get(command);
  const { execute, info } = pluginData;

  // Control
  if (info.enabled === false) return LenwyText(globalThis.mess.disable);

  if (info.maintenance === true && !isLenwy)
    return LenwyText(globalThis.mess.maintenance);

  // Akses private chat (default terbuka untuk semua).
  // Set globalThis.openPrivate = false di len.js bila ingin batasi ke Owner/Premium.
  if (!isGroup && globalThis.openPrivate === false) {
    if (!isPremium && !isLenwy && !info.allowPrivate) {
      return LenwyText(
        "⚠️ *Fitur Premium*\n\n" +
          "Fitur ini hanya tersedia untuk Owner/Premium di private chat.",
      );
    }
  }

  if (info.owner && !isLenwy) return LenwyText(globalThis.mess.creator);

  if (info.premium && !isPremium && !isLenwy)
    return LenwyText(globalThis.mess.premium);

  if (info.group && !isGroup) return LenwyText(globalThis.mess.group);

  if (info.private && isGroup) return LenwyText(globalThis.mess.private);

  if (info.admin && !isAdmin) return LenwyText(globalThis.mess.admin);

  if (info.botAdmin && !isBotAdmin) return LenwyText(globalThis.mess.botadmin);

  await execute({
    command,
    args,
    q,
    lenwy,
    m,
    msg,
    len,
    replyJid,
    senderJid,
    lenwyreply,
    LenwyText,
    LenwyWait,
    LenwyVideo,
    LenwyImage,
    LenwyAudio,
    LenwyFile,
    isGroup,
    isAdmin,
    isBotAdmin,
    isPremium,
    isLenwy,
    plugins,
    commands,
    normalizedSender,
    deleteMessage,
  });
};
