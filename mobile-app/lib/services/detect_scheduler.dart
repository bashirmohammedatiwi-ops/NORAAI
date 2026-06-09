import 'dart:math' as math;

import '../models/detection.dart';

/// Balances upload size, inference speed, and detection accuracy.
class DetectScheduler {
  static const int _minIntervalMs = 120;
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

  /// Display threshold — permissive so valid boxes are not hidden on phone.
  double displayMinConfidence(ServerConfig cfg) =>
      (cfg.minConfidence * 0.78).clamp(0.15, cfg.minConfidence);

  /// Raw ONNX decode threshold — match server conf band.
  double localInferMinConfidence(ServerConfig cfg) =>
      math.max(0.08, cfg.minConfidence * 0.2);

  /// Display filter for on-device boxes (slightly below server threshold).
  double localDisplayMinConfidence(ServerConfig cfg) =>
      (cfg.minConfidence * 0.65).clamp(0.12, cfg.minConfidence);

  /// On-device ONNX — target 15–30 FPS effective.
  int localIntervalMs({int? lastLatencyMs}) {
    if (lastLatencyMs == null) return 66;
    if (lastLatencyMs < 55) return 33;
    if (lastLatencyMs < 90) return 45;
    if (lastLatencyMs < 140) return 66;
    if (lastLatencyMs < 220) return 95;
    if (lastLatencyMs < 350) return 130;
    return 180;
  }

  int localCaptureWidth(int modelInputSize) =>
      (modelInputSize * 1.25).round().clamp(640, 960);

  int localJpegQuality() => 85;
}
