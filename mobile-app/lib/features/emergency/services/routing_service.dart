import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:latlong2/latlong.dart';

import '../../../utils/map_geo.dart';

class DrivingRoute {
  const DrivingRoute({
    required this.points,
    required this.distanceM,
    required this.durationSec,
  });

  final List<LatLng> points;
  final double distanceM;
  final double durationSec;

  String get summaryAr {
    final km = distanceM / 1000;
    final min = (durationSec / 60).round();
    return '${formatDistanceKm(km)} · ~$min د';
  }
}

class RoutingService {
  static const _timeout = Duration(seconds: 12);

  /// OSRM driving route (OpenStreetMap — works in Baghdad without API key).
  static Future<DrivingRoute?> fetchDrivingRoute(LatLng from, LatLng to) async {
    final url = Uri.parse(
      'https://router.project-osrm.org/route/v1/driving/'
      '${from.longitude},${from.latitude};${to.longitude},${to.latitude}'
      '?overview=full&geometries=geojson&steps=false',
    );
    try {
      final res = await http.get(url).timeout(_timeout);
      if (res.statusCode != 200) return _fallbackStraightLine(from, to);
      final data = jsonDecode(res.body) as Map<String, dynamic>;
      if (data['code'] != 'Ok') return _fallbackStraightLine(from, to);
      final routes = data['routes'] as List<dynamic>?;
      if (routes == null || routes.isEmpty) return _fallbackStraightLine(from, to);
      final route = routes.first as Map<String, dynamic>;
      final geom = route['geometry'] as Map<String, dynamic>?;
      final coords = geom?['coordinates'] as List<dynamic>?;
      if (coords == null || coords.isEmpty) return _fallbackStraightLine(from, to);

      final points = coords
          .map((c) {
            final pair = c as List<dynamic>;
            return LatLng((pair[1] as num).toDouble(), (pair[0] as num).toDouble());
          })
          .toList();

      return DrivingRoute(
        points: points,
        distanceM: ((route['distance'] as num?) ?? 0).toDouble(),
        durationSec: ((route['duration'] as num?) ?? 0).toDouble(),
      );
    } catch (_) {
      return _fallbackStraightLine(from, to);
    }
  }

  static DrivingRoute _fallbackStraightLine(LatLng from, LatLng to) {
    final dist = distanceMeters(from.latitude, from.longitude, to.latitude, to.longitude);
    return DrivingRoute(
      points: [from, to],
      distanceM: dist,
      durationSec: dist / 8.3, // ~30 km/h urban estimate
    );
  }
}
