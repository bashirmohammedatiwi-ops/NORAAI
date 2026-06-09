import 'dart:math' as math;

const _earthR = 6378137.0;

List<double> destinationPoint(
  double lat,
  double lon,
  double bearingDeg,
  double distanceM,
) {
  final brng = bearingDeg * math.pi / 180;
  final lat1 = lat * math.pi / 180;
  final lon1 = lon * math.pi / 180;
  final lat2 = math.asin(
    math.sin(lat1) * math.cos(distanceM / _earthR) +
        math.cos(lat1) * math.sin(distanceM / _earthR) * math.cos(brng),
  );
  final lon2 = lon1 +
      math.atan2(
        math.sin(brng) * math.sin(distanceM / _earthR) * math.cos(lat1),
        math.cos(distanceM / _earthR) - math.sin(lat1) * math.sin(lat2),
      );
  return [lat2 * 180 / math.pi, lon2 * 180 / math.pi];
}

List<List<double>> headingWedge(
  double lat,
  double lon,
  double headingDeg, {
  double radiusM = 140,
  double spreadDeg = 32,
}) {
  final tip = destinationPoint(lat, lon, headingDeg, radiusM);
  final left = destinationPoint(lat, lon, headingDeg - spreadDeg, radiusM * 0.55);
  final right = destinationPoint(lat, lon, headingDeg + spreadDeg, radiusM * 0.55);
  return [
    [lat, lon],
    left,
    right,
    tip,
    [lat, lon],
  ];
}

String formatDistanceKm(double km) {
  if (km < 1) return '${(km * 1000).round()} م';
  if (km < 10) return '${km.toStringAsFixed(1)} كم';
  return '${km.round()} كم';
}

double distanceMeters(double lat1, double lon1, double lat2, double lon2) {
  final p1 = lat1 * math.pi / 180;
  final p2 = lat2 * math.pi / 180;
  final dlat = (lat2 - lat1) * math.pi / 180;
  final dlon = (lon2 - lon1) * math.pi / 180;
  final a = math.sin(dlat / 2) * math.sin(dlat / 2) +
      math.cos(p1) * math.cos(p2) * math.sin(dlon / 2) * math.sin(dlon / 2);
  return 2 * _earthR * math.asin(math.sqrt(a));
}

double zoomForAccuracy(double? accuracyMeters) {
  if (accuracyMeters == null || accuracyMeters <= 0) return 15;
  if (accuracyMeters < 8) return 17;
  if (accuracyMeters < 20) return 16;
  if (accuracyMeters < 50) return 15;
  if (accuracyMeters < 120) return 14;
  return 13;
}

/// Driving zoom: wider at highway speed, closer when slow / accurate fix.
double zoomForDriving({required double speedKmh, required double accuracyM}) {
  var zoom = 16.0;
  if (speedKmh >= 100) {
    zoom = 14.2;
  } else if (speedKmh >= 70) {
    zoom = 14.8;
  } else if (speedKmh >= 40) {
    zoom = 15.4;
  } else if (speedKmh >= 15) {
    zoom = 16.0;
  } else {
    zoom = 16.8;
  }

  if (accuracyM > 0) {
    if (accuracyM < 8) zoom += 0.4;
    if (accuracyM > 25) zoom -= 0.5;
    if (accuracyM > 50) zoom -= 0.8;
  }
  return zoom.clamp(13.5, 18.0);
}
