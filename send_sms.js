const express = require("express");
const cors = require("cors");
const { Boom } = require("@hapi/boom");
const qrcode = require("qrcode-terminal");
const pino = require("pino");

const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
} = require("@whiskeysockets/baileys");

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

let sock; 

async function initWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info");
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: "silent" }),
    printQRInTerminal: false, 
  });

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log("===== СКАНИРУЙТЕ QR ДЛЯ ПОДКЛЮЧЕНИЯ =====");
      qrcode.generate(qr, { small: true });
      console.log("=========================================");
    }

    if (connection === "close") {
      const statusCode = (lastDisconnect?.error instanceof Boom)
        ? lastDisconnect.error?.output?.statusCode
        : undefined;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      console.log("WA connection closed. code:", statusCode, "reconnect:", shouldReconnect);
      if (shouldReconnect) initWhatsApp().catch(console.error);
    }

    if (connection === "open") {
      console.log("✅ WhatsApp подключен и готов отправлять сообщения.");
    }
  });

  sock.ev.on("creds.update", saveCreds);
}

function normalizeToJid(number) {
  let n = String(number).trim();
  n = n.replace(/[^\d+]/g, "");
  if (n.startsWith("+")) n = n.slice(1);
  if (n.length === 11 && n.startsWith("8")) n = "7" + n.slice(1);
  if (!/^\d{10,15}$/.test(n)) return null;
  return `${n}@s.whatsapp.net`;
}

app.post("/send", async (req, res) => {
  try {
    if (!sock) {
      return res.status(503).json({ statusCode: 503, message: "WhatsApp не инициализирован. Подождите подключения." });
    }

    const { number, message } = req.body || {};
    if (!number || !message) {
      return res.status(400).json({ statusCode: 400, message: "Нужно передать { number, message }" });
    }

    const jid = normalizeToJid(number);
    if (!jid) {
      return res.status(400).json({ statusCode: 400, message: "Неверный формат номера" });
    }

    await sock.sendMessage(jid, { text: String(message) });
    return res.status(200).json({ statusCode: 200, message: "Отправлено", to: jid });
  } catch (err) {
    console.error("Send error:", err?.message || err);
    return res.status(500).json({ statusCode: 500, message: "Ошибка отправки" });
  }
});

const PORT = 3025;
app.listen(PORT, async () => {
  console.log(`HTTP сервер запущен на :${PORT}`);
  await initWhatsApp().catch((e) => {
    console.error("initWhatsApp error:", e);
    process.exit(1);
  });
});


/*






*/