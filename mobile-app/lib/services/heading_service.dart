import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_compass/flutter_compass.dart';

/// Fuses GPS course heading with device compass for smooth map arrow rotation.
class HeadingService {
  HeadingService();

  StreamSubscription<CompassEvent>? _compassSub;
  double? _compassHeading;
  double _displayHeading = 0;
  bool _hasDisplay = false;

  double get displayHeading => _displayHeading;
  double? get compassHeading => _compassHeading;

  void start() {
    if (kIsWeb) return;
    _compassSub?.cancel();
    if (FlutterCompass.events == null) return;
    _compassSub = FlutterCompass.events!.listen((event) {
      final h = event.heading;
      if (h == null || h.isNaN || h < 0) return;
      _compassHeading = _normalize(h);
    });
  }

  void stop() {
    _compassSub?.cancel();
    _compassSub = null;
  }

  void dispose() => stop();

  /// [gpsHeading] degrees 0–360, or negative if invalid.
  /// [speedKmh] used to prefer GPS course when moving.
  double update({required double gpsHeading, required double speedKmh}) {
    final compass = _compassHeading;
    double target;

    if (speedKmh >= 8 && gpsHeading >= 0) {
      target = gpsHeading;
    } else if (compass != null) {
      target = compass;
    } else if (gpsHeading >= 0) {
      target = gpsHeading;
    } else {
      return _displayHeading;
    }

    target = _normalize(target);
    if (!_hasDisplay) {
      _displayHeading = target;
      _hasDisplay = true;
      return _displayHeading;
    }

    _displayHeading = _lerpAngle(_displayHeading, target, speedKmh >= 8 ? 0.35 : 0.22);
    return _displayHeading;
  }

  static double _normalize(double deg) {
    var d = deg % 360;
    if (d < 0) d += 360;
    return d;
  }

  static double _lerpAngle(double from, double to, double t) {
    var delta = to - from;
    while (delta > 180) {
      delta -= 360;
    }
    while (delta < -180) {
      delta += 360;
    }
    return _normalize(from + delta * t);
  }
}
