// ==========================================================
// Config
// แก้ไขค่าตรงนี้โดย Developer เท่านั้น
// ไม่มี API เปิด/ปิด, ไม่มี Web UI, ไม่มี Database Config
// ==========================================================

module.exports = {
  // EulerStream connection
  euler: {
    uniqueId: "target_tiktok_username",   // TikTok uniqueId ที่จะดักฟัง (ไม่ใส่ @)
    apiKey: "YOUR_EULERSTREAM_API_KEY",   // EulerStream API Key
    wsUrl: "wss://ws.eulerstream.com",
  },

  // HTTP POST output ปลายทาง (รับได้ทุกภาษา: Python/Go/PHP/AI/...)
  output: {
    url: "http://localhost:8000/events",
    timeoutMs: 5000,
  },

  // Event Filter - เปิด(true) / ปิด(false) ผ่าน Code เท่านั้น
  filter: {
    comment: true,
    gift: true,
    like: false,
    follow: true,
    share: true,
    roomInfo: true,
    unknown: false,
  },

  // Reconnect behavior
  reconnect: {
    retryDelayMs: 5000,       // ใช้กับ 4404 (ไม่ live) / 4500 / 4555
    rateLimitDelayMs: 15000,  // ใช้กับ 4429 (connection เกิน)
  },
};
