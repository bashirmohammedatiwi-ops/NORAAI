# راصد | RASID — التقرير التقني

**المسابقة:** NURAI · **2026**

---

## ملخص

منصة MLOps + GIS + Fleet: YOLO11 Detection، Dashboard for ML، Electron Driver App، Live WebSocket Map.

**الملف الكامل للطباعة:** `Rasid-Report-Print.html`

---

## 1. الهوية

| العنصر | القيمة |
|--------|--------|
| الاسم | راصد (RASID) |
| الاختصار | Road · AI · Surveillance · Intelligence · Detection |
| الشعار | نرصد الطريق… قبل أن تصبح المشكلة حادثاً |
| التصميم | أبيض · أسود · رمادي — بسيط وأنيق |

---

## 2. المكونات

- **Rasid Console** — React · JWT
- **Rasid Drive** — Electron · X-Device-Key
- **Backend** — FastAPI · Celery · PostgreSQL/PostGIS · Redis · MinIO

---

## 3. دورة MLOps

Ingestion (6 sources) → Annotation Konva → Training YOLO11 → Deploy Production → Driver Detection → GIS → Active Learning (threshold 0.70)

---

## 4. تطبيق السائق — تفاصيل

| العملية | الفترة |
|---------|--------|
| AI detect | 4s |
| sync config | 20s |
| nearby events | 15s · 15 km |
| speed limit | 12s or 25 m |
| camera | 1280×720 JPEG 0.85 |

GPS: Windows Native → Browser fallback

---

## 5. حد السرعة

Google Roads → OSM Overpass → osm_inferred → fallback  
Cache Redis: 180s

---

## 6. RoadEventType (8)

pothole · accident · road_crack · barrier · road_closed · construction · flooded_road · traffic_violation

---

## 7. API السائق

- `GET /driver/config`
- `POST /driver/detect`
- `POST /driver/telemetry`
- `GET /driver/speed-limit`
- `GET /driver/events/nearby`

---

## 8. النشر

```bash
cp .env.production.example .env
./scripts/deploy_vps.sh
cd driver-app && npm run electron:dev
```

Gateway: **8080**

---

## PDF

افتح `Rasid-Report-Print.html` في Chrome → Ctrl+P → Background graphics ✓
