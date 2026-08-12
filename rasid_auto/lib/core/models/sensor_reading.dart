class AccelFeatures {
  const AccelFeatures({
    this.peak = 0,
    this.suddenDrop = 0,
    this.rebound = 0,
    this.vibrationDurationMs = 0,
    this.rms = 0,
    this.variance = 0,
    this.verticalPeak = 0,
  });

  final double peak;
  final double suddenDrop;
  final double rebound;
  final double vibrationDurationMs;
  final double rms;
  final double variance;
  final double verticalPeak;

  /// Continuous road vibration 0..100% (for HUD / map meter).
  /// Tuned so a still phone sits near 0 after gravity removal.
  double get vibrationPercent {
    final rmsScore = ((rms - 0.25) / 3.2).clamp(0.0, 1.0);
    final varScore = ((variance - 0.05) / 4.0).clamp(0.0, 1.0);
    final peakScore = ((verticalPeak - 0.4) / 5.0).clamp(0.0, 1.0);
    return ((rmsScore * 0.55 + varScore * 0.25 + peakScore * 0.2) * 100)
        .clamp(0.0, 100.0);
  }

  /// Heuristic 0..1 score for a road impact (pothole/bump).
  double get impactScore {
    final peakScore = (verticalPeak / 6.0).clamp(0.0, 1.0);
    final dropScore = (suddenDrop / 4.0).clamp(0.0, 1.0);
    final rmsScore = (rms / 3.0).clamp(0.0, 1.0);
    final varScore = (variance / 8.0).clamp(0.0, 1.0);
    return (peakScore * 0.35 +
            dropScore * 0.25 +
            rmsScore * 0.2 +
            varScore * 0.2)
        .clamp(0.0, 1.0);
  }
}

class GyroFeatures {
  const GyroFeatures({
    this.pitchRatePeak = 0,
    this.rollRatePeak = 0,
    this.yawRatePeak = 0,
    this.orientationJerk = 0,
  });

  final double pitchRatePeak;
  final double rollRatePeak;
  final double yawRatePeak;
  final double orientationJerk;

  /// High orientation change without vertical impact → likely camera shake.
  double get shakeScore {
    final orient = (orientationJerk / 5.0).clamp(0.0, 1.0);
    final roll = (rollRatePeak / 3.0).clamp(0.0, 1.0);
    return (orient * 0.6 + roll * 0.4).clamp(0.0, 1.0);
  }
}

class SensorSnapshot {
  const SensorSnapshot({
    required this.accel,
    required this.gyro,
    required this.timestamp,
  });

  final AccelFeatures accel;
  final GyroFeatures gyro;
  final DateTime timestamp;
}
