import '../models/detection.dart';

/// Rotate normalized bbox 90° clockwise to match on-screen preview orientation.
List<double> rotateNormBbox90CW(List<double> bbox) {
  if (bbox.length < 4) return bbox;
  final x1 = bbox[0];
  final y1 = bbox[1];
  final x2 = bbox[2];
  final y2 = bbox[3];

  final xs = [y1, y1, y2, y2];
  final ys = [1.0 - x1, 1.0 - x2, 1.0 - x1, 1.0 - x2];

  return [
    xs.reduce((a, b) => a < b ? a : b).clamp(0.0, 1.0),
    ys.reduce((a, b) => a < b ? a : b).clamp(0.0, 1.0),
    xs.reduce((a, b) => a > b ? a : b).clamp(0.0, 1.0),
    ys.reduce((a, b) => a > b ? a : b).clamp(0.0, 1.0),
  ];
}

List<double> mirrorNormBboxX(List<double> bbox) {
  if (bbox.length < 4) return bbox;
  return [
    (1.0 - bbox[2]).clamp(0.0, 1.0),
    bbox[1].clamp(0.0, 1.0),
    (1.0 - bbox[0]).clamp(0.0, 1.0),
    bbox[3].clamp(0.0, 1.0),
  ];
}

List<double> rotateNormBboxByDegrees(List<double> bbox, int degrees) {
  final d = ((degrees % 360) + 360) % 360;
  if (d == 0) return bbox;
  if (d == 90) return rotateNormBbox90CW(bbox);
  if (d == 180) {
    return [
      (1.0 - bbox[2]).clamp(0.0, 1.0),
      (1.0 - bbox[3]).clamp(0.0, 1.0),
      (1.0 - bbox[0]).clamp(0.0, 1.0),
      (1.0 - bbox[1]).clamp(0.0, 1.0),
    ];
  }
  if (d == 270) {
    final x1 = bbox[0];
    final y1 = bbox[1];
    final x2 = bbox[2];
    final y2 = bbox[3];
    final xs = [1.0 - y1, 1.0 - y1, 1.0 - y2, 1.0 - y2];
    final ys = [x1, x2, x1, x2];
    return [
      xs.reduce((a, b) => a < b ? a : b).clamp(0.0, 1.0),
      ys.reduce((a, b) => a < b ? a : b).clamp(0.0, 1.0),
      xs.reduce((a, b) => a > b ? a : b).clamp(0.0, 1.0),
      ys.reduce((a, b) => a > b ? a : b).clamp(0.0, 1.0),
    ];
  }
  return bbox;
}

List<double> transformNormBboxForPreview({
  required List<double> bbox,
  required int rotationDegrees,
  required bool mirrorX,
}) {
  var out = rotateNormBboxByDegrees(bbox, rotationDegrees);
  if (mirrorX) out = mirrorNormBboxX(out);
  return out;
}

DetectionBox mapDetectionToPreview(
  DetectionBox box, {
  required int rotationDegrees,
  required bool mirrorX,
}) {
  if (box.bbox.length < 4) return box;
  return DetectionBox(
    className: box.className,
    confidence: box.confidence,
    bbox: transformNormBboxForPreview(
      bbox: box.bbox,
      rotationDegrees: rotationDegrees,
      mirrorX: mirrorX,
    ),
    eventType: box.eventType,
  );
}

List<DetectionBox> mapDetectionsToPreview(
  List<DetectionBox> boxes, {
  required int rotationDegrees,
  required bool mirrorX,
}) {
  if (rotationDegrees == 0 && !mirrorX) return boxes;
  return boxes
      .map((b) => mapDetectionToPreview(b, rotationDegrees: rotationDegrees, mirrorX: mirrorX))
      .toList();
}
