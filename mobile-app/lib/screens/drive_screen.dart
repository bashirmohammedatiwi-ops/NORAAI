import 'dart:async';

import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';
import 'package:vibration/vibration.dart';

import '../models/detection.dart';
import '../models/driver_config.dart';
import '../services/api_service.dart';
import '../services/config_storage.dart';
import '../services/model_sync.dart';
import '../services/speed_monitor.dart';
import '../widgets/detection_overlay.dart';

const _appVersion = '1.0.0';

class DriveScreen extends StatefulWidget {
  const DriveScreen({super.key, required this.config, required this.onLogout});

  final DriverConfig config;
  final VoidCallback onLogout;

  @override
  State<DriveScreen> createState() => _DriveScreenState();
}

class _DriveScreenState extends State<DriveScreen> {
  late final ApiService _api;
  CameraController? _camera;
  StreamSubscription<Position>? _posSub;
  SpeedViolationMonitor? _speedMonitor;

  ServerConfig? _serverCfg;
  Position? _position;
  double _roadLimit = 80;
  String? _roadName;
  String _modelStatus = 'جاري التحميل...';
  List<DetectionBox> _detections = [];
  bool _scanning = false;
  bool _camExpanded = false;
  String? _alertText;
  int _eventsCount = 0;
  bool _detectBusy = false;
  Timer? _configTimer;
  Timer? _detectTimer;

  @override
  void initState() {
    super.initState();
    _api = ApiService(widget.config);
    _initCamera();
    _startGps();
    _syncConfig();
    _configTimer = Timer.periodic(const Duration(seconds: 20), (_) => _syncConfig());
  }

  @override
  void dispose() {
    _configTimer?.cancel();
    _detectTimer?.cancel();
    _posSub?.cancel();
    _camera?.dispose();
    super.dispose();
  }

  Future<void> _initCamera() async {
    try {
      final camPerm = await Permission.camera.request();
      if (!camPerm.isGranted) {
        if (mounted) setState(() => _modelStatus = 'صلاحية الكاميرا مرفوضة');
        return;
      }
      final cameras = await availableCameras();
      final back = cameras.firstWhere(
        (c) => c.lensDirection == CameraLensDirection.back,
        orElse: () => cameras.first,
      );
      final controller = CameraController(
        back,
        ResolutionPreset.medium,
        enableAudio: false,
        imageFormatGroup: ImageFormatGroup.jpeg,
      );
      await controller.initialize();
      if (!mounted) {
        await controller.dispose();
        return;
      }
      setState(() => _camera = controller);
      _scheduleDetect();
    } catch (_) {
      setState(() => _modelStatus = 'الكاميرا غير متاحة');
    }
  }

  Future<void> _syncConfig() async {
    try {
      final cfg = await _api.fetchConfig();
      if (!mounted) return;
      setState(() {
        _serverCfg = cfg;
        _speedMonitor = SpeedViolationMonitor(cfg.speedViolation);
      });

      if (cfg.modelReady) {
        if (cfg.inferenceMode == 'local') {
          final local = await ModelSync.sync(widget.config, cfg.modelVersion);
          if (mounted) {
            setState(() => _modelStatus = '${local.message} · ONNX محلي');
          }
        } else {
          setState(() => _modelStatus = 'وضع السيرفر · ${cfg.modelVersion ?? "—"}');
        }
      } else {
        setState(() => _modelStatus = 'لا يوجد موديل — زامِن من لوحة Mobile App');
      }
    } catch (_) {
      if (mounted) setState(() => _modelStatus = 'خطأ في المزامنة');
    }
  }

