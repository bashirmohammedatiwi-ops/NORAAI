import '../models/detection.dart';

/// Single tracked object with smoothed bbox for fluid overlay animation.
class TrackedDetection {
  TrackedDetection({
    required this.id,
    required this.className,
    required this.confidence,
    required List<double> bbox,
  })  : bbox = List<double>.from(bbox),
        display = List<double>.from(bbox),
        velocity = List<double>.filled(4, 0);

  final int id;
  String className;
  double confidence;
  List<double> bbox;
  List<double> display;
  List<double> velocity;
  int missed = 0;
  int hitStreak = 1;
  double opacity = 1;
  double lockStrength = 0;
  DateTime lastHit = DateTime.now();

  bool get alive => opacity > 0.04;
  bool get locked => lockStrength >= 0.75;
}

/// IoU tracker with velocity prediction and spring smoothing.
class DetectionTracker {
  DetectionTracker({
    this.smoothHz = 38,
    this.maxCoastFrames = 22,
    this.matchIoU = 0.18,
  });

  final double smoothHz;
  final int maxCoastFrames;
  final double matchIoU;

  final List<TrackedDetection> _tracks = [];
  int _nextId = 1;
  DateTime _lastTick = DateTime.now();
  double _time = 0;

  double get animationTime => _time;
  List<TrackedDetection> get active => _tracks.where((t) => t.alive).toList();

  void ingest(List<DetectionBox> detections, double minConfidence) {
    final incoming = detections
        .where((d) => d.confidence >= minConfidence && d.bbox.length >= 4)
        .toList();

    final used = <int>{};
    final now = DateTime.now();

    for (final det in incoming) {
      final box = _norm(det.bbox);
      var bestIdx = -1;
      var bestScore = 0.0;

      for (var i = 0; i < _tracks.length; i++) {
        if (used.contains(i)) continue;
        final t = _tracks[i];
        final sameClass = t.className.toLowerCase() == det.className.toLowerCase();
        final iou = _iou(t.bbox, box);
        if (iou < matchIoU) continue;
        final score = iou + (sameClass ? 0.2 : 0) + t.lockStrength * 0.1;
        if (score > bestScore) {
          bestScore = score;
          bestIdx = i;
        }
      }

      if (bestIdx >= 0) {
        final t = _tracks[bestIdx];
        used.add(bestIdx);
        final dt = now.difference(t.lastHit).inMilliseconds.clamp(1, 2000) / 1000.0;
        for (var i = 0; i < 4; i++) {
          final raw = (box[i] - t.bbox[i]) / dt;
          t.velocity[i] = t.velocity[i] * 0.35 + raw * 0.65;
        }
        t.bbox = box;
        t.confidence = det.confidence;
        t.className = det.className;
        t.missed = 0;
        t.hitStreak++;
        t.lockStrength = (t.hitStreak / 2).clamp(0.0, 1.0);
        t.opacity = 1;
        t.lastHit = now;
      } else {
        _tracks.add(TrackedDetection(
          id: _nextId++,
          className: det.className,
          confidence: det.confidence,
          bbox: box,
        ));
      }
    }

    for (var i = 0; i < _tracks.length; i++) {
      if (used.contains(i)) continue;
      final t = _tracks[i];
      t.missed++;
      t.hitStreak = 0;
      t.lockStrength *= 0.85;
    }

    _tracks.removeWhere((t) => t.missed > maxCoastFrames);
  }

  void tick() {
    final now = DateTime.now();
    final dt = now.difference(_lastTick).inMilliseconds.clamp(1, 40) / 1000.0;
    _lastTick = now;
    _time += dt;
    final alpha = (smoothHz * dt).clamp(0.22, 0.92);

    for (final t in _tracks) {
      if (t.missed > 0) {
        for (var i = 0; i < 4; i++) {
          t.bbox[i] += t.velocity[i] * dt * 0.95;
          t.velocity[i] *= 0.88;
        }
        t.opacity = (1 - t.missed / maxCoastFrames).clamp(0, 1);
        t.lockStrength *= 0.92;
      } else {
        t.opacity = 1;
      }

      for (var i = 0; i < 4; i++) {
        t.display[i] += (t.bbox[i] - t.display[i]) * alpha;
      }
    }
  }

  void clear() {
    _tracks.clear();
    _time = 0;
  }

  static List<double> _norm(List<double> b) => [b[0], b[1], b[2], b[3]];

  static double _iou(List<double> a, List<double> b) {
    final ix1 = a[0] > b[0] ? a[0] : b[0];
    final iy1 = a[1] > b[1] ? a[1] : b[1];
    final ix2 = a[2] < b[2] ? a[2] : b[2];
    final iy2 = a[3] < b[3] ? a[3] : b[3];
    final iw = (ix2 - ix1).clamp(0.0, 1.0);
    final ih = (iy2 - iy1).clamp(0.0, 1.0);
    final inter = iw * ih;
    final areaA = (a[2] - a[0]) * (a[3] - a[1]);
    final areaB = (b[2] - b[0]) * (b[3] - b[1]);
    final union = areaA + areaB - inter;
    return union <= 0 ? 0 : inter / union;
  }
}
