import 'package:flutter/material.dart';

import '../theme/app_colors.dart';

class SpeedGauge extends StatelessWidget {
  const SpeedGauge({
    super.key,
    required this.speed,
    required this.limit,
    this.fromRoad = false,
    this.limitLabel,
    this.compact = false,
    this.accuracyM,
  });

  final double? speed;
  final double limit;
  final bool fromRoad;
  final String? limitLabel;
  final bool compact;
  final double? accuracyM;

  Color _color(double ratio) {
    if (ratio >= 1) return AppColors.danger;
    if (ratio >= 0.92) return AppColors.orange;
    if (ratio >= 0.78) return AppColors.warning;
    return AppColors.accent;
  }

  @override
  Widget build(BuildContext context) {
    final v = speed?.round();
    final ratio = v != null && limit > 0 ? v / limit : 0.0;
    final color = v != null ? _color(ratio) : AppColors.textMuted;
    final over = ratio >= 1;

    if (compact) {
      return Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            v?.toString() ?? '--',
            style: TextStyle(color: color, fontSize: 28, fontWeight: FontWeight.w800),
          ),
          const Text('كم/س', style: TextStyle(color: AppColors.textSecondary, fontSize: 10)),
          const SizedBox(height: 4),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: ratio.clamp(0, 1.12),
              minHeight: 4,
              backgroundColor: AppColors.border,
              color: color,
            ),
          ),
          Text('حد ${limit.round()}', style: const TextStyle(color: AppColors.textMuted, fontSize: 9)),
        ],
      );
    }

    return SizedBox(
      width: 200,
      height: 118,
      child: CustomPaint(
        painter: _GaugePainter(
          ratio: ratio.clamp(0, 1.12),
          color: color,
          speed: v,
          over: over,
          accuracyM: accuracyM,
        ),
      ),
    );
  }
}

class _GaugePainter extends CustomPainter {
  _GaugePainter({
    required this.ratio,
    required this.color,
    required this.speed,
    required this.over,
    this.accuracyM,
  });

  final double ratio;
  final Color color;
  final int? speed;
  final bool over;
  final double? accuracyM;

  @override
  void paint(Canvas canvas, Size size) {
    const start = 2.356;
    const sweep = 3.665;
    final center = Offset(size.width / 2, size.height - 4);
    final radius = size.width * 0.42;

    canvas.drawArc(
      Rect.fromCircle(center: center, radius: radius),
      start,
      sweep,
      false,
      Paint()
        ..color = AppColors.border.withValues(alpha: 0.35)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 10
        ..strokeCap = StrokeCap.round,
    );
    canvas.drawArc(
      Rect.fromCircle(center: center, radius: radius),
      start,
      sweep * ratio,
      false,
      Paint()
        ..color = color
        ..style = PaintingStyle.stroke
        ..strokeWidth = 10
        ..strokeCap = StrokeCap.round,
    );

    final tp = TextPainter(
      text: TextSpan(
        text: speed?.toString() ?? '--',
        style: TextStyle(
          color: over ? AppColors.danger : AppColors.textPrimary,
          fontSize: 34,
          fontWeight: FontWeight.w900,
        ),
      ),
      textDirection: TextDirection.ltr,
    )..layout();
    tp.paint(canvas, Offset(center.dx - tp.width / 2, center.dy - 44));

    final sub = TextPainter(
      text: const TextSpan(
        text: 'كم/س',
        style: TextStyle(color: AppColors.textSecondary, fontSize: 11),
      ),
      textDirection: TextDirection.rtl,
    )..layout();
    sub.paint(canvas, Offset(center.dx - sub.width / 2, center.dy - 18));

    if (accuracyM != null && accuracyM! > 0) {
      final acc = TextPainter(
        text: TextSpan(
          text: 'GPS ±${accuracyM!.round()}م',
          style: TextStyle(
            color: accuracyM! < 12 ? AppColors.success : AppColors.warning,
            fontSize: 8,
          ),
        ),
        textDirection: TextDirection.rtl,
      )..layout();
      acc.paint(canvas, Offset(center.dx - acc.width / 2, center.dy + 2));
    }
  }

  @override
  bool shouldRepaint(covariant _GaugePainter old) =>
      old.ratio != ratio || old.speed != speed || old.color != color;
}
