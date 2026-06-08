import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';

import '../models/detection.dart';
import '../models/driver_config.dart';
import '../models/nearby_event.dart';
import '../models/road_speed.dart';
import 'api_exception.dart';

const _defaultTimeout = Duration(seconds: 25);
const _downloadTimeout = Duration(minutes: 5);

class ApiService {
  ApiService(this.config);

  final DriverConfig config;
  final http.Client _client = http.Client();

  String get baseUrl => config.serverUrl.replaceAll(RegExp(r'/$'), '');

  Map<String, String> get _headers => {'X-Device-Key': config.apiKey};

  void dispose() => _client.close();

  /// Ping gateway health (no auth required).
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

  /// Validate device credentials.
  Future<ServerConfig> fetchConfig() async {
    final res = await _get('/api/v1/driver/config');
    return ServerConfig.fromJson(jsonDecode(res.body) as Map<String, dynamic>);
  }

  Future<void> warmupModel() async {
    await _post('/api/v1/driver/warmup', body: null);
  }

  Future<List<NearbyEvent>> fetchNearby(
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
      return list
          .map((e) => NearbyEvent.fromJson(e as Map<String, dynamic>))
          .toList();
    } catch (_) {
      return [];
    }
  }

  Future<Map<String, dynamic>> fetchManifest() async {
    final res = await _get('/api/v1/driver/model/manifest');
    return jsonDecode(res.body) as Map<String, dynamic>;
  }

  Future<String> downloadModel(
    String destPath, {
    void Function(int received, int? total)? onProgress,
  }) async {
    final request = http.Request('GET', Uri.parse('$baseUrl/api/v1/driver/model/download'));
    request.headers.addAll(_headers);
    final streamed = await _client.send(request).timeout(_downloadTimeout);
    if (streamed.statusCode != 200) {
      final body = await streamed.stream.bytesToString();
      throw ApiException.fromResponse(streamed.statusCode, body);
    }

    final total = streamed.contentLength;
    var received = 0;
    final file = File(destPath);
    final sink = file.openWrite();
    await for (final chunk in streamed.stream) {
      received += chunk.length;
      sink.add(chunk);
      onProgress?.call(received, (total != null && total > 0) ? total : null);
    }
    await sink.flush();
    await sink.close();
    return destPath;
  }

  Future<void> sendTelemetry({
    required double latitude,
    required double longitude,
    required double? speed,
    required String gpsStatus,
    required String cameraStatus,
    String? appVersion,
    String? modelVersion,
    String? modelSha256,
  }) async {
    try {
      await _post(
        '/api/v1/driver/telemetry',
        body: {
          'latitude': latitude,
          'longitude': longitude,
          'speed': speed,
          'gps_status': gpsStatus,
          'camera_status': cameraStatus,
          'app_version': appVersion,
          'model_version': modelVersion,
          'model_sha256': modelSha256,
        },
      );
    } catch (_) {
      // Telemetry is best-effort.
    }
  }

  Future<
      ({
        List<DetectionBox> detections,
        int eventsCreated,
        List<dynamic> alerts,
        int? latencyMs,
      })> detectFrame({
    required String imagePath,
    required double latitude,
    required double longitude,
    required double? speed,
    required double speedLimit,
  }) async {
    return _detectMultipart(
      file: await http.MultipartFile.fromPath('file', imagePath),
      latitude: latitude,
      longitude: longitude,
      speed: speed,
      speedLimit: speedLimit,
    );
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
  }) async {
    return _detectMultipart(
      file: http.MultipartFile.fromBytes('file', bytes, filename: filename),
      latitude: latitude,
      longitude: longitude,
      speed: speed,
      speedLimit: speedLimit,
    );
  }

  Future<
      ({
        List<DetectionBox> detections,
        int eventsCreated,
        List<dynamic> alerts,
        int? latencyMs,
      })> _detectMultipart({
    required http.MultipartFile file,
    required double latitude,
    required double longitude,
    required double? speed,
    required double speedLimit,
  }) async {
    final req = http.MultipartRequest('POST', Uri.parse('$baseUrl/api/v1/driver/detect'));
    req.headers.addAll(_headers);
    req.files.add(file);
    req.fields['latitude'] = latitude.toString();
    req.fields['longitude'] = longitude.toString();
    req.fields['speed_limit'] = speedLimit.toString();
    if (speed != null) req.fields['speed'] = speed.toString();

    final streamed = await _client.send(req).timeout(_defaultTimeout);
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

  Future<bool> reportViolation({
    required double latitude,
    required double longitude,
    required double speed,
    required double speedLimit,
    String? roadName,
    double? durationSeconds,
  }) async {
    try {
      final res = await _post(
        '/api/v1/driver/violations',
        body: {
          'latitude': latitude,
          'longitude': longitude,
          'speed': speed,
          'speed_limit': speedLimit,
          'road_name': roadName,
          'duration_seconds': durationSeconds,
        },
      );
      final json = jsonDecode(res.body) as Map<String, dynamic>;
      return json['created'] == true;
    } catch (_) {
      return false;
    }
  }

  Future<RoadSpeedResult> fetchSpeedLimit(
    double lat,
    double lon,
    double fallback,
  ) async {
    try {
      final uri = Uri.parse('$baseUrl/api/v1/driver/speed-limit').replace(
        queryParameters: {
          'latitude': lat.toString(),
          'longitude': lon.toString(),
          'fallback': fallback.toString(),
        },
      );
      final res = await _client.get(uri, headers: _headers).timeout(_defaultTimeout);
      if (res.statusCode != 200) return RoadSpeedResult.fallback(fallback);
      return RoadSpeedResult.fromJson(jsonDecode(res.body) as Map<String, dynamic>);
    } catch (_) {
      return RoadSpeedResult.fallback(fallback);
    }
  }

  Future<http.Response> _get(String path, {int retries = 2}) async {
    return _withRetry(
      () => _client
          .get(Uri.parse('$baseUrl$path'), headers: _headers)
          .timeout(_defaultTimeout),
      retries: retries,
    );
  }

  Future<http.Response> _post(String path, {Object? body, int retries = 1}) async {
    return _withRetry(
      () => _client
          .post(
            Uri.parse('$baseUrl$path'),
            headers: {..._headers, 'Content-Type': 'application/json'},
            body: body != null ? jsonEncode(body) : null,
          )
          .timeout(_defaultTimeout),
      retries: retries,
    );
  }

  Future<http.Response> _withRetry(
    Future<http.Response> Function() fn, {
    required int retries,
  }) async {
    Object? lastError;
    for (var i = 0; i <= retries; i++) {
      try {
        final res = await fn();
        if (res.statusCode >= 500 && i < retries) {
          await Future.delayed(Duration(milliseconds: 400 * (i + 1)));
          continue;
        }
        if (res.statusCode >= 400) {
          throw ApiException.fromResponse(res.statusCode, res.body);
        }
        return res;
      } catch (e) {
        lastError = e;
        if (e is ApiException && e.statusCode != null && e.statusCode! < 500) rethrow;
        if (i < retries) {
          await Future.delayed(Duration(milliseconds: 500 * (i + 1)));
          continue;
        }
      }
    }
    throw ApiException.fromError(lastError ?? 'unknown');
  }

  static Future<String> modelFilePath() async {
    final dir = await getApplicationDocumentsDirectory();
    final modelDir = Directory('${dir.path}/norai-model');
    if (!await modelDir.exists()) await modelDir.create(recursive: true);
    return '${modelDir.path}/model.onnx';
  }
}
