/// Road hazard types produced by the segmentation pipeline.
enum SegClass {
  background,
  pothole,
  speedBump,
}

extension SegClassX on SegClass {
  String get id {
    switch (this) {
      case SegClass.background:
        return 'background';
      case SegClass.pothole:
        return 'pothole';
      case SegClass.speedBump:
        return 'speed_bump';
    }
  }

  String get labelEn {
    switch (this) {
      case SegClass.background:
        return 'Background';
      case SegClass.pothole:
        return 'POTHOLE';
      case SegClass.speedBump:
        return 'SPEED BUMP';
    }
  }

  String get labelAr {
    switch (this) {
      case SegClass.background:
        return 'خلفية';
      case SegClass.pothole:
        return 'حفرة';
      case SegClass.speedBump:
        return 'مطب';
    }
  }

  static SegClass fromId(String raw) {
    final n = raw.toLowerCase().replaceAll(' ', '_');
    if (n.contains('pothole') || n.contains('حفر')) return SegClass.pothole;
    if (n.contains('bump') ||
        n.contains('speedbreaker') ||
        n.contains('speed_bump') ||
        n.contains('مطب')) {
      return SegClass.speedBump;
    }
    return SegClass.background;
  }
}

enum RiskLevel { low, medium, high }

extension RiskLevelX on RiskLevel {
  String get labelEn {
    switch (this) {
      case RiskLevel.low:
        return 'Low Risk';
      case RiskLevel.medium:
        return 'Medium Risk';
      case RiskLevel.high:
        return 'High Risk';
    }
  }

  String get labelAr {
    switch (this) {
      case RiskLevel.low:
        return 'خطورة منخفضة';
      case RiskLevel.medium:
        return 'خطورة متوسطة';
      case RiskLevel.high:
        return 'خطورة عالية';
    }
  }
}

/// Axis-aligned box in a specific coordinate space.
class BoundingBox {
  const BoundingBox({
    required this.left,
    required this.top,
    required this.right,
    required this.bottom,
  });

  final double left;
  final double top;
  final double right;
  final double bottom;

  double get width => right - left;
  double get height => bottom - top;
  double get centerX => (left + right) / 2;
  double get centerY => (top + bottom) / 2;
  double get area => width * height;

  BoundingBox lerp(BoundingBox other, double t) => BoundingBox(
        left: left + (other.left - left) * t,
        top: top + (other.top - top) * t,
        right: right + (other.right - right) * t,
        bottom: bottom + (other.bottom - bottom) * t,
      );

  double iou(BoundingBox other) {
    final ix1 = left > other.left ? left : other.left;
    final iy1 = top > other.top ? top : other.top;
    final ix2 = right < other.right ? right : other.right;
    final iy2 = bottom < other.bottom ? bottom : other.bottom;
    final iw = (ix2 - ix1).clamp(0, double.infinity);
    final ih = (iy2 - iy1).clamp(0, double.infinity);
    final inter = iw * ih;
    final union = area + other.area - inter;
    return union <= 0 ? 0 : inter / union;
  }
}

/// Single segmentation detection (pre-tracking).
class DetectionResult {
  const DetectionResult({
    required this.type,
    required this.confidence,
    required this.boundingBox,
    required this.centerX,
    required this.centerY,
    required this.area,
    required this.timestamp,
    this.contourPoints = const [],
    this.maskWidth = 0,
    this.maskHeight = 0,
  });

  final SegClass type;
  final double confidence;
  final BoundingBox boundingBox;
  final List<({double x, double y})> contourPoints;
  final double centerX;
  final double centerY;
  final double area;
  final DateTime timestamp;
  final int maskWidth;
  final int maskHeight;
}
