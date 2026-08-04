# Minimal TikTok LIVE Event Gateway

รับข้อมูลจาก TikTok LIVE ผ่าน EulerStream WebSocket แล้วส่งต่อผ่าน HTTP POST เท่านั้น
ไม่มี scraper, ไม่มี browser automation — ใช้ EulerStream เป็น data source เดียว

## Structure

```
config.js      แก้ apiKey / uniqueId / output url / filter เปิดปิด ที่นี่ที่เดียว
normalize.js   แปลง raw event ของ EulerStream -> { event, timestamp, data }
filter.js      เช็คว่า event ประเภทนี้เปิดหรือปิด (จาก config.js)
output.js      ส่ง HTTP POST ไปปลายทาง (fetch ในตัว Node.js ไม่ต้องใช้ axios)
index.js       เชื่อมต่อ WebSocket, จัดการ close code, reconnect logic
```

## Setup

```bash
npm install
```

แก้ไข `config.js`:

```js
euler: {
  uniqueId: "target_tiktok_username",
  apiKey: "YOUR_EULERSTREAM_API_KEY",
}
output: {
  url: "http://localhost:8000/events",
}
filter: {
  comment: true,
  gift: true,
  like: false,
  follow: true,
  ...
}
```

## Run

```bash
npm start
```

## Output format ที่ส่งไปปลายทาง (HTTP POST, JSON body)

```json
{
  "event": "comment",
  "timestamp": 1735900000000,
  "data": { "...": "..." }
}
```

ปลายทางรับได้ทุกภาษา (Python / Go / PHP / Java / C# / Rust / AI service ฯลฯ)
แค่เปิด HTTP endpoint รอรับ POST JSON

## Close code handling

| Code | ความหมาย | การจัดการ |
|------|----------|-----------|
| 4401 | Auth ผิด | หยุดทำงาน |
| 4404 | Stream ไม่ live | Retry |
| 4429 | Connection เกิน | รอแล้วเชื่อมใหม่ |
| 4500 | TikTok ปิด connection | Reconnect |
| 4555 | WS อายุครบ 8 ชม. | Reconnect ทันที |

## Dependencies

- `ws` — เท่านั้น (ไม่มี express / axios / dotenv / typescript / database)
