import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../core/models/detection.dart';
import '../../core/models/detection_box.dart';
import '../../core/models/detection_result.dart';
import '../../core/models/tracked_object.dart';
import '../../theme/rasid_theme.dart';

/// Live ADAS overlay — cloud YOLO boxes and optional legacy mask tracks.
class DetectionOverlay extends StatelessWidget {
  const DetectionOverlay({
    super.key,
    required this.tracks,
    this.cloudBoxes = const [],
    this.referenceWidth = 1280,
    this.referenceHeight = 720,
    this.maskBytes,
    this.maskWidth = 0,
    this.maskHeight = 0,
    this.debugMode = false,
    this.cameraFps = 0,
    this.inferenceFps = 0,
    this.preprocessMs = 0,
    this.inferenceMs = 0,
    this.postprocessMs = 0,
    this.totalLatencyMs = 0,
    this.accelPeak = 0,
    this.gyroShake = 0,
    this.droppedBusy = 0,
    this.droppedSkip = 0,
  });

  final List<TrackedObject> tracks;
  final List<DetectionBox> cloudBoxes;
  final double referenceWidth;
  final double referenceHeight;
  final Uint8List? maskBytes;
  final int maskWidth;
  final int maskHeight;
  final bool debugMode;
  final double cameraFps;
  final double inferenceFps;
  final int preprocessMs;
  final int inferenceMs;
  final int postprocessMs;
  final int totalLatencyMs;
  final double accelPeak;
  final double gyroShake;
  final int droppedBusy;
  final int droppedSkip;

  @override
  Widget build(BuildContext context) {
    return Stack(
      fit: StackFit.expand,
      children: [
        CustomPaint(
          painter: _LiveMaskPainter(
            tracks: tracks,
            cloudBoxes: cloudBoxes,
            referenceWidth: referenceWidth,
            referenceHeight: referenceHeight,
            maskBytes: maskBytes,
            maskWidth: maskWidth,
            maskHeight: maskHeight,
          ),
          child: const SizedBox.expand(),
        ),
        if (debugMode)
          Positioned(
            top: 8,
            left: 8,
            child: Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: Colors.black.withValues(alpha: 0.72),
                borderRadius: BorderRadius.circular(8),
              ),
              child: DefaultTextStyle(
                style: GoogleFonts.cairo(
                  color: RasidColors.safety,
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  height: 1.25,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Cloud ${cloudBoxes.length} · ${inferenceMs}ms'),
                    Text('Cam FPS  ${cameraFps.toStringAsFixed(1)}'),
                    Text('Total    ${totalLatencyMs}ms'),
                    Text('TRK ${tracks.length}'),
                  ],
                ),
              ),
            ),
          ),
      ],
    );
  }
}

class _LiveMaskPainter extends CustomPainter {
  _LiveMaskPainter({
    required this.tracks,
    required this.cloudBoxes,
    required this.referenceWidth,
    required this.referenceHeight,
    required this.maskBytes,
    required this.maskWidth,
    required this.maskHeight,
  });

  final List<TrackedObject> tracks;
  final List<DetectionBox> cloudBoxes;
  final double referenceWidth;
  final double referenceHeight;
  final Uint8List? maskBytes;
  final int maskWidth;
  final int maskHeight;

  static const _red = Color(0xFFE53935);

  @override
  void paint(Canvas canvas, Size size) {
    for (final box in cloudBoxes) {
      _paintCloudBox(canvas, size, box);
    }

    final bytes = maskBytes;
    if (bytes != null &&
        maskWidth > 0 &&
        maskHeight > 0 &&
        bytes.length >= maskWidth * maskHeight) {
      _paintDenseMask(canvas, size, bytes);
    }

    for (final t in tracks) {
      if (t.missedFrames > 2) continue;
      if (t.type != SegClass.pothole && t.type != SegClass.speedBump) continue;

      final conf =
          ((t.finalConfidence > 0 ? t.finalConfidence : t.confidence) * 100)
              .round();
      final box = t.smoothedBoundingBox;
      final tp = TextPainter(
        text: TextSpan(
          text: '${t.type.labelAr} $conf%',
          style: TextStyle(
            color: Colors.white,
            fontSize: 11,
            fontWeight: FontWeight.w800,
            shadows: [
              Shadow(color: Colors.black.withValues(alpha: 0.75), blurRadius: 4),
            ],
          ),
        ),
        textDirection: TextDirection.rtl,
      )..layout();
      final lx = box.left.clamp(4.0, size.width - tp.width - 4);
      final ly = (box.top - tp.height - 4).clamp(4.0, size.height - tp.height);
      tp.paint(canvas, Offset(lx, ly));
    }
  }

