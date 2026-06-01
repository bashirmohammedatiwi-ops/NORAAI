# NORAAI Driver — Desktop App

تطبيق سطح المكتب للسائق — يكتشف:
- **حفرة** (pothole)
- **حادث** (accident)
- **طريق مغلق** (road_closed)
- **مخالفة سرعة** (GPS vs speed limit)

## Setup

1. Register device in web dashboard: **Fleet → Register device**
2. Copy **API Key** (shown once)
3. Configure driver app with Server URL, Project ID, Device ID, API Key

## Run (development)

```bash
cd driver-app
npm install
npm run dev          # browser only — http://127.0.0.1:5174
npm run electron:dev # desktop window
```

## Build

```bash
npm run electron:build
```

Output: `driver-app/release/`

## API (device auth via `X-Device-Key`)

| Endpoint | Purpose |
|----------|---------|
| `GET /api/v1/driver/config` | Device + model config |
| `POST /api/v1/driver/telemetry` | GPS heartbeat |
| `POST /api/v1/driver/detect` | Frame + detection + events |
| `GET /api/v1/driver/events/nearby` | Nearby road events |

## Notes

- Requires camera + GPS permissions
- Without trained model, demo detections are returned for UI testing
- Train model with classes: `pothole`, `accident`, `road_closed`, `traffic_violation`
