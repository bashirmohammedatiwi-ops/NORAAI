import '../models/detection_result.dart';

/// Maps model/mask coordinates ↔ camera preview / screen coordinates.
class CoordinateConverter {
  const CoordinateConverter({
    required this.srcWidth,
    required this.srcHeight,
    required this.dstWidth,
    required this.dstHeight,
    this.letterbox = false,
    this.padX = 0,
    this.padY = 0,
    this.scale = 1,
  });

  final double srcWidth;
  final double srcHeight;
  final double dstWidth;
  final double dstHeight;
  final bool letterbox;
  final double padX;
  final double padY;
  final double scale;

  /// Stretch mapping (mask size → preview size).
  factory CoordinateConverter.stretch({
    required double maskW,
    required double maskH,
    required double previewW,
    required double previewH,
  }) {
    return CoordinateConverter(
      srcWidth: maskW,
      srcHeight: maskH,
      dstWidth: previewW,
      dstHeight: previewH,
      letterbox: false,
      scale: 1,
    );
  }

  /// Letterbox: content was scaled with pad on model input.
  factory CoordinateConverter.letterbox({
    required double maskW,
    required double maskH,
    required double previewW,
    required double previewH,
    required double padX,
    required double padY,
    required double scale,
  }) {
    return CoordinateConverter(
      srcWidth: maskW,
      srcHeight: maskH,
      dstWidth: previewW,
      dstHeight: previewH,
      letterbox: true,
      padX: padX,
      padY: padY,
      scale: scale,
    );
  }

  double mapX(double x) {
    if (letterbox) {
      return ((x - padX) / scale).clamp(0, dstWidth);
    }
    return x / srcWidth * dstWidth;
  }

  double mapY(double y) {
    if (letterbox) {
      return ((y - padY) / scale).clamp(0, dstHeight);
    }
    return y / srcHeight * dstHeight;
  }

  BoundingBox mapBox(BoundingBox box) => BoundingBox(
        left: mapX(box.left),
        top: mapY(box.top),
        right: mapX(box.right),
        bottom: mapY(box.bottom),
      );

  List<({double x, double y})> mapPoints(
    List<({double x, double y})> pts,
  ) =>
      pts.map((p) => (x: mapX(p.x), y: mapY(p.y))).toList();
}
