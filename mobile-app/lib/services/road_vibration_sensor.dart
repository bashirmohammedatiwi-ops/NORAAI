import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:sensors_plus/sensors_plus.dart';

/// Reads road vibration intensity from the device accelerometer (user acceleration).
class RoadVibrationSensor {
  StreamSubscription<UserAccelerometerEvent>? _sub;
  final List<double> _window = [];

  bool available = false;
  String? error;

  double _rms = 0;
  double _smoothedRms = 0;
  int _displayLevel = 0;
  DateTime? _lastDisplayChange;

  /// RMS vibration intensity in m/s² (high-frequency component).
  double get intensityMs2 => _smoothedRms;

  /// Stable 0–100 level for UI.
  int get levelPercent => _displayLevel;

  String get labelAr {
    if (!available) return 'غير متاح';
    if (_displayLevel < 18) return 'طريق ناعم';
    if (_displayLevel < 40) return 'اهتزاز خفيف';
    if (_displayLevel < 65) return 'اهتزاز متوسط';
    if (_displayLevel < 85) return 'اهتزاز قوي';
    return 'اهتزاز شديد';
  }

  void start(void Function() onUpdate) {
    if (kIsWeb) {
      available = false;
      error = 'حساس الاهتزاز غير مدعوم على المتصفح';
      return;
    }

    _sub?.cancel();
    _window.clear();
    _rms = 0;
    _smoothedRms = 0;
    _displayLevel = 0;

    try {
      _sub = userAccelerometerEventStream(
        samplingPeriod: SensorInterval.uiInterval,
      ).listen(
        (e) {
          _onSample(e, onUpdate);
        },
        onError: (Object e) {
          available = false;
          error = 'تعذّر قراءة حساس الاهتزاز';
          onUpdate();
        },
      );
      available = true;
      error = null;
    } catch (e) {
      available = false;
      error = 'حساس الاهتزاز غير متاح';
    }
  }

  void _onSample(UserAccelerometerEvent e, void Function() onUpdate) {
    final mag = math.sqrt(e.x * e.x + e.y * e.y + e.z * e.z);
    _window.add(mag);
    if (_window.length > 24) _window.removeAt(0);
    if (_window.length < 4) return;

    final mean = _window.reduce((a, b) => a + b) / _window.length;
    var sumSq = 0.0;
    for (final v in _window) {
      final d = v - mean;
      sumSq += d * d;
    }
    _rms = math.sqrt(sumSq / _window.length);

    _smoothedRms = _smoothedRms == 0 ? _rms : _smoothedRms * 0.72 + _rms * 0.28;

    // Typical driving: smooth ~0.05–0.2 m/s² RMS, rough ~0.8–2.5, pothole 3+
    final rawPct = ((_smoothedRms / 3.2) * 100).clamp(0.0, 100.0).round();
    final now = DateTime.now();
    if (_lastDisplayChange == null ||
        (rawPct - _displayLevel).abs() >= 3 ||
        now.difference(_lastDisplayChange!).inMilliseconds > 700) {
      _displayLevel = rawPct;
      _lastDisplayChange = now;
      onUpdate();
    }
  }

  void stop() {
    _sub?.cancel();
    _sub = null;
    _window.clear();
  }

  void dispose() => stop();
}
