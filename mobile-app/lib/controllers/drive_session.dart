import 'dart:async';

import 'package:camera/camera.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:vibration/vibration.dart';

import '../models/detection.dart' show DetectionBox, ServerConfig;
import '../models/driver_config.dart';
import '../models/nearby_event.dart' show LiveAlert, NearbyEvent;
import '../services/api_exception.dart';
import '../services/api_service.dart';
import '../services/config_storage.dart';
import '../services/detect_scheduler.dart';
import '../services/gps_bootstrap.dart';
import '../services/location_service.dart';
import '../services/model_sync.dart';
import '../services/road_speed_service.dart';
import '../services/speed_monitor.dart';
import '../config/app_config.dart';
import '../utils/event_meta.dart';
import '../utils/map_geo.dart';
import '../utils/platform_support.dart';

const appVersion = '3.1.0';

enum SyncPhase { idle, connecting, syncingConfig, syncingModel, ready, error }

class DriveSession extends ChangeNotifier {
  DriveSession(this.config, this.onLogout);

  final DriverConfig config;
  final VoidCallback onLogout;

  late final ApiService api = ApiService(config);
  late final RoadSpeedService roadSpeed = RoadSpeedService(api);
  late final LocationService locationService = LocationService();
  late final DetectScheduler scheduler = DetectScheduler();
  final mapController = MapController();

  CameraController? camera;
  String? cameraError;
  bool cameraStarting = false;
  String? gpsError;
  bool gpsSearching = true;
  StreamSubscription<Position>? _posSub;
  SpeedViolationMonitor? _speedMonitor;

  ServerConfig? serverCfg;
  Map<String, EventMeta> classMeta = {};
  Position? position;
  String? placeName;
  String modelStatus = 'جاري الاتصال...';
  String? configMessage;
  String? connectionError;
  bool online = false;
  bool followMap = true;
  bool scanning = false;
  bool detectBusy = false;
  int eventsCount = 0;
  int? lastLatencyMs;
  String? bannerText;
  bool syncingModel = false;
  double modelSyncProgress = 0;
  SyncPhase syncPhase = SyncPhase.connecting;
  DateTime? lastConfigSync;
  DateTime? lastModelSync;
  String? cachedModelVersion;
  String? cachedModelSha256;
  int _failures = 0;

  List<DetectionBox> detections = [];
  List<LiveAlert> liveAlerts = [];
  List<NearbyEvent> nearbyEvents = [];

  Timer? _configTimer;
  Timer? _nearbyTimer;
  Timer? _detectTimer;
  Timer? _reconnectTimer;
  Timer? _gpsWatchdog;

  void start() {
    startGps();
    syncAll();
    _configTimer = Timer.periodic(const Duration(seconds: 20), (_) => syncConfig());
    _nearbyTimer = Timer.periodic(const Duration(seconds: 15), (_) => fetchNearby());
  }

  @override
  void dispose() {
    _configTimer?.cancel();
    _nearbyTimer?.cancel();
    _detectTimer?.cancel();
    _reconnectTimer?.cancel();
    _gpsWatchdog?.cancel();
    _posSub?.cancel();
    camera?.dispose();
    api.dispose();
    super.dispose();
  }

  double? get speedKmh =>
      position != null && position!.speed >= 0 ? position!.speed * 3.6 : null;

  NearbyEvent? get nearestEvent {
    if (nearbyEvents.isEmpty) return null;
    final sorted = [...nearbyEvents]..sort((a, b) => a.distanceKm.compareTo(b.distanceKm));
    return sorted.first;
  }

  int get alertsCount => liveAlerts.length + nearbyEvents.length;

  String get connectionLabel {
    if (syncPhase == SyncPhase.syncingConfig || syncPhase == SyncPhase.syncingModel) {
      return 'جاري المزامنة...';
    }
    if (online) return 'متصل';
    return connectionError ?? 'غير متصل';
  }

  Future<void> syncAll() async {
    await syncConfig(forceModelSync: true);
    await fetchNearby(force: true);
  }

