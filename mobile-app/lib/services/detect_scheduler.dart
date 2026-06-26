import '../config/detection_config.dart';
import '../models/detection.dart';

/// جدولة بسيطة — فترة محلية تتكيف مع زمن الاستنتاج.
class DetectScheduler {
  double displayMinConfidence(ServerConfig cfg) =>
      cfg.minConfidence.clamp(0.25, 0.95);

  double localInferMinConfidence(ServerConfig cfg) =>
      (cfg.minConfidence * 0.82).clamp(0.22, 0.50);

  double localDisplayMinConfidence(ServerConfig cfg) =>
      cfg.minConfidence.clamp(0.28, 0.55);

  int localIntervalMs({int? lastLatencyMs}) {
    if (lastLatencyMs == null) return DetectionConfig.localDetectIntervalMs;
    if (lastLatencyMs < 20) return 12;
    if (lastLatencyMs < 35) return 16;
    if (lastLatencyMs < 55) return 22;
    if (lastLatencyMs < 90) return 33;
    if (lastLatencyMs < 140) return 50;
    if (lastLatencyMs < 220) return 70;
    return 90;
  }

  int nextIntervalMs(ServerConfig cfg, double speedKmh, {int? lastLatencyMs}) {
    final ms = speedKmh >= cfg.speedFastKmh ? cfg.scanIntervalFastMs : cfg.scanIntervalMs;
    return ms.clamp(200, 3000);
  }

  int captureWidth(ServerConfig cfg, {int? lastLatencyMs}) =>
      cfg.captureMaxWidth.clamp(640, 960);

  int jpegQuality(ServerConfig cfg, {int? lastLatencyMs}) =>
      (cfg.jpegQuality * 100).round().clamp(75, 88);

  int localJpegQuality() => 78;
}
