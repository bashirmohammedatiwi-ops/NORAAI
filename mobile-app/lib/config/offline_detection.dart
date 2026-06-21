import '../models/detection.dart';

/// Defaults when the app runs without network but ONNX is on disk.
abstract final class OfflineDetection {
  static ServerConfig config({List<String> classes = const []}) => ServerConfig(
        modelReady: true,
        detectionEnabled: true,
        inferenceMode: 'local',
        minConfidence: 0.35,
        scanFps: 24,
        speedViolation: const SpeedViolationRules(),
        captureMaxWidth: 640,
        jpegQuality: 0.78,
        scanIntervalMs: 2000,
        scanIntervalFastMs: 800,
        speedFastKmh: 40,
        classes: classes,
        modelClasses: classes,
        message: 'اكتشاف محلي — بدون إنترنت',
      );
}
