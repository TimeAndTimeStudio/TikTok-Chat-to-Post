// ==========================================================
// Minimal TikTok LIVE Event Gateway
//
// EulerStream WebSocket -> Normalize -> Filter -> HTTP POST
//
// Package ที่ใช้: ws เท่านั้น
// ==========================================================

const WebSocket = require("ws");
const config = require("./config");
const { normalize } = require("./normalize");
const { isAllowed } = require("./filter");
const output = require("./output");

let ws = null;
let reconnecting = false;

function buildUrl() {
  const params = new URLSearchParams({
    uniqueId: config.euler.uniqueId,
    apiKey: config.euler.apiKey,
  });
  return `${config.euler.wsUrl}?${params.toString()}`;
}

function connect() {
  reconnecting = false;
  const url = buildUrl();
  console.log(`[gateway] Connecting to EulerStream for "${config.euler.uniqueId}"...`);

  ws = new WebSocket(url);

  ws.on("open", () => {
    console.log("[gateway] Connected.");
  });

  ws.on("message", (raw) => {
    handleMessage(raw);
  });

  ws.on("close", (code, reason) => {
    console.log(`[gateway] Connection closed. code=${code} reason=${reason}`);
    handleClose(code);
  });

  ws.on("error", (err) => {
    console.error("[gateway] WebSocket error:", err.message);
  });
}

function handleMessage(raw) {
  let parsed;

  try {
    parsed = JSON.parse(raw.toString());
  } catch (err) {
    console.error("[gateway] Failed to parse message JSON:", err.message);
    return;
  }

  // EulerStream อาจส่งเป็น event เดี่ยว หรือ array ของ event
  const rawEvents = Array.isArray(parsed) ? parsed : [parsed];

  for (const rawEvent of rawEvents) {
    const normalized = normalize(rawEvent);

    if (!isAllowed(normalized)) {
      continue;
    }

    output.send(normalized);
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
