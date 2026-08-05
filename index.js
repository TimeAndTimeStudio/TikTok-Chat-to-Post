// ==========================================================
// Minimal TikTok LIVE Event Gateway
//
// EulerStream WebSocket -> Normalize -> Filter -> HTTP POST
//
// Package ที่ใช้: ws เท่านั้น
// ==========================================================

const WebSocket = require("ws");
require("./logger"); // ต้อง require ก่อนตัวอื่นเพื่อให้ patch console.log/error ทันเวลา
const config = require("./config");
const { normalize } = require("./normalize");
const { isAllowed } = require("./filter");
const output = require("./output");

let ws = null;
let reconnecting = false;
let messageCount = 0;

// ==========================================================
// Dedup memory
// เก็บ id ของ event ที่ "ส่งออกไปแล้ว" (ผ่าน output.send สำเร็จ)
// ตัวแปรนี้อยู่ระดับ module -> ไม่ถูก reset ตอน reconnect (connect() ถูกเรียกใหม่)
// จะถูก reset ก็ต่อเมื่อ process รันใหม่ทั้งหมดเท่านั้น
//
// ใช้ Set + Array คู่กันเพื่อ: เช็คซ้ำเร็ว (Set) และ จำกัดขนาดไม่ให้บวมไม่รู้จบ (Array เป็น FIFO)
// ==========================================================
const sentIds = new Set();
const sentIdsOrder = [];
const MAX_SENT_IDS = 20000; // เก็บ id ล่าสุดไว้ประมาณนี้ พอสำหรับกันซ้ำตอน reconnect สั้นๆ

function alreadySent(id) {
  if (!id) return false; // ไม่มี id ที่เชื่อถือได้ -> ส่งไปเลย ไม่กันซ้ำ
  return sentIds.has(id);
}

function markSent(id) {
  if (!id) return;
  if (sentIds.has(id)) return;

  sentIds.add(id);
  sentIdsOrder.push(id);

  if (sentIdsOrder.length > MAX_SENT_IDS) {
    const oldest = sentIdsOrder.shift();
    sentIds.delete(oldest);
  }
}

function maskKey(key) {
  if (!key) return "(empty)";
  if (key.length <= 8) return "*".repeat(key.length);
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

// เช็คว่า config.js ยังเป็นค่า placeholder เดิมอยู่หรือเปล่า
// (สาเหตุที่พบบ่อยที่สุดที่ connect ไม่ได้ คือ ลืมแก้ค่าพวกนี้)
function validateConfig() {
  const problems = [];

  if (!config.euler.uniqueId || config.euler.uniqueId === "target_tiktok_username") {
    problems.push('config.euler.uniqueId ยังเป็นค่า placeholder ("target_tiktok_username") - ใส่ TikTok username จริง (ไม่ต้องมี @)');
  }
  if (!config.euler.apiKey || config.euler.apiKey === "YOUR_EULERSTREAM_API_KEY") {
    problems.push('config.euler.apiKey ยังเป็นค่า placeholder ("YOUR_EULERSTREAM_API_KEY") - ใส่ API Key จริงจาก https://www.eulerstream.com');
  }

  if (problems.length > 0) {
    console.error("[gateway] ================================================");
    console.error("[gateway] ยังตั้งค่า config.js ไม่ครบ - connect ไม่สำเร็จแน่นอน:");
    problems.forEach((p) => console.error(`[gateway]  - ${p}`));
    console.error("[gateway] ================================================");
  }

  return problems.length === 0;
}

function buildUrl() {
  const params = new URLSearchParams({
    uniqueId: config.euler.uniqueId,
    apiKey: config.euler.apiKey,
  });
  return `${config.euler.wsUrl}?${params.toString()}`;
}

function connect() {
  reconnecting = false;
  validateConfig();

  const url = buildUrl();
  const debugUrl = `${config.euler.wsUrl}?uniqueId=${config.euler.uniqueId}&apiKey=${maskKey(config.euler.apiKey)}`;
  console.log(`[gateway] Connecting to EulerStream for "${config.euler.uniqueId}"...`);
  console.log(`[gateway] URL: ${debugUrl}`);

  ws = new WebSocket(url);

  ws.on("open", () => {
    console.log("[gateway] Connected.");
  });

  // เกิดตอน handshake ไม่ผ่าน (เช่น server ตอบ HTTP 401/403 แทนที่จะ upgrade เป็น WS)
  // มักเป็นสาเหตุ "connect ไม่ได้" ที่ event 'error' เฉยๆ ไม่บอกรายละเอียดพอ
  ws.on("unexpected-response", (req, res) => {
    let body = "";
    res.on("data", (chunk) => {
      body += chunk;
    });
    res.on("end", () => {
      console.error(
        `[gateway] Unexpected HTTP response during handshake: status=${res.statusCode} ${res.statusMessage}`
      );
      if (body) console.error(`[gateway] Response body: ${body}`);
      console.error(
        "[gateway] มักเกิดจาก apiKey ผิด/หมดอายุ หรือ uniqueId ไม่ถูกต้อง กรุณาตรวจสอบ config.js"
      );
    });
  });

  ws.on("message", (raw) => {
    handleMessage(raw);
  });

  ws.on("close", (code, reasonBuf) => {
    const reason = reasonBuf && reasonBuf.length ? reasonBuf.toString() : "(no reason given)";
    console.log(`[gateway] Connection closed. code=${code} reason=${reason}`);
    handleClose(code);
  });

  ws.on("error", (err) => {
    console.error("[gateway] WebSocket error:", err.message);
    if (err.code) console.error(`[gateway] error code: ${err.code}`);
  });
}

// ตัดฟิลด์ที่รู้อยู่แล้วว่า "ไม่ได้ใช้" ในระบบนี้เลย แต่ตัวเปลืองพื้นที่ log มากที่สุด
// เช่น profilePicture.url / giftImage / badge icon ฯลฯ ที่เป็น signed CDN URL ยาวๆ
// (ไม่กระทบข้อมูลจริงที่ส่งออกไปปลายทาง - ใช้แค่สำหรับ log preview เท่านั้น)
const NOISY_KEYS = new Set(["url", "urllist", "avatarthumb", "avatarmedium", "avatarlarge"]);

function sanitizeForLog(value) {
  if (Array.isArray(value)) {
    if (value.length > 0 && typeof value[0] === "string" && value[0].length > 60) {
      return `[${value.length} url(s) omitted]`;
    }
    return value.map(sanitizeForLog);
  }
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, val] of Object.entries(value)) {
      if (NOISY_KEYS.has(key.toLowerCase())) {
        out[key] = Array.isArray(val) ? `[${val.length} url(s) omitted]` : "[omitted]";
      } else {
        out[key] = sanitizeForLog(val);
      }
    }
    return out;
  }
  if (typeof value === "string" && value.length > 300) {
    return `${value.slice(0, 100)}...(${value.length} chars, truncated)`;
  }
  return value;
}

