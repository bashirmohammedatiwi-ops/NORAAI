import 'dart:typed_data';

import '../models/detection_result.dart';

/// Convert class mask → connected components → boxes + boundary contours.
class MaskToBoxes {
  const MaskToBoxes({
    this.minArea = 40,
    this.minConfidence = 0.18,
  });

  final int minArea;
  final double minConfidence;

  /// [mask] length = width*height, values = class id (0 bg, 1 pothole, 2 bump).
  List<DetectionResult> extract({
    required Int32List mask,
    required int width,
    required int height,
    Float32List? confidenceMap,
    DateTime? timestamp,
  }) {
    final ts = timestamp ?? DateTime.now();
    final visited = Uint8List(width * height);
    final results = <DetectionResult>[];

    for (var y = 0; y < height; y++) {
      for (var x = 0; x < width; x++) {
        final idx = y * width + x;
        if (visited[idx] == 1) continue;
        final cls = mask[idx];
        if (cls != 1 && cls != 2) {
          visited[idx] = 1;
          continue;
        }
        final component = _floodFill(
          mask: mask,
          visited: visited,
          width: width,
          height: height,
          startX: x,
          startY: y,
          target: cls,
        );
        if (component.area < minArea) continue;

        var confSum = 0.0;
        if (confidenceMap != null) {
          for (final p in component.pixels) {
            confSum += confidenceMap[p];
          }
        } else {
          confSum = component.area.toDouble();
        }
        final conf = (confSum / component.area).clamp(0.0, 1.0);
        if (conf < minConfidence) continue;

        final type = cls == 1 ? SegClass.pothole : SegClass.speedBump;
        final box = BoundingBox(
          left: component.minX.toDouble(),
          top: component.minY.toDouble(),
          right: component.maxX.toDouble() + 1,
          bottom: component.maxY.toDouble() + 1,
        );
        results.add(
          DetectionResult(
            type: type,
            confidence: conf,
            boundingBox: box,
            contourPoints: component.contour,
            centerX: box.centerX,
            centerY: box.centerY,
            area: box.area,
            timestamp: ts,
            maskWidth: width,
            maskHeight: height,
          ),
        );
      }
    }
    return results;
  }

  _Component _floodFill({
    required Int32List mask,
    required Uint8List visited,
    required int width,
    required int height,
    required int startX,
    required int startY,
    required int target,
  }) {
    final stackX = <int>[startX];
    final stackY = <int>[startY];
    final pixels = <int>[];
    var minX = startX, maxX = startX, minY = startY, maxY = startY;

    while (stackX.isNotEmpty) {
      final cx = stackX.removeLast();
      final cy = stackY.removeLast();
      if (cx < 0 || cy < 0 || cx >= width || cy >= height) continue;
      final i = cy * width + cx;
      if (visited[i] == 1) continue;
      if (mask[i] != target) continue;
      visited[i] = 1;
      pixels.add(i);
      if (cx < minX) minX = cx;
      if (cx > maxX) maxX = cx;
      if (cy < minY) minY = cy;
      if (cy > maxY) maxY = cy;
      stackX
        ..add(cx + 1)
        ..add(cx - 1)
        ..add(cx)
        ..add(cx);
      stackY
        ..add(cy)
        ..add(cy)
        ..add(cy + 1)
        ..add(cy - 1);
    }

    final contour = _boundaryContour(
      pixels: pixels,
      width: width,
      height: height,
      minX: minX,
      maxX: maxX,
      minY: minY,
      maxY: maxY,
    );

    return _Component(
      area: pixels.length,
      pixels: pixels,
      minX: minX,
      maxX: maxX,
      minY: minY,
      maxY: maxY,
      contour: contour,
    );
  }

  /// Compact boundary polyline for red-mask fill (like original U-Net overlay).
  List<({double x, double y})> _boundaryContour({
    required List<int> pixels,
    required int width,
    required int height,
    required int minX,
    required int maxX,
    required int minY,
    required int maxY,
  }) {
    final set = <int>{};
    for (final p in pixels) {
      set.add(p);
    }
    bool inside(int x, int y) {
      if (x < 0 || y < 0 || x >= width || y >= height) return false;
      return set.contains(y * width + x);
    }

    // Sample perimeter unused cleanup — leftEdge path only
    final rightEdge = <({double x, double y})>[];
    for (var y = minY; y <= maxY; y++) {
      var right = -1;
      for (var x = maxX; x >= minX; x--) {
        if (inside(x, y)) {
          right = x;
          break;
        }
      }
      if (right >= 0) {
        rightEdge.add((x: right.toDouble() + 1, y: y.toDouble()));
      }
    }
    // Closed silhouette: left edge top→bottom, right edge bottom→top.
    final leftEdge = <({double x, double y})>[];
    for (var y = minY; y <= maxY; y++) {
      for (var x = minX; x <= maxX; x++) {
        if (inside(x, y)) {
          leftEdge.add((x: x.toDouble(), y: y.toDouble()));
          break;
        }
      }
    }
    if (leftEdge.isEmpty) {
      return [
        (x: minX.toDouble(), y: minY.toDouble()),
        (x: maxX.toDouble() + 1, y: minY.toDouble()),
        (x: maxX.toDouble() + 1, y: maxY.toDouble() + 1),
        (x: minX.toDouble(), y: maxY.toDouble() + 1),
      ];
    }
    // Downsample for mobile paint performance.
    List<({double x, double y})> decimate(List<({double x, double y})> src) {
      if (src.length <= 48) return src;
      final step = (src.length / 40).ceil();
      final out = <({double x, double y})>[];
      for (var i = 0; i < src.length; i += step) {
        out.add(src[i]);
      }
      if (out.last != src.last) out.add(src.last);
      return out;
    }

    final left = decimate(leftEdge);
    final right = decimate(rightEdge.reversed.toList());
    return [...left, ...right];
  }
}

class _Component {
  const _Component({
    required this.area,
    required this.pixels,
    required this.minX,
    required this.maxX,
    required this.minY,
    required this.maxY,
    required this.contour,
  });

  final int area;
  final List<int> pixels;
  final int minX;
  final int maxX;
  final int minY;
  final int maxY;
  final List<({double x, double y})> contour;
}
