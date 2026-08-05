// ==========================================================
// Output
// ส่งข้อมูลออกผ่าน HTTP POST เท่านั้น
// ใช้ fetch ที่มีอยู่ใน Node.js 20+ (ไม่ต้องใช้ axios)
// ==========================================================

const config = require("./config");

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000; // ระหว่างครั้งที่ retry แต่ละครั้ง (คูณเพิ่มแบบ backoff ง่ายๆ)

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendOnce(normalizedEvent) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.output.timeoutMs);

  try {
    const res = await fetch(config.output.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(normalizedEvent),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

async function send(normalizedEvent) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      await sendOnce(normalizedEvent);
      return;
    } catch (err) {
      const isLastAttempt = attempt === MAX_RETRIES;
      console.error(
        `[output] Failed to send event "${normalizedEvent.event}" (attempt ${attempt}/${MAX_RETRIES}):`,
        err.message
      );

      if (isLastAttempt) {
        console.error(`[output] Giving up on event "${normalizedEvent.event}" after ${MAX_RETRIES} attempts`);
        return;
      }

      await sleep(RETRY_DELAY_MS * attempt);
    }
  }
}

module.exports = { send };
