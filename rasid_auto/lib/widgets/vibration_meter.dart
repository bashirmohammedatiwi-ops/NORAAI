import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../theme/rasid_theme.dart';

/// Circular vibration % meter for map / drive HUD.
class VibrationMeter extends StatelessWidget {
  const VibrationMeter({
    super.key,
    required this.percent,
    this.size = 88,
    this.label = 'الاهتزاز',
  });

  final double percent;
  final double size;
  final String label;

  Color get _color {
    if (percent >= 70) return RasidColors.danger;
    if (percent >= 40) return RasidColors.warning;
    if (percent >= 20) return RasidColors.amber;
    return RasidColors.safety;
  }

  @override
  Widget build(BuildContext context) {
    final p = percent.clamp(0.0, 100.0);
    return Container(
      width: size + 28,
      padding: const EdgeInsets.fromLTRB(10, 10, 10, 8),
      decoration: BoxDecoration(
        color: RasidColors.asphaltCard.withValues(alpha: 0.92),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: RasidColors.lane),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.35),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          SizedBox(
            width: size,
            height: size,
            child: CustomPaint(
              painter: _RingPainter(progress: p / 100, color: _color),
              child: Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      '${p.round()}%',
                      style: GoogleFonts.cairo(
                        fontSize: size * 0.26,
                        fontWeight: FontWeight.w900,
                        color: Colors.white,
                        height: 1,
                      ),
                    ),
                    Icon(
                      Icons.vibration_rounded,
                      size: size * 0.18,
                      color: _color,
                    ),
                  ],
                ),
              ),
            ),
          ),
          const SizedBox(height: 6),
          Text(
            label,
            style: GoogleFonts.cairo(
              fontSize: 12,
              fontWeight: FontWeight.w700,
              color: RasidColors.mist,
            ),
          ),
        ],
      ),
    );
  }
}

class _RingPainter extends CustomPainter {
  _RingPainter({required this.progress, required this.color});

  final double progress;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final c = Offset(size.width / 2, size.height / 2);
    final r = math.min(size.width, size.height) / 2 - 5;
    final bg = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 8
      ..color = RasidColors.lane
      ..strokeCap = StrokeCap.round;
    final fg = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 8
      ..color = color
      ..strokeCap = StrokeCap.round;

    canvas.drawCircle(c, r, bg);
    final sweep = 2 * math.pi * progress.clamp(0.0, 1.0);
    canvas.drawArc(
      Rect.fromCircle(center: c, radius: r),
      -math.pi / 2,
      sweep,
      false,
      fg,
    );
  }

  @override
  bool shouldRepaint(covariant _RingPainter old) =>
      old.progress != progress || old.color != color;
}
