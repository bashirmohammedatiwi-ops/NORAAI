import '../models/detection.dart';

class SpeedViolationMonitor {
  SpeedViolationMonitor(this.rules);

  SpeedViolationRules rules;
  double? _overSinceMs;
  double _lastViolationMs = 0;

  ({bool shouldReport, double durationSeconds}) update(
    double speedKmh,
    double limitKmh, [
    double? nowMs,
  ]) {
    final now = nowMs ?? DateTime.now().millisecondsSinceEpoch.toDouble();
    final threshold = limitKmh + rules.toleranceKmh;
    if (speedKmh <= threshold) {
      _overSinceMs = null;
      return (shouldReport: false, durationSeconds: 0);
    }

    _overSinceMs ??= now;
    final durationSeconds = (now - _overSinceMs!) / 1000;
    if (durationSeconds < rules.graceSeconds) {
      return (shouldReport: false, durationSeconds: durationSeconds);
    }

    if (now - _lastViolationMs < rules.cooldownSeconds * 1000) {
      return (shouldReport: false, durationSeconds: durationSeconds);
    }

    _lastViolationMs = now;
    _overSinceMs = null;
    return (shouldReport: true, durationSeconds: durationSeconds);
  }
}
