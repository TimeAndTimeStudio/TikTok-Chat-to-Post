// ==========================================================
// Normalize
// แปลง Event จาก EulerStream ให้เป็น Format กลาง
// { id, event, timestamp, data }
//
// id = ตัวระบุ event ที่เสถียร ใช้สำหรับ dedup ตอน reconnect
//      (ดึงจากฟิลด์ที่ EulerStream/TikTok มักแนบมาด้วย เช่น msgId)
// ==========================================================

function normalize(rawEvent) {
  const type = mapEventType(rawEvent);
  const data = rawEvent && rawEvent.data !== undefined ? rawEvent.data : rawEvent;

  return {
    id: extractId(data),
    event: type,
    timestamp: Date.now(),
    data,
  };
}

// พยายามหา id ที่เสถียรของ event จากตำแหน่งที่ EulerStream มักใช้
// เรียงจากที่พบบ่อยสุด -> รองลงมา ถ้าหาไม่เจอเลยจะ return null
// (คือ event ที่ dedup ไม่ได้ - จะถูกส่งออกเสมอ ไม่ถูกกันซ้ำ)
function extractId(data) {
  // EulerStream ใส่ msgId ไว้ที่ data.common.msgId เสมอ
  // (data ถูก fallback เป็น rawEvent เองแล้วตอนไม่มี data wrapper - ดู normalize() ด้านบน
  //  เพราะงั้นเช็คจุดเดียวตรงนี้ก็ครอบคลุมทั้ง 2 กรณีแล้ว)
  const id = data && data.common && data.common.msgId;
  return id !== undefined && id !== null && id !== "" ? String(id) : null;
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
    const details = safeGet(rawEvent, ["data", "event", "eventDetails"]) || {};
    const hint = `${details.displayType || ""} ${details.label || ""}`.toLowerCase();
    if (hint.includes("share")) return "share";
    return "follow"; // default เมื่อแยกไม่ได้ชัดเจน
  }

  if (t.includes("member")) return "join";

  // room stats / room info ทุกแบบ (RoomUserSeq, RoomMessage, LinkMicBattle ฯลฯ ที่มีคำว่า room)
  if (t.includes("room")) return "roomInfo";

  return "unknown";
}

function safeGet(obj, path) {
  let cur = obj;
  for (const key of path) {
    if (cur === null || cur === undefined) return undefined;
    cur = cur[key];
  }
  return cur;
}

module.exports = { normalize };
