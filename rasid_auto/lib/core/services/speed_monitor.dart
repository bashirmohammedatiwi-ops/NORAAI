import '../models/detection.dart';

class SpeedViolationMonitor {
  SpeedViolationMonitor(this.rules);

  SpeedViolationRules rules;
  double? _overSinceMs;
  double _lastViolationMs = 0;

  /// Seconds left in the grace countdown while over limit (0 = not counting).
  double countdownRemaining = 0;

  ({bool shouldReport, double durationSeconds, double countdownRemaining}) update(
    double speedKmh,
    double limitKmh, [
    double? nowMs,
  ]) {
    if (!rules.enabled) {
      countdownRemaining = 0;
      _overSinceMs = null;
      return (shouldReport: false, durationSeconds: 0, countdownRemaining: 0);
    }
    final now = nowMs ?? DateTime.now().millisecondsSinceEpoch.toDouble();
    final threshold = limitKmh + rules.toleranceKmh;
    if (speedKmh <= threshold) {
      _overSinceMs = null;
      countdownRemaining = 0;
      return (shouldReport: false, durationSeconds: 0, countdownRemaining: 0);
    }

    _overSinceMs ??= now;
    final durationSeconds = (now - _overSinceMs!) / 1000;
    countdownRemaining =
        (rules.graceSeconds - durationSeconds).clamp(0.0, rules.graceSeconds);

    if (durationSeconds < rules.graceSeconds) {
      return (
        shouldReport: false,
        durationSeconds: durationSeconds,
        countdownRemaining: countdownRemaining,
      );
    }

    if (now - _lastViolationMs < rules.cooldownSeconds * 1000) {
      countdownRemaining = 0;
      return (
        shouldReport: false,
        durationSeconds: durationSeconds,
        countdownRemaining: 0,
      );
    }

    _lastViolationMs = now;
    _overSinceMs = null;
    countdownRemaining = 0;
    return (
      shouldReport: true,
      durationSeconds: durationSeconds,
      countdownRemaining: 0,
    );
  }
}
