#!/usr/bin/env node
// DompetKos Telegram bot — catat transaksi & cek saldo dari Telegram.
// Jalankan:  TELEGRAM_BOT_TOKEN=123456:ABC node telegram-bot.js   (Node 18+)
//            FIREBASE_PROJECT_ID=dompetkos-b5877  (optional, default itu)

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "dompetkos-b5877";
const FS = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// ===== FORMAT & ESCAPE =====
const fmtRp = (n) => "Rp " + Math.round(Number(n) || 0).toLocaleString("id-ID");
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const fmtDate = (iso) => { const [y, m, d] = iso.split("-").map(Number); return `${d} ${BULAN[m - 1]} ${y}`; };

// ===== PARSER NOMINAL =====
// Terima: 15000, 15.000, 15,000, 10,5, 15rb, 2jt, 1,5jt, Rp15.000
function parseAmount(raw) {
  let s = String(raw).toLowerCase().replace(/rp/g, "").replace(/\s/g, "");
  let mult = 1;
  let m = s.match(/(juta|jt)$/);
  if (m) { mult = 1e6; s = s.slice(0, -m[0].length); }
  else if ((m = s.match(/(ribu|rb|k)$/))) { mult = 1e3; s = s.slice(0, -m[0].length); }
  const hasDot = s.includes("."), hasComma = s.includes(",");
  if (hasDot && hasComma) {
    const dec = s.lastIndexOf(",") > s.lastIndexOf(".") ? "," : ".";
    const thou = dec === "," ? "." : ",";
    s = s.split(thou).join("").split(dec).join(".");
  } else if (hasDot || hasComma) {
    const sep = hasDot ? "." : ",";
    if (/^\d{1,3}([.,]\d{3})+$/.test(s)) s = s.split(sep).join("");
    else if (sep === ",") s = s.replace(",", ".");
  }
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? Math.round(n * mult) : 0;
}

// ===== PARSER TANGGAL =====
// "-", kosong -> hari ini; "kemarin"/"besok"; "2026-08-22"; "22/8", "22-08-26"
function parseDate(raw) {
  const s = String(raw).trim().toLowerCase();
  if (!s || s === "-" || s === "skip") return isoOf(new Date());
  if (s.startsWith("kemarin")) return isoOf(new Date(Date.now() - 864e5));
  if (s.startsWith("besok")) return isoOf(new Date(Date.now() + 864e5));
  let y, mo, d, hadYear = true;
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})(?:[-/.](\d{2,4}))?$/))) {
    d = +m[1]; mo = +m[2];
    if (m[3] != null) { y = +m[3]; if (y < 100) y += 2000; }
    else { y = new Date().getFullYear(); hadYear = false; }
  } else return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, mo - 1, d);
  if (dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  let out = isoOf(dt);
  if (!hadYear && out > isoOf(new Date())) out = isoOf(new Date(y - 1, mo - 1, d));
  return out;
}

