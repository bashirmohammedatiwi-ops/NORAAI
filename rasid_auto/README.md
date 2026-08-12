# RASID Auto — Road Segmentation Pipeline

تطبيق قيادة ذكي أوفلاين. الكشف يعتمد على **Segmentation** (ليس YOLO).

## Pipeline

```
Camera ImageStream (YUV)
→ Frame skip (~12 FPS)
→ Preprocess isolate (YUV→NHWC/NCHW)
→ Segmentation Model (ONNX U-Net / Mock)
→ Mask → Contours → Boxes
→ Kalman Tracking
→ ADAS Overlay
→ Accel classifier + Gyro + GPS Fusion
→ LocalStore (dedupe)
```

## الموديل المدمج

[lilNewbie U-Net](https://github.com/lilNewbie/SemanticSegmentation) — semantic segmentation للحفر (ليس YOLO).

| | |
|--|--|
| Input | `float32` `[1,256,256,3]` **NHWC** — `/255` — stretch |
| Output | `[1,256,256,2]` — ch0=bg, ch1=pothole |
| حجم | ~53MB ONNX |

المطبّات غير مدعومة في هذا الموديل — تُسجَّل من **Accelerometer** عند الصدمات القوية أثناء القيادة.

## تشغيل

```bash
cd rasid_auto
flutter pub get
flutter run
```

`assets/models/model.onnx` يُنسخ تلقائياً إلى Documents عند أول تشغيل. بدون موديل يعمل **Mock**.

## أين أضع الموديل؟

```
assets/models/model.onnx
# أو Documents/rasid-model/model.onnx
# أو الاستيراد من شاشة الموديل
```

## اختبار

1. شاشة الموديل → Mock Mode
2. قيادة → تشغيل الكشف
3. Debug Mode من الإعدادات
4. استورد `model.onnx` الحقيقي