  void _startGps() {
    _posSub = Geolocator.getPositionStream(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.bestForNavigation,
        distanceFilter: 5,
      ),
    ).listen((pos) {
      setState(() => _position = pos);
      _onPosition(pos);
    });
  }

  Future<void> _onPosition(Position pos) async {
    final cfg = _serverCfg;
    if (cfg == null) return;

    final speedKmh = pos.speed >= 0 ? pos.speed * 3.6 : 0.0;

    unawaited(_api.sendTelemetry(
      latitude: pos.latitude,
      longitude: pos.longitude,
      speed: speedKmh > 0 ? speedKmh : null,
      gpsStatus: 'ok',
      cameraStatus: _camera != null ? 'ok' : 'error',
      appVersion: _appVersion,
      modelVersion: cfg.modelVersion,
      modelSha256: cfg.modelSha256,
    ));

    final limit = await _api.fetchSpeedLimit(
      pos.latitude,
      pos.longitude,
      cfg.speedViolation.fallbackLimitKmh,
    );
    if (!mounted) return;
    setState(() {
      _roadLimit = limit.limit;
      _roadName = limit.roadName;
    });

    if (cfg.speedViolation.enabled && speedKmh > 0) {
      final check = _speedMonitor?.update(speedKmh, limit.limit);
      if (check != null && check.shouldReport) {
        final ok = await _api.reportViolation(
          latitude: pos.latitude,
          longitude: pos.longitude,
          speed: speedKmh.roundToDouble(),
          speedLimit: limit.limit,
          roadName: limit.roadName,
          durationSeconds: check.durationSeconds,
        );
        if (ok && mounted) {
          if (await Vibration.hasVibrator() == true) {
            await Vibration.vibrate(duration: 400);
          }
          setState(() => _alertText = 'مخالفة سرعة: ${speedKmh.round()} كم/س');
          Future.delayed(const Duration(seconds: 4), () {
            if (mounted) setState(() => _alertText = null);
          });
        }
      }
    }
  }

  void _scheduleDetect() {
    _detectTimer?.cancel();
    _detectTimer = Timer.periodic(const Duration(milliseconds: 900), (_) => _runDetect());
  }

  Future<void> _runDetect() async {
    final cfg = _serverCfg;
    final cam = _camera;
    final pos = _position;
    if (cfg == null || cam == null || !cam.value.isInitialized || pos == null) return;
    if (!cfg.detectionEnabled || _detectBusy) return;

    _detectBusy = true;
    if (mounted) setState(() => _scanning = true);

    try {
      final file = await cam.takePicture();
      final result = await _api.detectFrame(
        imagePath: file.path,
        latitude: pos.latitude,
        longitude: pos.longitude,
        speed: pos.speed >= 0 ? pos.speed * 3.6 : null,
        speedLimit: _roadLimit,
      );

      final filtered = result.detections
          .where((d) => d.confidence >= cfg.minConfidence && d.bbox.length >= 4)
          .toList();

      if (!mounted) return;
      setState(() => _detections = filtered);

      if (result.eventsCreated > 0) {
        setState(() => _eventsCount += result.eventsCreated);
        if (await Vibration.hasVibrator() == true) {
          await Vibration.vibrate(duration: 200);
        }
        final alert = result.alerts.isNotEmpty ? result.alerts.first : null;
        if (alert is Map && mounted) {
          final label = alert['class_name'] ?? alert['type'] ?? 'اكتشاف';
          setState(() => _alertText = 'اكتشاف: $label');
          Future.delayed(const Duration(seconds: 3), () {
            if (mounted) setState(() => _alertText = null);
          });
        }
      }
    } catch (_) {
      if (mounted) setState(() => _detections = []);
    } finally {
      _detectBusy = false;
      if (mounted) setState(() => _scanning = false);
    }
  }

  Future<void> _logout() async {
    await ConfigStorage.clear();
    widget.onLogout();
  }

  @override
  Widget build(BuildContext context) {
    final pos = _position;
    final speedKmh = pos != null && pos.speed >= 0 ? (pos.speed * 3.6).round() : 0;
    final tolerance = _serverCfg?.speedViolation.toleranceKmh ?? 5;
    final overLimit = speedKmh > _roadLimit + tolerance;

    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      body: Stack(
        children: [
          if (pos != null)
            FlutterMap(
              options: MapOptions(
                initialCenter: LatLng(pos.latitude, pos.longitude),
                initialZoom: 15,
                interactionOptions: const InteractionOptions(flags: InteractiveFlag.all),
              ),
              children: [
                TileLayer(
                  urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                  userAgentPackageName: 'com.norai.norai_drive',
                ),
                MarkerLayer(
                  markers: [
                    Marker(
                      point: LatLng(pos.latitude, pos.longitude),
                      width: 40,
                      height: 40,
                      child: const Icon(Icons.navigation, color: Color(0xFF2DD4BF), size: 32),
                    ),
                  ],
                ),
              ],
            ),

          Positioned(
            top: MediaQuery.of(context).padding.top + 8,
            left: 16,
            right: 16,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  decoration: BoxDecoration(
                    color: const Color(0xE60F172A),
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(
                      color: overLimit ? const Color(0xFFEF4444) : const Color(0xFF0D9488),
                      width: 2,
                    ),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '$speedKmh',
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 36,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      const Text('كم/س', style: TextStyle(color: Color(0xFF94A3B8), fontSize: 12)),
                      Text(
                        'الحد $_roadLimit${_roadName != null ? ' · $_roadName' : ''}',
                        style: const TextStyle(color: Color(0xFFCBD5E1), fontSize: 11),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 6),
                Text(_modelStatus, style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 11)),
                Text('أحداث اليوم: $_eventsCount', style: const TextStyle(color: Color(0xFF64748B), fontSize: 10)),
                if (_alertText != null)
                  Container(
                    margin: const EdgeInsets.only(top: 6),
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: const Color(0xE6EF4444),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Text(_alertText!, style: const TextStyle(color: Colors.white, fontSize: 12)),
                  ),
                Align(
                  alignment: Alignment.centerRight,
                  child: TextButton(
                    onPressed: _logout,
                    child: const Text('خروج', style: TextStyle(color: Color(0xFFF87171))),
                  ),
                ),
              ],
            ),
          ),

          if (_camera != null && _camera!.value.isInitialized)
            Positioned(
              right: 16,
              bottom: 24,
              left: _camExpanded ? 16 : null,
              width: _camExpanded ? null : 140,
              height: _camExpanded ? 280 : 186,
              child: GestureDetector(
                onTap: () => setState(() => _camExpanded = !_camExpanded),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(16),
                  child: Container(
                    decoration: BoxDecoration(
                      border: Border.all(color: const Color(0xFF2DD4BF), width: 2),
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Stack(
                      fit: StackFit.expand,
                      children: [
                        CameraPreview(_camera!),
                        DetectionOverlay(
                          detections: _detections,
                          minConfidence: _serverCfg?.minConfidence ?? 0.45,
                          scanning: _scanning,
                        ),
                        Positioned(
                          top: 8,
                          left: 8,
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                            decoration: BoxDecoration(
                              color: const Color(0xE60D9488),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Text(
                              _scanning ? 'AI · جاري' : 'AI',
                              style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
