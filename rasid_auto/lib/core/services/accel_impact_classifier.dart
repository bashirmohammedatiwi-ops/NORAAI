import '../models/detection_result.dart';
import '../models/sensor_reading.dart';

/// Heuristic (and future ML) classifier for accelerometer impact patterns.
class AccelImpactClassifier {
  const AccelImpactClassifier();

  /// Returns probability-like scores for pothole vs speed bump from sensor window.
  ImpactClassification classify(AccelFeatures f, {double speedKmh = 0}) {
    final impact = f.impactScore;
    if (impact < 0.18) {
      return const ImpactClassification(
        kind: null,
        confidence: 0,
        label: 'none',
      );
    }

    // Potholes: sharp drop + rebound spike, short vibration.
    // Speed bumps: longer RMS elevation, lower sudden drop ratio.
    final dropRatio = f.peak <= 0 ? 0.0 : (f.suddenDrop / f.peak).clamp(0.0, 1.0);
    final durationNorm = (f.vibrationDurationMs / 400).clamp(0.0, 1.0);
    final reboundNorm = (f.rebound / 5.0).clamp(0.0, 1.0);

    var potholeScore =
        impact * 0.45 + dropRatio * 0.25 + reboundNorm * 0.2 - durationNorm * 0.15;
    var bumpScore =
        impact * 0.4 + durationNorm * 0.3 + (1 - dropRatio) * 0.15 + (f.rms / 4).clamp(0.0, 1.0) * 0.15;

    // Speed prior: stronger impacts at higher speed amplify both.
    if (speedKmh > 50) {
      potholeScore += 0.05;
      bumpScore += 0.08;
    }

    potholeScore = potholeScore.clamp(0.0, 1.0);
    bumpScore = bumpScore.clamp(0.0, 1.0);

    if (potholeScore >= bumpScore && potholeScore >= 0.35) {
      return ImpactClassification(
        kind: SegClass.pothole,
        confidence: potholeScore,
        label: 'pothole_like',
      );
    }
    if (bumpScore > potholeScore && bumpScore >= 0.35) {
      return ImpactClassification(
        kind: SegClass.speedBump,
        confidence: bumpScore,
        label: 'bump_like',
      );
    }
    return ImpactClassification(
      kind: null,
      confidence: impact,
      label: 'impact_unknown',
    );
  }
}

class ImpactClassification {
  const ImpactClassification({
    required this.kind,
    required this.confidence,
    required this.label,
  });

  final SegClass? kind;
  final double confidence;
  final String label;
}
