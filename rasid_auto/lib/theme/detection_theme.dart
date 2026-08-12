import 'package:flutter/material.dart';

import '../core/models/detection_result.dart';

/// ADAS-style detection colors by risk (editable theme constants).
class DetectionTheme {
  DetectionTheme._();

  static const low = Color(0xFF2ECC71);
  static const medium = Color(0xFFF5B301);
  static const high = Color(0xFFE53935);
  static const speedBump = Color(0xFF3D9CF0);
  static const labelBg = Color(0xCC0B0F14);
  static const strokeWidth = 2.5;

  static Color forRisk(RiskLevel risk) {
    switch (risk) {
      case RiskLevel.low:
        return low;
      case RiskLevel.medium:
        return medium;
      case RiskLevel.high:
        return high;
    }
  }

  static Color forType(SegClass type, RiskLevel risk) {
    if (type == SegClass.speedBump) {
      return Color.lerp(speedBump, forRisk(risk), 0.35)!;
    }
    return forRisk(risk);
  }

  static RiskLevel riskFromConfidence(double conf, {bool verified = false}) {
    final c = verified ? (conf + 0.1).clamp(0.0, 1.0) : conf;
    if (c >= 0.75) return RiskLevel.high;
    if (c >= 0.45) return RiskLevel.medium;
    return RiskLevel.low;
  }
}
