import '../../theme/detection_theme.dart';
import '../models/detection_result.dart';
import '../models/sensor_reading.dart';
import '../services/accel_impact_classifier.dart';

class ConfidenceBreakdown {
  const ConfidenceBreakdown({
    required this.camera,
    required this.sensor,
    required this.finalScore,
    required this.severity,
    required this.verified,
    this.impactLabel = 'none',
  });

  final double camera;
  final double sensor;
  final double finalScore;
  final RiskLevel severity;
  final bool verified;
  final String impactLabel;
}

class ConfidenceCalculator {
  const ConfidenceCalculator({
    this.cameraWeight = 0.7,
    this.sensorWeight = 0.3,
    this.verifyThreshold = 0.55,
    this.classifier = const AccelImpactClassifier(),
  });

  final double cameraWeight;
  final double sensorWeight;
  final double verifyThreshold;
  final AccelImpactClassifier classifier;

  ConfidenceBreakdown fuse({
    required double cameraConfidence,
    required AccelFeatures accel,
    required GyroFeatures gyro,
    required double speedKmh,
    required SegClass type,
  }) {
    final impact = accel.impactScore;
    final shake = gyro.shakeScore;
    final classified = classifier.classify(accel, speedKmh: speedKmh);

    var sensor = impact;
    if (shake > 0.55 && impact < 0.25) {
      sensor *= 0.35;
    }

    // Boost when sensor class agrees with camera class.
    if (classified.kind == type && classified.confidence > 0.35) {
      sensor = (sensor * 0.6 + classified.confidence * 0.4).clamp(0.0, 1.0);
    } else if (classified.kind != null &&
        classified.kind != type &&
        classified.confidence > 0.5) {
      sensor *= 0.55;
    }

    if (speedKmh > 40 && impact > 0.4) {
      sensor = (sensor + 0.15).clamp(0.0, 1.0);
    }

    final hasSensor = impact > 0.22;
    final fused = hasSensor
        ? (cameraConfidence * cameraWeight + sensor * sensorWeight)
        : (cameraConfidence * 0.85);

    final verified = hasSensor && fused >= verifyThreshold;
    final severity = DetectionTheme.riskFromConfidence(
      fused,
      verified: verified,
    );

    return ConfidenceBreakdown(
      camera: cameraConfidence,
      sensor: sensor,
      finalScore: fused.clamp(0.0, 1.0),
      severity: severity,
      verified: verified,
      impactLabel: classified.label,
    );
  }
}
