import '../models/detection.dart';

class DetectScheduler {
  int nextIntervalMs(ServerConfig cfg, double speedKmh, {int? lastLatencyMs}) {
    final fast = speedKmh >= cfg.speedFastKmh;
    var ms = fast ? cfg.scanIntervalFastMs : cfg.scanIntervalMs;
    if (cfg.scanFps > 0) {
      final fromFps = (1000 / cfg.scanFps).round();
      ms = fast ? (ms < fromFps ? ms : fromFps) : fromFps;
    }
    if (lastLatencyMs != null && lastLatencyMs > 900) {
      ms = (ms * 1.25).round();
    }
    return ms.clamp(500, 5000);
  }
}
