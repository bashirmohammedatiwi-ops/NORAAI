import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';

import '../models/detection.dart';
import '../models/driver_config.dart';
import '../models/nearby_event.dart';
import '../models/road_speed.dart';
import 'api_exception.dart';

const _defaultTimeout = Duration(seconds: 35);
const _detectTimeout = Duration(seconds: 22);
const _downloadTimeout = Duration(minutes: 45);
const _downloadIdleTimeout = Duration(seconds: 180);

class ApiService {
  ApiService(this.config);

  final DriverConfig config;
  final http.Client _client = http.Client();
  final http.Client _downloadClient = http.Client();

  String get baseUrl => config.serverUrl.replaceAll(RegExp(r'/$'), '');

  Map<String, String> get _headers => {'X-Device-Key': config.apiKey};

  void dispose() {
    _client.close();
    _downloadClient.close();
  }

  /// Ping gateway health (no auth required).
  Future<bool> pingHealth({int attempts = 3}) async {
    for (var i = 0; i < attempts; i++) {
      try {
        final res = await _client
            .get(Uri.parse('$baseUrl/health/ready'))
            .timeout(const Duration(seconds: 15));
        if (res.statusCode == 200) return true;
      } catch (_) {
        if (i < attempts - 1) {
          await Future<void>.delayed(Duration(milliseconds: 600 * (i + 1)));
        }
      }
    }
    return false;
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
    int? expectedBytes,
    void Function(int received, int? total)? onProgress,
  }) async {
    final file = File(destPath);
    if (!await file.parent.exists()) {
      await file.parent.create(recursive: true);
    }

    var resumeFrom = 0;
    if (await file.exists()) {
      resumeFrom = await file.length();
    }

    final request = http.Request('GET', Uri.parse('$baseUrl/api/v1/driver/model/download'));
    request.headers.addAll(_headers);
    request.headers['Accept'] = 'application/octet-stream';
    if (resumeFrom > 0) {
      request.headers['Range'] = 'bytes=$resumeFrom-';
    }

    final streamed = await _downloadClient.send(request).timeout(_downloadTimeout);
    if (streamed.statusCode != 200 && streamed.statusCode != 206) {
      final body = await streamed.stream.bytesToString();
      throw ApiException.fromResponse(streamed.statusCode, body);
    }

    final headerBytes = int.tryParse(streamed.headers['x-model-bytes'] ?? '');
    final chunkLen = streamed.contentLength;
    final progressTotal = headerBytes ??
        ((chunkLen != null && chunkLen > 0)
            ? resumeFrom + chunkLen
            : expectedBytes);

    var receivedThisSession = 0;
    final sink = resumeFrom > 0 ? file.openWrite(mode: FileMode.append) : file.openWrite();
    try {
      final byteStream = streamed.stream.timeout(
        _downloadIdleTimeout,
        onTimeout: (EventSink<List<int>> sink) {
          sink.close();
          throw ApiException(
            'download stalled',
            userMessage: 'توقف التحميل — تحقق من الشبكة وأعد المحاولة',
          );
        },
      );

      await for (final chunk in byteStream) {
        receivedThisSession += chunk.length;
        sink.add(chunk);
        final totalReceived = resumeFrom + receivedThisSession;
        onProgress?.call(totalReceived, progressTotal);
      }
      await sink.flush();
    } catch (e) {
      try {
        await sink.close();
      } catch (_) {}
      // Keep partial file for resume on retry.
      if (resumeFrom == 0 && receivedThisSession == 0 && await file.exists()) {
        await file.delete();
      }
      rethrow;
    }
    await sink.close();

    final totalReceived = resumeFrom + receivedThisSession;
    if (totalReceived == 0) {
      if (await file.exists()) await file.delete();
      throw ApiException('empty download', userMessage: 'الملف المحمّل فارغ — أعد المحاولة');
    }

    final expectedTotal = progressTotal;
    if (expectedTotal != null &&
        expectedTotal > 0 &&
        totalReceived < expectedTotal * 0.95) {
      throw ApiException(
        'incomplete download',
        userMessage:
            'تحميل غير مكتمل — أعد المحاولة (${_fmtBytes(totalReceived)} / ${_fmtBytes(expectedTotal)})',
      );
    }
    return destPath;
  }

  static String _fmtBytes(int n) {
    if (n >= 1024 * 1024) return '${(n / (1024 * 1024)).toStringAsFixed(1)} MB';
    if (n >= 1024) return '${(n / 1024).toStringAsFixed(0)} KB';
    return '$n B';
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
    double? minConfidence,
  }) async {
    return _detectMultipart(
      file: http.MultipartFile.fromBytes('file', bytes, filename: filename),
      latitude: latitude,
      longitude: longitude,
      speed: speed,
      speedLimit: speedLimit,
      minConfidence: minConfidence,
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
    double? minConfidence,
  }) async {
    final req = http.MultipartRequest('POST', Uri.parse('$baseUrl/api/v1/driver/detect'));
    req.headers.addAll(_headers);
    req.files.add(file);
    req.fields['latitude'] = latitude.toString();
    req.fields['longitude'] = longitude.toString();
    req.fields['speed_limit'] = speedLimit.toString();
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

  static Future<Directory> modelDirectory() async {
    final dir = await getApplicationDocumentsDirectory();
    final modelDir = Directory('${dir.path}/norai-model');
    if (!await modelDir.exists()) await modelDir.create(recursive: true);
    return modelDir;
  }

  static Future<String> modelManifestPath() async {
    final modelDir = await modelDirectory();
    return '${modelDir.path}/manifest.json';
  }

  static Future<String> modelFilePath() async {
    final modelDir = await modelDirectory();
    return '${modelDir.path}/model.onnx';
  }

  Future<({
    List<DetectionBox> detections,
    int eventsCreated,
    List<dynamic> alerts,
  })> reportLocalDetections({
    required double latitude,
    required double longitude,
    required List<DetectionBox> detections,
    double? minConfidence,
  }) async {
    final res = await _post(
      '/api/v1/driver/detections/report',
      body: {
        'latitude': latitude,
        'longitude': longitude,
        'min_confidence': ?minConfidence,
        'detections': detections
            .map(
              (d) => {
                'class_name': d.className,
                'confidence': d.confidence,
                'bbox': d.bbox,
                'event_type': ?d.eventType,
              },
            )
            .toList(),
      },
    );
    final json = jsonDecode(res.body) as Map<String, dynamic>;
    final raw = (json['detections'] as List<dynamic>? ?? []).cast<Map<String, dynamic>>();
    return (
      detections: raw.map(DetectionBox.fromJson).toList(),
      eventsCreated: json['events_created'] as int? ?? 0,
      alerts: json['alerts'] as List<dynamic>? ?? [],
    );
  }
}
