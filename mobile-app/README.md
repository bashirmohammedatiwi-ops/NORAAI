# NURAI Drive Mobile (Flutter)

تطبيق هاتف السائق — خريطة، كاميرا، قياس سرعة، مخالفات، ومزامنة موديل ONNX من لوحة التحكم.

## المتطلبات

- [Flutter SDK](https://docs.flutter.dev/get-started/install) 3.11+
- جهاز Android/iOS أو محاكي

## الإعداد

1. من لوحة التحكم: **Fleet** → سجّل جهازاً وانسخ API Key و Project ID
2. من **Mobile App** → اختر الموديل → **رفع ومزامنة للتطبيق**
3. شغّل التطبيق:

```bash
cd mobile-app
flutter pub get
flutter run
```

للتشغيل على جهاز محدد:

```bash
flutter devices
flutter run -d <device_id>
```

## الميزات

- خريطة OpenStreetMap + موقع GPS مستمر
- عداد سرعة + حد الطريق من السيرفر
- تسجيل مخالفة سرعة تلقائياً (`POST /driver/violations`)
- مزامنة إعدادات التطبيق من لوحة **Mobile Command**
- كاميرا خلفية + اكتشاف عبر السيرفر مع مربعات ملونة
- تحميل ONNX محلياً من `/driver/model/download` (جاهز للاستدلال المحلي لاحقاً)
- اضغط على الكاميرا لتكبيرها

## API

| Endpoint | الاستخدام |
|----------|-----------|
| `GET /driver/config` | إعدادات + إصدار الموديل |
| `GET /driver/model/manifest` | معلومات ONNX |
| `GET /driver/model/download` | ملف الموديل |
| `POST /driver/detect` | اكتشاف من إطار الكاميرا |
| `POST /driver/violations` | مخالفة سرعة |
| `POST /driver/telemetry` | نبض الجهاز |

## البنية

```
lib/
  main.dart              # نقطة الدخول
  models/                # DriverConfig, ServerConfig, DetectionBox
  services/              # API, مزامنة الموديل, GPS/سرعة
  screens/               # إعداد الاتصال + شاشة القيادة
  widgets/               # طبقة مربعات الاكتشاف
```
