/// إعدادات الاكتشاف — بسيطة وثابتة.
abstract final class DetectionConfig {
  static const bool mapEventReporting = false;
  static const bool offlineFastPreprocess = true;
  static const bool localOnlyWhenReady = true;

  /// فترة افتراضية بين إطارات الاكتشاف المحلي (ms).
  static const int localDetectIntervalMs = 20;

  /// أقل تأخير بين دورات الاكتشاف المحلي (ms).
  static const int localDetectFloorMs = 4;

  /// معالجة YUV على نفس الخيط للإطارات الصغيرة (بدون [compute]).
  static const int inlinePreprocessMaxPixels = 400000;

  static const bool accidentEmergencyEnabled = true;
  static const double accidentEmergencyMinConfidence = 0.45;
  static const int accidentEmergencyCooldownSec = 90;
}
