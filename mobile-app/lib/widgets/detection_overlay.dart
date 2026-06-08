import 'package:flutter/material.dart';

import '../models/detection.dart';

class DetectionOverlay extends StatelessWidget {
  const DetectionOverlay({
    super.key,
    required this.detections,
    required this.minConfidence,
    this.scanning = false,
  });

  final List<DetectionBox> detections;
  final double minConfidence;
  final bool scanning;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final w = constraints.maxWidth;
        final h = constraints.maxHeight;
        final boxes = <Widget>[];

        if (scanning) {
          boxes.add(
            Positioned(
              left: 0,
              right: 0,
              top: h * 0.45,
              child: Container(height: 2, color: const Color(0xCC2DD4BF)),
            ),
          );
        }

        for (final det in detections) {
          if (det.confidence < minConfidence || det.bbox.length < 4) continue;
          final color = classColor(det.className);
          var x1 = det.bbox[0];
          var y1 = det.bbox[1];
          var x2 = det.bbox[2];
          var y2 = det.bbox[3];

          double left, top, width, height;
          if (x2 <= 1.5 && y2 <= 1.5) {
            left = x1 * w;
            top = y1 * h;
            width = (x2 - x1) * w;
            height = (y2 - y1) * h;
          } else {
            left = x1;
            top = y1;
            width = x2 - x1;
            height = y2 - y1;
          }

          boxes.add(
            Positioned(
              left: left.clamp(0, w - 4),
              top: top.clamp(0, h - 4),
              width: width.clamp(4, w),
              height: height.clamp(4, h),
              child: Stack(
                clipBehavior: Clip.none,
                children: [
                  Positioned.fill(
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        border: Border.all(color: color, width: 2),
                        borderRadius: BorderRadius.circular(4),
                        boxShadow: [
                          BoxShadow(color: color.withValues(alpha: 0.55), blurRadius: 8),
                        ],
                      ),
                    ),
                  ),
                  Positioned(
                    top: -18,
                    left: 0,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: color,
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        '${det.className} ${(det.confidence * 100).toStringAsFixed(0)}%',
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 9,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          );
        }

        return Stack(fit: StackFit.expand, children: boxes);
      },
    );
  }
}
