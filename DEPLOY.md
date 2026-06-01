# دليل النشر على VPS — AI Operations Center

## المتطلبات

- Ubuntu 22.04+ (أو أي Linux مع Docker)
- 4 GB RAM على الأقل (8 GB موصى به)
- 20 GB مساحة تخزين
- المنافذ المتاحة: **8080** (التطبيق) + **6001–6005** (خدمات أخرى)

> **مهم:** لا تستخدم المنفذ **6000** للتطبيق — متصفح Chrome يحجبه (`ERR_UNSAFE_PORT`) لأنه مخصص لـ X11.

## خريطة المنافذ

| المنفذ | الخدمة | الوصف |
|--------|--------|-------|
| **8080** | Gateway | التطبيق الرئيسي (واجهة + API + WebSocket) |
| **5000** | Driver Web | تطبيق السائق (Rasid Drive) |
| **6001** | API | الوصول المباشر للـ API و Swagger |
| **6002** | MinIO | تخزين S3 للصور والنماذج |
| **6003** | MinIO Console | لوحة إدارة MinIO |
| **6004** | Grafana | مراقبة الأداء |
| **6005** | Prometheus | metrics |
| 6006–6010 | — | محجوز |

> PostgreSQL و Redis **غير معرّضين** خارجياً لأسباب أمنية.

## خطوات النشر

### 1. رفع المشروع إلى VPS

```bash
# على جهازك
scp -r ./AI user@YOUR_VPS_IP:/opt/aiops

# أو عبر git
ssh user@YOUR_VPS_IP
git clone YOUR_REPO /opt/aiops
cd /opt/aiops
```

### 2. إعداد البيئة

```bash
cp .env.production.example .env
nano .env   # غيّر كلمات المرور و SECRET_KEY
```

**يجب تغيير:**
- `SECRET_KEY`
- `POSTGRES_PASSWORD`
- `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY`
- `ADMIN_PASSWORD`
- `GRAFANA_PASSWORD`
- `PUBLIC_URL=http://YOUR_VPS_IP:8080`

### 3. تشغيل النشر

```bash
chmod +x scripts/deploy_vps.sh
./scripts/deploy_vps.sh
```

### 4. فتح المنافذ في الجدار الناري

```bash
# UFW
sudo ufw allow 8080/tcp
sudo ufw allow 6001:6005/tcp
sudo ufw reload

# أو iptables
sudo iptables -A INPUT -p tcp --dport 8080 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 6001:6005 -j ACCEPT
```

## الوصول بعد النشر

| الخدمة | الرابط |
|--------|--------|
| التطبيق | `http://YOUR_VPS_IP:8080` |
| تطبيق السائق | `http://YOUR_VPS_IP:5000` |
| API Docs | `http://YOUR_VPS_IP:8080/docs` |
| Grafana | `http://YOUR_VPS_IP:6004` |
| MinIO | `http://YOUR_VPS_IP:6003` |

**تسجيل الدخول:** `admin@aiops.com` / كلمة المرور من `ADMIN_PASSWORD`

## أوامر مفيدة

```bash
# حالة الخدمات
docker compose -f docker-compose.prod.yml ps

# سجلات API
docker compose -f docker-compose.prod.yml logs -f api

# إعادة تشغيل
docker compose -f docker-compose.prod.yml restart

# إيقاف
docker compose -f docker-compose.prod.yml down

# تحديث بعد تعديل الكود
docker compose -f docker-compose.prod.yml up -d --build
```

## GPU (اختياري)

إذا كان VPS يحتوي NVIDIA GPU:

```bash
# تثبيت NVIDIA Container Toolkit
# ثم في .env:
TRAINING_DOCKERFILE=Dockerfile.gpu
TRAINING_CPU_FALLBACK=false
```

## استكشاف الأخطاء

### تحديث فاشل (git pull conflict)

إذا ظهر `Your local changes would be overwritten`:

```bash
cd /opt/aiops
chmod +x scripts/update_vps.sh
./scripts/update_vps.sh
```

### API unhealthy

```bash
./scripts/diagnose.sh
docker compose -f docker-compose.prod.yml logs api --tail 80
./scripts/sync_env.sh .env
```

إذا ظهر `password authentication failed` — أعد إنشاء قاعدة البيانات (يحذف البيانات):

```bash
docker compose -f docker-compose.prod.yml down -v
./scripts/sync_env.sh .env
docker compose -f docker-compose.prod.yml up -d --build
```

```bash
# تحقق من صحة API
curl http://localhost:6001/health

# تحقق من قاعدة البيانات
docker compose -f docker-compose.prod.yml exec api python scripts/init_db.py

# عرض سجلات worker التدريب
docker compose -f docker-compose.prod.yml logs worker-training
```
