import 'package:flutter/material.dart';

import '../theme/app_colors.dart';

class VibrationMeter extends StatelessWidget {
  const VibrationMeter({
    super.key,
    required this.level,
    this.intensityMs2,
    this.label,
    this.available = true,
    this.compact = false,
  });

  final int level;
  final double? intensityMs2;
  final String? label;
  final bool available;
  final bool compact;

  Color _color(int lvl) {
    if (!available) return AppColors.textMuted;
    if (lvl < 18) return AppColors.success;
    if (lvl < 40) return AppColors.accentBright;
    if (lvl < 65) return AppColors.warning;
    if (lvl < 85) return AppColors.orange;
    return AppColors.danger;
  }

  @override
  Widget build(BuildContext context) {
    final color = _color(level);
    final pct = level.clamp(0, 100);

    if (compact) {
      return Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            available ? Icons.vibration : Icons.sensors_off,
            color: color,
            size: 20,
          ),
          const SizedBox(height: 2),
          Text(
            available ? '$pct%' : '—',
            style: TextStyle(color: color, fontSize: 16, fontWeight: FontWeight.w800),
          ),
          Text(
            'اهتزاز',
            style: TextStyle(color: color.withValues(alpha: 0.8), fontSize: 9),
          ),
        ],
      );
    }

    return SizedBox(
      width: 72,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              Icon(
                available ? Icons.vibration : Icons.sensors_off,
                color: color,
                size: 14,
              ),
              const SizedBox(width: 4),
              Text(
                'اهتزاز الطريق',
                style: TextStyle(color: color, fontSize: 9, fontWeight: FontWeight.w600),
              ),
            ],
          ),
          const SizedBox(height: 6),
          _BarMeter(level: pct, color: color, active: available),
          const SizedBox(height: 4),
          Text(
            available ? '$pct%' : '—',
            style: TextStyle(color: color, fontSize: 18, fontWeight: FontWeight.w900, height: 1),
          ),
          if (intensityMs2 != null && available)
            Text(
              '${intensityMs2!.toStringAsFixed(2)} م/ث²',
              style: const TextStyle(color: Color(0xFF64748B), fontSize: 8),
            ),
          if (label != null)
            Text(
              label!,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 8),
            ),
        ],
      ),
    );
  }
}

class _BarMeter extends StatelessWidget {
  const _BarMeter({
    required this.level,
    required this.color,
    required this.active,
  });

  final int level;
  final Color color;
  final bool active;

  @override
  Widget build(BuildContext context) {
    const bars = 8;
    final filled = active ? ((level / 100) * bars).ceil().clamp(0, bars) : 0;

    return SizedBox(
      height: 36,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: List.generate(bars, (i) {
          final h = 8.0 + (i + 1) * 3.2;
          final on = i < filled;
          return Expanded(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 1.2),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 120),
                height: h,
                decoration: BoxDecoration(
                  color: on ? color : const Color(0xFF1E293B),
                  borderRadius: BorderRadius.circular(2),
                  border: Border.all(
                    color: on ? color.withValues(alpha: 0.6) : const Color(0xFF334155),
                  ),
                ),
              ),
            ),
          );
        }),
      ),
    );
  }
}
