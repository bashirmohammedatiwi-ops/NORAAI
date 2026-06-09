import 'dart:math' as math;

import 'package:geolocator/geolocator.dart';

class _SpeedSample {
  _SpeedSample(this.pos, this.at);
  final Position pos;
  final DateTime at;
}

/// High-accuracy speed from GPS + position deltas with outlier rejection.
class SpeedEstimator {
  final List<_SpeedSample> _window = [];
  double? _smoothed;
  int? _displayKmh;
  DateTime? _lastDisplayChange;

  double? get smoothedKmh => _smoothed;

  /// Stable integer km/h for UI (reduces jitter).
  int? get displayKmh {
    if (_smoothed == null) return null;
    final candidate = _smoothed!.round();
    if (_displayKmh == null) {
      _displayKmh = candidate;
      _lastDisplayChange = DateTime.now();
      return _displayKmh;
    }
    final now = DateTime.now();
    final delta = (candidate - _displayKmh!).abs();
    if (delta >= 2 ||
        now.difference(_lastDisplayChange!).inMilliseconds > 700) {
      _displayKmh = candidate;
      _lastDisplayChange = now;
    }
    return _displayKmh;
  }

  double? update(Position pos) {
    final at = pos.timestamp;
    _window.removeWhere((s) => at.difference(s.at).inSeconds > 5);
    _window.add(_SpeedSample(pos, at));
    if (_window.length > 12) _window.removeAt(0);

    final derivedSpeeds = <double>[];
    for (var i = 1; i < _window.length; i++) {
      final a = _window[i - 1];
      final b = _window[i];
      final dt = b.at.difference(a.at).inMilliseconds / 1000.0;
      if (dt < 0.28 || dt > 6) continue;
      final meters = _haversineM(
        a.pos.latitude,
        a.pos.longitude,
        b.pos.latitude,
        b.pos.longitude,
      );
      if (meters < 0.35) continue;
      final kmh = (meters / dt) * 3.6;
      if (kmh >= 0 && kmh < 280) derivedSpeeds.add(kmh);
    }

    double? derived;
    if (derivedSpeeds.isNotEmpty) {
      derivedSpeeds.sort();
      derived = derivedSpeeds[derivedSpeeds.length ~/ 2];
    }

    final gpsKmh = pos.speed >= 0 ? pos.speed * 3.6 : null;
    final acc = pos.accuracy;

    var gpsWeight = 0.55;
    if (acc > 30) {
      gpsWeight = 0.12;
    } else if (acc > 18) {
      gpsWeight = 0.28;
    } else if (acc > 10) {
      gpsWeight = 0.42;
    } else if (acc < 6) {
      gpsWeight = 0.68;
    }

    if (derived != null && derived < 4) gpsWeight *= 0.4;
    if (derived != null && derived > 15) gpsWeight = gpsWeight.clamp(0.35, 0.75);

    double? raw;
    if (gpsKmh != null && derived != null) {
      raw = gpsKmh * gpsWeight + derived * (1 - gpsWeight);
    } else {
      raw = derived ?? gpsKmh;
    }

    if (raw == null) return _smoothed;

    if (_smoothed != null && _window.length >= 2) {
      final dt = at.difference(_window[_window.length - 2].at).inMilliseconds / 1000.0;
      if (dt > 0.1) {
        final maxJump = (18 * dt).clamp(4.0, 35.0);
        final diff = raw - _smoothed!;
        if (diff.abs() > maxJump) {
          raw = _smoothed! + maxJump * (diff > 0 ? 1 : -1);
        }
      }
    }

    if (raw < 1.8) raw = 0;

    final alpha = raw < 6 ? 0.62 : 0.48;
    _smoothed = _smoothed == null ? raw : _smoothed! + (raw - _smoothed!) * alpha;
    return _smoothed;
  }

  void reset() {
    _window.clear();
    _smoothed = null;
    _displayKmh = null;
    _lastDisplayChange = null;
  }

  static double _haversineM(double lat1, double lon1, double lat2, double lon2) {
    const r = 6378137.0;
    final p1 = lat1 * math.pi / 180;
    final p2 = lat2 * math.pi / 180;
    final dlat = (lat2 - lat1) * math.pi / 180;
    final dlon = (lon2 - lon1) * math.pi / 180;
    final a = math.sin(dlat / 2) * math.sin(dlat / 2) +
        math.cos(p1) * math.cos(p2) * math.sin(dlon / 2) * math.sin(dlon / 2);
    return 2 * r * math.asin(math.sqrt(a));
  }
}