// ===== SELF-CHECK (ponytail: satu runnable check buat logika non-trivial) =====
function selfTest() {
  const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
  const eq = (a, b, label) => assert(a === b, `${label}: got ${JSON.stringify(a)} want ${JSON.stringify(b)}`);
  // nominal
  eq(parseAmount("15000"), 15000, "15000");
  eq(parseAmount("15.000"), 15000, "15.000");
  eq(parseAmount("15,000"), 15000, "15,000");
  eq(parseAmount("15.000.000"), 15000000, "15.000.000");
  eq(parseAmount("Rp 15.000"), 15000, "Rp 15.000");
  eq(parseAmount("15rb"), 15000, "15rb");
  eq(parseAmount("15ribu"), 15000, "15ribu");
  eq(parseAmount("15k"), 15000, "15k");
  eq(parseAmount("2jt"), 2000000, "2jt");
  eq(parseAmount("2juta"), 2000000, "2juta");
  eq(parseAmount("1,5jt"), 1500000, "1,5jt");
  eq(parseAmount("1.5jt"), 1500000, "1.5jt");
  eq(parseAmount("2.500.000"), 2500000, "2.500.000");
  eq(parseAmount("10,5rb"), 10500, "10,5rb");
  eq(parseAmount("1.234,5"), 1235, "1.234,5 -> 1234.5 rounds");
  eq(parseAmount("abc"), 0, "abc");
  eq(parseAmount(""), 0, "empty");
  eq(parseAmount("0"), 0, "0");
  // tanggal
  const today = isoOf(new Date());
  const yest = isoOf(new Date(Date.now() - 864e5));
  eq(parseDate("-"), today, "dash -> today");
  eq(parseDate(""), today, "empty -> today");
  eq(parseDate("skip"), today, "skip -> today");
  eq(parseDate("kemarin"), yest, "kemarin");
  eq(parseDate("2026-08-20"), "2026-08-20", "iso");
  eq(parseDate("20/8/2026"), "2026-08-20", "20/8/2026");
  eq(parseDate("20-08-26"), "2026-08-20", "20-08-26");
  eq(parseDate("31/2"), null, "31/2 invalid");
  eq(parseDate("13/13"), null, "13/13 invalid");
  eq(parseDate("garbage"), null, "garbage");
  // future without year -> geser ke tahun lalu
  const nm = new Date(); nm.setDate(1); nm.setMonth(nm.getMonth() + 1);
  const futureNoYear = `1/${nm.getMonth() + 1}`;
  const futureOut = parseDate(futureNoYear);
  const expectY = nm.getFullYear() - 1;
  eq(futureOut, `${expectY}-${String(nm.getMonth() + 1).padStart(2, "0")}-01`, "future without year shifts back");
  console.log("self-check OK: parseAmount + parseDate");
}

if (process.argv.includes("--check")) {
  try { selfTest(); process.exit(0); } catch (e) { console.error("self-check FAIL:", e.message); process.exit(1); }
}

// ===== TOKEN GUARD =====
if (!BOT_TOKEN) {
  console.error("Set TELEGRAM_BOT_TOKEN dulu. Bikin bot via @BotFather, lalu:");
  console.error("  PowerShell:  $env:TELEGRAM_BOT_TOKEN=\"123456:ABC\"; node telegram-bot.js");
  console.error("  Bash:        TELEGRAM_BOT_TOKEN=123456:ABC node telegram-bot.js");
  process.exit(1);
}

// ===== TELEGRAM API =====
async function tg(method, body = {}) {
  const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}
const send = (chatId, text, reply_markup) =>
  tg("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", ...(reply_markup && { reply_markup }) });
const edit = (chatId, messageId, text, reply_markup) =>
  tg("editMessageText", { chat_id: chatId, message_id: messageId, text, parse_mode: "HTML", ...(reply_markup && { reply_markup }) });

