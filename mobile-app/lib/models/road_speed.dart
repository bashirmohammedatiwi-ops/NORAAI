class RoadSpeedResult {
  const RoadSpeedResult({
    required this.limit,
    required this.source,
    required this.fromRoad,
    this.roadName,
    this.highwayType,
  });

  final double limit;
  final String source;
  final bool fromRoad;
  final String? roadName;
  final String? highwayType;

  String get sourceLabelAr {
    switch (source) {
      case 'google':
        return 'Google';
      case 'osm':
      case 'osm_inferred':
        return 'OSM';
      case 'fallback':
        return 'يدوي';
      default:
        return source;
    }
  }

  factory RoadSpeedResult.fallback(double limit) => RoadSpeedResult(
        limit: limit,
        source: 'fallback',
        fromRoad: false,
      );

  factory RoadSpeedResult.fromJson(Map<String, dynamic> json) => RoadSpeedResult(
        limit: (json['speed_limit_kmh'] as num?)?.toDouble() ?? 80,
        source: json['source'] as String? ?? 'fallback',
        fromRoad: json['road_speed_available'] as bool? ?? false,
        roadName: json['road_name'] as String?,
        highwayType: json['highway_type'] as String?,
      );
}
