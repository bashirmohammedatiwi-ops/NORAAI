import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../theme/rasid_theme.dart';

/// International-style speed limit sign: white disc, red ring, black number.
class SpeedLimitSign extends StatelessWidget {
  const SpeedLimitSign({
    super.key,
    required this.limit,
    this.size = 52,
  });

  final double limit;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: Colors.white,
        border: Border.all(color: const Color(0xFFD32F2F), width: size * 0.09),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.35),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      alignment: Alignment.center,
      child: Text(
        limit.round().toString(),
        style: GoogleFonts.cairo(
          color: const Color(0xFF1A1A1A),
          fontWeight: FontWeight.w900,
          fontSize: size * 0.38,
          height: 1,
        ),
      ),
    );
  }
}

/// Animated digital speed readout with over-limit flash.
class SpeedReadout extends StatefulWidget {
  const SpeedReadout({
    super.key,
    required this.speed,
    required this.limit,
    this.size = 64,
  });

  final double speed;
  final double limit;
  final double size;

  @override
  State<SpeedReadout> createState() => _SpeedReadoutState();
}

class _SpeedReadoutState extends State<SpeedReadout>
    with SingleTickerProviderStateMixin {
  late final AnimationController _flash;

  @override
  void initState() {
    super.initState();
    _flash = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 700),
    );
  }

  @override
  void didUpdateWidget(covariant SpeedReadout old) {
    super.didUpdateWidget(old);
    final over = widget.speed > widget.limit + 3;
    if (over && !_flash.isAnimating) {
      _flash.repeat(reverse: true);
    } else if (!over && _flash.isAnimating) {
      _flash.stop();
      _flash.value = 0;
    }
  }

  @override
  void dispose() {
    _flash.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final over = widget.speed > widget.limit + 3;
    final near =
        !over && widget.speed > widget.limit - 8 && widget.speed > 5;
    final base =
        over ? RasidColors.danger : (near ? RasidColors.warning : Colors.white);

    return AnimatedBuilder(
      animation: _flash,
      builder: (context, _) {
        final glow = over ? 0.35 + _flash.value * 0.4 : 0.18;
        return Container(
          width: widget.size,
          height: widget.size,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: RasidColors.asphaltCard.withValues(alpha: 0.92),
            border: Border.all(
              color: base.withValues(alpha: 0.85),
              width: 2.4,
            ),
            boxShadow: [
              BoxShadow(color: base.withValues(alpha: glow), blurRadius: 14),
            ],
          ),
          alignment: Alignment.center,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                widget.speed.round().toString(),
                style: GoogleFonts.cairo(
                  color: base,
                  fontWeight: FontWeight.w900,
                  fontSize: widget.size * 0.34,
                  height: 1,
                ),
              ),
              Text(
                'كم/س',
                style: GoogleFonts.cairo(
                  color: RasidColors.mistDim,
                  fontSize: widget.size * 0.13,
                  height: 1.1,
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}