  void _paintCloudBox(Canvas canvas, Size size, DetectionBox box) {
    if (box.bbox.length < 4) return;
    final rect = _bboxToRect(box.bbox, size);
    if (rect.isEmpty) return;

    final color = hazardColor(box.className);
    final paint = Paint()
      ..color = color.withValues(alpha: 0.22)
      ..style = PaintingStyle.fill;
    canvas.drawRect(rect, paint);
    canvas.drawRect(
      rect,
      Paint()
        ..color = color
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.5,
    );

    final label =
        '${hazardLabelAr(box.className)} ${(box.confidence * 100).round()}%';
    final tp = TextPainter(
      text: TextSpan(
        text: label,
        style: const TextStyle(
          color: Colors.white,
          fontSize: 11,
          fontWeight: FontWeight.w800,
        ),
      ),
      textDirection: TextDirection.rtl,
    )..layout(maxWidth: size.width - 8);
    final lx = rect.left.clamp(4.0, size.width - tp.width - 4);
    final ly = (rect.top - tp.height - 4).clamp(4.0, size.height - tp.height);
    final bg = Rect.fromLTWH(lx - 4, ly - 2, tp.width + 8, tp.height + 4);
    canvas.drawRRect(
      RRect.fromRectAndRadius(bg, const Radius.circular(4)),
      Paint()..color = color.withValues(alpha: 0.85),
    );
    tp.paint(canvas, Offset(lx, ly));
  }

  Rect _bboxToRect(List<double> bbox, Size size) {
    var x1 = bbox[0];
    var y1 = bbox[1];
    var x2 = bbox[2];
    var y2 = bbox[3];
    final maxVal = [x1, y1, x2, y2].reduce((a, b) => a > b ? a : b);

    if (maxVal <= 1.0) {
      return Rect.fromLTRB(
        x1 * size.width,
        y1 * size.height,
        x2 * size.width,
        y2 * size.height,
      );
    }

    final refW = referenceWidth > 0 ? referenceWidth : 1280.0;
    final refH = referenceHeight > 0 ? referenceHeight : 720.0;
    final sx = size.width / refW;
    final sy = size.height / refH;
    return Rect.fromLTRB(x1 * sx, y1 * sy, x2 * sx, y2 * sy);
  }

  void _paintDenseMask(Canvas canvas, Size size, Uint8List bytes) {
    final sx = size.width / maskWidth;
    final sy = size.height / maskHeight;
    final core = Path();
    final mid = Path();

    for (var y = 0; y < maskHeight; y++) {
      var x = 0;
      while (x < maskWidth) {
        final v = bytes[y * maskWidth + x];
        if (v < 36) {
          x++;
          continue;
        }
        final strong = v >= 140;
        var x2 = x + 1;
        while (x2 < maskWidth) {
          final v2 = bytes[y * maskWidth + x2];
          if (v2 < 36 || (v2 >= 140) != strong) break;
          x2++;
        }
        final r = Rect.fromLTRB(x * sx, y * sy, x2 * sx, (y + 1) * sy + 0.4);
        if (strong) {
          core.addRect(r);
        } else {
          mid.addRect(r);
        }
        x = x2;
      }
    }

    if (!mid.getBounds().isEmpty || !core.getBounds().isEmpty) {
      final halo = Path()
        ..addPath(mid, Offset.zero)
        ..addPath(core, Offset.zero);
      canvas.drawPath(
        halo,
        Paint()
          ..color = _red.withValues(alpha: 0.20)
          ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 18),
      );
    }
    if (!mid.getBounds().isEmpty) {
      canvas.drawPath(
        mid,
        Paint()
          ..color = _red.withValues(alpha: 0.30)
          ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 8),
      );
    }
    if (!core.getBounds().isEmpty) {
      canvas.drawPath(
        core,
        Paint()
          ..color = _red.withValues(alpha: 0.50)
          ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 5),
      );
    }
  }

  @override
  bool shouldRepaint(covariant _LiveMaskPainter old) {
    return old.tracks != tracks ||
        old.cloudBoxes != cloudBoxes ||
        old.referenceWidth != referenceWidth ||
        old.referenceHeight != referenceHeight ||
        old.maskBytes != maskBytes ||
        old.maskWidth != maskWidth ||
        old.maskHeight != maskHeight;
  }
}
