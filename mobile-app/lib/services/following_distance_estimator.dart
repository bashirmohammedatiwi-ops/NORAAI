import '../models/detection.dart';

/// Estimated gap to the lead vehicle using camera bbox + speed headway.
class FollowingDistanceState {
  const FollowingDistanceState({
    this.distanceM,
    this.headwaySec,
    this.safeDistanceM,
    this.safeHeadwaySec = 2.0,
    this.hasLeadVehicle = false,
    this.leadClass,
    this.tooClose = false,
    this.source = FollowingSource.none,
  });

  final double? distanceM;
  final double? headwaySec;
  final double? safeDistanceM;
  final double safeHeadwaySec;
  final bool hasLeadVehicle;
  final String? leadClass;
  final bool tooClose;
  final FollowingSource source;
}

enum FollowingSource {
  none,
  camera,
  speedOnly,
}

class FollowingDistanceEstimator {
  static const _vehicleKeywords = [
    'car',
    'truck',
    'bus',
    'van',
    'vehicle',
    'motorcycle',
    'motorbike',
    'سيارة',
    'مركبة',
    'شاحنة',
    'حافلة',
  ];

  /// Calibrated: normalized bbox height at ~10 m for a typical sedan rear.
  static const _refBboxHeight = 0.42;
  static const _refDistanceM = 10.0;

  double? _smoothedDistance;
  String? _leadClass;
  DateTime? _lastSeen;

  FollowingDistanceState update({
    required List<DetectionBox> detections,
    required double? speedKmh,
    double safeHeadwaySec = 2.0,
    double minConfidence = 0.35,
  }) {
    final speed = speedKmh ?? 0;
    final speedMps = speed > 0 ? speed / 3.6 : 0;
    final safeM = speedMps > 0 ? speedMps * safeHeadwaySec : null;

    final lead = _pickLeadVehicle(detections, minConfidence);
    var source = FollowingSource.none;
    double? distance;

    if (lead != null) {
      distance = _distanceFromBbox(lead.bbox);
      _leadClass = lead.className;
      _lastSeen = DateTime.now();
      source = FollowingSource.camera;
    } else if (_lastSeen != null &&
        DateTime.now().difference(_lastSeen!).inMilliseconds < 1200 &&
        _smoothedDistance != null) {
      distance = _smoothedDistance;
      source = FollowingSource.camera;
    } else {
      _leadClass = null;
      if (speed > 8) {
        source = FollowingSource.speedOnly;
      }
    }

    if (distance != null) {
      _smoothedDistance = _smoothedDistance == null
          ? distance
          : _smoothedDistance! * 0.65 + distance * 0.35;
    } else if (source != FollowingSource.camera) {
      _smoothedDistance = null;
    }

    final dist = _smoothedDistance;
    double? headway;
    if (dist != null && speedMps > 1.5) {
      headway = dist / speedMps;
    }

    var tooClose = false;
    if (dist != null && safeM != null && dist < safeM * 0.85) {
      tooClose = true;
    } else if (headway != null && headway < safeHeadwaySec * 0.85) {
      tooClose = true;
    }

    return FollowingDistanceState(
      distanceM: dist,
      headwaySec: headway,
      safeDistanceM: safeM,
      safeHeadwaySec: safeHeadwaySec,
      hasLeadVehicle: lead != null || (dist != null && source == FollowingSource.camera),
      leadClass: _leadClass,
      tooClose: tooClose,
      source: source,
    );
  }

  void reset() {
    _smoothedDistance = null;
    _leadClass = null;
    _lastSeen = null;
  }

  static DetectionBox? _pickLeadVehicle(List<DetectionBox> detections, double minConf) {
    DetectionBox? best;
    var bestScore = -1.0;

    for (final d in detections) {
      if (d.confidence < minConf || d.bbox.length < 4) continue;
      if (!_isVehicleClass(d.className)) continue;

      final x1 = d.bbox[0];
      final y1 = d.bbox[1];
      final x2 = d.bbox[2];
      final y2 = d.bbox[3];
      final cx = (x1 + x2) / 2;
      final cy = (y1 + y2) / 2;
      final h = (y2 - y1).abs();
      final w = (x2 - x1).abs();

      if (h < 0.04 || w < 0.03) continue;
      // Prefer large, centered, lower in frame (closer lane ahead).
      final laneScore = (1.0 - (cx - 0.5).abs() * 1.6).clamp(0.0, 1.0);
      final depthScore = (cy * 0.55 + h * 0.45).clamp(0.0, 1.0);
      final score = h * laneScore * depthScore * d.confidence;

      if (score > bestScore) {
        bestScore = score;
        best = d;
      }
    }
    return best;
  }

  static bool _isVehicleClass(String name) {
    final n = name.toLowerCase();
    return _vehicleKeywords.any((k) => n.contains(k));
  }

  static double _distanceFromBbox(List<double> bbox) {
    final h = (bbox[3] - bbox[1]).abs().clamp(0.06, 0.92);
    final raw = _refDistanceM * (_refBboxHeight / h);
    return raw.clamp(3.0, 120.0);
  }
}
