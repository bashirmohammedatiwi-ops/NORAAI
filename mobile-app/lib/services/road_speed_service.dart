import '../models/road_speed.dart';
import '../utils/map_geo.dart';
import 'api_service.dart';

class RoadSpeedService {
  RoadSpeedService(this._api);

  final ApiService _api;
  double? _lastLat;
  double? _lastLon;
  DateTime? _lastFetch;
  RoadSpeedResult _cached = RoadSpeedResult.fallback(80);

  RoadSpeedResult get cached => _cached;

  Future<RoadSpeedResult> fetchIfNeeded(
    double lat,
    double lon,
    double fallback, {
    bool force = false,
  }) async {
    final now = DateTime.now();
    final moved = _lastLat == null ||
        distanceMeters(_lastLat!, _lastLon!, lat, lon) >= 25;
    final stale = _lastFetch == null ||
        now.difference(_lastFetch!) >= const Duration(seconds: 12);

    if (!force && !moved && !stale) return _cached;

    _lastLat = lat;
    _lastLon = lon;
    _lastFetch = now;

    try {
      _cached = await _api.fetchSpeedLimit(lat, lon, fallback);
    } catch (_) {}

    return _cached;
  }
}