  /// Lazy camera init — must run only when camera tab is visible (especially on web).
  Future<void> ensureCamera({bool force = false}) async {
    if (!force && camera != null && camera!.value.isInitialized) return;
    if (cameraStarting) return;

    cameraStarting = true;
    cameraError = null;
    notifyListeners();

    try {
      if (!kIsWeb) {
        final camPerm = await Permission.camera.request();
        if (!camPerm.isGranted) {
          cameraError = 'صلاحية الكاميرا مرفوضة — فعّلها من إعدادات الجهاز';
          return;
        }
      }

      final cameras = await availableCameras();
      if (cameras.isEmpty) {
        cameraError = 'لا توجد كاميرا متاحة على هذا الجهاز';
        return;
      }

      final selected = kIsWeb
          ? cameras.firstWhere(
              (c) => c.lensDirection == CameraLensDirection.front,
              orElse: () => cameras.first,
            )
          : cameras.firstWhere(
              (c) => c.lensDirection == CameraLensDirection.back,
              orElse: () => cameras.first,
            );

      final old = camera;
      camera = null;
      if (old != null) {
        await old.dispose();
        if (kIsWeb) {
          // Browser releases getUserMedia asynchronously.
          await Future<void>.delayed(const Duration(milliseconds: 200));
        }
      }

      final controller = CameraController(
        selected,
        kIsWeb ? ResolutionPreset.medium : ResolutionPreset.medium,
        enableAudio: false,
        imageFormatGroup: kIsWeb ? null : ImageFormatGroup.jpeg,
      );

      controller.addListener(notifyListeners);
      await controller.initialize();

      if (!controller.value.isInitialized) {
        await controller.dispose();
        cameraError = 'تعذّر تشغيل بث الكاميرا';
        return;
      }

      camera = controller;
      cameraError = null;
      notifyListeners();
      scheduleNextDetect(0);
    } catch (e) {
      cameraError = kIsWeb
          ? 'لم يتم السماح بالكاميرا — اضغط «إعادة المحاولة» واقبل طلب المتصفح'
          : 'فشل تشغيل الكاميرا: ${e.toString()}';
    } finally {
      cameraStarting = false;
      notifyListeners();
    }
  }

  void requestCamera({bool force = false}) {
    unawaited(ensureCamera(force: force));
  }

  Future<void> releaseCamera() async {
    _detectTimer?.cancel();
    final old = camera;
    camera = null;
    cameraError = null;
    notifyListeners();
    if (old != null) {
      await old.dispose();
    }
  }

  Future<void> syncConfig({bool forceModelSync = false}) async {
    if (syncingModel && !forceModelSync) return;

    syncPhase = SyncPhase.syncingConfig;
    notifyListeners();

    try {
      final cfg = await api.fetchConfig();
      serverCfg = cfg;
      online = true;
      connectionError = null;
      _failures = 0;
      _reconnectTimer?.cancel();
      lastConfigSync = DateTime.now();
      configMessage = cfg.message;
      classMeta = buildClassMetaFromServer(cfg.projectClasses, cfg.alertTypes);
      _speedMonitor = SpeedViolationMonitor(cfg.speedViolation);

      if (cfg.detectionEnabled && cfg.modelReady) {
        unawaited(api.warmupModel());
      }

      if (cfg.modelReady) {
        final versionChanged = cfg.modelVersion != null &&
            cfg.modelVersion != cachedModelVersion &&
            cachedModelVersion != null;
        final shaChanged =
            cfg.modelSha256 != null && cfg.modelSha256 != cachedModelSha256;

        final mode = effectiveInferenceMode(cfg.inferenceMode);
        if (mode == 'local') {
          if (forceModelSync || versionChanged || shaChanged || cachedModelVersion == null) {
            await _syncModel(cfg);
          } else {
            modelStatus = 'محلي · ${cachedModelVersion ?? cfg.modelVersion ?? "—"}';
            syncPhase = SyncPhase.ready;
          }
        } else {
          modelStatus = supportsLocalOnnx
              ? 'سيرفر · ${cfg.modelName ?? cfg.modelVersion ?? "—"}'
              : 'سيرفر (متصفح) · ${cfg.modelName ?? cfg.modelVersion ?? "—"}';
          syncPhase = SyncPhase.ready;
        }
      } else {
        modelStatus = cfg.message ?? 'لا يوجد موديل — درّب وزامِن من لوحة التحكم';
        syncPhase = SyncPhase.ready;
      }
      notifyListeners();
    } on ApiException catch (e) {
      _onConnectionFailed(e.displayMessage);
    } catch (e) {
      _onConnectionFailed(ApiException.fromError(e).displayMessage);
    }
  }

