import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;

import 'package:camera/camera.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
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
import '../services/camera_frame_buffer.dart';
import '../services/api_service.dart';
import '../services/config_storage.dart';
import '../services/detect_scheduler.dart';
import '../services/following_distance_estimator.dart';
import '../services/gps_bootstrap.dart';
import '../services/heading_service.dart';
import '../services/local_onnx_detector.dart';
import '../services/location_service.dart';
import '../services/model_sync.dart';
import '../services/road_speed_service.dart';
import '../services/road_vibration_sensor.dart';
import '../services/speed_estimator.dart';
import '../services/speed_monitor.dart';
import '../features/emergency/models/hospital.dart';
import '../features/emergency/services/hospital_repository.dart';
import '../features/emergency/services/routing_service.dart';
import '../features/emergency/utils/accident_detection.dart';
import '../config/app_config.dart';
import '../config/detection_config.dart';
import '../config/offline_detection.dart';
import '../utils/event_meta.dart';
import '../utils/frame_compress.dart';
import '../utils/image_compress.dart';
import '../utils/map_geo.dart';
import '../utils/map_styles.dart';
import '../utils/platform_support.dart';

const appVersion = '3.13.0';

enum SyncPhase { idle, connecting, syncingConfig, syncingModel, ready, error }

class DriveSession extends ChangeNotifier {
  DriveSession(this.config, this.onLogout);

  final DriverConfig config;
  final VoidCallback onLogout;

  /// Set by [AppShell] to switch tabs from alerts / hub actions.
  void Function(int tab)? onNavigateTab;

  late final ApiService api = ApiService(config);
  late final RoadSpeedService roadSpeed = RoadSpeedService(api);
  late final LocationService locationService = LocationService();
  late final DetectScheduler scheduler = DetectScheduler();
  final mapController = MapController();
  final HeadingService headingService = HeadingService();
  final SpeedEstimator speedEstimator = SpeedEstimator();
  final RoadVibrationSensor roadVibration = RoadVibrationSensor();
  final LocalOnnxDetector localOnnx = LocalOnnxDetector();
  final FollowingDistanceEstimator followingDistanceEstimator = FollowingDistanceEstimator();
  final CameraFrameBuffer _frameBuffer = CameraFrameBuffer();
  FollowingDistanceState followingDistance = const FollowingDistanceState();
  DateTime? _lastHeadwayWarn;

  CameraController? camera;
  String? cameraError;
  bool cameraStarting = false;
  bool torchOn = false;
  String? nearbyError;
  DateTime? _lastTelemetryAt;
  int _bannerToken = 0;
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
  bool mapHeadingUp = false;
  DateTime? _lastUiNotify;
  bool _lastCamInit = false;
  String? _lastCamError;
  MapStyle mapStyle = MapStyle.drive;
  double _manualZoom = 0;
  List<LatLng> positionTrail = [];
  bool scanning = false;
  bool detectBusy = false;
  String? detectError;
  double displayHeading = 0;
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
  String? modelSyncError;
  DateTime? _lastModelSyncFailAt;
  bool _modelAutoSyncDone = false;
  int _failures = 0;
  bool _localOnnxPending = false;
  bool _onnxLoading = false;
  DateTime? _lastProgressNotify;
  DateTime? _cameraReadyAt;
  Future<void>? _cameraInitFuture;
  int _detectFailures = 0;
  int _localInferFailures = 0;
  bool _localInferBroken = false;
  Timer? _localRecoveryTimer;
  bool _localModelOnDisk = false;

  bool _camera2x = false;

  bool get camera2x => _camera2x;

  Future<void> toggleCamera2x() async {
    _camera2x = !_camera2x;
    if (camera != null) {
      await releaseCamera();
      requestCamera();
    }
    notifyListeners();
  }

  List<DetectionBox> detections = [];
  List<LiveAlert> liveAlerts = [];
  List<NearbyEvent> nearbyEvents = [];

  bool showEmergencySheet = false;
  bool accidentEmergencyActive = false;
  List<HospitalWithDistance> nearbyHospitals = [];
  Hospital? selectedHospital;
  List<LatLng> hospitalRoute = [];
  String? hospitalRouteSummary;
  bool hospitalRouting = false;
  DateTime? _lastAccidentEmergencyAt;

  Timer? _configTimer;
  Timer? _nearbyTimer;
  Timer? _detectTimer;
  Timer? _reconnectTimer;
  Timer? _gpsWatchdog;

  int get vibrationLevel => roadVibration.levelPercent;

  /// Config for detection — cached server config or offline defaults.
  ServerConfig? get effectiveCfg => serverCfg;

  double get displayMinConfidence {
    final cfg = effectiveCfg;
    if (cfg == null) return 0.32;
    return scheduler.displayMinConfidence(cfg);
  }

  double get vibrationIntensity => roadVibration.intensityMs2;

  String get vibrationLabel => roadVibration.labelAr;

  bool get vibrationSensorAvailable => roadVibration.available;

  bool get localInferenceReady => localOnnx.isReady;

  String? get localInferenceError => localOnnx.loadError;

  /// On-device ONNX when loaded and not failing repeatedly.
  bool get usesLocalInference =>
      supportsLocalInference && localOnnx.isReady && !_localInferBroken;

  /// Prefer local path when ONNX exists on disk (even while session is loading).
  bool get prefersLocalInference =>
      supportsLocalInference && (_localModelOnDisk || localOnnx.isReady);

