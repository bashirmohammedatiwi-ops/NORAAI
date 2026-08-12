import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:uuid/uuid.dart';

import '../models/detection_box.dart';
import '../models/driver_config.dart';
import 'api_exception.dart';

const _defaultTimeout = Duration(seconds: 35);
const _detectTimeout = Duration(seconds: 90);

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

  Future<Map<String, dynamic>> fetchBootstrap() async {
    final res = await _client
        .get(Uri.parse('$baseUrl/api/v1/driver/bootstrap'))
        .timeout(_defaultTimeout);
    if (res.statusCode != 200) {
      throw ApiException.fromResponse(res.statusCode, res.body);
    }
    return jsonDecode(res.body) as Map<String, dynamic>;
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
    String phoneNumber = '',
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
            if (phoneNumber.trim().isNotEmpty) 'phone_number': phoneNumber.trim(),
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
      phoneNumber: phoneNumber.trim(),
      speedLimit: config.speedLimit,
    );
  }

  Future<void> updateProfile({
    required String driverName,
    required String phoneNumber,
  }) async {
    final name = driverName.trim();
    final phone = phoneNumber.trim();
    final patchRes = await _client
        .patch(
          Uri.parse('$baseUrl/api/v1/driver/profile'),
          headers: {..._headers, 'Content-Type': 'application/json'},
          body: jsonEncode({
            'driver_name': name,
            'phone_number': phone,
          }),
        )
        .timeout(_defaultTimeout);

    if (patchRes.statusCode == 200) return;

    // Older VPS without PATCH /driver/profile — upsert fleet + telemetry.
    if (patchRes.statusCode == 404) {
      await _syncProfileLegacy(name: name, phone: phone);
      return;
    }
    throw ApiException.fromResponse(patchRes.statusCode, patchRes.body);
  }

  Future<void> _syncProfileLegacy({
    required String name,
    required String phone,
  }) async {
    final res = await _client
        .post(
          Uri.parse('$baseUrl/api/v1/fleet/${config.projectId}'),
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode({
            'device_id': config.deviceId,
            'vehicle_id': config.vehicleId,
            'driver_name': name,
            if (phone.isNotEmpty) 'phone_number': phone,
          }),
        )
        .timeout(_defaultTimeout);
    if (res.statusCode != 200) {
      throw ApiException.fromResponse(res.statusCode, res.body);
    }
    await sendTelemetry(
      latitude: 0,
      longitude: 0,
      speed: null,
      gpsStatus: 'ok',
      cameraStatus: 'idle',
      driverName: name,
      phoneNumber: phone,
    );
  }

  Future<void> sendTelemetry({
    required double latitude,
    required double longitude,
    required double? speed,
    required String gpsStatus,
    required String cameraStatus,
    String? driverName,
    String? phoneNumber,
  }) async {
    final name = (driverName ?? config.driverName).trim();
    final phone = (phoneNumber ?? config.phoneNumber).trim();
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
              'driver_name': name,
              if (phone.isNotEmpty) 'phone_number': phone,
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
        String? message,
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
      message: json['message'] as String?,
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
