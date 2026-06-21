import 'dart:math' as math;

import '../models/detection.dart';

/// Single tracked object with predictive, spring-smoothed bbox.
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

  /// Latest measured box [x1,y1,x2,y2] (normalized).
  List<double> bbox;

  /// Smoothed box currently rendered.
  List<double> display;

  /// Center velocity (normalized units per second) for prediction.
  double vx = 0;
  double vy = 0;

  int missed = 0;
  int hitStreak = 1;
  double lockStrength = 0;
  DateTime lastHit = DateTime.now();
  DateTime lastMeasured = DateTime.now();

  /// 0→1 spawn animation; 1→0 fade-out before removal.
  double appear = 0;
  bool dying = false;

  bool get locked => lockStrength >= 0.65;
}

/// Predictive IoU tracker — boxes glide smoothly between low-fps detections.
class DetectionTracker {
  DetectionTracker({
    this.smoothHz = 60,
    this.maxMissedIngests = 1,
    this.matchIoU = 0.1,
  });

  final double smoothHz;
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

    final now = DateTime.now();
    final used = <int>{};

    for (final det in incoming) {
      final box = _norm(det.bbox);
      var bestIdx = -1;
      var bestScore = 0.0;

      for (var i = 0; i < _tracks.length; i++) {
        if (used.contains(i)) continue;
        final t = _tracks[i];
        if (t.dying) continue;

        final sameClass = t.className.toLowerCase() == det.className.toLowerCase();
        final iou = _iou(t.bbox, box);
        final cxDist = _centerDist(t.bbox, box);
        if (iou < matchIoU && cxDist > 0.18) continue;

        final score =
            iou * 1.2 + (sameClass ? 0.3 : 0) + t.lockStrength * 0.2 - cxDist * 0.4;
        if (score > bestScore) {
          bestScore = score;
          bestIdx = i;
        }
      }

      if (bestIdx >= 0) {
        final t = _tracks[bestIdx];
        used.add(bestIdx);

        // Estimate velocity from measured center delta over elapsed time.
        final dt = now.difference(t.lastMeasured).inMilliseconds / 1000.0;
        if (dt > 0.001 && dt < 0.6) {
          final pcx = (t.bbox[0] + t.bbox[2]) * 0.5;
          final pcy = (t.bbox[1] + t.bbox[3]) * 0.5;
          final ncx = (box[0] + box[2]) * 0.5;
          final ncy = (box[1] + box[3]) * 0.5;
          final nvx = (ncx - pcx) / dt;
          final nvy = (ncy - pcy) / dt;
          // Smooth velocity to avoid jitter.
          t.vx = t.vx * 0.5 + nvx * 0.5;
          t.vy = t.vy * 0.5 + nvy * 0.5;
        }

        t.bbox = box;
        t.confidence = det.confidence;
        t.className = det.className;
        t.missed = 0;
        t.dying = false;
        t.hitStreak++;
        t.lockStrength = (t.hitStreak / 3.0).clamp(0.0, 1.0);
        t.lastHit = now;
        t.lastMeasured = now;

        if (t.hitStreak <= 1) {
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

    // Unmatched tracks begin fade-out instead of vanishing instantly.
    for (var i = _tracks.length - 1; i >= 0; i--) {
      if (used.contains(i)) continue;
      final t = _tracks[i];
      t.missed++;
      t.hitStreak = 0;
      t.lockStrength *= 0.6;
      if (t.missed > maxMissedIngests) {
        t.dying = true;
      }
    }
  }

  void tick() {
    final now = DateTime.now();
    final dt = now.difference(_lastTick).inMilliseconds.clamp(1, 40) / 1000.0;
    _lastTick = now;
    _time += dt;

    for (var i = _tracks.length - 1; i >= 0; i--) {
      final t = _tracks[i];

      // Lifecycle: spawn in / fade out.
      if (t.dying) {
        t.appear -= dt * 5.0;
        if (t.appear <= 0) {
          _tracks.removeAt(i);
          continue;
        }
      } else {
        t.appear = math.min(1.0, t.appear + dt * 6.0);
      }

      final lock = t.lockStrength.clamp(0.0, 1.0);

      // Predicted target: extrapolate measured box along velocity since last measurement.
      final since = now.difference(t.lastMeasured).inMilliseconds / 1000.0;
      final predict = t.dying ? 0.0 : since.clamp(0.0, 0.35);
      final tcx = (t.bbox[0] + t.bbox[2]) * 0.5 + t.vx * predict;
      final tcy = (t.bbox[1] + t.bbox[3]) * 0.5 + t.vy * predict;
      final tw = (t.bbox[2] - t.bbox[0]).clamp(0.002, 1.0);
      final th = (t.bbox[3] - t.bbox[1]).clamp(0.002, 1.0);

      final dcx = (t.display[0] + t.display[2]) * 0.5;
      final dcy = (t.display[1] + t.display[3]) * 0.5;
      final dw = (t.display[2] - t.display[0]).clamp(0.002, 1.0);
      final dh = (t.display[3] - t.display[1]).clamp(0.002, 1.0);

      // Critically-damped style follow — fast lock, no overshoot.
      final posAlpha = (smoothHz * dt * (0.30 + lock * 0.55)).clamp(0.18, 0.85);
      final sizeAlpha = (smoothHz * dt * (0.22 + lock * 0.45)).clamp(0.14, 0.75);

      final newCx = dcx + (tcx - dcx) * posAlpha;
      final newCy = dcy + (tcy - dcy) * posAlpha;
      final newW = dw + (tw - dw) * sizeAlpha;
      final newH = dh + (th - dh) * sizeAlpha;

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
