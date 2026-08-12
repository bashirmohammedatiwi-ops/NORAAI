import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:uuid/uuid.dart';

import '../models/detection_box.dart';
import '../models/driver_config.dart';
import 'api_exception.dart';

const _defaultTimeout = Duration(seconds: 35);
const _detectTimeout = Duration(seconds: 25);

class RasidApiService {
  RasidApiService(this.config);

  final DriverConfig config;
  final http.Client _client = http.Client();

  String get baseUrl => config.serverUrl.replaceAll(RegExp(r'/$'), '');

  Map<String, String> get _headers => {'X-Device-Key': config.apiKey};

  void dispose() => _client.close();

  Future<bool> pingHealth() async {
    try {
      final res = await _client
          .get(Uri.parse('$baseUrl/health/ready'))
          .timeout(const Duration(seconds: 12));
      return res.statusCode == 200;
    } catch (_) {
      return false;
    }
  }

  Future<Map<String, dynamic>> fetchConfig() async {
    final res = await _client
        .get(Uri.parse('$baseUrl/api/v1/driver/config'), headers: _headers)
        .timeout(_defaultTimeout);
    if (res.statusCode != 200) {
      throw ApiException.fromResponse(res.statusCode, res.body);
    }
    return jsonDecode(res.body) as Map<String, dynamic>;
  }

  Future<DriverConfig> registerDevice({
    required String projectId,
    required String driverName,
    required String vehicleId,
  }) async {
    final deviceId = 'rasid-${const Uuid().v4().substring(0, 8)}';
    final res = await _client
        .post(
          Uri.parse('$baseUrl/api/v1/fleet/$projectId'),
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode({
            'device_id': deviceId,
            'vehicle_id': vehicleId,
            'driver_name': driverName,
          }),
        )
        .timeout(_defaultTimeout);
    if (res.statusCode != 200) {
      throw ApiException.fromResponse(res.statusCode, res.body);
    }
    final json = jsonDecode(res.body) as Map<String, dynamic>;
    return DriverConfig(
      serverUrl: config.serverUrl,
      projectId: projectId,
      deviceId: json['device_id'] as String,
      vehicleId: json['vehicle_id'] as String,
      apiKey: json['api_key'] as String,
      driverName: driverName,
      speedLimit: config.speedLimit,
    );
  }

  Future<void> sendTelemetry({
    required double latitude,
    required double longitude,
    required double? speed,
    required String gpsStatus,
    required String cameraStatus,
  }) async {
    try {
      await _client
          .post(
            Uri.parse('$baseUrl/api/v1/driver/telemetry'),
            headers: {..._headers, 'Content-Type': 'application/json'},
            body: jsonEncode({
              'latitude': latitude,
              'longitude': longitude,
              'speed': speed,
              'gps_status': gpsStatus,
              'camera_status': cameraStatus,
              'driver_name': config.driverName,
              'app_version': 'rasid_auto',
            }),
          )
          .timeout(_defaultTimeout);
    } catch (_) {}
  }

  Future<
      ({
        List<DetectionBox> detections,
        int eventsCreated,
        List<dynamic> alerts,
        int? latencyMs,
      })> detectFrameBytes({
    required List<int> bytes,
    required String filename,
    required double latitude,
    required double longitude,
    required double? speed,
    required double speedLimit,
    double? minConfidence,
    String source = 'camera',
  }) async {
    final req = http.MultipartRequest('POST', Uri.parse('$baseUrl/api/v1/driver/detect'));
    req.headers.addAll(_headers);
    req.files.add(http.MultipartFile.fromBytes('file', bytes, filename: filename));
    req.fields['latitude'] = latitude.toString();
    req.fields['longitude'] = longitude.toString();
    req.fields['speed_limit'] = speedLimit.toString();
    req.fields['source'] = source;
    if (speed != null) req.fields['speed'] = speed.toString();
    if (minConfidence != null) {
      req.fields['min_confidence'] = minConfidence.toString();
    }

    final streamed = await _client.send(req).timeout(_detectTimeout);
    final body = await streamed.stream.bytesToString();
    if (streamed.statusCode != 200) {
      throw ApiException.fromResponse(streamed.statusCode, body);
    }
    final json = jsonDecode(body) as Map<String, dynamic>;
    final raw = (json['detections'] as List<dynamic>? ?? []).cast<Map<String, dynamic>>();
    return (
      detections: raw.map(DetectionBox.fromJson).toList(),
      eventsCreated: json['events_created'] as int? ?? 0,
      alerts: json['alerts'] as List<dynamic>? ?? [],
      latencyMs: (json['latency_ms'] as num?)?.toInt(),
    );
  }

  Future<List<Map<String, dynamic>>> fetchNearby(
    double lat,
    double lon, {
    double radiusKm = 15,
  }) async {
    final uri = Uri.parse('$baseUrl/api/v1/driver/events/nearby').replace(
      queryParameters: {
        'latitude': lat.toString(),
        'longitude': lon.toString(),
        'radius_km': radiusKm.toString(),
      },
    );
    try {
      final res = await _client.get(uri, headers: _headers).timeout(_defaultTimeout);
      if (res.statusCode != 200) return [];
      final list = jsonDecode(res.body) as List<dynamic>;
      return list.map((e) => e as Map<String, dynamic>).toList();
    } catch (_) {
      return [];
    }
  }
}
