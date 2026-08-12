import 'dart:async';
import 'dart:collection';
import 'dart:math' as math;

import 'package:sensors_plus/sensors_plus.dart';

import '../models/sensor_reading.dart';
import 'platform_support.dart';

/// Gyroscope features for pitch/roll/orientation change (false-positive filter).
class GyroscopeService {
  StreamSubscription<GyroscopeEvent>? _sub;
  final _window = ListQueue<({double x, double y, double z, int t})>();
  static const _windowMs = 600;

  GyroFeatures latest = const GyroFeatures();

  void start() {
    if (!supportsMotionSensors) return;
    _sub?.cancel();
    _sub = gyroscopeEventStream().listen((e) {
      final now = DateTime.now().millisecondsSinceEpoch;
      _window.add((x: e.x, y: e.y, z: e.z, t: now));
      while (_window.isNotEmpty && now - _window.first.t > _windowMs) {
        _window.removeFirst();
      }
      latest = _compute();
    });
  }

  GyroFeatures _compute() {
    if (_window.isEmpty) return const GyroFeatures();
    var pitchPeak = 0.0;
    var rollPeak = 0.0;
    var yawPeak = 0.0;
    var jerk = 0.0;
    ({double x, double y, double z, int t})? prev;
    for (final s in _window) {
      pitchPeak = math.max(pitchPeak, s.x.abs());
      rollPeak = math.max(rollPeak, s.y.abs());
      yawPeak = math.max(yawPeak, s.z.abs());
      if (prev != null) {
        final dx = s.x - prev.x;
        final dy = s.y - prev.y;
        final dz = s.z - prev.z;
        final j = math.sqrt(dx * dx + dy * dy + dz * dz);
        if (j > jerk) jerk = j;
      }
      prev = s;
    }
    return GyroFeatures(
      pitchRatePeak: pitchPeak,
      rollRatePeak: rollPeak,
      yawRatePeak: yawPeak,
      orientationJerk: jerk,
    );
  }

  void stop() {
    _sub?.cancel();
    _sub = null;
  }

  void dispose() => stop();
}
