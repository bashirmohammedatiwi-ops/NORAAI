import '../models/detection_result.dart';
import '../models/tracked_object.dart';

/// Lightweight constant-velocity Kalman (cx, cy, w, h + velocities).
class _BoxKalman {
  _BoxKalman(BoundingBox box)
      : cx = box.centerX,
        cy = box.centerY,
        w = box.width,
        h = box.height,
        vx = 0,
        vy = 0,
        vw = 0,
        vh = 0;

  double cx, cy, w, h;
  double vx, vy, vw, vh;

  // Process / measurement noise (tuned for phone overlay smoothness).
  static const qPos = 2.5;
  static const qVel = 1.2;
  static const rMeas = 6.0;

  double pPos = 12;
  double pVel = 8;

  void predict() {
    cx += vx;
    cy += vy;
    w += vw;
    h += vh;
    pPos += qPos;
    pVel += qVel;
  }

  BoundingBox update(BoundingBox meas) {
    predict();
    final mx = meas.centerX;
    final my = meas.centerY;
    final mw = meas.width.clamp(4.0, 4000.0);
    final mh = meas.height.clamp(4.0, 4000.0);

    final kPos = pPos / (pPos + rMeas);
    final kVel = pVel / (pVel + rMeas);

    final dx = mx - cx;
    final dy = my - cy;
    cx += kPos * dx;
    cy += kPos * dy;
    w += kPos * (mw - w);
    h += kPos * (mh - h);
    vx += kVel * dx;
    vy += kVel * dy;
    vw += kVel * (mw - w) * 0.25;
    vh += kVel * (mh - h) * 0.25;

    pPos *= (1 - kPos);
    pVel *= (1 - kVel);

    return BoundingBox(
      left: cx - w / 2,
      top: cy - h / 2,
      right: cx + w / 2,
      bottom: cy + h / 2,
    );
  }

  BoundingBox get box => BoundingBox(
        left: cx - w / 2,
        top: cy - h / 2,
        right: cx + w / 2,
        bottom: cy + h / 2,
      );
}

/// Multi-object tracker: IoU + centroid matching + Kalman box smoothing.
class TrackingService {
  TrackingService({
    this.iouThreshold = 0.25,
    this.maxMissed = 5,
    this.smoothAlpha = 0.38,
    this.centroidMaxDist = 160,
    this.useKalman = true,
  });

  final double iouThreshold;
  final int maxMissed;
  final double smoothAlpha;
  final double centroidMaxDist;
  final bool useKalman;

  final List<TrackedObject> _tracks = [];
  final Map<int, _BoxKalman> _filters = {};
  int _nextId = 1;

  List<TrackedObject> get tracks => List.unmodifiable(_tracks);

  List<TrackedObject> update(List<DetectionResult> detections) {
    final unmatchedDet = List<DetectionResult>.from(detections);
    final matchedTrack = <int>{};

    for (final track in _tracks) {
      var bestIdx = -1;
      var bestScore = -1.0;
      for (var i = 0; i < unmatchedDet.length; i++) {
        final d = unmatchedDet[i];
        if (d.type != track.type) continue;
        final iou = track.smoothedBoundingBox.iou(d.boundingBox);
        final dx = track.smoothedBoundingBox.centerX - d.centerX;
        final dy = track.smoothedBoundingBox.centerY - d.centerY;
        final dist = dx * dx + dy * dy;
        final distOk = dist <= centroidMaxDist * centroidMaxDist;
        final score = iou > 0 ? iou : (distOk ? 0.15 : -1.0);
        if (score > bestScore && (iou >= iouThreshold || distOk)) {
          bestScore = score;
          bestIdx = i;
        }
      }
      if (bestIdx >= 0) {
        final d = unmatchedDet.removeAt(bestIdx);
        _apply(track, d);
        matchedTrack.add(track.trackId);
      } else {
        track.missedFrames += 1;
        // Coast with Kalman prediction while briefly missed.
        final kf = _filters[track.trackId];
        if (kf != null && track.missedFrames <= 3) {
          kf.predict();
          track.smoothedBoundingBox = kf.box;
        }
      }
    }

    for (final d in unmatchedDet) {
      final id = _nextId++;
      final track = TrackedObject(
        trackId: id,
        type: d.type,
        boundingBox: d.boundingBox,
        confidence: d.confidence,
        timestamp: d.timestamp,
        contourPoints: d.contourPoints,
        cameraConfidence: d.confidence,
        finalConfidence: d.confidence,
      );
      _tracks.add(track);
      _filters[id] = _BoxKalman(d.boundingBox);
    }

    _tracks.removeWhere((t) {
      final drop = t.missedFrames > maxMissed;
      if (drop) _filters.remove(t.trackId);
      return drop;
    });
    return tracks;
  }

  void _apply(TrackedObject track, DetectionResult d) {
    track.boundingBox = d.boundingBox;
    if (useKalman) {
      final kf = _filters.putIfAbsent(
        track.trackId,
        () => _BoxKalman(track.smoothedBoundingBox),
      );
      track.smoothedBoundingBox = kf.update(d.boundingBox);
    } else {
      track.smoothedBoundingBox =
          track.smoothedBoundingBox.lerp(d.boundingBox, smoothAlpha);
    }
    track.confidence = d.confidence;
    track.cameraConfidence = d.confidence;
    track.timestamp = d.timestamp;
    track.contourPoints = d.contourPoints;
    track.type = d.type;
    track.age += 1;
    track.missedFrames = 0;
  }

  void clear() {
    _tracks.clear();
    _filters.clear();
  }
}
