import 'dart:async';

import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:vibration/vibration.dart';

import '../models/detection.dart';
import '../models/driver_config.dart';
import '../models/nearby_event.dart';
import '../services/api_service.dart';
import '../services/config_storage.dart';
import '../services/detect_scheduler.dart';
import '../services/location_service.dart';
import '../services/model_sync.dart';
import '../services/road_speed_service.dart';
import '../services/speed_monitor.dart';
import '../utils/event_meta.dart';
import '../utils/map_geo.dart';
import '../widgets/alert_sheet.dart';
import '../widgets/camera_pip.dart';
import '../widgets/dash_bar.dart';
import '../widgets/drive_map_view.dart';
import '../widgets/drive_top_bar.dart';

const _appVersion = '2.0.0';

class DriveScreen extends StatefulWidget {
  const DriveScreen({super.key, required this.config, required this.onLogout});

  final DriverConfig config;
  final VoidCallback onLogout;

  @override
  State<DriveScreen> createState() => _DriveScreenState();
}

class _DriveScreenState extends State<DriveScreen> {
  late final ApiService _api;
  late final RoadSpeedService _roadSpeed;
  late final LocationService _locationService;
  late final DetectScheduler _scheduler;
  final _mapController = MapController();

  CameraController? _camera;
  StreamSubscription<Position>? _posSub;
  SpeedViolationMonitor? _speedMonitor;

  ServerConfig? _serverCfg;
  Map<String, EventMeta> _classMeta = {};
  Position? _position;
  String? _placeName;
  String _modelStatus = 'جاري التحميل...';
  String? _configMessage;
  bool _online = true;
  bool _followMap = true;
  bool _showAlerts = false;
  bool _camExpanded = false;
  bool _scanning = false;
  bool _detectBusy = false;
  int _eventsCount = 0;
  int? _lastLatencyMs;
  String? _bannerText;

  List<DetectionBox> _detections = [];
  List<LiveAlert> _liveAlerts = [];
  List<NearbyEvent> _nearbyEvents = [];

  Timer? _configTimer;
  Timer? _nearbyTimer;
  Timer? _detectTimer;

  @override
  void initState() {
    super.initState();
    _api = ApiService(widget.config);
    _roadSpeed = RoadSpeedService(_api);
    _locationService = LocationService();
    _scheduler = DetectScheduler();
    _initCamera();
    _startGps();
    _syncConfig();
    _configTimer = Timer.periodic(const Duration(seconds: 20), (_) => _syncConfig());
    _nearbyTimer = Timer.periodic(const Duration(seconds: 15), (_) => _fetchNearby());
  }