function handleMessage(raw) {
  messageCount += 1;
  const rawStr = raw.toString();

  let parsed;
  try {
    parsed = JSON.parse(rawStr);
  } catch (err) {
    console.error("[gateway] Failed to parse message JSON:", err.message);
    return;
  }

  // Log ข้อความดิบทุกอันที่ได้รับ แบบตัดฟิลด์รกๆ (url รูปภาพ ฯลฯ) ออกก่อน
  // เพื่อไม่ให้ log ท่วมด้วยข้อมูลที่ไม่ได้ใช้งานจริง
  let preview = JSON.stringify(sanitizeForLog(parsed));
  if (preview.length > 1000) preview = `${preview.slice(0, 1000)}...(truncated)`;
  console.log(`[gateway] [recv #${messageCount}] ${preview}`);

  // EulerStream ส่งมาได้หลายแบบ ขึ้นกับ feature flag / เวอร์ชัน:
  //   1) { messages: [ {...}, {...} ] }   <- รูปแบบมาตรฐานของ ws.eulerstream.com
  //   2) [ {...}, {...} ]                  <- array ของ event ตรงๆ
  //   3) { ...single event... }            <- event เดี่ยว
  let rawEvents;
  if (parsed && Array.isArray(parsed.messages)) {
    rawEvents = parsed.messages;
  } else if (Array.isArray(parsed)) {
    rawEvents = parsed;
  } else {
    rawEvents = [parsed];
  }

  console.log(`[gateway] [recv #${messageCount}] parsed ${rawEvents.length} event(s)`);

  for (const rawEvent of rawEvents) {
    const normalized = normalize(rawEvent);

    // กันส่งซ้ำ: ถ้า event นี้เคยถูกส่งออกไปแล้ว (เช่นตอนก่อน reconnect) ให้ข้าม
    if (alreadySent(normalized.id)) {
      console.log(
        `[gateway] [event] type=${normalized.event} id=${normalized.id} skipped (duplicate, already sent before)`
      );
      continue;
    }

    const allowed = isAllowed(normalized);
    const rawTypeHint =
      normalized.event === "unknown" ? ` rawType=${rawEvent && (rawEvent.type || rawEvent.event)}` : "";

    console.log(
      `[gateway] [event] type=${normalized.event}${rawTypeHint} id=${normalized.id || "(no id)"} allowed=${allowed}${
        allowed ? "" : " (filtered out by config.filter)"
      }`
    );

    if (!allowed) {
      continue;
    }

    output.send(normalized);
    markSent(normalized.id);
  }
}

function handleClose(code) {
  switch (code) {
    case 4401:
      // Authentication ผิด -> หยุดทำงาน
      console.error("[gateway] Authentication failed (4401). Stopping.");
      return;

    case 4404:
      // Stream ไม่ Live -> Retry
      console.log(`[gateway] Stream not live (4404). Retrying in ${config.reconnect.retryDelayMs}ms...`);
      scheduleReconnect(config.reconnect.retryDelayMs);
      return;

    case 4429:
      // Connection เกิน -> รอแล้วเชื่อมใหม่
      console.log(`[gateway] Too many connections (4429). Waiting ${config.reconnect.rateLimitDelayMs}ms...`);
      scheduleReconnect(config.reconnect.rateLimitDelayMs);
      return;

    case 4500:
      // TikTok ปิด Connection -> Reconnect
      console.log(`[gateway] TikTok closed connection (4500). Reconnecting in ${config.reconnect.retryDelayMs}ms...`);
      scheduleReconnect(config.reconnect.retryDelayMs);
      return;

    case 4555:
      // WebSocket อายุครบ 8 ชั่วโมง -> Reconnect ใหม่
      console.log("[gateway] WebSocket expired after 8 hours (4555). Reconnecting now...");
      scheduleReconnect(0);
      return;

    default:
      console.log(`[gateway] Unhandled close code (${code}). Retrying in ${config.reconnect.retryDelayMs}ms...`);
      scheduleReconnect(config.reconnect.retryDelayMs);
      return;
  }
}

function scheduleReconnect(delayMs) {
  if (reconnecting) return;
  reconnecting = true;
  setTimeout(connect, delayMs);
}

connect();
