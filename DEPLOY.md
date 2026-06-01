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
cd /opt/aiops
./scripts/update_vps.sh
```

> **مساحة القرص:** كل تحديث قديم كان يستخدم `build --no-cache` ويبني 8 نسخ من backend — هذا يستهلك ~10 GB إضافية.  
> السكربت الحالي يستخدم **Docker cache** + **صورة backend واحدة** + **تنظيف تلقائي** بعد التحديث.

### تنظيف مساحة القرص

```bash
# عرض ما يستهلك المساحة
./scripts/disk_usage.sh

# تنظيف آمن (لا يحذف بيانات المشروع)
./scripts/cleanup_disk.sh --after-update

# تنظيف أقوى — يحذف الصور غير المستخدمة
./scripts/cleanup_disk.sh --all-images

# تحرير مساحة فوراً (مرة واحدة بعد التحديث القديم)
./scripts/docker_cleanup_after_update.sh
```

**ما يستهلك المساحة عادة:**
| المصدر | الحجم التقريبي |
|--------|----------------|
| `minio_data` | الصور والنماذج المرفوعة (بيانات حقيقية) |
| `training_data` | ملفات تدريب مؤقتة |
| Docker build cache | ~2–5 GB بعد عدة تحديثات |
| صور Docker القديمة | ~1–2 GB لكل rebuild بدون تنظيف |

**لا تستخدم** `--volumes` إلا إذا أردت حذف كل البيانات.

## GPU (اختياري)

إذا كان VPS يحتوي NVIDIA GPU:

```bash
# تثبيت NVIDIA Container Toolkit
# ثم في .env:
TRAINING_DOCKERFILE=Dockerfile.gpu
TRAINING_CPU_FALLBACK=false
```

## استكشاف الأخطاء

### Bad Gateway (502)

**السبب الشائع:** nginx يحتفظ بـ IP قديم لحاوية `api` بعد إعادة تشغيلها.

```bash
cd /opt/aiops
./scripts/fix_gateway.sh
# أو يدوياً:
docker compose -f docker-compose.prod.yml restart gateway
curl http://localhost:8080/health/ready
```

إذا API مباشرة يعمل لكن Gateway لا:

```bash
curl http://localhost:6001/health/ready   # يجب OK
curl http://localhost:8080/health/ready   # إن فشل → restart gateway
```

**الحل الدائم:** أعد بناء gateway بعد `git pull` (يحدّث nginx لإعادة حل DNS تلقائياً):

```bash
./scripts/update_vps.sh
```

### Cannot reach the server / بعد إعادة تشغيل VPS

**السبب:** الخدمات لا تبدأ تلقائياً أو الـ API يحتاج 2–3 دقائق بعد الإقلاع.

**الحل الدائم (مرة واحدة على السيرفر):**

```bash
cd /opt/aiops
git pull
chmod +x scripts/ensure_services.sh scripts/install_boot_service.sh
sudo ./scripts/install_boot_service.sh
```

هذا يثبّت:
- `aiops.service` — يشغّل Docker Compose عند إقلاع VPS
- `aiops-health.timer` — **watchdog كل دقيقتين** + حاوية **autoheal** تعيد تشغيل الحاويات unhealthy تلقائياً

**مهم على VPS 4GB (مرة واحدة):**

```bash
sudo ./scripts/setup_swap.sh          # 2GB swap ضد OOM
sudo ./scripts/install_boot_service.sh
```

**سبب شائع لتوقف السيرفر:** نفاد الذاكرة (OOM) — الحاوية تبقى "running" لكن API لا يستجيب. الحل: swap + autoheal + تقليل workers (Grafana/Prometheus معطّلان افتراضياً).

**إذا ظهر الخطأ الآن:**

```bash
cd /opt/aiops
./scripts/ensure_services.sh recover
# أو
sudo systemctl start aiops
```

**تحقق:**

```bash
curl http://localhost:8080/health/ready
curl http://localhost:6001/health/ready
docker compose -f docker-compose.prod.yml ps
tail -20 logs/watchdog.log
./scripts/diagnose.sh
```

**إذا تكرر التوقف:** راجع `dmesg | grep -i oom` — إن ظهر `Killed process` فالذاكرة ممتلئة. نفّذ `sudo ./scripts/setup_swap.sh` أو زِد RAM VPS.

**بعد التحديث — يجب 10 حاويات فقط** (ليس 17):

```bash
cd /opt/aiops
git pull
./scripts/cleanup_orphans.sh
```

الـ 7 الزائدة عادة: `worker-ingestion`, `worker-labeling`, `worker-deploy`, `worker-monitor`, `worker-reports`, `grafana`, `prometheus`.

**إذا أردت Grafana/Prometheus:**

```bash
KEEP_MONITORING=1 docker compose -f docker-compose.prod.yml --profile monitoring up -d
```

### تحديث فاشل (git pull conflict)

إذا ظهر `Your local changes would be overwritten`:

```bash
cd /opt/aiops
git checkout -- scripts/ systemd/ backend/entrypoint.sh
git pull origin main
chmod +x scripts/*.sh
./scripts/cleanup_orphans.sh
```

أو:

```bash
cd /opt/aiops
./scripts/update_vps.sh --force
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
