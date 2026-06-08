import 'package:flutter/material.dart';

class SpeedGauge extends StatefulWidget {
  const SpeedGauge({
    super.key,
    required this.speed,
    required this.limit,
    this.fromRoad = false,
    this.limitLabel,
    this.compact = false,
  });

  final double? speed;
  final double limit;
  final bool fromRoad;
  final String? limitLabel;
  final bool compact;

  @override
  State<SpeedGauge> createState() => _SpeedGaugeState();
}

class _SpeedGaugeState extends State<SpeedGauge> {
  double? _smoothed;

  @override
  void didUpdateWidget(covariant SpeedGauge oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.speed != null) {
      _smoothed = _smoothed == null
          ? widget.speed
          : _smoothed! + (widget.speed! - _smoothed!) * 0.3;
    }
  }

  Color _color(double ratio) {
    if (ratio >= 1) return const Color(0xFFEF4444);
    if (ratio >= 0.92) return const Color(0xFFF97316);
    if (ratio >= 0.78) return const Color(0xFFEAB308);
    return const Color(0xFF0D9488);
  }

  @override
  Widget build(BuildContext context) {
    final v = _smoothed;
    final ratio = v != null && widget.limit > 0 ? v / widget.limit : 0.0;
    final color = v != null ? _color(ratio) : const Color(0xFF64748B);
    final over = ratio >= 1;

    if (widget.compact) {
      return Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            v?.round().toString() ?? '--',
            style: TextStyle(
              color: color,
              fontSize: 28,
              fontWeight: FontWeight.w800,
            ),
          ),
          const Text('كم/س', style: TextStyle(color: Color(0xFF94A3B8), fontSize: 10)),
          const SizedBox(height: 4),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: ratio.clamp(0, 1.12),
              minHeight: 4,
              backgroundColor: const Color(0xFF1E293B),
              color: color,
            ),
          ),
          Text(
            'حد ${widget.limit.round()}',
            style: const TextStyle(color: Color(0xFF64748B), fontSize: 9),
          ),
        ],
      );
    }

    return SizedBox(
      width: 200,
      height: 110,
      child: CustomPaint(
        painter: _GaugePainter(
          ratio: ratio.clamp(0, 1.12),
          color: color,
          speed: v?.round(),
          over: over,
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
  });

  final double ratio;
  final Color color;
  final int? speed;
  final bool over;

  @override
  void paint(Canvas canvas, Size size) {
    const start = 2.356;
    const sweep = 3.665;
    final center = Offset(size.width / 2, size.height - 4);
    final radius = size.width * 0.42;
    final bg = Paint()
      ..color = const Color(0x331E293B)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 10
      ..strokeCap = StrokeCap.round;
    final fg = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 10
      ..strokeCap = StrokeCap.round;

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
      sweep * ratio,
      false,
      fg,
    );

    final tp = TextPainter(
      text: TextSpan(
        text: speed?.toString() ?? '--',
        style: TextStyle(
          color: over ? const Color(0xFFEF4444) : Colors.white,
          fontSize: 32,
          fontWeight: FontWeight.w800,
        ),
      ),
      textDirection: TextDirection.ltr,
    )..layout();
    tp.paint(canvas, Offset(center.dx - tp.width / 2, center.dy - 42));

    final sub = TextPainter(
      text: const TextSpan(
        text: 'كم/س',
        style: TextStyle(color: Color(0xFF94A3B8), fontSize: 11),
      ),
      textDirection: TextDirection.rtl,
    )..layout();
    sub.paint(canvas, Offset(center.dx - sub.width / 2, center.dy - 18));
  }

  @override
  bool shouldRepaint(covariant _GaugePainter old) =>
      old.ratio != ratio || old.speed != speed || old.color != color;
}