  void _resetLocalInferState() {
    _localRecoveryTimer?.cancel();
    _localRecoveryTimer = null;
    _localInferBroken = false;
    _localInferFailures = 0;
  }

  void _scheduleLocalRecovery() {
    _localRecoveryTimer?.cancel();
    _localRecoveryTimer = Timer(const Duration(seconds: 45), () {
      _localInferBroken = false;
      _localInferFailures = 0;
      _localOnnxPending = true;
      unawaited(ensureLocalOnnx());
      _notifyThrottled();
    });
  }

  void _notifyThrottled() {
    final now = DateTime.now();
    if (_lastUiNotify != null && now.difference(_lastUiNotify!).inMilliseconds < 280) return;
    _lastUiNotify = now;
    notifyListeners();
  }

  void _onCameraChanged() {
    final cam = camera;
    if (cam == null) return;
    final init = cam.value.isInitialized;
    final err = cam.value.errorDescription;
    if (init != _lastCamInit || err != _lastCamError) {
      _lastCamInit = init;
      _lastCamError = err;
      _notifyThrottled();
    }
  }

  void start() {
    headingService.start();
    roadVibration.start(_notifyThrottled);
    unawaited(_bootstrapOffline());
    startGps();
    unawaited(_safeSyncAll());
    _configTimer = Timer.periodic(const Duration(seconds: 20), (_) => unawaited(_safeSyncConfig()));
    if (DetectionConfig.mapEventReporting) {
      _nearbyTimer = Timer.periodic(const Duration(seconds: 15), (_) => fetchNearby());
    }
  }

  /// الكاميرا نشطة والاكتشاف مفعّل.
  bool get overlayScanning =>
      effectiveCfg?.detectionEnabled == true && camera != null && camera!.value.isInitialized;

  Future<void> _safeSyncAll() async {
    try {
      await syncAll();
    } catch (e, st) {
      debugPrint('syncAll failed: $e\n$st');
      _onConnectionFailed(ApiException.fromError(e).displayMessage);
    }
  }

  Future<void> _safeSyncConfig() async {
    try {
      await syncConfig();
    } catch (e, st) {
      debugPrint('syncConfig failed: $e\n$st');
    }
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
    headingService.dispose();
    roadVibration.dispose();
    unawaited(localOnnx.dispose());
    api.dispose();
    super.dispose();
  }

  double? get speedKmh {
    final v = speedEstimator.displayKmh;
    return v?.toDouble();
  }

  double? get speedRawKmh => speedEstimator.smoothedKmh;

