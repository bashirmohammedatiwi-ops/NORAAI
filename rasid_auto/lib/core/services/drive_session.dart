import 'dart:async';
import 'dart:io';
import 'dart:math' as math;

import 'package:camera/camera.dart';
import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';
import 'package:vibration/vibration.dart';

import '../models/detection.dart';
import '../models/detection_box.dart';
import '../models/driver_config.dart';
import 'config_bootstrap.dart';
import 'config_storage.dart';
import 'rasid_api_service.dart';
import 'api_exception.dart';
import '../models/detection_result.dart';
import '../models/final_detection.dart';
import '../models/hospital.dart';
import '../models/road_event.dart';
import '../models/tracked_object.dart';
import '../../data/baghdad_hospitals.dart';
import 'accelerometer_service.dart';
import 'accel_impact_classifier.dart';
import 'android_auto_bridge.dart';
import 'gyroscope_service.dart';
import 'local_store.dart';
import 'offline_speed_limit.dart';
import 'platform_support.dart';
import 'route_service.dart';
import 'sensor_fusion_service.dart';
import 'speed_monitor.dart';

/// Central session: camera → segmentation → tracking → fusion → GPS save.
class DriveSession extends ChangeNotifier {
  DriveSession();

  final SensorFusionService fusion = SensorFusionService();
  final AccelerometerService accel = AccelerometerService();
  final GyroscopeService gyro = GyroscopeService();
  final OfflineSpeedLimitService _speedLimits =
      const OfflineSpeedLimitService();
  final SpeedViolationMonitor _speedMonitor =
      SpeedViolationMonitor(const SpeedViolationRules());

  StreamSubscription<Position>? _gpsSub;
  Timer? _detectTimer;
  Timer? _autoPushTimer;
  Timer? _sensorUiTimer;
  Timer? _syncTimer;
  Timer? _telemetryTimer;
  Timer? _sensorHitTimer;
  bool _cloudDetectBusy = false;

  DriverConfig? driverConfig;
  RasidApiService? api;
  List<DetectionBox> cloudBoxes = [];
  bool online = false;
  String? connectionError;

  CameraController? camera;
  List<CameraDescription> cameras = [];

  bool ready = false;
  bool driving = false;
  bool detecting = false;
  bool debugMode = false;
  String? statusMessage;
  String? modelError;
  String backendName = 'Mock Segmentation';

  double latitude = 33.3152;
  double longitude = 44.3661;
  double speedKmh = 0;
  double heading = 0;
  double limitKmh = 40;
  String zoneNameAr = 'طريق عام';
  double roadRoughness = 0;
  /// Seconds left before a speed fine is recorded (0 = not over / past grace).
  int overSpeedCountdownSec = 0;
  static const double speedometerFactor = 1.05;
  static const int fineAmountIqd = 200000;

  List<TrackedObject> tracked = [];
  List<FinalDetection> fused = [];
  Uint8List? liveMask;
  int liveMaskWidth = 0;
  int liveMaskHeight = 0;
  int lastLatencyMs = 0;
  double pipelineFps = 0; // inference FPS
  double cameraFps = 0;
  int preprocessMs = 0;
  int inferenceMs = 0;
  int postprocessMs = 0;
  int totalLatencyMs = 0;
  double _lastVibUi = -1;

  double previewWidth = 0;
  double previewHeight = 0;

  List<RoadEvent> events = [];
  List<SpeedFine> fines = [];
  List<Hospital> nearestHospitals = [];
  RoadEvent? lastAlert;
  SpeedFine? lastFine;

  /// Active turn-by-turn style navigation to a hospital / point.
  Hospital? navigationTarget;
  List<LatLng> routePoints = const [];
  double routeDistanceM = 0;
  double routeDurationS = 0;
  bool navigating = false;
  bool routingBusy = false;
  String? routingError;
  int? pendingTabIndex;
  int routeVersion = 0;

  bool showHospitals = true;
  bool showHazards = true;
  bool hapticAlerts = true;
  double minConfidence = 0.22;

  DateTime? _lastSensorOnlyAt;
  ({double lat, double lng})? _lastSensorOnlyGps;
  final AccelImpactClassifier _impact = const AccelImpactClassifier();

  /// Cloud API ready (replaces local ONNX).
  bool get detectorReady => api != null;
  List<String> get classNames => const [];

