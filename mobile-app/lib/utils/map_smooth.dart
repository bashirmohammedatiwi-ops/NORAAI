import 'dart:math' as math;

import 'package:latlong2/latlong.dart';

double lerpDouble(double a, double b, double t) => a + (b - a) * t;

LatLng lerpLatLng(LatLng from, LatLng to, double t) {
  return LatLng(
    lerpDouble(from.latitude, to.latitude, t),
    lerpDouble(from.longitude, to.longitude, t),
  );
}

double lerpAngleDeg(double from, double to, double t) {
  var delta = to - from;
  while (delta > 180) { delta -= 360; }
  while (delta < -180) { delta += 360; }
  return from + delta * t;
}

/// Frame-rate independent smoothing (Waze-like glide).
double smoothStep(double current, double target, double dtSec, {double hz = 9}) {
  final alpha = (1 - math.exp(-hz * dtSec)).clamp(0.05, 0.55);
  return current + (target - current) * alpha;
}

LatLng smoothLatLng(LatLng current, LatLng target, double dtSec, {double hz = 9}) {
  final t = (1 - math.exp(-hz * dtSec)).clamp(0.05, 0.55);
  return lerpLatLng(current, target, t);
}
