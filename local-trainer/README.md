# Rasid Local Trainer

تطبيق ويب محلي لتدريب YOLO11 على Mac (M1/M2/M3) دون الحاجة لسيرفر الإنتاج.

## الميزات

- رفع ZIP بصور معنونة بصيغة YOLO (`images/` + `labels/`)
- إدارة الكلاسات
- تدريب **YOLO11n** أو **YOLO11s**
- دعم Apple GPU (MPS) على Mac
- Fine-tune من موديل محلي سابق
- تصدير **PT** و **ONNX**
- استيراد الموديل في Rasid Console عبر «استيراد موديل»

## التشغيل

```bash
cd local-trainer
chmod +x start.sh
./start.sh
```

**أول تشغيل:** يثبّت PyTorch (ملف كبير) — انتظر 5–15 دقيقة حتى يكتمل.

**إذا ظهر `uvicorn: No such file`:**
```bash
rm -rf venv
./start.sh
```
يُفضّل Python **3.12** (يُختار تلقائياً). لا تستخدم 3.14 حالياً.

افتح: **http://127.0.0.1:8765**

## صيغة ZIP

```
dataset.zip
├── images/
│   ├── img001.jpg
│   └── img002.jpg
├── labels/          # أو labels-yolo
│   ├── img001.txt
│   └── img002.txt
└── data.yaml        # اختياري — names: [pothole, crack]
```

كل ملف `.txt`: `class_id x_center y_center width height` (مُطبّع 0–1)

## استيراد في المنصة الرئيسية

1. صدّر `best.pt` (أو ONNX) من Local Trainer
2. في Rasid Console → **Unified Model** → **استيراد موديل**
3. ارفع الملف وحدّد الكلاسات → تفعيل كـ Main Model

## المتطلبات

- Python 3.10+
- ~2GB مساحة لـ PyTorch + Ultralytics
- أول تشغيل يحمّل `yolo11n.pt` / `yolo11s.pt` تلقائياً
