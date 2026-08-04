// ==========================================================
// Output
// ส่งข้อมูลออกผ่าน HTTP POST เท่านั้น
// ใช้ fetch ที่มีอยู่ใน Node.js 20+ (ไม่ต้องใช้ axios)
// ==========================================================

const config = require("./config");

async function send(normalizedEvent) {
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
      console.error(`[output] HTTP ${res.status} ${res.statusText}`);
    }
  } catch (err) {
    console.error(`[output] Failed to send event "${normalizedEvent.event}":`, err.message);
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { send };
