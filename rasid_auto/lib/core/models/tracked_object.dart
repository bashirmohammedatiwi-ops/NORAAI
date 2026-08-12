import 'detection_result.dart';

/// Tracked hazard across frames with smoothed geometry.
class TrackedObject {
  TrackedObject({
    required this.trackId,
    required this.type,
    required this.boundingBox,
    required this.confidence,
    required this.timestamp,
    DateTime? appearedAt,
    this.age = 1,
    this.missedFrames = 0,
    this.contourPoints = const [],
    this.risk = RiskLevel.medium,
    this.cameraConfidence = 0,
    this.sensorConfidence = 0,
    this.finalConfidence = 0,
    this.verified = false,
  })  : smoothedBoundingBox = boundingBox,
        appearedAt = appearedAt ?? timestamp;

  final int trackId;
  SegClass type;
  BoundingBox boundingBox;
  BoundingBox smoothedBoundingBox;
  double confidence;
  double cameraConfidence;
  double sensorConfidence;
  double finalConfidence;
  RiskLevel risk;
  bool verified;
  int age;
  int missedFrames;
  DateTime timestamp;
  DateTime appearedAt;
  List<({double x, double y})> contourPoints;

  bool get isStable => age >= 3 && missedFrames == 0;
}
