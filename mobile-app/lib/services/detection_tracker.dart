import 'dart:math' as math;

import '../models/detection.dart';

/// Single tracked object with smoothed bbox for fluid overlay animation.
class TrackedDetection {
  TrackedDetection({
    required this.id,
    required this.className,
    required this.confidence,
    required List<double> bbox,
  })  : bbox = List<double>.from(bbox),
        display = List<double>.from(bbox);

  final int id;
  String className;
  double confidence;
  List<double> bbox;
  List<double> display;
  int missed = 0;
  int hitStreak = 1;
  double lockStrength = 0;
  DateTime lastHit = DateTime.now();

  bool get locked => lockStrength >= 0.65;
}

/// IoU tracker — boxes vanish when detections stop; smooth follow while visible.
class DetectionTracker {
  DetectionTracker({
    this.smoothHz = 60,
    this.maxMissedIngests = 0,
    this.matchIoU = 0.11,
  });

  final double smoothHz;
  /// How many ingest cycles without a match before the track is removed (0 = instant).
  final int maxMissedIngests;
  final double matchIoU;

  final List<TrackedDetection> _tracks = [];
  int _nextId = 1;
  DateTime _lastTick = DateTime.now();
  double _time = 0;

  double get animationTime => _time;
  List<TrackedDetection> get active => List.unmodifiable(_tracks);

  void ingest(List<DetectionBox> detections, double minConfidence) {
    final incoming = detections
        .where((d) => d.confidence >= minConfidence && d.bbox.length >= 4)
        .toList();

    if (incoming.isEmpty) {
      _tracks.clear();
      return;
    }

    final used = <int>{};
    final now = DateTime.now();

    for (final det in incoming) {
      final box = _norm(det.bbox);
      var bestIdx = -1;
      var bestScore = 0.0;

      for (var i = 0; i < _tracks.length; i++) {
        if (used.contains(i)) continue;
        final t = _tracks[i];
        if (t.missed > 0) continue;

        final sameClass = t.className.toLowerCase() == det.className.toLowerCase();
        final iou = _iou(t.bbox, box);
        if (iou < matchIoU) continue;

        final cxDist = _centerDist(t.bbox, box);
        if (cxDist > 0.22) continue;

        final score = iou * 1.1 + (sameClass ? 0.25 : 0) + t.lockStrength * 0.2 - cxDist * 0.35;
        if (score > bestScore) {
          bestScore = score;
          bestIdx = i;
        }
      }

      if (bestIdx >= 0) {
        final t = _tracks[bestIdx];
        used.add(bestIdx);
        t.bbox = box;
        t.confidence = det.confidence;
        t.className = det.className;
        t.missed = 0;
        t.hitStreak++;
        t.lockStrength = (t.hitStreak / 2.0).clamp(0.0, 1.0);
        t.lastHit = now;

        // First frames: snap display to detection for crisp appearance.
        if (t.hitStreak <= 2) {
          t.display = List<double>.from(box);
        }
      } else {
        _tracks.add(TrackedDetection(
          id: _nextId++,
          className: det.className,
          confidence: det.confidence,
          bbox: box,
        ));
      }
    }

    for (var i = _tracks.length - 1; i >= 0; i--) {
      if (used.contains(i)) continue;
      final t = _tracks[i];
      t.missed++;
      t.hitStreak = 0;
      t.lockStrength = 0;
      if (t.missed > maxMissedIngests) {
        _tracks.removeAt(i);
      }
    }
  }

  void tick() {
    final now = DateTime.now();
    final dt = now.difference(_lastTick).inMilliseconds.clamp(1, 40) / 1000.0;
    _lastTick = now;
    _time += dt;

    for (final t in _tracks) {
      if (t.missed > 0) continue;

      final lock = t.lockStrength.clamp(0.0, 1.0);
      // Locked tracks follow tightly; new tracks snap faster.
      final posAlpha = (smoothHz * dt * (0.55 + lock * 0.75)).clamp(0.38, 0.92);
      final sizeAlpha = (smoothHz * dt * (0.42 + lock * 0.58)).clamp(0.28, 0.88);

      final cx = (t.bbox[0] + t.bbox[2]) * 0.5;
      final cy = (t.bbox[1] + t.bbox[3]) * 0.5;
      final w = (t.bbox[2] - t.bbox[0]).clamp(0.002, 1.0);
      final h = (t.bbox[3] - t.bbox[1]).clamp(0.002, 1.0);

      final dcx = (t.display[0] + t.display[2]) * 0.5;
      final dcy = (t.display[1] + t.display[3]) * 0.5;
      final dw = (t.display[2] - t.display[0]).clamp(0.002, 1.0);
      final dh = (t.display[3] - t.display[1]).clamp(0.002, 1.0);

      final newCx = dcx + (cx - dcx) * posAlpha;
      final newCy = dcy + (cy - dcy) * posAlpha;
      final newW = dw + (w - dw) * sizeAlpha;
      final newH = dh + (h - dh) * sizeAlpha;

      t.display[0] = (newCx - newW / 2).clamp(0.0, 1.0);
      t.display[1] = (newCy - newH / 2).clamp(0.0, 1.0);
      t.display[2] = (newCx + newW / 2).clamp(0.0, 1.0);
      t.display[3] = (newCy + newH / 2).clamp(0.0, 1.0);
    }
  }

  void clear() {
    _tracks.clear();
    _time = 0;
  }

  static List<double> _norm(List<double> b) => [
        b[0].clamp(0.0, 1.0),
        b[1].clamp(0.0, 1.0),
        b[2].clamp(0.0, 1.0),
        b[3].clamp(0.0, 1.0),
      ];

  static double _centerDist(List<double> a, List<double> b) {
    final acx = (a[0] + a[2]) * 0.5;
    final acy = (a[1] + a[3]) * 0.5;
    final bcx = (b[0] + b[2]) * 0.5;
    final bcy = (b[1] + b[3]) * 0.5;
    return math.sqrt((acx - bcx) * (acx - bcx) + (acy - bcy) * (acy - bcy));
  }

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