// ===== FIRESTORE REST (open rules -> tanpa auth) =====
function unpackDoc(d) {
  const fields = {};
  for (const [k, v] of Object.entries(d.fields || {})) fields[k] = Object.values(v)[0];
  return { id: d.name.split("/").pop(), ...fields };
}
async function fsList(col) {
  // ponytail: ambil semua lalu filter di sini; ganti ke runQuery kalau transaksi udah puluhan ribu
  const r = await fetch(`${FS}/${col}?pageSize=1000`).then((r) => r.json());
  if (r.error) throw new Error(r.error.message);
  return (r.documents || []).map(unpackDoc);
}
async function fsAdd(col, obj, docId) {
  const fields = {};
  for (const [k, v] of Object.entries(obj))
    fields[k] = typeof v === "number"
      ? Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }
      : { stringValue: String(v) };
  const url = `${FS}/${col}${docId ? `?documentId=${encodeURIComponent(docId)}` : ""}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ fields }),
  }).then((r) => r.json());
  if (r.error) throw new Error(r.error.message);
  return r.name ? r.name.split("/").pop() : docId;
}

// ===== SALDO (sama seperti renderHero di web: income received - expense, bulan ini ke atas) =====
async function saldoBulanIni() {
  const now = new Date();
  const first = isoOf(new Date(now.getFullYear(), now.getMonth(), 1));
  const txs = await fsList("transactions");
  let masuk = 0, keluar = 0;
  for (const t of txs) {
    if (String(t.date) < first) continue;
    if (t.type === "expense") keluar += Number(t.amount) || 0;
    else if ((t.status || "received") === "received") masuk += Number(t.amount) || 0;
  }
  return { masuk, keluar };
}
async function saldoText() {
  const { masuk, keluar } = await saldoBulanIni();
  return `💰 <b>Saldo bulan ini</b>\n\nMasuk: ${fmtRp(masuk)}\nKeluar: ${fmtRp(keluar)}\n\nSaldo: <b>${fmtRp(masuk - keluar)}</b>`;
}

// ===== FLOW STATE =====
// ponytail: state di memori — bot single-user, restart = sesi input mulai lagi
const flows = new Map();
const COLORS = ["#fb923c", "#c4f542", "#22d3ee", "#c084fc", "#f472b6", "#fbbf24", "#f87171", "#94a3b8"];

async function askType(chatId) {
  flows.set(chatId, { step: "type" });
  await send(chatId, "Catat apa?", {
    inline_keyboard: [[
      { text: "💸 Pengeluaran", callback_data: "type:expense" },
      { text: "💰 Pemasukan", callback_data: "type:income" },
    ], [{ text: "✖ Batal", callback_data: "cancel" }]],
  });
}

async function askCategory(chatId, editMid) {
  const f = flows.get(chatId);
  const cats = (await fsList("categories")).filter((c) => c.type === f.type);
  f.cats = cats;
  const rows = [];
  for (let i = 0; i < cats.length; i += 2)
    rows.push(cats.slice(i, i + 2).map((c) => ({ text: c.name, callback_data: `cat:${c.id}` })));
  rows.push([{ text: "➕ Kategori baru", callback_data: "newcat" }]);
  rows.push([{ text: "✖ Batal", callback_data: "cancel" }]);
  const label = f.type === "expense" ? "pengeluaran" : "pemasukan";
  const text = `Kategori ${label}:`;
  if (editMid) await edit(chatId, editMid, text, { inline_keyboard: rows });
  else await send(chatId, text, { inline_keyboard: rows });
}

// ===== UPDATE HANDLER =====
async function onUpdate(u) {
  // callback buttons
  if (u.callback_query) {
    const cb = u.callback_query;
    if (!cb.message) { await tg("answerCallbackQuery", { callback_query_id: cb.id }); return; }
    const chatId = cb.message.chat.id;
    const mid = cb.message.message_id;
    const data = cb.data;
    await tg("answerCallbackQuery", { callback_query_id: cb.id });
    if (data === "cancel") { flows.delete(chatId); await edit(chatId, mid, "Dibatalkan.").catch(() => {}); return; }
    const f = flows.get(chatId);
    if (!f) { await edit(chatId, mid, "Sesi kedaluwarsa, ketik /input lagi.").catch(() => {}); return; }
    if (data === "newcat") { f.step = "newcat"; await edit(chatId, mid, "Nama kategori baru?"); return; }
    if (data.startsWith("cat:")) {
      f.catId = data.slice(4);
      f.step = "amount";
      await edit(chatId, mid, "Nominalnya berapa?\nContoh: 15000 · 15.000 · 15rb · 2jt");
      return;
    }
    if (data.startsWith("type:")) {
      f.type = data.slice(5);
      f.step = "category";
      await askCategory(chatId, mid);
      return;
    }
    return;
  }

  const msg = u.message;
  if (!msg) return;
  const chatId = msg.chat.id;

  // non-text di tengah flow -> minta teks
  if (msg.text == null) {
    if (flows.has(chatId)) await send(chatId, "Kirim teks ya — ketik /batal buat batalkan.");
    return;
  }
  const text = msg.text.trim();

  // commands
  if (text.startsWith("/")) {
    const cmd = text.split(/\s+/)[0].toLowerCase().split("@")[0];
    if (cmd === "/start" || cmd === "/help") {
      flows.delete(chatId);
      await send(chatId,
        "👋 <b>DompetKos Bot</b>\n\n"
        + "/input — catat transaksi\n"
        + "/saldo — cek saldo bulan ini\n"
        + "/batal — batalkan input\n\n"
        + "Nominal fleksibel: <code>15000</code> · <code>15.000</code> · <code>15rb</code> · <code>2jt</code> · <code>1,5jt</code>\n"
        + "Tanggal fleksibel: <code>-</code> (= hari ini) · <code>kemarin</code> · <code>20/8</code> · <code>2026-08-20</code>\n\n"
        + "Bot & web baca tulis Firestore yang sama, data langsung sinkron.");
      return;
    }
    if (cmd === "/saldo") {
      try { await send(chatId, await saldoText()); } catch (e) { await send(chatId, "Gagal ambil saldo: " + esc(e.message)); }
      return;
    }
    if (cmd === "/input" || cmd === "/catat") { await askType(chatId); return; }
    if (cmd === "/batal") { flows.delete(chatId); await send(chatId, "Dibatalkan."); return; }
    // unknown command -> ignore
    return;
  }

  const f = flows.get(chatId);
  if (!f) { await send(chatId, "Ketik /input buat catat transaksi, atau /saldo buat cek saldo."); return; }

  switch (f.step) {
    case "type": {
      await send(chatId, "Pilih jenis transaksi di tombol di atas ya.");
      return;
    }
    case "category": {
      await send(chatId, "Pilih kategori di tombol di atas ya.");
      return;
    }
    case "newcat": {
      const name = text.slice(0, 40).trim();
      if (!name) { await send(chatId, "Nama kategorinya?"); return; }
      f.newCatName = name;
      f.step = "amount";
      await send(chatId, `Kategori "${esc(name)}" ✅\n\nNominalnya berapa?\nContoh: 15000 · 15.000 · 15rb · 2jt`);
      return;
    }
    case "amount": {
      const amount = parseAmount(text);
      if (!amount) { await send(chatId, "Nominalnya belum kebaca 🤔\nContoh yang valid: 15000 · 15.000 · 15rb · 2jt"); return; }
      f.amount = amount;
      f.step = "note";
      await send(chatId, `${fmtRp(amount)} ✅\n\nDeskripsinya? (kirim <code>-</code> buat lewati)`);
      return;
    }
    case "note": {
      f.note = (text === "-" || text.toLowerCase() === "skip") ? "" : text.slice(0, 200);
      f.step = "date";
      await send(chatId, "Tanggalnya?\n<code>-</code> = hari ini · contoh lain: <code>kemarin</code> · <code>20/8</code> · <code>2026-08-20</code>");
      return;
    }
    case "date": {
      const date = parseDate(text);
      if (!date) { await send(chatId, "Tanggalku nggak ngerti 😅\nCoba: <code>-</code> · <code>kemarin</code> · <code>20/8</code> · <code>2026-08-20</code>"); return; }
      let catId = f.catId, catName = "";
      const known = (f.cats || []).find((c) => c.id === catId);
      if (known) catName = known.name;
      if (f.newCatName) {
        catId = Date.now().toString();
        catName = f.newCatName;
        await fsAdd("categories", { id: catId, name: catName, icon: "ellipsis", color: COLORS[catName.length % COLORS.length], type: f.type }, catId);
      }
      await fsAdd("transactions", {
        type: f.type, category: catId, amount: f.amount, note: f.note || "", date, status: "received", createdAt: Date.now(),
      });
      flows.delete(chatId);
      const jenis = f.type === "expense" ? "💸 Pengeluaran" : "💰 Pemasukan";
      let conf = `✅ <b>Tersimpan!</b>\n\n${jenis} — ${esc(catName || "?")}\n💵 ${fmtRp(f.amount)}`;
      if (f.note) conf += `\n📝 ${esc(f.note)}`;
      conf += `\n📅 ${fmtDate(date)}`;
      try { conf += `\n\n${await saldoText()}`; } catch {}
      await send(chatId, conf);
      return;
    }
  }
}

// ===== POLLING LOOP =====
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  await tg("deleteWebhook").catch(() => {});
  console.log(`DompetKos bot jalan (project: ${PROJECT_ID}). Ctrl+C buat stop.`);
  console.log("Commands: /input  /saldo  /batal");
  let offset = 0;
  while (true) {
    try {
      const res = await tg("getUpdates", { offset, timeout: 25 });
      if (Array.isArray(res.result)) {
        for (const u of res.result) {
          offset = u.update_id + 1;
          try { await onUpdate(u); } catch (e) { console.error("handler:", e.message); }
        }
      }
    } catch (e) {
      console.error("poll:", e.message);
      await sleep(3000);
    }
  }
}

main();
