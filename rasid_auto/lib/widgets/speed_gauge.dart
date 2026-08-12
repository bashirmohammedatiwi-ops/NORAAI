import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../theme/rasid_theme.dart';

class SpeedGauge extends StatelessWidget {
  const SpeedGauge({
    super.key,
    required this.speed,
    required this.limit,
    this.size = 120,
  });

  final double speed;
  final double limit;
  final double size;

  @override
  Widget build(BuildContext context) {
    final over = speed > limit + 5;
    final color = over ? RasidColors.danger : RasidColors.amber;
    return SizedBox(
      width: size,
      height: size,
      child: CustomPaint(
        painter: _GaugePainter(
          progress: (speed / math.max(limit * 1.4, 1)).clamp(0.0, 1.0),
          color: color,
        ),
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                speed.toStringAsFixed(0),
                style: GoogleFonts.cairo(
                  fontSize: size * 0.28,
                  fontWeight: FontWeight.w900,
                  height: 1,
                  color: color,
                ),
              ),
              Text(
                'كم/س',
                style: GoogleFonts.cairo(
                  fontSize: 11,
                  color: RasidColors.mistDim,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _GaugePainter extends CustomPainter {
  _GaugePainter({required this.progress, required this.color});

  final double progress;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = size.width / 2 - 6;
    final bg = Paint()
      ..color = RasidColors.lane
      ..style = PaintingStyle.stroke
      ..strokeWidth = 8
      ..strokeCap = StrokeCap.round;
    final fg = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 8
      ..strokeCap = StrokeCap.round;

    const start = -math.pi * 0.75;
    const sweep = math.pi * 1.5;
    canvas.drawArc(
      Rect.fromCircle(center: center, radius: radius),
      start,
      sweep,
      false,
      bg,
    );
    canvas.drawArc(
      Rect.fromCircle(center: center, radius: radius),
      start,
      sweep * progress,
      false,
      fg,
    );
  }

  @override
  bool shouldRepaint(covariant _GaugePainter oldDelegate) =>
      oldDelegate.progress != progress || oldDelegate.color != color;
}
