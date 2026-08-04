// ==========================================================
// Filter
// ตรวจว่า Event นี้เปิดหรือปิด ตาม config.filter
// ==========================================================

const config = require("./config");

function isAllowed(normalizedEvent) {
  const key = normalizedEvent.event;
  // ถ้าไม่รู้จัก key ให้ fallback ไปที่ unknown
  if (Object.prototype.hasOwnProperty.call(config.filter, key)) {
    return config.filter[key] === true;
  }
  return config.filter.unknown === true;
}

module.exports = { isAllowed };
