import '../models/detection.dart';

/// Balances upload size, inference speed, and detection accuracy.
class DetectScheduler {
  static const int _minIntervalMs = 200;
  static const int _maxIntervalMs = 2200;
  static const int _minCaptureWidth = 640;
  static const int _maxCaptureWidth = 1024;

  int nextIntervalMs(ServerConfig cfg, double speedKmh, {int? lastLatencyMs}) {
    final fast = speedKmh >= cfg.speedFastKmh;
    var ms = fast ? cfg.scanIntervalFastMs : cfg.scanIntervalMs;
    if (cfg.scanFps > 0) {
      final fromFps = (1000 / cfg.scanFps).round();
      ms = fast ? (ms < fromFps ? ms : fromFps) : fromFps;
    }

    if (lastLatencyMs != null) {
      if (lastLatencyMs < 300) {
        ms = (ms * 0.5).round();
      } else if (lastLatencyMs < 500) {
        ms = (ms * 0.62).round();
      } else if (lastLatencyMs < 750) {
        ms = (ms * 0.78).round();
      } else if (lastLatencyMs > 1600) {
        ms = (ms * 1.35).round();
      } else if (lastLatencyMs > 1000) {
        ms = (ms * 1.15).round();
      }
    }

    return ms.clamp(_minIntervalMs, _maxIntervalMs);
  }

  /// Adaptive JPEG width — prioritize readable detail for the model.
  int captureWidth(ServerConfig cfg, {int? lastLatencyMs}) {
    final base = cfg.captureMaxWidth.clamp(_minCaptureWidth, 1280);
    if (lastLatencyMs == null) {
      return base.clamp(_minCaptureWidth, _maxCaptureWidth);
    }
    if (lastLatencyMs < 400) {
      return base.clamp(768, _maxCaptureWidth);
    }
    if (lastLatencyMs < 700) {
      return base.clamp(_minCaptureWidth, 896);
    }
    if (lastLatencyMs < 1100) {
      return base.clamp(640, 768);
    }
    return _minCaptureWidth;
  }

  int jpegQuality(ServerConfig cfg, {int? lastLatencyMs}) {
    final q = (cfg.jpegQuality * 100).round();
    if (lastLatencyMs != null && lastLatencyMs > 1100) {
      return q.clamp(72, 82);
    }
    return q.clamp(78, 90);
  }

  /// Display threshold — slightly below server config to avoid hiding valid boxes.
  double displayMinConfidence(ServerConfig cfg) =>
      (cfg.minConfidence * 0.92).clamp(0.25, cfg.minConfidence);

  /// On-device ONNX — much faster cadence.
  int localIntervalMs({int? lastLatencyMs}) {
    if (lastLatencyMs == null) return 100;
    if (lastLatencyMs < 70) return 55;
    if (lastLatencyMs < 120) return 80;
    if (lastLatencyMs < 200) return 110;
    if (lastLatencyMs < 350) return 150;
    return 220;
  }

  int localCaptureWidth(int modelInputSize) => (modelInputSize * 1.15).round().clamp(416, 896);

  int localJpegQuality() => 88;
}
