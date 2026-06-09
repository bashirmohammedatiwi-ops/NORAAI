import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/scheduler.dart';
import 'package:flutter/material.dart';

import '../models/detection.dart';
import '../services/detection_tracker.dart';
import '../theme/app_colors.dart';
import '../utils/preview_layout.dart';

class DetectionOverlay extends StatefulWidget {
  const DetectionOverlay({
    super.key,
    required this.detections,
    required this.minConfidence,
    this.scanning = false,
    this.layout,
    this.headwayDistanceM,
    this.leadVehicleClass,
    this.localInference = false,
  });

  final List<DetectionBox> detections;
  final double minConfidence;
  final bool scanning;
  final PreviewLayout? layout;
  final double? headwayDistanceM;
  final String? leadVehicleClass;
  final bool localInference;

  @override
  State<DetectionOverlay> createState() => _DetectionOverlayState();
}

class _DetectionOverlayState extends State<DetectionOverlay> {
  final _tracker = DetectionTracker(smoothHz: 48, maxCoastFrames: 28, matchIoU: 0.16);
  Ticker? _ticker;

  @override
  void initState() {
    super.initState();
    _ticker = Ticker((_) {
      _tracker.tick();
      if (mounted) setState(() {});
    })..start();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _tracker.ingest(widget.detections, widget.minConfidence);
    });
  }

  @override
  void dispose() {
    _ticker?.dispose();
    super.dispose();
  }

  @override
  void didUpdateWidget(covariant DetectionOverlay oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.detections != oldWidget.detections) {
      _tracker.ingest(widget.detections, widget.minConfidence);
    }
    if (widget.detections.isEmpty && !widget.scanning) {
      _tracker.clear();
    }
  }

  @override
  Widget build(BuildContext context) {
    return RepaintBoundary(
      child: CustomPaint(
        painter: _ArDetectPainter(
          tracks: _tracker.active,
          layout: widget.layout,
          scanning: widget.scanning,
          localInference: widget.localInference,
          animTime: _tracker.animationTime,
          headwayDistanceM: widget.headwayDistanceM,
          leadVehicleClass: widget.leadVehicleClass,
        ),
        child: const SizedBox.expand(),
      ),
    );
  }
}

class _ArDetectPainter extends CustomPainter {
  _ArDetectPainter({
    required this.tracks,
    required this.layout,
    required this.scanning,
    required this.localInference,
    required this.animTime,
    this.headwayDistanceM,
    this.leadVehicleClass,
  });

  final List<TrackedDetection> tracks;
  final PreviewLayout? layout;
  final bool scanning;
  final bool localInference;
  final double animTime;
  final double? headwayDistanceM;
  final String? leadVehicleClass;

  static const _neonCyan = Color(0xFF00E5FF);
  static const _neonBlue = Color(0xFF3B82F6);

  @override
  void paint(Canvas canvas, Size size) {
    if (scanning) _drawScanField(canvas, size);
    if (localInference && scanning) _drawLocalBadge(canvas, size);

    TrackedDetection? leadTrack;
    for (final t in tracks) {
      if (!t.alive) continue;
      final rect = _mapBbox(t.display, size);
      if (rect.width < 6 || rect.height < 6) continue;

      final isLead = headwayDistanceM != null &&
          leadVehicleClass != null &&
          t.className.toLowerCase() == leadVehicleClass!.toLowerCase();
      if (isLead) leadTrack = t;

      _drawArBox(canvas, rect, t, isLead: isLead);
    }

    if (leadTrack != null && headwayDistanceM != null) {
      _drawLeadLink(canvas, size, _mapBbox(leadTrack.display, size), headwayDistanceM!);
    }
  }

  void _drawLocalBadge(Canvas canvas, Size size) {
    final tp = TextPainter(
      text: const TextSpan(
        text: '⚡ ONNX محلي',
        style: TextStyle(color: _neonCyan, fontSize: 10, fontWeight: FontWeight.w800),
      ),
      textDirection: TextDirection.ltr,
    )..layout();
    final pad = 8.0;
    final w = tp.width + pad * 2;
    final h = tp.height + pad;
    final r = RRect.fromRectAndRadius(Rect.fromLTWH(12, 12, w, h), const Radius.circular(10));
    canvas.drawRRect(
      r,
      Paint()..color = Colors.black.withValues(alpha: 0.45),
    );
    canvas.drawRRect(
      r,
      Paint()
        ..color = _neonCyan.withValues(alpha: 0.55)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1,
    );
    tp.paint(canvas, Offset(12 + pad, 12 + pad / 2));
  }