  Future<void> _syncModel(ServerConfig cfg) async {
    syncingModel = true;
    syncPhase = SyncPhase.syncingModel;
    modelSyncProgress = 0;
    notifyListeners();

    final result = await ModelSync.sync(
      api,
      cfg.modelVersion,
      onProgress: (p) {
        modelSyncProgress = p;
        notifyListeners();
      },
    );

    syncingModel = false;
    if (result.ready) {
      cachedModelVersion = result.version ?? cfg.modelVersion;
      cachedModelSha256 = result.sha256 ?? cfg.modelSha256;
      lastModelSync = DateTime.now();
      modelStatus = result.message;
      syncPhase = SyncPhase.ready;
      connectionError = null;
    } else {
      modelStatus = result.message;
      syncPhase = online ? SyncPhase.ready : SyncPhase.error;
      if (!online) connectionError = result.message;
    }
    notifyListeners();
  }

  Future<void> syncModelNow() async {
    final cfg = serverCfg;
    if (cfg == null) {
      await syncConfig(forceModelSync: true);
      return;
    }
    if (effectiveInferenceMode(cfg.inferenceMode) == 'local') {
      await _syncModel(cfg);
      await syncConfig();
    } else {
      await syncConfig(forceModelSync: true);
      modelStatus = 'وضع السيرفر — لا حاجة لتحميل ONNX';
      notifyListeners();
    }
  }

  void _onConnectionFailed(String message) {
    online = false;
    connectionError = message;
    _failures++;
    syncPhase = SyncPhase.error;
    modelStatus = message;
    notifyListeners();
    _scheduleReconnect();
  }

  void _scheduleReconnect() {
    _reconnectTimer?.cancel();
    final delay = Duration(seconds: (_failures.clamp(1, 6) * 5));
    _reconnectTimer = Timer(delay, () {
      if (!online) syncConfig();
    });
  }

  Future<void> startGps() async {
    gpsSearching = true;
    gpsError = null;
    notifyListeners();

    try {
      final permError = await ensureLocationPermission();
      if (permError != null) {
        gpsError = permError;
        gpsSearching = false;
        notifyListeners();
        return;
      }

      await _posSub?.cancel();
      _posSub = Geolocator.getPositionStream(
        locationSettings: locationSettingsForStream(),
      ).listen(
        (pos) => _applyPosition(pos, moveMap: followMap),
        onError: (e) {
          gpsError = gpsErrorMessage(e);
          gpsSearching = false;
          notifyListeners();
        },
      );

      _startGpsWatchdog();

      if (!kIsWeb) {
        final lastKnown = await readLastKnownPosition();
        if (lastKnown != null) {
          _applyPosition(lastKnown, moveMap: followMap);
        }
      }

      unawaited(_fetchInitialFix());
    } catch (e) {
      gpsError = gpsErrorMessage(e);
      gpsSearching = false;
      notifyListeners();
    }
  }

  Future<void> _fetchInitialFix() async {
    var fix = await fetchCurrentPositionFix();
    if (fix == null && kIsWeb) {
      fix = await fetchCurrentPositionFix(highAccuracy: true);
    }
    if (fix != null) {
      _applyPosition(fix, moveMap: followMap);
      return;
    }

    if (position == null) {
      gpsSearching = true;
      gpsError = kIsWeb
          ? 'انتظر قليلاً أو اسمح بالموقع من أيقونة القفل بجانب الرابط'
          : null;
      notifyListeners();
    }
  }

