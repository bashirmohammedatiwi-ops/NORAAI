import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:latlong2/latlong.dart';

class RouteResult {
  const RouteResult({
    required this.points,
    required this.distanceMeters,
    required this.durationSeconds,
  });

  final List<LatLng> points;
  final double distanceMeters;
  final double durationSeconds;

  String get distanceLabel {
    if (distanceMeters >= 1000) {
      return '${(distanceMeters / 1000).toStringAsFixed(1)} كم';
    }
    return '${distanceMeters.round()} م';
  }

  String get durationLabel {
    final m = (durationSeconds / 60).ceil();
    if (m >= 60) {
      final h = m ~/ 60;
      final rem = m % 60;
      return '$h س $rem د';
    }
    return '$m د';
  }
}

/// Online routing via public OSRM (fallback: straight line).
class RouteService {
  const RouteService();

  static const _base = 'https://router.project-osrm.org/route/v1/driving';

  Future<RouteResult> route({
    required LatLng from,
    required LatLng to,
  }) async {
    final uri = Uri.parse(
      '$_base/${from.longitude},${from.latitude};${to.longitude},${to.latitude}'
      '?overview=full&geometries=geojson&steps=false',
    );
    try {
      final res = await http.get(uri).timeout(const Duration(seconds: 12));
      if (res.statusCode == 200) {
        final json = jsonDecode(res.body) as Map<String, dynamic>;
        final routes = json['routes'] as List?;
        if (routes != null && routes.isNotEmpty) {
          final r = routes.first as Map<String, dynamic>;
          final geom = r['geometry'] as Map<String, dynamic>;
          final coords = geom['coordinates'] as List;
          final points = <LatLng>[];
          for (final c in coords) {
            final pair = c as List;
            points.add(
              LatLng((pair[1] as num).toDouble(), (pair[0] as num).toDouble()),
            );
          }
          if (points.length >= 2) {
            return RouteResult(
              points: points,
              distanceMeters: (r['distance'] as num?)?.toDouble() ?? 0,
              durationSeconds: (r['duration'] as num?)?.toDouble() ?? 0,
            );
          }
        }
      }
    } catch (_) {}

    // Offline / error fallback — direct segment.
    final dist = const Distance().as(LengthUnit.Meter, from, to);
    return RouteResult(
      points: [from, to],
      distanceMeters: dist,
      durationSeconds: dist / 8.5, // ~30 km/h urban guess
    );
  }
}