  void _drawScanField(Canvas canvas, Size size) {
    final sweep = (animTime * 0.38) % 1.0;
    final y = size.height * sweep;

    final beam = ui.Gradient.linear(
      Offset(0, y - 50),
      Offset(0, y + 50),
      [
        Colors.transparent,
        _neonCyan.withValues(alpha: 0.06),
        _neonCyan.withValues(alpha: 0.35),
        _neonCyan.withValues(alpha: 0.06),
        Colors.transparent,
      ],
      const [0.0, 0.35, 0.5, 0.65, 1.0],
    );
    canvas.drawRect(Rect.fromLTWH(0, y - 2, size.width, 4), Paint()..shader = beam);

    final gridPaint = Paint()
      ..color = _neonCyan.withValues(alpha: 0.04)
      ..strokeWidth = 1;
    const step = 48.0;
    for (double x = 0; x < size.width; x += step) {
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), gridPaint);
    }
    for (double gy = 0; gy < size.height; gy += step) {
      canvas.drawLine(Offset(0, gy), Offset(size.width, gy), gridPaint);
    }
  }

  void _drawArBox(Canvas canvas, Rect rect, TrackedDetection t, {required bool isLead}) {
    final base = classColor(t.className);
    final pulse = 0.5 + 0.5 * math.sin(animTime * 5.5 + t.id);
    final lock = t.lockStrength.clamp(0.0, 1.0);
    final alpha = t.opacity;
    final accent = isLead ? AppColors.warning : Color.lerp(base, _neonCyan, lock * 0.55)!;
    final color = accent.withValues(alpha: alpha);

    final dashPhase = animTime * 40;

    // Outer neon bloom
    canvas.drawRRect(
      RRect.fromRectAndRadius(rect.inflate(10 + pulse * 4), const Radius.circular(10)),
      Paint()
        ..color = color.withValues(alpha: (0.06 + lock * 0.14) * alpha)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 10),
    );

    // Dual stroke — solid + animated dash
    final outer = RRect.fromRectAndRadius(rect.deflate(0.5), const Radius.circular(8));
    canvas.drawRRect(
      outer,
      Paint()
        ..color = color.withValues(alpha: 0.35 * alpha)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 4.5,
    );
    _drawDashedRRect(canvas, outer, color.withValues(alpha: 0.9 * alpha), dashPhase, 2.2);

    // Inner glass fill
    canvas.drawRRect(
      RRect.fromRectAndRadius(rect.deflate(2), const Radius.circular(6)),
      Paint()..color = color.withValues(alpha: (0.05 + lock * 0.1) * alpha),
    );

    // AR corner brackets
    _drawCornerBrackets(canvas, rect, color, lock, pulse, alpha);

    // Lock reticle
    if (lock > 0.2) {
      final c = rect.center;
      final r = 3.5 + pulse * 2 + lock * 3;
      canvas.drawCircle(c, r + 5, Paint()..color = color.withValues(alpha: 0.25 * alpha));
      canvas.drawCircle(c, r, Paint()..color = Colors.white.withValues(alpha: 0.95 * alpha));
      canvas.drawCircle(
        c,
        r,
        Paint()
          ..color = color
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2,
      );
    }

    // Confidence arc (top-right)
    _drawConfidenceArc(canvas, rect, t.confidence, color, alpha);

    // Label pill
    _drawLabelPill(canvas, rect, t, isLead: isLead, color: color, alpha: alpha);
  }

  void _drawCornerBrackets(
    Canvas canvas,
    Rect rect,
    Color color,
    double lock,
    double pulse,
    double alpha,
  ) {
    final len = 16.0 + lock * 12 + pulse * 4;
    final paint = Paint()
      ..color = Colors.white.withValues(alpha: (0.88 + pulse * 0.12) * alpha)
      ..strokeWidth = 2.8
      ..strokeCap = StrokeCap.round
      ..style = PaintingStyle.stroke;

    final glow = Paint()
      ..color = color.withValues(alpha: 0.7 * alpha)
      ..strokeWidth = 4
      ..strokeCap = StrokeCap.round
      ..style = PaintingStyle.stroke
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 3);

    void bracket(Offset origin, bool top, bool left) {
      final dx = left ? 1 : -1;
      final dy = top ? 1 : -1;
      final p1 = origin + Offset(dx * len, 0);
      final p2 = origin + Offset(0, dy * len);
      canvas.drawLine(origin, p1, glow);
      canvas.drawLine(origin, p2, glow);
      canvas.drawLine(origin, p1, paint);
      canvas.drawLine(origin, p2, paint);
    }

    bracket(rect.topLeft, true, true);
    bracket(rect.topRight, true, false);
    bracket(rect.bottomLeft, false, true);
    bracket(rect.bottomRight, false, false);
  }

  void _drawConfidenceArc(Canvas canvas, Rect rect, double conf, Color color, double alpha) {
    final c = Offset(rect.right - 10, rect.top + 10);
    final r = 9.0;
    canvas.drawArc(
      Rect.fromCircle(center: c, radius: r),
      -math.pi / 2,
      math.pi * 2 * conf,
      false,
      Paint()
        ..color = color.withValues(alpha: 0.9 * alpha)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.5
        ..strokeCap = StrokeCap.round,
    );
    canvas.drawCircle(
      c,
      r,
      Paint()
        ..color = Colors.black.withValues(alpha: 0.35 * alpha)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2,
    );
  }

  void _drawLabelPill(
    Canvas canvas,
    Rect rect,
    TrackedDetection t, {
    required bool isLead,
    required Color color,
    required double alpha,
  }) {
    final label = isLead
        ? '◉ ${headwayDistanceM!.round()}م · ${t.className}'
        : '${t.className}  ${(t.confidence * 100).round()}%';

    final tp = TextPainter(
      text: TextSpan(
        text: label,
        style: TextStyle(
          color: Colors.white.withValues(alpha: alpha),
          fontSize: isLead ? 11 : 10,
          fontWeight: FontWeight.w800,
          letterSpacing: 0.3,
        ),
      ),
      textDirection: TextDirection.ltr,
    )..layout(maxWidth: rect.width + 60);

    final chipW = tp.width + 18;
    final chipH = tp.height + 10;
    final chipRect = Rect.fromLTWH(rect.left, rect.top - chipH - 6, chipW, chipH);
    final chip = RRect.fromRectAndRadius(chipRect, const Radius.circular(10));

    canvas.drawRRect(
      chip,
      Paint()
        ..shader = ui.Gradient.linear(
          chipRect.topLeft,
          chipRect.bottomRight,
          [
            color.withValues(alpha: 0.92 * alpha),
            _neonBlue.withValues(alpha: 0.75 * alpha),
          ],
        ),
    );
    canvas.drawRRect(
      chip,
      Paint()
        ..color = Colors.white.withValues(alpha: 0.35 * alpha)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.2,
    );
    tp.paint(canvas, Offset(chipRect.left + 9, chipRect.top + 5));
  }

  void _drawLeadLink(Canvas canvas, Size size, Rect target, double distM) {
    final anchor = Offset(size.width / 2, size.height - 22);
    final tip = target.center;

    _drawDashedLine(
      canvas,
      anchor,
      tip,
      Paint()
        ..color = AppColors.warning.withValues(alpha: 0.65)
        ..strokeWidth = 2
        ..strokeCap = StrokeCap.round,
    );

    canvas.drawCircle(anchor, 6, Paint()..color = AppColors.warning.withValues(alpha: 0.25));
    canvas.drawCircle(anchor, 4, Paint()..color = AppColors.warning);

    final distTp = TextPainter(
      text: TextSpan(
        text: '${distM.round()} م',
        style: const TextStyle(color: AppColors.warning, fontSize: 11, fontWeight: FontWeight.w900),
      ),
      textDirection: TextDirection.rtl,
    )..layout();
    final pillW = distTp.width + 14;
    final pill = RRect.fromRectAndRadius(
      Rect.fromCenter(center: Offset(anchor.dx, anchor.dy - 20), width: pillW, height: 20),
      const Radius.circular(10),
    );
    canvas.drawRRect(pill, Paint()..color = Colors.black.withValues(alpha: 0.55));
    distTp.paint(canvas, Offset(anchor.dx - distTp.width / 2, anchor.dy - 28));
  }

  void _drawDashedRRect(Canvas canvas, RRect rrect, Color color, double phase, double stroke) {
    final path = Path()..addRRect(rrect);
    final metrics = path.computeMetrics();
    const dash = 10.0;
    const gap = 7.0;

    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke;

    for (final metric in metrics) {
      var dist = phase % (dash + gap);
      while (dist < metric.length) {
        final end = math.min(dist + dash, metric.length);
        canvas.drawPath(metric.extractPath(dist, end), paint);
        dist += dash + gap;
      }
    }
  }

  void _drawDashedLine(Canvas canvas, Offset start, Offset end, Paint paint) {
    const dash = 7.0;
    const gap = 6.0;
    final dx = end.dx - start.dx;
    final dy = end.dy - start.dy;
    final length = math.sqrt(dx * dx + dy * dy);
    if (length < 1) return;

    final ux = dx / length;
    final uy = dy / length;
    var traveled = 0.0;
    var draw = true;

    while (traveled < length) {
      final step = math.min(draw ? dash : gap, length - traveled);
      if (draw) {
        final p1 = Offset(start.dx + ux * traveled, start.dy + uy * traveled);
        final p2 = Offset(start.dx + ux * (traveled + step), start.dy + uy * (traveled + step));
        canvas.drawLine(p1, p2, paint);
      }
      traveled += step;
      draw = !draw;
    }
  }

  Rect _mapBbox(List<double> bbox, Size size) {
    if (layout != null && bbox[2] <= 1.5 && bbox[3] <= 1.5) {
      return layout!.mapNormalizedBbox(bbox);
    }
    final w = size.width;
    final h = size.height;
    if (bbox[2] <= 1.5 && bbox[3] <= 1.5) {
      return Rect.fromLTRB(bbox[0] * w, bbox[1] * h, bbox[2] * w, bbox[3] * h);
    }
    return Rect.fromLTRB(bbox[0], bbox[1], bbox[2], bbox[3]);
  }

  @override
  bool shouldRepaint(covariant _ArDetectPainter old) => true;
}