  double? get gpsAccuracyM => position?.accuracy;

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
    if (usesLocalInference || _localModelOnDisk) return 'محلي — بدون إنترنت';
    return connectionError ?? 'غير متصل';
  }

  Future<void> _loadModelCache() async {
    final cache = await ConfigStorage.loadModelCache();
    cachedModelVersion = cache.version;
    cachedModelSha256 = cache.sha256;
  }

  Future<void> _bootstrapOffline() async {
    await _loadModelCache();
    _localModelOnDisk = await _hasLocalModelOnDisk();
    final manifestClasses = _localModelOnDisk ? await _manifestClasses() : <String>[];

    final cachedCfg = await ConfigStorage.loadServerConfig();
    if (cachedCfg != null) {
      serverCfg = _localModelOnDisk
          ? OfflineDetection.preferLocal(cachedCfg, manifestClasses: manifestClasses)
          : cachedCfg;
      classMeta = buildClassMetaFromServer(serverCfg!.projectClasses, serverCfg!.alertTypes);
      _speedMonitor = SpeedViolationMonitor(serverCfg!.speedViolation);
      modelStatus = localOnnx.isReady
          ? 'محلي ONNX ⚡ · ${cachedModelVersion ?? "—"}'
          : (_localModelOnDisk ? 'جاهز محلياً — بدون إنترنت' : 'جاهز محلياً · ${cachedModelVersion ?? "—"}');
      syncPhase = SyncPhase.ready;
    } else if (_localModelOnDisk) {
      serverCfg = OfflineDetection.config(classes: manifestClasses);
      classMeta = buildClassMetaFromServer(serverCfg!.projectClasses, serverCfg!.alertTypes);
      _speedMonitor = SpeedViolationMonitor(serverCfg!.speedViolation);
      modelStatus = 'اكتشاف محلي — بدون إنترنت';
      syncPhase = SyncPhase.ready;
    }

    if (_localModelOnDisk) {
      _localOnnxPending = true;
      unawaited(ensureLocalOnnx());
    }
    notifyListeners();
  }

  Future<bool> _hasLocalModelOnDisk() async {
    final path = await ApiService.modelFilePath();
    final manifest = await ApiService.modelManifestPath();
    return await File(path).exists() && await File(manifest).exists();
  }

  Future<List<String>> _manifestClasses() async {
    try {
      final manifest = await ApiService.modelManifestPath();
      final raw = await File(manifest).readAsString();
      final json = jsonDecode(raw) as Map<String, dynamic>;
      return (json['classes'] as List<dynamic>?)?.map((e) => e.toString()).toList() ?? [];
    } catch (_) {
      return [];
    }
  }

  Future<void> syncAll() async {
    await syncConfig(forceModelSync: false);
    await fetchNearby(force: true);
  }

  Future<CameraController> _openCameraController(CameraDescription selected) async {
    final targetPreset = _camera2x ? ResolutionPreset.high : ResolutionPreset.low;

    // Low first — less motion blur copy + faster YUV→ONNX on device.
    final presets = supportsLocalInference
        ? [targetPreset, ResolutionPreset.medium, ResolutionPreset.high]
        : [ResolutionPreset.medium, ResolutionPreset.high];

    Object? lastError;
    for (final preset in presets) {
      final controller = CameraController(
        selected,
        preset,
        enableAudio: false,
        imageFormatGroup: kIsWeb ? null : ImageFormatGroup.yuv420,
      );
      controller.addListener(_onCameraChanged);
      try {
        await controller.initialize();
        if (controller.value.isInitialized) return controller;
        await controller.dispose();
      } catch (e) {
        lastError = e;
        await controller.dispose();
      }
    }
    throw lastError ?? StateError('camera init failed');
  }

  /// Lazy camera init — must run only when camera tab is visible (especially on web).
  Future<void> ensureCamera({bool force = false}) async {
    if (!force && camera != null && camera!.value.isInitialized) return;
    if (_cameraInitFuture != null) return _cameraInitFuture!;

    _cameraInitFuture = _ensureCameraImpl(force);
    try {
      await _cameraInitFuture;
    } finally {
      _cameraInitFuture = null;
    }
  }

  Future<void> _ensureCameraImpl(bool force) async {
    if (!force && camera != null && camera!.value.isInitialized) return;
    if (cameraStarting) return;

    cameraStarting = true;
    _cameraReadyAt = null;
    cameraError = null;
    _detectTimer?.cancel();
    notifyListeners();

    if (_localModelOnDisk || serverCfg?.modelReady == true) {
      unawaited(ensureLocalOnnx());
    }

    try {
      final cfg = serverCfg;
      if (localOnnx.isReady) {
        modelStatus = 'محلي ONNX ⚡ · ${cachedModelVersion ?? cfg?.modelVersion ?? "AI"}';
      } else if (cfg?.modelReady == true) {
        modelStatus = 'الموديل جاهز — ONNX عند إغلاق الكاميرا';
      }

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
        await _frameBuffer.detach(old);
        await old.dispose();
        if (kIsWeb) {
          await Future<void>.delayed(const Duration(milliseconds: 300));
        } else {
          await Future<void>.delayed(const Duration(milliseconds: 400));
        }
      }

      final controller = await _openCameraController(selected);

      if (!controller.value.isInitialized) {
        await controller.dispose();
        cameraError = 'تعذّر تشغيل بث الكاميرا';
        return;
      }

      try {
        await controller.setFocusMode(FocusMode.auto);
        await controller.setExposureMode(ExposureMode.auto);
      } catch (_) {}

      camera = controller;
      cameraError = null;
      _cameraReadyAt = DateTime.now();
      _detectFailures = 0;
      notifyListeners();

      // Let preview stabilize before image stream (prevents native crashes).
      await Future<void>.delayed(const Duration(milliseconds: 100));
      if (camera != controller || !controller.value.isInitialized) return;

      await _frameBuffer.attach(controller);
      await Future<void>.delayed(const Duration(milliseconds: 40));
      if (camera == controller && controller.value.isInitialized) {
        if (!localOnnx.isReady) {
          unawaited(ensureLocalOnnx());
        }
        scheduleNextDetect(8);
      }
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
    _cameraReadyAt = null;
    detectBusy = false;
    scanning = false;
    final old = camera;
    camera = null;
    cameraError = null;
    torchOn = false;
    detections = [];
    notifyListeners();
    if (old != null) {
      await _frameBuffer.detach(old);
      await old.dispose();
    }
    if (!localOnnx.isReady && serverCfg?.modelReady == true) {
      unawaited(ensureLocalOnnx());
    }
  }

  Future<void> syncConfig({bool forceModelSync = false}) async {
    if (syncingModel && !forceModelSync) return;

    syncPhase = SyncPhase.syncingConfig;
    notifyListeners();

    try {
      final cfg = await api.fetchConfig();
      serverCfg = cfg;
      await ConfigStorage.saveServerConfig(cfg);
      online = true;
      connectionError = null;
      _failures = 0;
      _reconnectTimer?.cancel();
      lastConfigSync = DateTime.now();
      configMessage = cfg.message;
      classMeta = buildClassMetaFromServer(cfg.projectClasses, cfg.alertTypes);
      _speedMonitor = SpeedViolationMonitor(cfg.speedViolation);

      if (cfg.modelReady) {
        modelSyncError = null;
        if (supportsLocalInference) {
          final serverSha = cfg.modelSha256?.toLowerCase();
          var localApplied = false;
          if (serverSha != null && serverSha.isNotEmpty) {
            localApplied = await _applyLocalModelIfReady(serverSha, cfg);
          }

          if (!localApplied) {
            final versionChanged = cfg.modelVersion != null &&
                cfg.modelVersion != cachedModelVersion &&
                cachedModelVersion != null;
            final shaChanged = serverSha != null &&
                cachedModelSha256 != null &&
                serverSha != cachedModelSha256!.toLowerCase();
            final needsModelSync = forceModelSync || versionChanged || shaChanged;
            final missingLocalCache = cachedModelVersion == null;
            final failCooldown = _lastModelSyncFailAt != null &&
                DateTime.now().difference(_lastModelSyncFailAt!) < const Duration(minutes: 30);

            if (forceModelSync) {
              await _syncModel(cfg, userInitiated: true);
            } else if (needsModelSync && !syncingModel && !failCooldown) {
              modelStatus = 'متصل — تحميل الموديل داخل التطبيق';
              syncPhase = SyncPhase.ready;
              unawaited(Future<void>.delayed(const Duration(seconds: 1), () => _syncModel(cfg)));
            } else if (missingLocalCache && !_modelAutoSyncDone && !syncingModel && !failCooldown) {
              _modelAutoSyncDone = true;
              modelStatus = 'متصل — تحميل الموديل داخل التطبيق';
              syncPhase = SyncPhase.ready;
              unawaited(Future<void>.delayed(const Duration(seconds: 1), () => _syncModel(cfg)));
            } else {
              modelStatus = localOnnx.isReady
                  ? 'محلي ONNX ⚡ · ${cachedModelVersion ?? cfg.modelVersion ?? "—"}'
                  : 'جاهز للتحميل · ${cachedModelVersion ?? cfg.modelVersion ?? "—"}';
              syncPhase = SyncPhase.ready;
              if (cachedModelSha256 != null) {
                _localOnnxPending = true;
                unawaited(ensureLocalOnnx());
              }
            }
          }
        } else {
          final label = cfg.modelName ?? cfg.modelVersion ?? '—';
          modelStatus = kIsWeb ? 'سيرفر (متصفح) · $label' : 'سيرفر · $label';
          syncPhase = SyncPhase.ready;
          if (cfg.detectionEnabled) {
            unawaited(api.warmupModel());
          }
        }
      } else {
        modelStatus = cfg.message ?? 'لا يوجد موديل — درّب وزامِن من لوحة التحكم';
        syncPhase = SyncPhase.ready;
      }
      notifyListeners();
    } on ApiException catch (e) {
      if (serverCfg == null) {
        final cached = await ConfigStorage.loadServerConfig();
        if (cached != null) {
          serverCfg = cached;
          classMeta = buildClassMetaFromServer(cached.projectClasses, cached.alertTypes);
          _speedMonitor = SpeedViolationMonitor(cached.speedViolation);
        } else if (await _hasLocalModelOnDisk()) {
          final classes = await _manifestClasses();
          serverCfg = OfflineDetection.config(classes: classes);
        }
      }
      _onConnectionFailed(e.displayMessage);
    } catch (e) {
      _onConnectionFailed(ApiException.fromError(e).displayMessage);
    }
  }

  Future<bool> _applyLocalModelIfReady(String sha, ServerConfig cfg) async {
    final localReady = await ModelSync.tryLocalReady(sha);
    if (localReady == null) return false;

    cachedModelVersion = localReady.version ?? cfg.modelVersion;
    cachedModelSha256 = localReady.sha256 ?? sha;
    await ConfigStorage.saveModelCache(
      version: cachedModelVersion,
      sha256: cachedModelSha256,
    );
    lastModelSync = DateTime.now();
    modelStatus = localReady.message;
    modelSyncError = null;
    _lastModelSyncFailAt = null;
    syncPhase = SyncPhase.ready;
    _localOnnxPending = true;
    unawaited(ensureLocalOnnx());
    return true;
  }

  Future<void> _syncModel(ServerConfig cfg, {bool userInitiated = false}) async {
    if (syncingModel) return;
    if (userInitiated) {
      _lastModelSyncFailAt = null;
    }

    syncingModel = true;
    syncPhase = SyncPhase.syncingModel;
    modelSyncProgress = 0;
    _lastProgressNotify = null;
    notifyListeners();

    try {
      final result = await ModelSync.sync(
        api,
        cfg.modelVersion,
        expectedSha256: cfg.modelSha256,
        onProgress: (p) {
          modelSyncProgress = p;
          final now = DateTime.now();
          if (_lastProgressNotify == null ||
              now.difference(_lastProgressNotify!).inMilliseconds >= 450 ||
              p >= 1.0) {
            _lastProgressNotify = now;
            _notifyThrottled();
          }
        },
      );

      if (result.ready) {
        cachedModelVersion = result.version ?? cfg.modelVersion;
        cachedModelSha256 = result.sha256 ?? cfg.modelSha256;
        await ConfigStorage.saveModelCache(
          version: cachedModelVersion,
          sha256: cachedModelSha256,
        );
        lastModelSync = DateTime.now();
        modelStatus = result.message;
        modelSyncError = null;
        _lastModelSyncFailAt = null;
        syncPhase = SyncPhase.ready;
        connectionError = null;
        _resetLocalInferState();
        if (result.path != null) {
          _localOnnxPending = true;
          unawaited(ensureLocalOnnx());
        }
      } else {
        modelStatus = 'اكتشاف سحابي · ${cfg.modelName ?? cfg.modelVersion ?? "—"}';
        modelSyncError = result.message;
        _lastModelSyncFailAt = DateTime.now();
        syncPhase = SyncPhase.ready;
      }
    } catch (e, st) {
      debugPrint('_syncModel failed: $e\n$st');
      modelStatus = 'اكتشاف سحابي · ${cfg.modelName ?? cfg.modelVersion ?? "—"}';
      modelSyncError = ApiException.fromError(e).displayMessage;
      _lastModelSyncFailAt = DateTime.now();
      syncPhase = SyncPhase.ready;
    } finally {
      syncingModel = false;
      notifyListeners();
    }
  }

  /// Load ONNX into app memory — can run in parallel with camera open.
  Future<void> ensureLocalOnnx() async {
    if (!supportsLocalInference || localOnnx.isReady || localOnnx.isLoading || _onnxLoading) {
      return;
    }
    if (!_localOnnxPending) {
      final path = await ApiService.modelFilePath();
      final manifest = await ApiService.modelManifestPath();
      if (!await File(path).exists() || !await File(manifest).exists()) return;
      _localOnnxPending = true;
    }

    _onnxLoading = true;
    try {
      final path = await ApiService.modelFilePath();
      final manifest = await ApiService.modelManifestPath();
      await localOnnx.load(modelPath: path, manifestPath: manifest);
      if (localOnnx.isReady) {
        _localOnnxPending = false;
        _localModelOnDisk = true;
        _resetLocalInferState();
        modelStatus = 'محلي ONNX ⚡ · ${cachedModelVersion ?? serverCfg?.modelVersion ?? "—"}';
        if (camera != null && camera!.value.isInitialized && _detectTimer == null) {
          scheduleNextDetect(8);
        }
        _notifyThrottled();
      }
    } catch (e, st) {
      debugPrint('ensureLocalOnnx failed: $e\n$st');
      if (!online) {
        modelSyncError = 'تعذّر تحميل ONNX محلياً';
      } else {
        modelSyncError = 'تعذّر تحميل ONNX — يُستخدم السيرفر';
      }
    } finally {
      _onnxLoading = false;
    }
  }

  Future<void> syncModelNow() async {
    _resetLocalInferState();
    final cfg = serverCfg;
    if (cfg == null) {
      await syncConfig(forceModelSync: true);
      return;
    }
    if (supportsLocalInference) {
      await _syncModel(cfg, userInitiated: true);
      await syncConfig();
    } else {
      modelSyncError = null;
      await api.warmupModel();
      await syncConfig();
      modelStatus = 'سيرفر · ${cfg.modelName ?? cfg.modelVersion ?? "—"} — متزامن';
      notifyListeners();
    }
  }

  void _onConnectionFailed(String message) {
    online = false;
    connectionError = message;
    _failures++;
    if (_localModelOnDisk) {
      syncPhase = SyncPhase.ready;
      modelStatus = localOnnx.isReady
          ? 'محلي ONNX ⚡ · ${cachedModelVersion ?? serverCfg?.modelVersion ?? "—"}'
          : 'محلي — بدون إنترنت';
      if (serverCfg != null && _localModelOnDisk) {
        unawaited(_manifestClasses().then((classes) {
          serverCfg = OfflineDetection.preferLocal(serverCfg!, manifestClasses: classes);
          notifyListeners();
        }));
      }
    } else {
      syncPhase = SyncPhase.error;
      modelStatus = message;
    }
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

    speedEstimator.update(pos);
    final gpsH = pos.heading;
    final spd = speedEstimator.smoothedKmh ?? 0;
    displayHeading = headingService.update(gpsHeading: gpsH, speedKmh: spd);
    _updateFollowingDistance();

    _appendTrail(pos);

    // Camera glide handled by [DriveMapView] when followMap is true.
    _notifyThrottled();
    unawaited(onPosition(pos));
  }

  LatLng get mapCenter {
    final pos = position;
    if (pos != null) return LatLng(pos.latitude, pos.longitude);
    return kDefaultMapCenter;
  }

  double get mapZoom {
    if (_manualZoom > 0) return _manualZoom;
    final pos = position;
    return zoomForDriving(
      speedKmh: speedKmh ?? 0,
      accuracyM: pos != null && pos.accuracy > 0 ? pos.accuracy : 40,
    );
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

    final speed = speedKmh ?? 0.0;

    final now = DateTime.now();
    if (_lastTelemetryAt == null || now.difference(_lastTelemetryAt!).inSeconds >= 10) {
      _lastTelemetryAt = now;
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
    }

    await roadSpeed.fetchIfNeeded(pos.latitude, pos.longitude, config.speedLimit);

    unawaited(locationService.reverseGeocode(pos.latitude, pos.longitude).then((p) {
      if (p != null && p != placeName) {
        placeName = p;
        _notifyThrottled();
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
          _showBanner('مخالفة سرعة: ${speed.round()} كم/س', const Duration(seconds: 4));
        }
      }
    }
  }

  Future<void> fetchNearby({bool force = false}) async {
    if (!DetectionConfig.mapEventReporting) return;
    final pos = position;
    if (pos == null) return;
    if (!force && !online) return;
    try {
      nearbyEvents = await api.fetchNearby(pos.latitude, pos.longitude);
      nearbyError = null;
      notifyListeners();
    } on ApiException catch (e) {
      nearbyError = e.displayMessage;
      notifyListeners();
    } catch (_) {
      nearbyError = 'تعذّر تحميل الأحداث القريبة';
      notifyListeners();
    }
  }

  Future<Uint8List?> _captureTakePicture(CameraController cam, int maxW, int q) async {
    try {
      final file = await cam.takePicture().timeout(const Duration(seconds: 4));
      final rawBytes = await file.readAsBytes();
      if (!kIsWeb) {
        unawaited(File(file.path).delete().catchError((_) => File(file.path)));
      }
      try {
        return await compute(compressFrameIsolate, [rawBytes, maxW, q]);
      } catch (_) {
        return compressJpegBytes(rawBytes, maxWidth: maxW, quality: q);
      }
    } catch (_) {
      return null;
    }
  }

  void scheduleNextDetect(int delayMs) {
    _detectTimer?.cancel();
    _detectTimer = Timer(Duration(milliseconds: delayMs), () async {
      final started = DateTime.now();
      await runDetect();
      final cfg = effectiveCfg;
      final pos = position;
      final useLocalLoop = prefersLocalInference || usesLocalInference;
      if (cfg == null || (!useLocalLoop && pos == null)) {
        scheduleNextDetect(400);
        return;
      }
      final speed = speedKmh ?? 0.0;
      final useLocal = usesLocalInference;
      final interval = useLocal
          ? scheduler.localIntervalMs(lastLatencyMs: lastLatencyMs)
          : scheduler.nextIntervalMs(cfg, speed, lastLatencyMs: lastLatencyMs);
      final elapsed = DateTime.now().difference(started).inMilliseconds;
      final floor = useLocal ? DetectionConfig.localDetectFloorMs : 120;
      scheduleNextDetect((interval - elapsed).clamp(floor, interval));
    });
  }

  Future<void> runDetect() async {
    final cfg = effectiveCfg;
    final cam = camera;
    final pos = position;
    if (cfg == null || cam == null || !cam.value.isInitialized) return;
    if (!cfg.detectionEnabled || detectBusy || cameraStarting) return;

    final readyAt = _cameraReadyAt;
    if (readyAt != null && DateTime.now().difference(readyAt).inMilliseconds < 50) {
      return;
    }

    final preferLocal = prefersLocalInference;
    final useLocal = usesLocalInference;
    if (!useLocal && !preferLocal && (pos == null || !online)) return;
    if (preferLocal && !localOnnx.isReady) {
      unawaited(ensureLocalOnnx());
    }
    if (!useLocal && preferLocal) {
      // Model on disk but still loading — keep loop alive, skip frame.
      detectError = 'جاري تحميل ONNX محلياً...';
      scanning = true;
      notifyListeners();
      return;
    }
    if (!useLocal && (pos == null || !online)) return;

    detectBusy = true;
    scanning = true;

    try {
      detectError = null;
      List<DetectionBox> boxes = [];
      int? latency;
      bool usedServerInfer = false;

      if (useLocal) {
        try {
          final inferMin = scheduler.localInferMinConfidence(cfg);
          final displayMin = scheduler.localDisplayMinConfidence(cfg);
          LocalDetectResult local;

          if (!kIsWeb && _frameBuffer.isAttached) {
            final prep = await _frameBuffer.captureOnnxInput(
              localOnnx.inputWidth,
              localOnnx.inputHeight,
              stretch: localOnnx.resizeStretch,
              fast: DetectionConfig.offlineFastPreprocess,
            );
            if (prep != null) {
              local = await localOnnx.detectFromPrep(
                prep,
                minConfidence: inferMin,
                iouThreshold: 0.45,
              );
            } else {
              final frameBytes = await _frameBuffer.captureJpeg(
                maxWidth: localOnnx.inputSize,
                quality: scheduler.localJpegQuality(),
              );
              if (frameBytes == null) {
                return;
              }
              local = await localOnnx.detect(
                frameBytes,
                minConfidence: inferMin,
                iouThreshold: 0.45,
              );
            }
          } else {
            final frameBytes = await _captureTakePicture(
              cam,
              localOnnx.inputSize,
              scheduler.localJpegQuality(),
            );
            if (frameBytes == null) {
              _detectFailures++;
              detectError = 'تعذّر التقاط إطار';
              return;
            }
            local = await localOnnx.detect(
              frameBytes,
              minConfidence: inferMin,
              iouThreshold: 0.45,
            );
          }

          boxes = local.boxes
              .where((d) => d.confidence >= displayMin && d.bbox.length >= 4)
              .toList();
          latency = local.latencyMs;
          _detectFailures = 0;
          _localInferFailures = 0;
        } catch (e, st) {
          debugPrint('Local ONNX detect failed: $e\n$st');
          _localInferFailures++;
          if (_localInferFailures >= 3) {
            _localInferBroken = true;
            _localOnnxPending = true;
            unawaited(localOnnx.dispose());
            _scheduleLocalRecovery();
          }
        }
      }

      final skipCloud = DetectionConfig.localOnlyWhenReady &&
          (usesLocalInference || _localModelOnDisk);
      final canServer = !skipCloud && online && pos != null && cfg.modelReady;

      Uint8List? frameBytes;
      if (canServer && boxes.isEmpty) {
        final maxW = scheduler.captureWidth(cfg, lastLatencyMs: lastLatencyMs);
        final q = scheduler.jpegQuality(cfg, lastLatencyMs: lastLatencyMs);
        if (!kIsWeb && _frameBuffer.isAttached) {
          frameBytes = await _frameBuffer.captureJpeg(maxWidth: maxW, quality: q);
        } else {
          frameBytes = await _captureTakePicture(cam, maxW, q);
        }
      }

      if (boxes.isEmpty && canServer && frameBytes != null) {
        final gps = pos;
        final sw = Stopwatch()..start();
        final result = await api.detectFrameBytes(
          bytes: frameBytes,
          filename: 'frame.jpg',
          latitude: gps.latitude,
          longitude: gps.longitude,
          speed: speedKmh,
          speedLimit: roadSpeed.cached.limit,
          minConfidence: cfg.minConfidence,
        );
        latency = result.latencyMs ?? sw.elapsedMilliseconds;
        final displayMin = scheduler.displayMinConfidence(cfg);
        boxes = result.detections
            .where((d) => d.confidence >= displayMin && d.bbox.length >= 4)
            .toList();
        usedServerInfer = true;
        if (boxes.isNotEmpty) detectError = null;
        if (DetectionConfig.mapEventReporting) {
          unawaited(_handleDetectEvents(result.eventsCreated, result.alerts));
        }
      }

      detections = boxes;
      if (latency != null) lastLatencyMs = latency;

      if (detections.isEmpty && detectError == null) {
        if (preferLocal && !localOnnx.isReady) {
          detectError = 'جاري تحميل الموديل المحلي...';
        } else if (!preferLocal && !canServer && pos == null) {
          detectError = 'انتظر GPS للاكتشاف السحابي';
        } else if (!preferLocal && !canServer && !online) {
          detectError = 'لا يوجد اتصال — زامِن الموديل مرة واحدة';
        } else if (_localInferBroken && _localModelOnDisk && !online) {
          detectError = 'الموديل المحلي معطّل — أعد فتح التطبيق';
        } else if (_localInferBroken && !skipCloud && !usedServerInfer) {
          detectError = 'الموديل المحلي معطّل — جاري التحويل للسيرفر';
        } else if (usedServerInfer) {
          detectError = null;
        }
      }

      _updateFollowingDistance();
      _checkAccidentEmergency(boxes, cfg);

      if (DetectionConfig.mapEventReporting &&
          online &&
          pos != null &&
          detections.isNotEmpty &&
          !usedServerInfer) {
        unawaited(api.reportLocalDetections(
          latitude: pos.latitude,
          longitude: pos.longitude,
          detections: detections,
          minConfidence: cfg.minConfidence,
        ).then((report) => _handleDetectEvents(report.eventsCreated, report.alerts)));
      }
    } on ApiException catch (e) {
      detections = [];
      detectError = e.displayMessage;
      if (!online) connectionError = e.displayMessage;
    } catch (e, st) {
      debugPrint('runDetect failed: $e\n$st');
      detections = [];
      detectError = e is StateError
          ? e.message
          : ApiException.fromError(e).displayMessage;
    } finally {
      detectBusy = false;
      scanning = false;
      if (usesLocalInference || prefersLocalInference) {
        notifyListeners();
      } else {
        _notifyThrottled();
      }
    }
  }

  void _updateFollowingDistance() {
    final cfg = serverCfg;
    followingDistance = followingDistanceEstimator.update(
      detections: detections,
      speedKmh: speedKmh,
      safeHeadwaySec: 2.0,
      minConfidence: (cfg?.minConfidence ?? 0.35) * 0.85,
    );
    _maybeWarnHeadway();
  }

  void _maybeWarnHeadway() {
    if (!followingDistance.tooClose) return;
    final speed = speedKmh ?? 0;
    if (speed < 25) return;
    final now = DateTime.now();
    if (_lastHeadwayWarn != null && now.difference(_lastHeadwayWarn!).inSeconds < 12) {
      return;
    }
    _lastHeadwayWarn = now;
    final dist = followingDistance.distanceM?.round();
    final headway = followingDistance.headwaySec?.toStringAsFixed(1);
    _showBanner(
      dist != null
          ? 'قرب زائد! $dist م · ${headway ?? "?"} ث'
          : 'قرب زائد من المركبة الأمامية',
      const Duration(seconds: 3),
    );
    if (supportsVibration) {
      unawaited(Vibration.vibrate(duration: 300));
    }
  }

  Future<void> _handleDetectEvents(int eventsCreated, List<dynamic> alerts) async {
    for (final raw in alerts) {
      if (raw is! Map<String, dynamic>) continue;
      final alert = LiveAlert.fromDetect(raw);
      final type = alert.type.toLowerCase();
      if (DetectionConfig.accidentEmergencyEnabled &&
          (type.contains('accident') || type == 'moderate' || type == 'severe')) {
        _triggerAccidentEmergency();
      }
      if (DetectionConfig.mapEventReporting) {
        pushLiveAlert(alert);
      }
    }
    if (!DetectionConfig.mapEventReporting || eventsCreated <= 0) return;
    eventsCount += eventsCreated;
    if (supportsVibration && await Vibration.hasVibrator() == true) {
      await Vibration.vibrate(duration: 200);
    }
    unawaited(fetchNearby(force: true));
  }

  void pushLiveAlert(LiveAlert alert) {
    liveAlerts = [alert, ...liveAlerts].take(10).toList();
    _showBanner(alert.label, const Duration(seconds: 3));
  }

  void _showBanner(String text, Duration duration) {
    final token = ++_bannerToken;
    bannerText = text;
    notifyListeners();
    Future.delayed(duration, () {
      if (_bannerToken == token && bannerText == text) {
        bannerText = null;
        notifyListeners();
      }
    });
  }

  void _checkAccidentEmergency(List<DetectionBox> boxes, ServerConfig cfg) {
    if (!DetectionConfig.accidentEmergencyEnabled) return;

    final classes = cfg.classes.isNotEmpty
        ? cfg.classes
        : (cfg.modelClasses.isNotEmpty ? cfg.modelClasses : localOnnx.classNames);
    if (!modelSupportsAccidentDetection(classes)) return;

    final minConf = DetectionConfig.accidentEmergencyMinConfidence;
    for (final box in boxes) {
      if (isAccidentDetection(box, minConfidence: minConf)) {
        _triggerAccidentEmergency();
        return;
      }
    }
  }

  void _triggerAccidentEmergency() {
    final now = DateTime.now();
    final cooldown = DetectionConfig.accidentEmergencyCooldownSec;
    if (_lastAccidentEmergencyAt != null &&
        now.difference(_lastAccidentEmergencyAt!).inSeconds < cooldown &&
        showEmergencySheet) {
      return;
    }
    _lastAccidentEmergencyAt = now;
    accidentEmergencyActive = true;
    showEmergencySheet = true;
    unawaited(_refreshNearbyHospitals());
    _showBanner('🚨 تم رصد حادث — اتصل 115 فوراً', const Duration(seconds: 5));
    if (supportsVibration) {
      unawaited(Vibration.vibrate(pattern: [0, 350, 150, 350]));
    }
    notifyListeners();
  }

  Future<void> _refreshNearbyHospitals() async {
    final pos = position;
    if (pos != null) {
      nearbyHospitals = HospitalRepository.nearest(pos.latitude, pos.longitude);
    } else {
      nearbyHospitals = HospitalRepository.all
          .take(8)
          .map((h) => HospitalWithDistance(hospital: h, distanceM: 0))
          .toList();
    }
    notifyListeners();
  }

  void dismissEmergencyPanel() {
    showEmergencySheet = false;
    accidentEmergencyActive = false;
    notifyListeners();
  }

  void openEmergencyPanel({bool fromAccident = false}) {
    if (fromAccident) accidentEmergencyActive = true;
    showEmergencySheet = true;
    unawaited(_refreshNearbyHospitals());
    notifyListeners();
  }

  // For app_shell to navigate to a specific hospital from general emergency sheet.
  Future<void> navigateToHospital(Hospital hospital, BuildContext context) => _navigateToHospital(hospital, context);

  // For hospitals_screen to navigate to a specific hospital from browse view.
  Future<void> navigateToHospitalFromBrowse(Hospital hospital, BuildContext context) => _navigateToHospital(hospital, context);


  Future<void> _navigateToHospital(Hospital hospital, BuildContext context) async {
    final pos = position;
    selectedHospital = hospital;
    hospitalRouting = true;
    hospitalRoute = [];
    hospitalRouteSummary = null;
    followMap = true;
    notifyListeners();

    if (pos == null) {
      hospitalRouting = false;
      notifyListeners();
      return;
    }

    final from = LatLng(pos.latitude, pos.longitude);
    final to = LatLng(hospital.latitude, hospital.longitude);
    final route = await RoutingService.fetchDrivingRoute(from, to);
    hospitalRouting = false;
    if (route != null) {
      hospitalRoute = route.points;
      hospitalRouteSummary = route.summaryAr;
      _fitMapToRoute(from, to);
      onNavigateTab?.call(1);
    }
    notifyListeners();
  }

  void clearHospitalRoute() {
    selectedHospital = null;
    hospitalRoute = [];
    hospitalRouteSummary = null;
    notifyListeners();
  }

  void _fitMapToRoute(LatLng from, LatLng to) {
    try {
      final minLat = math.min(from.latitude, to.latitude);
      final maxLat = math.max(from.latitude, to.latitude);
      final minLon = math.min(from.longitude, to.longitude);
      final maxLon = math.max(from.longitude, to.longitude);
      final bounds = LatLngBounds(LatLng(minLat, minLon), LatLng(maxLat, maxLon));
      mapController.fitCamera(
        CameraFit.bounds(bounds: bounds, padding: const EdgeInsets.all(48)),
      );
      followMap = false;
    } catch (_) {}
  }

  Future<void> toggleTorch() async {
    final cam = camera;
    if (cam == null || !cam.value.isInitialized) return;
    try {
      final next = !torchOn;
      await cam.setFlashMode(next ? FlashMode.torch : FlashMode.off);
      torchOn = next;
      notifyListeners();
    } catch (_) {}
  }

  void focusMapOn(double lat, double lon, {double? zoom}) {
    followMap = false;
    _manualZoom = zoom ?? 17.0;
    final center = LatLng(lat, lon);
    if (mapHeadingUp) {
      mapController.moveAndRotate(center, _manualZoom, -displayHeading);
    } else {
      mapController.move(center, _manualZoom);
    }
    notifyListeners();
  }

  void openEventOnMap(double lat, double lon) {
    focusMapOn(lat, lon);
    onNavigateTab?.call(1);
  }

  void _appendTrail(Position pos) {
    final pt = LatLng(pos.latitude, pos.longitude);
    if (positionTrail.isEmpty) {
      positionTrail.add(pt);
      return;
    }
    final last = positionTrail.last;
    if (distanceMeters(last.latitude, last.longitude, pt.latitude, pt.longitude) >= 2.5) {
      positionTrail.add(pt);
      if (positionTrail.length > 400) {
        positionTrail.removeRange(0, positionTrail.length - 400);
      }
    }
  }

  void locateNow() {
    if (position == null) return;
    followMap = true;
    _manualZoom = 0;
    notifyListeners();
  }

  void zoomMapIn() {
    followMap = false;
    _manualZoom = (mapController.camera.zoom + 0.8).clamp(12.0, 19.0);
    mapController.move(mapController.camera.center, _manualZoom);
    notifyListeners();
  }

  void zoomMapOut() {
    followMap = false;
    _manualZoom = (mapController.camera.zoom - 0.8).clamp(12.0, 19.0);
    mapController.move(mapController.camera.center, _manualZoom);
    notifyListeners();
  }

  void cycleMapStyle() {
    final styles = MapStyle.values;
    mapStyle = styles[(mapStyle.index + 1) % styles.length];
    notifyListeners();
  }

  void toggleFollow() {
    followMap = !followMap;
    notifyListeners();
  }

  void toggleMapHeadingUp() {
    mapHeadingUp = !mapHeadingUp;
    if (!mapHeadingUp) {
      mapController.rotate(0);
    } else if (followMap) {
      mapController.rotate(-displayHeading);
    }
    notifyListeners();
  }

  void onMapMoved() {
    followMap = false;
    _manualZoom = mapController.camera.zoom;
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
