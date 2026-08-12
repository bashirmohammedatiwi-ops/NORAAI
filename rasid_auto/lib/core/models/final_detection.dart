import 'detection_result.dart';
import 'tracked_object.dart';

class FinalDetection {
  const FinalDetection({
    required this.track,
    required this.type,
    required this.cameraConfidence,
    required this.sensorConfidence,
    required this.finalConfidence,
    required this.severity,
    required this.verified,
  });

  final TrackedObject track;
  final SegClass type;
  final double cameraConfidence;
  final double sensorConfidence;
  final double finalConfidence;
  final RiskLevel severity;
  final bool verified;
}
