import 'dart:convert';

import 'package:http/http.dart' as http;

class LocationService {
  String? _cachedPlace;
  double? _lastLat;
  double? _lastLon;

  String? get cachedPlace => _cachedPlace;

  Future<String?> reverseGeocode(double lat, double lon) async {
    if (_cachedPlace != null &&
        _lastLat != null &&
        _lastLon != null &&
        (lat - _lastLat!).abs() < 0.002 &&
        (lon - _lastLon!).abs() < 0.002) {
      return _cachedPlace;
    }

    try {
      final uri = Uri.parse(
        'https://nominatim.openstreetmap.org/reverse'
        '?lat=$lat&lon=$lon&format=json&accept-language=ar',
      );
      final res = await http.get(
        uri,
        headers: {'User-Agent': 'NURAI-Drive/1.0'},
      ).timeout(const Duration(seconds: 6));

      if (res.statusCode != 200) return _cachedPlace;

      final json = jsonDecode(res.body) as Map<String, dynamic>;
      final addr = json['address'] as Map<String, dynamic>?;
      if (addr == null) return _cachedPlace;

      final parts = <String>[
        addr['road'] as String? ?? '',
        addr['suburb'] as String? ?? addr['neighbourhood'] as String? ?? '',
        addr['city'] as String? ?? addr['town'] as String? ?? '',
      ].where((p) => p.isNotEmpty).toList();

      _cachedPlace = parts.isNotEmpty ? parts.join(' · ') : json['display_name'] as String?;
      _lastLat = lat;
      _lastLon = lon;
      return _cachedPlace;
    } catch (_) {
      return _cachedPlace;
    }
  }
}
