// ==========================================================
// Logger
// Patch console.log / console.error ให้เขียนลงไฟล์ควบคู่กับ console เดิม
// require ไฟล์นี้ตัวแรกสุดใน entrypoint (index.js) เพื่อให้ log ทุกจุด
// ในโปรเจ็คถูกบันทึกลงไฟล์ด้วยโดยอัตโนมัติ ไม่ต้องแก้ทีละจุด
// ==========================================================

const fs = require("fs");
const path = require("path");

const LOG_DIR = path.join(__dirname, "logs");
const LOG_FILE = path.join(LOG_DIR, "app.log");

try {
  fs.mkdirSync(LOG_DIR, { recursive: true });
} catch (err) {
  // ถ้าสร้างโฟลเดอร์ไม่ได้ ก็ปล่อยให้ log ขึ้น console อย่างเดียวต่อไป
}

const originalLog = console.log.bind(console);
const originalError = console.error.bind(console);

function formatArgs(args) {
  return args
    .map((a) => (typeof a === "string" ? a : (a && a.stack) || JSON.stringify(a)))
    .join(" ");
}

function writeToFile(level, args) {
  const line = `[${new Date().toISOString()}] [${level}] ${formatArgs(args)}\n`;
  try {
    fs.appendFileSync(LOG_FILE, line);
  } catch (err) {
    originalError(`[logger] Failed to write log file: ${err.message}`);
  }
}

console.log = (...args) => {
  originalLog(...args);
  writeToFile("INFO", args);
};

console.error = (...args) => {
  originalError(...args);
  writeToFile("ERROR", args);
};

module.exports = { LOG_FILE };
