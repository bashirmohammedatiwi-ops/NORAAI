import 'dart:async';
import 'dart:collection';
import 'dart:math' as math;

import 'package:sensors_plus/sensors_plus.dart';

import '../models/sensor_reading.dart';
import 'platform_support.dart';

/// Accelerometer feature extractor focused on vertical impact.
/// Uses gravity baseline so a still phone does not report false vibration.
class AccelerometerService {
  StreamSubscription<AccelerometerEvent>? _sub;
  final _window = ListQueue<({double x, double y, double z, int t})>();
  static const _windowMs = 800;

  double verticalPeak = 0;
  AccelFeatures latest = const AccelFeatures();

  /// Low-pass gravity estimate (m/s²).
  double _gx = 0;
  double _gy = 0;
  double _gz = 9.8;
  bool _gravityReady = false;

  void start() {
    if (!supportsMotionSensors) return;
    _sub?.cancel();
    _sub = accelerometerEventStream().listen((e) {
      final now = DateTime.now().millisecondsSinceEpoch;
      // Slow gravity tracking — rejects DC bias / orientation hold.
      const gAlpha = 0.02;
      if (!_gravityReady) {
        _gx = e.x;
        _gy = e.y;
        _gz = e.z;
        _gravityReady = true;
      } else {
        _gx = _gx * (1 - gAlpha) + e.x * gAlpha;
        _gy = _gy * (1 - gAlpha) + e.y * gAlpha;
        _gz = _gz * (1 - gAlpha) + e.z * gAlpha;
      }
      _window.add((x: e.x, y: e.y, z: e.z, t: now));
      while (_window.isNotEmpty && now - _window.first.t > _windowMs) {
        _window.removeFirst();
      }
      latest = _compute();
      verticalPeak = latest.verticalPeak;
    });
  }

  AccelFeatures _compute() {
    if (_window.isEmpty) return const AccelFeatures();

    final linearMags = <double>[];
    final verts = <double>[];
    for (final s in _window) {
      final lx = s.x - _gx;
      final ly = s.y - _gy;
      final lz = s.z - _gz;
      final lin = math.sqrt(lx * lx + ly * ly + lz * lz);
      linearMags.add(lin);
      // Vertical ≈ component along gravity unit vector.
      final gMag = math.sqrt(_gx * _gx + _gy * _gy + _gz * _gz).clamp(1.0, 20.0);
      final vert = (lx * _gx + ly * _gy + lz * _gz).abs() / gMag;
      verts.add(vert);
    }

    var peak = 0.0;
    var suddenDrop = 0.0;
    var rebound = 0.0;
    for (var i = 0; i < verts.length; i++) {
      if (verts[i] > peak) peak = verts[i];
      if (i > 0) {
        final delta = verts[i] - verts[i - 1];
        if (delta < suddenDrop) suddenDrop = delta;
        if (delta > rebound) rebound = delta;
      }
    }
    suddenDrop = suddenDrop.abs();

    final mean =
        linearMags.fold<double>(0, (a, b) => a + b) / linearMags.length;
    var varSum = 0.0;
    var rmsSum = 0.0;
    var vibSamples = 0;
    // Higher threshold: idle noise / engine idle often sits under ~0.55.
    for (final m in linearMags) {
      varSum += (m - mean) * (m - mean);
      rmsSum += m * m;
      if (m > 0.9) vibSamples++;
    }
    final variance = varSum / linearMags.length;
    final rms = math.sqrt(rmsSum / linearMags.length);
    final vibMs = vibSamples * (_windowMs / math.max(linearMags.length, 1));

    return AccelFeatures(
      peak: peak,
      suddenDrop: suddenDrop,
      rebound: rebound,
      vibrationDurationMs: vibMs,
      rms: rms,
      variance: variance,
      verticalPeak: peak,
    );
  }

  void stop() {
    _sub?.cancel();
    _sub = null;
  }

  void dispose() => stop();
}
