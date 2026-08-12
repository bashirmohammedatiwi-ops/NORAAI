# NURAI Dashboard — مشروع مستقل

لوحة تحكم + API + PostgreSQL + Redis — كل شيء في `docker compose` واحد.

## التشغيل على VPS (أمر واحد)

```bash
git clone https://github.com/bashirmohammedatiwi-ops/NURAI-DASHBOARD.git
cd NURAI-DASHBOARD
docker compose up -d --build
```

| الخدمة | المنفذ | الوصف |
|--------|--------|--------|
| **dashboard** | **9800** | الواجهة — http://IP:9800/login |
| **api** | داخلي | Backend (لا يحتاج فتح منفذ على VPS) |
| postgres | داخلي | قاعدة البيانات |
| redis | داخلي | WebSocket / pubsub |

**تسجيل الدخول:** `admin@aiops.com` / `admin123`

عند أول تشغيل يُنشئ تلقائياً:
- مستخدم admin
- مشروع «Road Infrastructure Monitoring»
- **22 تنبيه + 10 مركبات** (بيانات العرض — بغداد)

## أوامر مفيدة

```bash
docker compose ps
docker compose logs -f api
docker compose logs -f dashboard
docker compose down
docker compose up -d --build   # بعد git pull
```

## البنية

```
NURAI-DASHBOARD/
├── backend/           # FastAPI — API مستقل
│   ├── app/
│   ├── scripts/init_db.py
│   └── Dockerfile
├── src/               # React frontend
├── nginx/             # proxy للإنتاج
├── docker-compose.yml # postgres + redis + api + dashboard
└── Dockerfile         # frontend image
```

## التطوير المحلي

```bash
# Backend
cd backend && pip install -r requirements.txt
cp .env.example .env
# عدّل DATABASE_URL لـ localhost
python scripts/init_db.py
PYTHONPATH=. uvicorn app.main:app --reload --port 9000

# Frontend
npm install && npm run dev
```

## متغيرات Backend (`backend/.env`)

| المتغير | الافتراضي |
|---------|-----------|
| `ADMIN_EMAIL` | admin@aiops.com |
| `ADMIN_PASSWORD` | admin123 |
| `SECRET_KEY` | غيّره في الإنتاج |
| `CLOUD_PREDICT_URL` | لمختبر AI (اختياري) |

## API الرئيسية

- `POST /api/v1/auth/login`
- `GET /api/v1/projects`
- `GET /api/v1/control-center/{id}/overview`
- `GET /api/v1/road-intelligence/{id}/events`
- `WS /api/v1/ws/road-intelligence/{id}`
- `POST /api/v1/control-center/{id}/demo/seed`

## ملاحظات

- صفحة **الإعدادات** مخفية — بيانات العرض تُحمّل تلقائياً عند أول تشغيل.
- للصور: ضع ملفات JPG في `backend/demo_images/` ثم `POST .../demo/attach-images`.
