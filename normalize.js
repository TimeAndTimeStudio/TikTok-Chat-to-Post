// ==========================================================
// Normalize
// แปลง Event จาก EulerStream ให้เป็น Format กลาง
// { event, timestamp, data }
// ==========================================================

function normalize(rawEvent) {
  const type = mapEventType(rawEvent);

  return {
    event: type,
    timestamp: Date.now(),
    data: rawEvent && rawEvent.data !== undefined ? rawEvent.data : rawEvent,
  };
}

// EulerStream ส่งชื่อ event มาในฟิลด์ "type" (เช่น "WebcastChatMessage",
// "WebcastGiftMessage", "WebcastRoomUserSeqMessage", ...) ไม่ใช่ฟิลด์ "event"
// เก็บ rawEvent.event ไว้ด้วยเผื่อ format เก่า/แหล่งอื่นยังใช้ชื่อฟิลด์นี้อยู่
function mapEventType(rawEvent) {
  if (!rawEvent) return "unknown";

  const rawType = rawEvent.type || rawEvent.event;
  if (!rawType) return "unknown";

  const t = String(rawType).toLowerCase();

  if (t.includes("chat") || t.includes("comment")) return "comment";
  if (t.includes("gift")) return "gift";
  if (t.includes("like")) return "like";

  // WebcastSocialMessage ใช้ทั้ง follow และ share ร่วมกัน
  // แยกจาก label/displayType ที่อยู่ใน data.event.eventDetails ถ้ามี
  if (t.includes("social")) {
    const details =
      (rawEvent.data && rawEvent.data.event && rawEvent.data.event.eventDetails) || {};
    const hint = `${details.displayType || ""} ${details.label || ""}`.toLowerCase();
    if (hint.includes("share")) return "share";
    return "follow"; // default เมื่อแยกไม่ได้ชัดเจน
  }

  if (t.includes("member")) return "join";
  if (t.includes("room")) return "roomInfo";

  return "unknown";
}

module.exports = { normalize };