  void _startGpsWatchdog() {
    _gpsWatchdog?.cancel();
    _gpsWatchdog = Timer(Duration(seconds: kIsWeb ? 20 : 30), () {
      if (position != null) return;
      gpsSearching = false;
      gpsError ??= kIsWeb
          ? 'لم يُحدد الموقع — اسمح بالموقع من Chrome ثم اضغط «إعادة»'
          : 'تعذّر تحديد الموقع — تحقق من GPS';
      notifyListeners();
    });
  }

  void _applyPosition(Position pos, {required bool moveMap}) {
    position = pos;
    gpsSearching = false;
    gpsError = null;
    _gpsWatchdog?.cancel();
    if (moveMap) {
      mapController.move(
        LatLng(pos.latitude, pos.longitude),
        zoomForAccuracy(pos.accuracy > 0 ? pos.accuracy : 80),
      );
    }
    notifyListeners();
    onPosition(pos);
  }

  LatLng get mapCenter {
    final pos = position;
    if (pos != null) return LatLng(pos.latitude, pos.longitude);
    return kDefaultMapCenter;
  }

  bool get hasGpsFix => position != null;

  Future<void> retryGps() async {
    _gpsWatchdog?.cancel();
    await _posSub?.cancel();
    gpsError = null;
    gpsSearching = true;
    notifyListeners();
    await startGps();
  }

  Future<void> onPosition(Position pos) async {
    final cfg = serverCfg;
    if (cfg == null || !online) return;

    final speed = pos.speed >= 0 ? pos.speed * 3.6 : 0.0;

    unawaited(api.sendTelemetry(
      latitude: pos.latitude,
      longitude: pos.longitude,
      speed: speed > 0 ? speed : null,
      gpsStatus: 'ok',
      cameraStatus: camera?.value.isInitialized == true ? 'ok' : 'error',
      appVersion: appVersion,
      modelVersion: cfg.modelVersion,
      modelSha256: cfg.modelSha256,
    ));

    await roadSpeed.fetchIfNeeded(pos.latitude, pos.longitude, config.speedLimit);

    unawaited(locationService.reverseGeocode(pos.latitude, pos.longitude).then((p) {
      if (p != null) {
        placeName = p;
        notifyListeners();
      }
    }));

    if (cfg.speedViolation.enabled && speed > 0) {
      final check = _speedMonitor?.update(speed, roadSpeed.cached.limit);
      if (check != null && check.shouldReport) {
        final ok = await api.reportViolation(
          latitude: pos.latitude,
          longitude: pos.longitude,
          speed: speed.roundToDouble(),
          speedLimit: roadSpeed.cached.limit,
          roadName: roadSpeed.cached.roadName,
          durationSeconds: check.durationSeconds,
        );
        if (ok) {
        if (supportsVibration && await Vibration.hasVibrator() == true) {
          await Vibration.vibrate(duration: 400);
        }
          pushLiveAlert(LiveAlert(
            type: 'speed_violation',
            label: 'تجاوز سرعة ${speed.round()} كم/س',
            confidence: 1,
            at: DateTime.now(),
            speed: speed,
            speedLimit: roadSpeed.cached.limit,
          ));
          bannerText = 'مخالفة سرعة: ${speed.round()} كم/س';
          notifyListeners();
          Future.delayed(const Duration(seconds: 4), () {
            if (bannerText?.contains('مخالفة') == true) {
              bannerText = null;
              notifyListeners();
            }
          });
        }
      }
    }
    notifyListeners();
  }

  Future<void> fetchNearby({bool force = false}) async {
    final pos = position;
    if (pos == null) return;
    if (!force && !online) return;
    try {
      nearbyEvents = await api.fetchNearby(pos.latitude, pos.longitude);
      notifyListeners();
    } catch (_) {}
  }

