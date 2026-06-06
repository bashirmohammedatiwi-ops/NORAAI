# AI Operations Center

Enterprise MLOps and Computer Vision Operations Center for Smart Road Infrastructure and Traffic Monitoring.

## VPS Deployment (Port 8080 + 6001–6005)

> Chrome blocks port **6000** (`ERR_UNSAFE_PORT`). Use **8080** for the main app.

```bash
cp .env.production.example .env
# Edit .env — change all passwords and PUBLIC_URL
chmod +x scripts/deploy_vps.sh
./scripts/deploy_vps.sh
```

| Port | Service |
|------|---------|
| 8080 | Main App (UI + API + WebSocket) |
| 6001 | API Direct / Swagger |
| 6002 | MinIO S3 |
| 6003 | MinIO Console |
| 6004 | Grafana |
| 6005 | Prometheus |

See [DEPLOY.md](DEPLOY.md) for full Arabic/English deployment guide.

## Local Development

```bash
cp .env.example .env
docker compose up -d --build
docker compose exec api python scripts/init_db.py
```

| Service | URL |
|---------|-----|
| Web UI | http://localhost:5173 |
| API | http://localhost:8000 |
| API Docs | http://localhost:8000/docs |

**Login:** `admin@aiops.com` / `admin123`

### Local training → VPS storage (no Docker on PC)

Train on your computer (full CPU/GPU); models and data stay on the VPS.

**On VPS (once):**
```bash
cd /opt/aiops && git pull
bash scripts/enable_vps_remote_training.sh
```

**On Windows:**
```powershell
copy .env.local-worker.example .env.local-worker
# Edit: VPS_HOST, passwords (same as VPS .env)
scripts\setup_local_worker.ps1
scripts\tunnel_vps.ps1          # keep open
scripts\start_local_training_worker.ps1
scripts\start_local_app.ps1     # optional UI → http://localhost:5173
```

Start training from the VPS UI (`http://VPS:8080`); the local worker picks up the job.

## Features

- AI Project Module, Data Ingestion (6 sources), Dataset Versioning
- Auto Labeling, Active Learning, Class Management
- Training Center (YOLO11, YOLOv10, RT-DETR, Faster R-CNN, EfficientDet)
- Optuna HPO, Live WebSocket metrics, Model Registry & Comparison
- Deployment Center, Model Monitoring, Road Intelligence GIS
- Fleet Management, PDF/Excel Reports

## Tech Stack

FastAPI · PostgreSQL/PostGIS · Redis · Celery · MinIO · PyTorch/Ultralytics · React/TypeScript · Docker

## Structure

```
├── backend/              FastAPI + Celery + ML
├── frontend/             React SPA
├── infra/                nginx, prometheus, grafana
├── Dockerfile.gateway    Production build (frontend + nginx)
├── docker-compose.yml    Local dev
├── docker-compose.prod.yml  VPS production (port 8080 + 6001-6005)
└── scripts/deploy_vps.sh
```
