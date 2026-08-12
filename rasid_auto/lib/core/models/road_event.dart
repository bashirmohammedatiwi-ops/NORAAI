import 'package:uuid/uuid.dart';

class RoadEvent {
  RoadEvent({
    String? id,
    required this.kind,
    required this.labelAr,
    required this.latitude,
    required this.longitude,
    required this.confidence,
    required this.createdAt,
    this.speedKmh,
    this.heading,
    this.note,
    this.source = 'ai',
    this.severity,
    this.sensorVerified = false,
    this.trackId,
    this.cameraConfidence,
    this.sensorConfidence,
    this.finalConfidence,
  }) : id = id ?? const Uuid().v4();

  final String id;
  final String kind;
  final String labelAr;
  final double latitude;
  final double longitude;
  final double confidence;
  final DateTime createdAt;
  final double? speedKmh;
  final double? heading;
  final String? note;
  final String source;
  final String? severity;
  final bool sensorVerified;
  final int? trackId;
  final double? cameraConfidence;
  final double? sensorConfidence;
  final double? finalConfidence;

  Map<String, dynamic> toMap() => {
        'id': id,
        'kind': kind,
        'label_ar': labelAr,
        'latitude': latitude,
        'longitude': longitude,
        'confidence': confidence,
        'created_at': createdAt.toIso8601String(),
        'speed_kmh': speedKmh,
        'heading': heading,
        'note': note,
        'source': source,
        'severity': severity,
        'sensor_verified': sensorVerified ? 1 : 0,
        'track_id': trackId,
        'camera_confidence': cameraConfidence,
        'sensor_confidence': sensorConfidence,
        'final_confidence': finalConfidence,
      };

  factory RoadEvent.fromMap(Map<String, dynamic> m) => RoadEvent(
        id: m['id'] as String,
        kind: m['kind'] as String,
        labelAr: m['label_ar'] as String,
        latitude: (m['latitude'] as num).toDouble(),
        longitude: (m['longitude'] as num).toDouble(),
        confidence: (m['confidence'] as num).toDouble(),
        createdAt: DateTime.parse(m['created_at'] as String),
        speedKmh: (m['speed_kmh'] as num?)?.toDouble(),
        heading: (m['heading'] as num?)?.toDouble(),
        note: m['note'] as String?,
        source: m['source'] as String? ?? 'ai',
        severity: m['severity'] as String?,
        sensorVerified: (m['sensor_verified'] as int? ?? 0) == 1,
        trackId: m['track_id'] as int?,
        cameraConfidence: (m['camera_confidence'] as num?)?.toDouble(),
        sensorConfidence: (m['sensor_confidence'] as num?)?.toDouble(),
        finalConfidence: (m['final_confidence'] as num?)?.toDouble(),
      );
}

class SpeedFine {
  SpeedFine({
    String? id,
    required this.speedKmh,
    required this.limitKmh,
    required this.latitude,
    required this.longitude,
    required this.createdAt,
    this.durationSeconds = 0,
    this.note,
    this.resolved = false,
    this.amountIqd = 200000,
  }) : id = id ?? const Uuid().v4();

  final String id;
  final double speedKmh;
  final double limitKmh;
  final double latitude;
  final double longitude;
  final DateTime createdAt;
  final double durationSeconds;
  final String? note;
  final bool resolved;
  final int amountIqd;

  double get excess => (speedKmh - limitKmh).clamp(0, 999);

  Map<String, dynamic> toMap() => {
        'id': id,
        'speed_kmh': speedKmh,
        'limit_kmh': limitKmh,
        'latitude': latitude,
        'longitude': longitude,
        'created_at': createdAt.toIso8601String(),
        'duration_seconds': durationSeconds,
        'note': note,
        'resolved': resolved ? 1 : 0,
        'amount_iqd': amountIqd,
      };

  factory SpeedFine.fromMap(Map<String, dynamic> m) => SpeedFine(
        id: m['id'] as String,
        speedKmh: (m['speed_kmh'] as num).toDouble(),
        limitKmh: (m['limit_kmh'] as num).toDouble(),
        latitude: (m['latitude'] as num).toDouble(),
        longitude: (m['longitude'] as num).toDouble(),
        createdAt: DateTime.parse(m['created_at'] as String),
        durationSeconds: (m['duration_seconds'] as num?)?.toDouble() ?? 0,
        note: m['note'] as String?,
        resolved: (m['resolved'] as int? ?? 0) == 1,
        amountIqd: (m['amount_iqd'] as num?)?.toInt() ?? 200000,
      );

  SpeedFine copyWith({
    double? speedKmh,
    double? limitKmh,
    String? note,
    bool? resolved,
    int? amountIqd,
  }) =>
      SpeedFine(
        id: id,
        speedKmh: speedKmh ?? this.speedKmh,
        limitKmh: limitKmh ?? this.limitKmh,
        latitude: latitude,
        longitude: longitude,
        createdAt: createdAt,
        durationSeconds: durationSeconds,
        note: note ?? this.note,
        resolved: resolved ?? this.resolved,
        amountIqd: amountIqd ?? this.amountIqd,
      );
}
