// ==========================================================
// Normalize
// แปลง Event จาก EulerStream ให้เป็น Format กลาง
// { event, timestamp, data }
// ==========================================================

function normalize(rawEvent) {
  const type = mapEventType(rawEvent && rawEvent.event);

  return {
    event: type,
    timestamp: Date.now(),
    data: rawEvent && rawEvent.data !== undefined ? rawEvent.data : rawEvent,
  };
}

// EulerStream ส่ง event name มาหลายแบบ (ขึ้นกับ library/version)
// map ให้เหลือ event กลางที่ระบบเรารู้จัก
function mapEventType(rawType) {
  if (!rawType) return "unknown";

  const t = String(rawType).toLowerCase();

  if (t.includes("comment") || t === "chat") return "comment";
  if (t.includes("gift")) return "gift";
  if (t.includes("like")) return "like";
  if (t.includes("follow")) return "follow";
  if (t.includes("share")) return "share";
  if (t.includes("room")) return "roomInfo";

  return "unknown";
}

module.exports = { normalize };