  void scheduleNextDetect(int delayMs) {
    _detectTimer?.cancel();
    _detectTimer = Timer(Duration(milliseconds: delayMs), () async {
      await runDetect();
      final cfg = serverCfg;
      final pos = position;
      if (cfg == null || pos == null) {
        scheduleNextDetect(1500);
        return;
      }
      final speed = pos.speed >= 0 ? pos.speed * 3.6 : 0.0;
      final next = scheduler.nextIntervalMs(cfg, speed, lastLatencyMs: lastLatencyMs);
      scheduleNextDetect(next);
    });
  }

  Future<void> runDetect() async {
    final cfg = serverCfg;
    final cam = camera;
    final pos = position;
    if (cfg == null || cam == null || !cam.value.isInitialized || pos == null) return;
    if (!online || !cfg.detectionEnabled || detectBusy) return;

    detectBusy = true;
    scanning = true;
    notifyListeners();

    try {
      final file = await cam.takePicture();
      final result = kIsWeb
          ? await api.detectFrameBytes(
              bytes: await file.readAsBytes(),
              filename: 'frame.jpg',
              latitude: pos.latitude,
              longitude: pos.longitude,
              speed: pos.speed >= 0 ? pos.speed * 3.6 : null,
              speedLimit: roadSpeed.cached.limit,
            )
          : await api.detectFrame(
              imagePath: file.path,
              latitude: pos.latitude,
              longitude: pos.longitude,
              speed: pos.speed >= 0 ? pos.speed * 3.6 : null,
              speedLimit: roadSpeed.cached.limit,
            );

      detections = result.detections
          .where((d) => d.confidence >= cfg.minConfidence && d.bbox.length >= 4)
          .toList();
      lastLatencyMs = result.latencyMs;

      if (result.eventsCreated > 0) {
        eventsCount += result.eventsCreated;
        if (supportsVibration && await Vibration.hasVibrator() == true) {
          await Vibration.vibrate(duration: 200);
        }
        for (final raw in result.alerts) {
          if (raw is Map<String, dynamic>) {
            pushLiveAlert(LiveAlert.fromDetect(raw));
          }
        }
        unawaited(fetchNearby(force: true));
      }
    } on ApiException catch (e) {
      detections = [];
      if (!online) connectionError = e.displayMessage;
    } catch (_) {
      detections = [];
    } finally {
      detectBusy = false;
      scanning = false;
      notifyListeners();
    }
  }

  void pushLiveAlert(LiveAlert alert) {
    liveAlerts = [alert, ...liveAlerts].take(10).toList();
    bannerText = alert.label;
    notifyListeners();
    Future.delayed(const Duration(seconds: 3), () {
      if (bannerText == alert.label) {
        bannerText = null;
        notifyListeners();
      }
    });
  }

  void locateNow() {
    final pos = position;
    if (pos == null) return;
    followMap = true;
    mapController.move(
      LatLng(pos.latitude, pos.longitude),
      zoomForAccuracy(pos.accuracy),
    );
    notifyListeners();
  }

  void toggleFollow() {
    followMap = !followMap;
    notifyListeners();
  }

  void onMapMoved() {
    followMap = false;
    notifyListeners();
  }

  Future<void> logout() async {
    await ConfigStorage.clear();
    onLogout();
  }

  String? get lastSyncText {
    final t = lastModelSync ?? lastConfigSync;
    if (t == null) return null;
    final diff = DateTime.now().difference(t);
    if (diff.inSeconds < 60) return 'منذ ${diff.inSeconds} ث';
    if (diff.inMinutes < 60) return 'منذ ${diff.inMinutes} د';
    return 'منذ ${diff.inHours} س';
  }
}

class DriveSessionScope extends InheritedNotifier<DriveSession> {
  const DriveSessionScope({
    super.key,
    required DriveSession notifier,
    required super.child,
  }) : super(notifier: notifier);

  static DriveSession of(BuildContext context) {
    final scope = context.dependOnInheritedWidgetOfExactType<DriveSessionScope>();
    assert(scope != null, 'DriveSessionScope not found');
    return scope!.notifier!;
  }
}
