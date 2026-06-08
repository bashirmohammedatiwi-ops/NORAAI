class NearbyEvent {
  const NearbyEvent({
    required this.id,
    required this.eventType,
    required this.latitude,
    required this.longitude,
    required this.distanceKm,
    this.confidence,
  });

  final String id;
  final String eventType;
  final double latitude;
  final double longitude;
  final double distanceKm;
  final double? confidence;

  factory NearbyEvent.fromJson(Map<String, dynamic> json) => NearbyEvent(
        id: json['id'] as String,
        eventType: json['event_type'] as String? ?? '',
        latitude: (json['latitude'] as num).toDouble(),
        longitude: (json['longitude'] as num).toDouble(),
        distanceKm: (json['distance_km'] as num?)?.toDouble() ?? 0,
        confidence: (json['confidence'] as num?)?.toDouble(),
      );
}

class LiveAlert {
  const LiveAlert({
    required this.type,
    required this.label,
    required this.confidence,
    required this.at,
    this.className,
    this.speed,
    this.speedLimit,
  });

  final String type;
  final String label;
  final double confidence;
  final DateTime at;
  final String? className;
  final double? speed;
  final double? speedLimit;

  factory LiveAlert.fromDetect(Map<String, dynamic> json) {
    return LiveAlert(
      type: json['type'] as String? ?? 'detection',
      label: json['label'] as String? ??
          json['class_name'] as String? ??
          json['type'] as String? ??
          'اكتشاف',
      confidence: (json['confidence'] as num?)?.toDouble() ?? 0,
      at: DateTime.now(),
      className: json['class_name'] as String?,
      speed: (json['speed'] as num?)?.toDouble(),
      speedLimit: (json['speed_limit'] as num?)?.toDouble(),
    );
  }
}