  @override
  void dispose() {
    _configTimer?.cancel();
    _nearbyTimer?.cancel();
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
      _scheduleNextDetect(0);
    } catch (_) {
      if (mounted) setState(() => _modelStatus = 'الكاميرا غير متاحة');
    }
  }

  Future<void> _syncConfig() async {
    try {
      final cfg = await _api.fetchConfig();
      if (!mounted) return;
      setState(() {
        _serverCfg = cfg;
        _online = true;
        _configMessage = cfg.message;
        _classMeta = buildClassMetaFromServer(cfg.projectClasses, cfg.alertTypes);
        _speedMonitor = SpeedViolationMonitor(cfg.speedViolation);
      });

      if (cfg.detectionEnabled && cfg.modelReady) {
        unawaited(_api.warmupModel());
      }

      if (cfg.modelReady) {
        if (cfg.inferenceMode == 'local') {
          final local = await ModelSync.sync(widget.config, cfg.modelVersion);
          if (mounted) {
            setState(() => _modelStatus = '${local.message} · ONNX');
          }
        } else {
          setState(() {
            _modelStatus =
                'سيرفر · ${cfg.modelName ?? cfg.modelVersion ?? "—"}';
          });
        }
      } else {
        setState(() => _modelStatus = 'لا يوجد موديل — زامِن من لوحة Mobile App');
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _online = false;
          _modelStatus = 'غير متصل بالسيرفر';
        });
      }
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
      if (_followMap) {
        _mapController.move(
          LatLng(pos.latitude, pos.longitude),
          zoomForAccuracy(pos.accuracy),
        );
      }
      _onPosition(pos);
    });
  }

  Future<void> _onPosition(Position pos) async {
    final cfg = _serverCfg;
    if (cfg == null) return;

    final speedKmh = pos.speed >= 0 ? pos.speed * 3.6 : 0.0;
    final fallback = widget.config.speedLimit;

    unawaited(_api.sendTelemetry(
      latitude: pos.latitude,
      longitude: pos.longitude,
      speed: speedKmh > 0 ? speedKmh : null,
      gpsStatus: 'ok',
      cameraStatus: _camera?.value.isInitialized == true ? 'ok' : 'error',
      appVersion: _appVersion,
      modelVersion: cfg.modelVersion,
      modelSha256: cfg.modelSha256,
    ));

    final road = await _roadSpeed.fetchIfNeeded(
      pos.latitude,
      pos.longitude,
      fallback,
    );

    unawaited(_locationService.reverseGeocode(pos.latitude, pos.longitude).then((p) {
      if (mounted && p != null) setState(() => _placeName = p);
    }));

    if (!mounted) return;
    setState(() {});

    if (cfg.speedViolation.enabled && speedKmh > 0) {
      final check = _speedMonitor?.update(speedKmh, road.limit);
      if (check != null && check.shouldReport) {
        final ok = await _api.reportViolation(
          latitude: pos.latitude,
          longitude: pos.longitude,
          speed: speedKmh.roundToDouble(),
          speedLimit: road.limit,
          roadName: road.roadName,
          durationSeconds: check.durationSeconds,
        );
        if (ok && mounted) {
          if (await Vibration.hasVibrator() == true) {
            await Vibration.vibrate(duration: 400);
          }
          _pushLiveAlert(LiveAlert(
            type: 'speed_violation',
            label: 'تجاوز سرعة ${speedKmh.round()} كم/س',
            confidence: 1,
            at: DateTime.now(),
            speed: speedKmh,
            speedLimit: road.limit,
          ));
          setState(() => _bannerText = 'مخالفة سرعة: ${speedKmh.round()} كم/س');
          Future.delayed(const Duration(seconds: 4), () {
            if (mounted) setState(() => _bannerText = null);
          });
        }
      }
    }
  }

  Future<void> _fetchNearby({bool force = false}) async {
    final pos = _position;
    if (pos == null) return;
    if (!force && !_online) return;
    try {
      final events = await _api.fetchNearby(pos.latitude, pos.longitude);
      if (!mounted) return;
      setState(() => _nearbyEvents = events);
    } catch (_) {}
  }

  void _scheduleNextDetect(int delayMs) {
    _detectTimer?.cancel();
    _detectTimer = Timer(Duration(milliseconds: delayMs), () async {
      await _runDetect();
      final cfg = _serverCfg;
      final pos = _position;
      if (cfg == null || pos == null) {
        _scheduleNextDetect(1500);
        return;
      }
      final speed = pos.speed >= 0 ? pos.speed * 3.6 : 0.0;
      final next = _scheduler.nextIntervalMs(
        cfg,
        speed,
        lastLatencyMs: _lastLatencyMs,
      );
      _scheduleNextDetect(next);
    });
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
        speedLimit: _roadSpeed.cached.limit,
      );

      final filtered = result.detections
          .where((d) => d.confidence >= cfg.minConfidence && d.bbox.length >= 4)
          .toList();

      if (!mounted) return;
      setState(() {
        _detections = filtered;
        _lastLatencyMs = result.latencyMs;
      });

      if (result.eventsCreated > 0) {
        setState(() => _eventsCount += result.eventsCreated);
        if (await Vibration.hasVibrator() == true) {
          await Vibration.vibrate(duration: 200);
        }
        for (final raw in result.alerts) {
          if (raw is Map<String, dynamic>) {
            _pushLiveAlert(LiveAlert.fromDetect(raw));
          }
        }
        unawaited(_fetchNearby(force: true));
      }
    } catch (_) {
      if (mounted) setState(() => _detections = []);
    } finally {
      _detectBusy = false;
      if (mounted) setState(() => _scanning = false);
    }
  }

  void _pushLiveAlert(LiveAlert alert) {
    setState(() {
      _liveAlerts = [alert, ..._liveAlerts].take(10).toList();
      _bannerText = alert.label;
    });
    Future.delayed(const Duration(seconds: 3), () {
      if (mounted && _bannerText == alert.label) {
        setState(() => _bannerText = null);
      }
    });
  }

  Future<void> _locateNow() async {
    final pos = _position;
    if (pos == null) return;
    setState(() => _followMap = true);
    _mapController.move(
      LatLng(pos.latitude, pos.longitude),
      zoomForAccuracy(pos.accuracy),
    );
  }

  Future<void> _logout() async {
    await ConfigStorage.clear();
    widget.onLogout();
  }

  NearbyEvent? get _nearestEvent {
    if (_nearbyEvents.isEmpty) return null;
    final sorted = [..._nearbyEvents]..sort((a, b) => a.distanceKm.compareTo(b.distanceKm));
    return sorted.first;
  }

  @override
  Widget build(BuildContext context) {
    final pos = _position;
    final speedKmh = pos != null && pos.speed >= 0 ? pos.speed * 3.6 : null;
    final bottomPad = MediaQuery.of(context).padding.bottom;
    const dashHeight = 168.0;
    final camBottom = dashHeight + bottomPad + 8;

    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      body: Stack(
        children: [
          if (pos != null)
            DriveMapView(
              mapController: _mapController,
              position: pos,
              nearbyEvents: _nearbyEvents,
              classMeta: _classMeta,
              onMapMoved: () => setState(() => _followMap = false),
            )
          else
            const Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  CircularProgressIndicator(color: Color(0xFF0D9488)),
                  SizedBox(height: 12),
                  Text('جاري تحديد الموقع...', style: TextStyle(color: Color(0xFF94A3B8))),
                ],
              ),
            ),

          DriveTopBar(
            vehicleId: widget.config.vehicleId,
            online: _online,
            eventsCount: _eventsCount,
            alertsCount: _liveAlerts.length + _nearbyEvents.length,
            followMode: _followMap,
            onAlerts: () => setState(() => _showAlerts = !_showAlerts),
            onLocate: _locateNow,
            onToggleFollow: () => setState(() => _followMap = !_followMap),
            onLogout: _logout,
          ),

          if (_configMessage != null && _configMessage!.isNotEmpty)
            Positioned(
              top: MediaQuery.of(context).padding.top + 58,
              left: 12,
              right: 12,
              child: Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: const Color(0xE6B45309),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(
                  _configMessage!,
                  style: const TextStyle(color: Colors.white, fontSize: 11),
                ),
              ),
            ),

          if (_bannerText != null)
            Positioned(
              top: MediaQuery.of(context).padding.top + 58,
              left: 48,
              right: 48,
              child: Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: const Color(0xE6EF4444),
                  borderRadius: BorderRadius.circular(12),
                  boxShadow: const [BoxShadow(color: Color(0x66000000), blurRadius: 12)],
                ),
                child: Text(
                  _bannerText!,
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                ),
              ),
            ),

          if (_camera != null)
            CameraPip(
              controller: _camera!,
              detections: _detections,
              minConfidence: _serverCfg?.minConfidence ?? 0.45,
              expanded: _camExpanded,
              scanning: _scanning,
              cameraOk: _camera!.value.isInitialized,
              bottomOffset: camBottom,
              onToggle: () => setState(() => _camExpanded = !_camExpanded),
            ),

          Positioned(
            left: 0,
            right: 0,
            bottom: bottomPad,
            child: DashBar(
              speed: speedKmh,
              roadSpeed: _roadSpeed.cached,
              placeName: _placeName ?? _roadSpeed.cached.roadName,
              modelStatus: _modelStatus,
              nearestEvent: _nearestEvent,
              classMeta: _classMeta,
              latencyMs: _lastLatencyMs,
              scanning: _scanning,
            ),
          ),

          if (_showAlerts)
            AlertSheet(
              liveAlerts: _liveAlerts,
              nearbyEvents: _nearbyEvents,
              classMeta: _classMeta,
            ),
        ],
      ),
    );
  }
}
