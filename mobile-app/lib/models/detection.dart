import 'package:flutter/material.dart';

class DetectionBox {
  const DetectionBox({
    required this.className,
    required this.confidence,
    required this.bbox,
    this.eventType,
  });

  final String className;
  final double confidence;
  final List<double> bbox;
  final String? eventType;

  factory DetectionBox.fromJson(Map<String, dynamic> json) => DetectionBox(
        className: json['class'] as String? ?? '',
        confidence: (json['confidence'] as num?)?.toDouble() ?? 0,
        bbox: (json['bbox'] as List<dynamic>?)
                ?.map((e) => (e as num).toDouble())
                .toList() ??
            [],
        eventType: json['event_type'] as String?,
      );
}

class SpeedViolationRules {
  const SpeedViolationRules({
    this.enabled = true,
    this.toleranceKmh = 5,
    this.graceSeconds = 3,
    this.cooldownSeconds = 60,
    this.fallbackLimitKmh = 80,
  });

  final bool enabled;
  final double toleranceKmh;
  final double graceSeconds;
  final int cooldownSeconds;
  final double fallbackLimitKmh;

  factory SpeedViolationRules.fromJson(Map<String, dynamic>? json) {
    if (json == null) return const SpeedViolationRules();
    return SpeedViolationRules(
      enabled: json['enabled'] as bool? ?? true,
      toleranceKmh: (json['tolerance_kmh'] as num?)?.toDouble() ?? 5,
      graceSeconds: (json['grace_seconds'] as num?)?.toDouble() ?? 3,
      cooldownSeconds: (json['cooldown_seconds'] as num?)?.toInt() ?? 60,
      fallbackLimitKmh: (json['fallback_limit_kmh'] as num?)?.toDouble() ?? 80,
    );
  }
}

class ServerConfig {
  const ServerConfig({
    required this.modelReady,
    required this.detectionEnabled,
    required this.inferenceMode,
    required this.minConfidence,
    required this.scanFps,
    required this.speedViolation,
    this.modelVersion,
    this.modelSha256,
    this.modelName,
    this.message,
    this.roadSpeedEnabled = false,
    this.captureMaxWidth = 640,
    this.jpegQuality = 0.72,
    this.scanIntervalMs = 2000,
    this.scanIntervalFastMs = 1200,
    this.speedFastKmh = 40,
    this.projectClasses = const [],
    this.alertTypes = const [],
    this.modelClasses = const [],
  });

  final bool modelReady;
  final bool detectionEnabled;
  final String inferenceMode;
  final double minConfidence;
  final int scanFps;
  final SpeedViolationRules speedViolation;
  final String? modelVersion;
  final String? modelSha256;
  final String? modelName;
  final String? message;
  final bool roadSpeedEnabled;
  final int captureMaxWidth;
  final double jpegQuality;
  final int scanIntervalMs;
  final int scanIntervalFastMs;
  final double speedFastKmh;
  final List<Map<String, dynamic>> projectClasses;
  final List<Map<String, dynamic>> alertTypes;
  final List<String> modelClasses;

  factory ServerConfig.fromJson(Map<String, dynamic> json) => ServerConfig(
        modelReady: json['model_ready'] as bool? ?? false,
        detectionEnabled: json['detection_enabled'] as bool? ?? false,
        inferenceMode: json['inference_mode'] as String? ?? 'local',
        minConfidence: (json['min_confidence'] as num?)?.toDouble() ?? 0.45,
        scanFps: (json['scan_fps'] as num?)?.toInt() ?? 12,
        speedViolation: SpeedViolationRules.fromJson(
          json['speed_violation'] as Map<String, dynamic>?,
        ),
        modelVersion: json['model_version'] as String?,
        modelSha256: json['model_sha256'] as String?,
        modelName: json['model_name'] as String?,
        message: json['message'] as String?,
        roadSpeedEnabled: json['road_speed_enabled'] as bool? ?? false,
        captureMaxWidth: (json['capture_max_width'] as num?)?.toInt() ?? 640,
        jpegQuality: (json['jpeg_quality'] as num?)?.toDouble() ?? 0.72,
        scanIntervalMs: (json['scan_interval_ms'] as num?)?.toInt() ?? 2000,
        scanIntervalFastMs:
            (json['scan_interval_fast_ms'] as num?)?.toInt() ?? 1200,
        speedFastKmh: (json['speed_fast_kmh'] as num?)?.toDouble() ?? 40,
        projectClasses: (json['project_classes'] as List<dynamic>?)
                ?.map((e) => Map<String, dynamic>.from(e as Map))
                .toList() ??
            [],
        alertTypes: (json['alert_types'] as List<dynamic>?)
                ?.map((e) => Map<String, dynamic>.from(e as Map))
                .toList() ??
            [],
        modelClasses: (json['model_classes'] as List<dynamic>?)
                ?.map((e) => e.toString())
                .toList() ??
            [],
      );
}

Color classColor(String name) {
  final n = name.toLowerCase();
  if (n.contains('accident') || n.contains('حادث')) return const Color(0xFFEF4444);
  if (n.contains('pothole') || n.contains('حفر') || n.contains('حفرة')) {
    return const Color(0xFFF97316);
  }
  if (n.contains('closed') || n.contains('مغلق')) return const Color(0xFFDC2626);
  if (n.contains('violation') || n.contains('مخالف')) return const Color(0xFFEAB308);
  return const Color(0xFF22C55E);
}