  Future<void> init() async {
    statusMessage = 'تحضير التطبيق…';
    notifyListeners();
    await LocalStore.instance.db;
    await _reloadLists();
    await _initApi();
    await _ensurePermissions();
    await _startGps();
    await _initCamera();
    accel.start();
    gyro.start();

    // Debug hook: /sdcard/Download/rasid_force_detect auto-starts detection once.
    try {
      final flag = File('/storage/emulated/0/Download/rasid_force_detect');
      if (await flag.exists()) {
        debugPrint('force_detect → startDriving');
        try {
          await flag.delete();
        } catch (_) {}
        await Future<void>.delayed(const Duration(milliseconds: 800));
        await startDriving();
      }
    } catch (e) {
      debugPrint('force_detect: $e');
    }

    _autoPushTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      unawaited(_tickCarBridge());
    });
    // Keep vibration meter / HUD live on map without waiting for GPS.
    _sensorUiTimer = Timer.periodic(const Duration(milliseconds: 300), (_) {
      roadRoughness = accel.latest.rms;
      final v = accel.latest.vibrationPercent;
      if ((v - _lastVibUi).abs() < 1.0 && !detecting) return;
      _lastVibUi = v;
      notifyListeners();
    });
    ready = true;
    statusMessage = api != null
        ? 'متصل — ${driverConfig?.driverName ?? ""} · ${driverConfig?.vehicleId ?? ""}'
        : 'جاري الاتصال بالسيرفر…';
    notifyListeners();
  }

  Future<void> _initApi() async {
    driverConfig = await ConfigStorage.load();
    driverConfig ??= await ConfigBootstrap.ensureRegistered();
    if (driverConfig == null) return;
    api?.dispose();
    api = RasidApiService(driverConfig!);
    backendName = 'Rasid Cloud · YOLO';
    online = true;
    _telemetryTimer?.cancel();
    _syncTimer?.cancel();
    _telemetryTimer = Timer.periodic(const Duration(seconds: 20), (_) {
      unawaited(_sendTelemetry());
    });
    _syncTimer = Timer.periodic(const Duration(seconds: 15), (_) {
      unawaited(syncServerEvents());
    });
    unawaited(_sendTelemetry());
    unawaited(syncServerEvents());
  }

  Future<void> reloadApiConfig() => _initApi();

  Future<void> _sendTelemetry() async {
    final a = api;
    if (a == null) return;
    await a.sendTelemetry(
      latitude: latitude,
      longitude: longitude,
      speed: speedKmh > 0 ? speedKmh : null,
      gpsStatus: 'ok',
      cameraStatus: detecting ? 'active' : 'idle',
    );
  }

  Future<void> syncServerEvents() async {
    final a = api;
    if (a == null) return;
    try {
      final nearby = await a.fetchNearby(latitude, longitude, radiusKm: 15);
      final serverEvents = nearby.map(_roadEventFromServer).toList()
        ..sort((a, b) => b.createdAt.compareTo(a.createdAt));
      final serverIds = serverEvents.map((e) => e.id).toSet();
      final localOnly = events
          .where(
            (e) =>
                (e.source == 'speed' || e.source == 'sensor') &&
                !serverIds.contains(e.id),
          )
          .toList();
      events = [...serverEvents, ...localOnly];
      if (serverEvents.isNotEmpty) {
        lastAlert = serverEvents.first;
      }
      online = true;
      connectionError = null;
      notifyListeners();
    } catch (e) {
      online = false;
      connectionError = ApiException.fromError(e).displayMessage;
      notifyListeners();
    }
  }

  RoadEvent _roadEventFromServer(Map<String, dynamic> json) {
    final type = json['event_type'] as String? ?? 'other';
    final meta = json['metadata'];
    final source = meta is Map && meta['source'] is String
        ? meta['source'] as String
        : 'server';
    return RoadEvent(
      id: json['id']?.toString() ?? '',
      kind: type,
      labelAr: source == 'citizen' ? 'تبليغ مواطن · ${hazardLabelAr(type)}' : hazardLabelAr(type),
      latitude: (json['latitude'] as num).toDouble(),
      longitude: (json['longitude'] as num).toDouble(),
      confidence: (json['confidence'] as num?)?.toDouble() ?? 0.5,
      createdAt: DateTime.now(),
      source: source == 'citizen' ? 'citizen' : 'server',
    );
  }

  Future<({List<DetectionBox> boxes, int eventsCreated})> submitCitizenScan(
    Uint8List bytes,
  ) async {
    final a = api;
    if (a == null) throw StateError('غير متصل بالسيرفر');
    final result = await a.detectFrameBytes(
      bytes: bytes,
      filename: 'citizen.jpg',
      latitude: latitude,
      longitude: longitude,
      speed: speedKmh > 0 ? speedKmh : null,
      speedLimit: limitKmh,
      minConfidence: minConfidence,
      source: 'citizen',
    );
    cloudBoxes = result.detections;
    if (result.eventsCreated > 0 || result.detections.isNotEmpty) {
      final top = result.detections.isNotEmpty ? result.detections.first : null;
      lastAlert = RoadEvent(
        kind: top?.eventType ?? 'citizen',
        labelAr: top != null ? hazardLabelAr(top.className) : 'تبليغ مواطن',
        latitude: latitude,
        longitude: longitude,
        confidence: top?.confidence ?? 1,
        createdAt: DateTime.now(),
        source: 'citizen',
      );
    }
    await syncServerEvents();
    notifyListeners();
    return (boxes: result.detections, eventsCreated: result.eventsCreated);
  }

  Future<void> _reloadLists() async {
    events = await LocalStore.instance.recentEvents();
    fines = await LocalStore.instance.allFines();
    _refreshNearestHospitals();
  }

  Future<void> _ensurePermissions() async {
    var perm = await Geolocator.checkPermission();
    if (perm == LocationPermission.denied) {
      perm = await Geolocator.requestPermission();
    }
  }

  Future<void> _startGps() async {
    const settings = LocationSettings(
      accuracy: LocationAccuracy.bestForNavigation,
      distanceFilter: 2,
    );
    DateTime? lastUiPush;
    _gpsSub = Geolocator.getPositionStream(locationSettings: settings).listen(
      (pos) {
        latitude = pos.latitude;
        longitude = pos.longitude;
        speedKmh = _smoothSpeed(pos);
        if (pos.heading >= 0 && pos.headingAccuracy < 25) {
          heading = pos.heading;
        }
        final limit = _speedLimits.lookup(
          latitude,
          longitude,
          currentZone: zoneNameAr,
        );
        limitKmh = limit.limitKmh;
        zoneNameAr = limit.zoneNameAr;
        roadRoughness = accel.latest.rms;
        _refreshNearestHospitals();
        _checkSpeedViolation();
        // Throttle UI rebuilds — GPS can fire many times/sec.
        final now = DateTime.now();
        if (lastUiPush == null ||
            now.difference(lastUiPush!).inMilliseconds >= 400) {
          lastUiPush = now;
          notifyListeners();
        }
      },
      onError: (e) => debugPrint('gps: $e'),
    );
  }

  double _speedEma = 0;

  /// Accuracy-weighted EMA, then ×1.05 to approximate dash speedometer
  /// (GPS is typically a few % below the cluster). Prefer car hardware
  /// speed when Android Auto exposes it.
  double _smoothSpeed(Position pos) {
    final raw = (pos.speed * 3.6);
    final acc = pos.speedAccuracy.isFinite && pos.speedAccuracy > 0
        ? pos.speedAccuracy * 3.6
        : 15.0;
    if (raw < 0) return _speedEma;
    final alpha = acc > 20 ? 0.18 : (acc > 8 ? 0.35 : 0.55);
    _speedEma += alpha * (raw.clamp(0.0, 300.0) - _speedEma);
    if (_speedEma < 2.0 && raw < 2.0) _speedEma = 0;
    final calibrated = (_speedEma * speedometerFactor).clamp(0.0, 300.0);
    if (calibrated < 2.5 && raw < 2.0) return 0;
    return calibrated;
  }

  int _displayVibrationPercent() {
    // Still / crawling: ignore phone noise and engine idle.
    if (speedKmh < 5) return 0;
    final raw = accel.latest.vibrationPercent;
    return (raw - 6).clamp(0, 100).round();
  }

  Future<void> _tickCarBridge() async {
    // Prefer vehicle cluster speed when the host provides it.
    final vehicle = await AndroidAutoBridge.instance.getVehicleSpeed();
    if (vehicle != null && vehicle >= 0) {
      speedKmh = vehicle.clamp(0, 300);
      _checkSpeedViolation();
    }

    final cmd = await AndroidAutoBridge.instance.pollCarCommand();
    if (cmd != null) {
      if (cmd['action'] == 'navigateHospital') {
        final id = cmd['hospitalId'] as String?;
        if (id != null) {
          final match = kBaghdadHospitals.where((h) => h.id == id);
          if (match.isNotEmpty) {
            await navigateToHospital(match.first);
          }
        }
      } else if (cmd['action'] == 'cancelNavigation') {
        clearNavigation();
      }
    }

    final hazard = lastAlert;
    final hazardFresh = hazard != null &&
        DateTime.now().difference(hazard.createdAt).inSeconds < 8;
    final navDest = navigationTarget;
    final remM = remainingRouteMeters;
    final etaMin = navigating && remM > 0
        ? (remM / ((speedKmh > 8 ? speedKmh : 28.0) / 3.6) / 60)
            .ceil()
            .clamp(1, 999)
        : 0;

    // Decimate route for AA surface draw (more points = smoother curves).
    final pts = routePoints;
    final step = pts.length <= 120 ? 1 : (pts.length / 120).ceil();
    final routeStr = <String>[];
    for (var i = 0; i < pts.length; i += step) {
      routeStr.add(
        '${pts[i].latitude.toStringAsFixed(5)},${pts[i].longitude.toStringAsFixed(5)}',
      );
    }

    final hospPayload = nearestHospitals.take(6).map((h) {
      final d = _haversineKm(latitude, longitude, h.latitude, h.longitude);
      return {
        'id': h.id,
        'nameAr': h.nameAr,
        'subtitle': '${d.toStringAsFixed(1)} كم · ${h.typeLabelAr}',
      };
    }).toList();

    final finePayload = fines.take(6).map((f) {
      final status = f.resolved ? 'مغلقة' : 'مفتوحة';
      return <String, Object>{
        'title':
            '${f.speedKmh.round()} / ${f.limitKmh.round()} كم/س · ${f.amountIqd} د.ع',
        'subtitle': '$status · +${f.excess.round()} فوق الحد',
        'resolved': f.resolved,
      };
    }).toList();

    // Compact hazard string for the car map: "lat,lng,kind;..." (ASCII only).
    final hzStr = events
        .where((e) => e.kind != HazardKind.speed.name)
        .take(40)
        .map((e) {
      final k = switch (e.kind) {
        'pothole' => 'p',
        'bump' => 'b',
        'accident' => 'a',
        'manhole' => 'm',
        _ => 'o',
      };
      return '${e.latitude.toStringAsFixed(5)},${e.longitude.toStringAsFixed(5)},$k';
    }).join(';');

    await AndroidAutoBridge.instance.pushStatus(
      speedKmh: speedKmh,
      limitKmh: limitKmh,
      zoneNameAr: zoneNameAr,
      alertTitle: hazardFresh ? hazard.labelAr : null,
      alertBody: !hazardFresh
          ? null
          : '${((hazard.finalConfidence ?? hazard.confidence) * 100).round()}% · ${detecting ? "كشف نشط" : "متوقف"}',
      detecting: detecting,
      potholeCount: cloudBoxes
          .where((b) => classifyHazard(b.className) == HazardKind.pothole)
          .length,
      bumpCount: cloudBoxes
          .where((b) => classifyHazard(b.className) == HazardKind.bump)
          .length,
      backendName: backendName,
      navigating: navigating && navDest != null,
      navDestName: navDest?.nameAr ?? '',
      navRemainingM: remM,
      navEtaMin: etaMin,
      vibrationPercent: _displayVibrationPercent(),
      headingDeg: heading,
      overSpeedCountdownSec: overSpeedCountdownSec,
      openFinesCount: fines.where((f) => !f.resolved).length,
      latitude: latitude,
      longitude: longitude,
      hospitals: hospPayload,
      fines: finePayload,
      routePoints: routeStr.join(';'),
      hazards: hzStr,
    );
  }

  void _refreshNearestHospitals() {
    final scored = kBaghdadHospitals.map((h) {
      final d = _haversineKm(latitude, longitude, h.latitude, h.longitude);
      return (h: h, d: d);
    }).toList()
      ..sort((a, b) => a.d.compareTo(b.d));
    nearestHospitals = scored.take(6).map((e) => e.h).toList();
  }

  Future<void> reloadModel() async {
    tracked = [];
    fused = [];
    await syncServerEvents();
  }

  Future<void> enableMockMode() async {
    statusMessage = 'الكشف عبر Rasid Cloud فقط';
    notifyListeners();
  }

  Future<void> enableRealMode() async {
    await reloadModel();
  }

  Future<void> _initCamera() async {
    try {
      cameras = await availableCameras();
      if (cameras.isEmpty) return;
      final back = cameras.firstWhere(
        (c) => c.lensDirection == CameraLensDirection.back,
        orElse: () => cameras.first,
      );
      camera = CameraController(
        back,
        ResolutionPreset.medium,
        enableAudio: false,
        imageFormatGroup: ImageFormatGroup.yuv420,
      );
      await camera!.initialize();
      previewWidth = camera!.value.previewSize?.height ?? 0;
      previewHeight = camera!.value.previewSize?.width ?? 0;
      notifyListeners();
    } catch (e) {
      debugPrint('camera init: $e');
    }
  }

  Future<void> startDriving() async {
    driving = true;
    statusMessage = 'وضع القيادة مفعّل';
    _sensorHitTimer?.cancel();
    _sensorHitTimer = Timer.periodic(const Duration(seconds: 2), (_) {
      if (driving) unawaited(_persistSensorOnlyHits());
    });
    notifyListeners();
    await startDetection();
  }

  Future<void> stopDriving() async {
    driving = false;
    _sensorHitTimer?.cancel();
    _sensorHitTimer = null;
    await stopDetection();
    statusMessage = 'توقفت القيادة';
    notifyListeners();
  }

  Future<void> startDetection() async {
    if (detecting) return;
    if (api == null) {
      statusMessage = 'السيرفر غير مهيأ — أكمل الإعداد';
      notifyListeners();
      return;
    }
    detecting = true;
    statusMessage = 'كشف سحابي · Rasid Cloud';
    notifyListeners();
    _scheduleCloudDetect(0);
  }

  void _scheduleCloudDetect(int delayMs) {
    _detectTimer?.cancel();
    _detectTimer = Timer(Duration(milliseconds: delayMs), () async {
      if (!detecting) return;
      final started = DateTime.now();
      await _runCloudDetectOnce();
      final interval = lastLatencyMs > 2500 ? 3200 : 1800;
      final elapsed = DateTime.now().difference(started).inMilliseconds;
      _scheduleCloudDetect((interval - elapsed).clamp(800, interval));
    });
  }

  Future<void> _runCloudDetectOnce() async {
    if (!detecting || _cloudDetectBusy || api == null) return;
    final cam = camera;
    if (cam == null || !cam.value.isInitialized) return;
    _cloudDetectBusy = true;
    try {
      final file = await cam.takePicture().timeout(const Duration(seconds: 4));
      final bytes = await File(file.path).readAsBytes();
      try {
        await File(file.path).delete();
      } catch (_) {}
      final result = await api!.detectFrameBytes(
        bytes: bytes,
        filename: 'frame.jpg',
        latitude: latitude,
        longitude: longitude,
        speed: speedKmh > 0 ? speedKmh : null,
        speedLimit: limitKmh,
        minConfidence: minConfidence,
        source: 'camera',
      );
      cloudBoxes = result.detections;
      lastLatencyMs = result.latencyMs ?? 0;
      totalLatencyMs = lastLatencyMs;
      inferenceMs = lastLatencyMs;
      if (result.eventsCreated > 0 && result.detections.isNotEmpty) {
        final top = result.detections.first;
        lastAlert = RoadEvent(
          kind: top.eventType ?? classifyHazard(top.className).name,
          labelAr: hazardLabelAr(top.className),
          latitude: latitude,
          longitude: longitude,
          confidence: top.confidence,
          createdAt: DateTime.now(),
          source: 'ai',
        );
        if (hapticAlerts) {
          unawaited(Vibration.vibrate(duration: 80));
        }
      }
      await syncServerEvents();
      notifyListeners();
    } catch (e) {
      debugPrint('cloud detect: $e');
    } finally {
      _cloudDetectBusy = false;
    }
  }

  Future<void> stopDetection() async {
    detecting = false;
    _detectTimer?.cancel();
    _detectTimer = null;
    cloudBoxes = [];
    tracked = [];
    fused = [];
    liveMask = null;
    notifyListeners();
  }

  Future<void> _persistSensorOnlyHits() async {
    final hit = _impact.classify(accel.latest, speedKmh: speedKmh);
    if (hit.kind == null || hit.confidence < 0.45) return;

    // Prefer camera tracks when they already match this class.
    final coveredByCamera = fused.any(
      (f) =>
          f.type == hit.kind &&
          f.finalConfidence >= minConfidence &&
          f.track.missedFrames <= 1,
    );
    if (coveredByCamera) return;

    final now = DateTime.now();
    final last = _lastSensorOnlyAt;
    if (last != null && now.difference(last).inSeconds < 8) return;
    final prevGps = _lastSensorOnlyGps;
    if (prevGps != null) {
      final d = _haversineKm(latitude, longitude, prevGps.lat, prevGps.lng);
      if (d < 0.025) return;
    }

    final event = RoadEvent(
      kind: hit.kind!.id,
      labelAr: hit.kind!.labelAr,
      latitude: latitude,
      longitude: longitude,
      confidence: hit.confidence,
      createdAt: now,
      speedKmh: speedKmh,
      heading: heading,
      source: 'sensor',
      severity: hit.confidence >= 0.7 ? 'high' : 'medium',
      sensorVerified: true,
      cameraConfidence: 0,
      sensorConfidence: hit.confidence,
      finalConfidence: hit.confidence,
      note: hit.label,
    );
    await LocalStore.instance.insertEvent(event);
    events = [event, ...events];
    lastAlert = event;
    _lastSensorOnlyAt = now;
    _lastSensorOnlyGps = (lat: latitude, lng: longitude);

    if (hapticAlerts && supportsVibration) {
      try {
        if (await Vibration.hasVibrator()) {
          await Vibration.vibrate(
            duration: hit.kind == SegClass.pothole ? 200 : 140,
          );
        }
      } catch (_) {}
    }
  }

  void _checkSpeedViolation() {
    final r = _speedMonitor.update(speedKmh, limitKmh);
    final nextCd = r.countdownRemaining.ceil().clamp(0, 5);
    if (nextCd != overSpeedCountdownSec) {
      final prev = overSpeedCountdownSec;
      overSpeedCountdownSec = nextCd;
      if (Platform.isAndroid) {
        unawaited(AndroidAutoBridge.instance.playCountdownAlarm(nextCd));
      }
      if (prev == 0 && nextCd > 0) {
        lastAlert = RoadEvent(
          kind: HazardKind.speed.name,
          labelAr: 'تجاوز سرعة · $nextCd ث',
          latitude: latitude,
          longitude: longitude,
          confidence: 1,
          createdAt: DateTime.now(),
          speedKmh: speedKmh,
          source: 'speed',
        );
      }
      notifyListeners();
    }
    if (!r.shouldReport) return;
    overSpeedCountdownSec = 0;
    final fine = SpeedFine(
      speedKmh: speedKmh,
      limitKmh: limitKmh,
      latitude: latitude,
      longitude: longitude,
      createdAt: DateTime.now(),
      durationSeconds: r.durationSeconds,
      amountIqd: fineAmountIqd,
      note: 'غرامة تجاوز سرعة: $fineAmountIqd دينار عراقي',
    );
    unawaited(() async {
      await LocalStore.instance.insertFine(fine);
      fines = [fine, ...fines];
      lastFine = fine;
      lastAlert = RoadEvent(
        kind: HazardKind.speed.name,
        labelAr: 'مخالفة سرعة · $fineAmountIqd د.ع',
        latitude: latitude,
        longitude: longitude,
        confidence: 1,
        createdAt: DateTime.now(),
        speedKmh: speedKmh,
        source: 'speed',
      );
      notifyListeners();
      if (hapticAlerts && supportsVibration) {
        try {
          await Vibration.vibrate(duration: 300);
        } catch (_) {}
      }
    }());
  }

  Future<void> updateFine(SpeedFine f) async {
    await LocalStore.instance.updateFine(f);
    fines = await LocalStore.instance.allFines();
    notifyListeners();
  }

  Future<void> deleteFine(String id) async {
    await LocalStore.instance.deleteFine(id);
    fines = await LocalStore.instance.allFines();
    notifyListeners();
  }

  Future<void> deleteEvent(String id) async {
    await LocalStore.instance.deleteEvent(id);
    events = await LocalStore.instance.recentEvents();
    notifyListeners();
  }

  void requestTab(int index) {
    pendingTabIndex = index;
    notifyListeners();
  }

  int? consumeTabRequest() {
    final i = pendingTabIndex;
    pendingTabIndex = null;
    return i;
  }

  /// Fetch road route to [hospital], draw it, open the Map tab.
  /// Does NOT start driving / camera — the driver chooses that manually.
  Future<bool> navigateToHospital(Hospital hospital) async {
    routingBusy = true;
    routingError = null;
    notifyListeners();
    try {
      final from = LatLng(latitude, longitude);
      final to = LatLng(hospital.latitude, hospital.longitude);
      final result = await const RouteService().route(from: from, to: to);
      navigationTarget = hospital;
      routePoints = result.points;
      routeDistanceM = result.distanceMeters;
      routeDurationS = result.durationSeconds;
      navigating = true;
      showHospitals = true;
      routeVersion++;
      routingBusy = false;
      requestTab(3); // Map tab — see the route first
      statusMessage = 'توجيه إلى ${hospital.nameAr}';
      notifyListeners();
      return true;
    } catch (e) {
      routingBusy = false;
      routingError = 'تعذّر حساب المسار';
      debugPrint('navigateToHospital: $e');
      notifyListeners();
      return false;
    }
  }

  void clearNavigation() {
    navigating = false;
    navigationTarget = null;
    routePoints = const [];
    routeDistanceM = 0;
    routeDurationS = 0;
    routingError = null;
    notifyListeners();
  }

  /// Remaining distance along current route (approx from GPS to dest).
  double get remainingRouteMeters {
    final t = navigationTarget;
    if (t == null) return 0;
    return const Distance().as(
      LengthUnit.Meter,
      LatLng(latitude, longitude),
      LatLng(t.latitude, t.longitude),
    );
  }

  /// Index of the route point closest to the user (for progress rendering).
  int get nearestRouteIndex {
    final route = routePoints;
    if (route.length < 2) return 0;
    const dist = Distance();
    final here = LatLng(latitude, longitude);
    var best = 0;
    var bestM = double.infinity;
    for (var i = 0; i < route.length; i++) {
      final d = dist.as(LengthUnit.Meter, here, route[i]);
      if (d < bestM) {
        bestM = d;
        best = i;
      }
    }
    return best;
  }

  /// Bearing toward the upcoming route point — keeps the arrow aligned
  /// with the road ahead even before GPS heading settles.
  double get routeBearingDeg {
    final route = routePoints;
    if (route.length < 2) return heading;
    final i = nearestRouteIndex;
    final next = route[(i + 3).clamp(0, route.length - 1)];
    const dist = Distance();
    return dist.bearing(LatLng(latitude, longitude), next);
  }

  void setShowHospitals(bool v) {
    showHospitals = v;
    notifyListeners();
  }

  void setShowHazards(bool v) {
    showHazards = v;
    notifyListeners();
  }

  void setHapticAlerts(bool v) {
    hapticAlerts = v;
    notifyListeners();
  }

  void setMinConfidence(double v) {
    minConfidence = v;
    notifyListeners();
  }

  void setDebugMode(bool v) {
    debugMode = v;
    notifyListeners();
  }

  Future<void> addManualHazard(String kind, String labelAr) async {
    final event = RoadEvent(
      kind: kind,
      labelAr: labelAr,
      latitude: latitude,
      longitude: longitude,
      confidence: 1,
      createdAt: DateTime.now(),
      speedKmh: speedKmh,
      heading: heading,
      source: 'manual',
    );
    await LocalStore.instance.insertEvent(event);
    events = [event, ...events];
    notifyListeners();
  }

  static double _haversineKm(
    double lat1,
    double lon1,
    double lat2,
    double lon2,
  ) {
    const r = 6371.0;
    final dLat = _rad(lat2 - lat1);
    final dLon = _rad(lon2 - lon1);
    final a = math.sin(dLat / 2) * math.sin(dLat / 2) +
        math.cos(_rad(lat1)) *
            math.cos(_rad(lat2)) *
            math.sin(dLon / 2) *
            math.sin(dLon / 2);
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a));
  }

  static double _rad(double d) => d * math.pi / 180;

  double distanceToHospitalKm(Hospital h) =>
      _haversineKm(latitude, longitude, h.latitude, h.longitude);

  @override
  void dispose() {
    _gpsSub?.cancel();
    _detectTimer?.cancel();
    _autoPushTimer?.cancel();
    _sensorUiTimer?.cancel();
    _syncTimer?.cancel();
    _telemetryTimer?.cancel();
    _sensorHitTimer?.cancel();
    api?.dispose();
    accel.dispose();
    gyro.dispose();
    camera?.dispose();
    super.dispose();
  }
}
