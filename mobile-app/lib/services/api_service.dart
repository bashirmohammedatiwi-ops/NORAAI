import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';

import '../models/detection.dart';
import '../models/driver_config.dart';
import '../models/nearby_event.dart';
import '../models/road_speed.dart';

class ApiService {
  ApiService(this.config);

  final DriverConfig config;

  String get _base => config.serverUrl.replaceAll(RegExp(r'/$'), '');

  Map<String, String> get _headers => {'X-Device-Key': config.apiKey};

  Future<void> warmupModel() async {
    await http.post(
      Uri.parse('$_base/api/v1/driver/warmup'),
      headers: _headers,
    );
  }

  Future<List<NearbyEvent>> fetchNearby(
    double lat,
    double lon, {
    double radiusKm = 15,
  }) async {
    final uri = Uri.parse('$_base/api/v1/driver/events/nearby').replace(
      queryParameters: {
        'latitude': lat.toString(),
        'longitude': lon.toString(),
        'radius_km': radiusKm.toString(),
      },
    );
    final res = await http.get(uri, headers: _headers);
    if (res.statusCode != 200) return [];
    final list = jsonDecode(res.body) as List<dynamic>;
    return list
        .map((e) => NearbyEvent.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<ServerConfig> fetchConfig() async {
    final res = await http.get(
      Uri.parse('$_base/api/v1/driver/config'),
      headers: _headers,
    );
    if (res.statusCode != 200) {
      throw Exception(res.body);
    }
    return ServerConfig.fromJson(jsonDecode(res.body) as Map<String, dynamic>);
  }

  Future<Map<String, dynamic>> fetchManifest() async {
    final res = await http.get(
      Uri.parse('$_base/api/v1/driver/model/manifest'),
      headers: _headers,
    );
    if (res.statusCode != 200) throw Exception(res.body);
    return jsonDecode(res.body) as Map<String, dynamic>;
  }

  Future<String> downloadModel(String destPath) async {
    final client = http.Client();
    final request = http.Request(
      'GET',
      Uri.parse('$_base/api/v1/driver/model/download'),
    );
    request.headers.addAll(_headers);
    final streamed = await client.send(request);
    if (streamed.statusCode != 200) {
      throw Exception('Download failed (${streamed.statusCode})');
    }
    final file = File(destPath);
    final sink = file.openWrite();
    await streamed.stream.pipe(sink);
    await sink.flush();
    await sink.close();
    client.close();
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
    await http.post(
      Uri.parse('$_base/api/v1/driver/telemetry'),
      headers: {..._headers, 'Content-Type': 'application/json'},
      body: jsonEncode({
        'latitude': latitude,
        'longitude': longitude,
        'speed': speed,
        'gps_status': gpsStatus,
        'camera_status': cameraStatus,
        'app_version': appVersion,
        'model_version': modelVersion,
        'model_sha256': modelSha256,
      }),
    );
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
    final req = http.MultipartRequest(
      'POST',
      Uri.parse('$_base/api/v1/driver/detect'),
    );
    req.headers.addAll(_headers);
    req.files.add(await http.MultipartFile.fromPath('file', imagePath));
    req.fields['latitude'] = latitude.toString();
    req.fields['longitude'] = longitude.toString();
    req.fields['speed_limit'] = speedLimit.toString();
    if (speed != null) req.fields['speed'] = speed.toString();

    final streamed = await req.send();
    final body = await streamed.stream.bytesToString();
    if (streamed.statusCode != 200) throw Exception(body);

    final json = jsonDecode(body) as Map<String, dynamic>;
    final raw = (json['detections'] as List<dynamic>? ?? [])
        .cast<Map<String, dynamic>>();
    final detections = raw.map(DetectionBox.fromJson).toList();
    return (
      detections: detections,
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
    final res = await http.post(
      Uri.parse('$_base/api/v1/driver/violations'),
      headers: {..._headers, 'Content-Type': 'application/json'},
      body: jsonEncode({
        'latitude': latitude,
        'longitude': longitude,
        'speed': speed,
        'speed_limit': speedLimit,
        'road_name': roadName,
        'duration_seconds': durationSeconds,
      }),
    );
    if (res.statusCode != 200) return false;
    final json = jsonDecode(res.body) as Map<String, dynamic>;
    return json['created'] == true;
  }

  Future<RoadSpeedResult> fetchSpeedLimit(
    double lat,
    double lon,
    double fallback,
  ) async {
    final uri = Uri.parse('$_base/api/v1/driver/speed-limit').replace(
      queryParameters: {
        'latitude': lat.toString(),
        'longitude': lon.toString(),
        'fallback': fallback.toString(),
      },
    );
    final res = await http.get(uri, headers: _headers);
    if (res.statusCode != 200) return RoadSpeedResult.fallback(fallback);
    return RoadSpeedResult.fromJson(
      jsonDecode(res.body) as Map<String, dynamic>,
    );
  }

  static Future<String> modelFilePath() async {
    final dir = await getApplicationDocumentsDirectory();
    final modelDir = Directory('${dir.path}/norai-model');
    if (!await modelDir.exists()) await modelDir.create(recursive: true);
    return '${modelDir.path}/model.onnx';
  }
}
