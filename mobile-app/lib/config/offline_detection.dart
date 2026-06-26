import '../models/detection.dart';

/// Defaults when the app runs without network but ONNX is on disk.
abstract final class OfflineDetection {
  /// High-throughput local pipeline — targets ~25–30 FPS inference.
  static ServerConfig config({List<String> classes = const []}) => ServerConfig(
        modelReady: true,
        detectionEnabled: true,
        inferenceMode: 'local',
        minConfidence: 0.30,
        scanFps: 30,
        speedViolation: const SpeedViolationRules(),
        captureMaxWidth: 640,
        jpegQuality: 0.78,
        scanIntervalMs: 800,
        scanIntervalFastMs: 33,
        speedFastKmh: 25,
        classes: classes,
        modelClasses: classes,
        message: 'محلي ONNX — بدون إنترنت',
      );

  /// Force local-first settings when a cached ONNX exists on device.
  static ServerConfig preferLocal(ServerConfig cfg, {List<String> manifestClasses = const []}) {
    final cls = manifestClasses.isNotEmpty
        ? manifestClasses
        : (cfg.classes.isNotEmpty ? cfg.classes : cfg.modelClasses);
    return ServerConfig(
      modelReady: true,
      detectionEnabled: true,
      inferenceMode: 'local',
      minConfidence: cfg.minConfidence.clamp(0.28, 0.50),
      scanFps: cfg.scanFps < 24 ? 30 : cfg.scanFps,
      speedViolation: cfg.speedViolation,
      modelVersion: cfg.modelVersion,
      modelSha256: cfg.modelSha256,
      modelName: cfg.modelName,
      message: 'محلي ONNX — بدون إنترنت',
      roadSpeedEnabled: cfg.roadSpeedEnabled,
      captureMaxWidth: cfg.captureMaxWidth.clamp(640, 640),
      jpegQuality: cfg.jpegQuality,
      scanIntervalMs: 800,
      scanIntervalFastMs: 33,
      speedFastKmh: cfg.speedFastKmh,
      projectClasses: cfg.projectClasses,
      alertTypes: cfg.alertTypes,
      modelClasses: cls,
      classes: cls,
    );
  }
}
