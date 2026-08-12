import '../models/final_detection.dart';
import '../models/sensor_reading.dart';
import '../models/tracked_object.dart';
import '../utils/confidence_calculator.dart';

/// Fuses camera tracks with accelerometer / gyroscope / speed.
class SensorFusionService {
  SensorFusionService({ConfidenceCalculator? calculator})
      : _calc = calculator ?? const ConfidenceCalculator();

  final ConfidenceCalculator _calc;

  List<FinalDetection> fuse({
    required List<TrackedObject> tracks,
    required AccelFeatures accel,
    required GyroFeatures gyro,
    required double speedKmh,
  }) {
    final out = <FinalDetection>[];
    for (final t in tracks) {
      if (t.missedFrames > 2) continue;
      final c = _calc.fuse(
        cameraConfidence: t.cameraConfidence > 0 ? t.cameraConfidence : t.confidence,
        accel: accel,
        gyro: gyro,
        speedKmh: speedKmh,
        type: t.type,
      );
      t.cameraConfidence = c.camera;
      t.sensorConfidence = c.sensor;
      t.finalConfidence = c.finalScore;
      t.risk = c.severity;
      t.verified = c.verified;
      out.add(
        FinalDetection(
          track: t,
          type: t.type,
          cameraConfidence: c.camera,
          sensorConfidence: c.sensor,
          finalConfidence: c.finalScore,
          severity: c.severity,
          verified: c.verified,
        ),
      );
    }
    return out;
  }
}
