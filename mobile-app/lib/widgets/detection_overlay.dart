import 'package:flutter/material.dart';

import '../models/detection.dart';
import '../utils/event_meta.dart';
import '../utils/preview_layout.dart';

/// رسم مباشر لنتائج الاكتشاف — بدون tracker أو رسوم متحركة.
class DetectionOverlay extends StatelessWidget {
  const DetectionOverlay({
    super.key,
    required this.detections,
    required this.minConfidence,
    this.layout,
  });

  final List<DetectionBox> detections;
  final double minConfidence;
  final PreviewLayout? layout;

  @override
  Widget build(BuildContext context) {
    final visible = detections
        .where((d) => d.confidence >= minConfidence && d.bbox.length >= 4)
        .toList();

    return IgnorePointer(
      child: CustomPaint(
        painter: _SimpleDetectPainter(detections: visible, layout: layout),
        child: const SizedBox.expand(),
      ),
    );
  }
}

class _SimpleDetectPainter extends CustomPainter {
  _SimpleDetectPainter({required this.detections, this.layout});

  final List<DetectionBox> detections;
  final PreviewLayout? layout;

  @override
  void paint(Canvas canvas, Size size) {
    for (final det in detections) {
      final rect = _toRect(det.bbox, size);
      if (rect.width < 6 || rect.height < 6) continue;

      final color = classColor(det.className);
      canvas.drawRect(
        rect,
        Paint()
          ..color = color
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2.5,
      );

      final label = '${classDisplayLabel(det.className)} ${(det.confidence * 100).round()}%';
      final tp = TextPainter(
        text: TextSpan(
          text: label,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 11,
            fontWeight: FontWeight.w600,
          ),
        ),
        textDirection: TextDirection.ltr,
      )..layout();

      final chipTop = rect.top - tp.height - 6 < 0 ? rect.bottom + 4 : rect.top - tp.height - 6;
      final chip = Rect.fromLTWH(rect.left, chipTop, tp.width + 8, tp.height + 4);
      canvas.drawRect(chip, Paint()..color = color.withValues(alpha: 0.9));
      tp.paint(canvas, Offset(chip.left + 4, chip.top + 2));
    }
  }

  Rect _toRect(List<double> bbox, Size size) {
    if (layout != null && bbox[2] <= 1.5 && bbox[3] <= 1.5) {
      return layout!.mapNormalizedBbox(bbox);
    }
    return Rect.fromLTRB(
      bbox[0] * size.width,
      bbox[1] * size.height,
      bbox[2] * size.width,
      bbox[3] * size.height,
    );
  }

  @override
  bool shouldRepaint(covariant _SimpleDetectPainter old) =>
      old.detections != detections || old.layout != layout;
}
