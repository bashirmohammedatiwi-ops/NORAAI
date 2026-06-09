import 'dart:ui';

import 'package:flutter/material.dart';

import '../theme/app_colors.dart';

class MapHud extends StatelessWidget {
  const MapHud({
    super.key,
    required this.speedKmh,
    required this.speedLimit,
    required this.heading,
    this.accuracyM,
    this.placeName,
    this.overLimit = false,
    this.vibrationLevel,
    this.vibrationLabel,
    this.vibrationAvailable = true,
  });

  final int? speedKmh;
  final double speedLimit;
  final double heading;
  final double? accuracyM;
  final String? placeName;
  final bool overLimit;
  final int? vibrationLevel;
  final String? vibrationLabel;
  final bool vibrationAvailable;

  Color _speedColor() {
    final speed = speedKmh;
    if (overLimit) return AppColors.danger;
    if (speed != null && speedLimit > 0 && speed >= speedLimit * 0.9) return AppColors.orange;
    return AppColors.accentBright;
  }

  @override
  Widget build(BuildContext context) {
    final speed = speedKmh;
    final speedColor = _speedColor();

    return ClipRRect(
      borderRadius: BorderRadius.circular(20),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.94),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: const Color(0xFFE2E8F0)),
            boxShadow: [
              BoxShadow(color: Colors.black.withValues(alpha: 0.12), blurRadius: 18, offset: const Offset(0, 5)),
            ],
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    speed?.toString() ?? '--',
                    style: TextStyle(color: speedColor, fontSize: 38, fontWeight: FontWeight.w900, height: 1),
                  ),
                  const Text('كم/س', style: TextStyle(color: Color(0xFF64748B), fontSize: 10)),
                ],
              ),
              if (vibrationLevel != null) ...[
                const SizedBox(width: 12),
                _vDivider(),
                const SizedBox(width: 12),
                _vibrationChip(vibrationLevel!, vibrationLabel, vibrationAvailable),
              ],
              const SizedBox(width: 14),
              _vDivider(),
              const SizedBox(width: 14),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Icon(Icons.speed_rounded, color: AppColors.textMuted, size: 14),
                      const SizedBox(width: 4),
                      Text('حد ${speedLimit.round()}', style: const TextStyle(color: Color(0xFF1E293B), fontSize: 12, fontWeight: FontWeight.w600)),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      Transform.rotate(
                        angle: heading * 3.14159265 / 180,
                        child: const Icon(Icons.navigation_rounded, color: AppColors.accent, size: 14),
                      ),
                      const SizedBox(width: 4),
                      Text('${heading.round()}°', style: const TextStyle(color: Color(0xFF64748B), fontSize: 11)),
                      if (accuracyM != null && accuracyM! > 0) ...[
                        const SizedBox(width: 8),
                        Icon(
                          accuracyM! < 12 ? Icons.gps_fixed : Icons.gps_not_fixed,
                          color: accuracyM! < 12 ? AppColors.success : AppColors.warning,
                          size: 13,
                        ),
                        Text('±${accuracyM!.round()}م', style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 10)),
                      ],
                    ],
                  ),
                  if (placeName != null && placeName!.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    SizedBox(
                      width: 150,
                      child: Text(placeName!, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 9)),
                    ),
                  ],
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _vDivider() => Container(width: 1, height: 46, color: const Color(0xFFE2E8F0));

  Widget _vibrationChip(int level, String? label, bool available) {
    Color color;
    if (!available) {
      color = AppColors.textMuted;
    } else if (level < 18) {
      color = AppColors.success;
    } else if (level < 40) {
      color = AppColors.accentBright;
    } else if (level < 65) {
      color = AppColors.warning;
    } else {
      color = AppColors.danger;
    }

    return Column(
      children: [
        Icon(available ? Icons.vibration_rounded : Icons.sensors_off_rounded, color: color, size: 18),
        Text(available ? '$level%' : '—', style: TextStyle(color: color, fontSize: 18, fontWeight: FontWeight.w900, height: 1)),
        Text(label ?? 'اهتزاز', style: const TextStyle(color: AppColors.textMuted, fontSize: 8)),
      ],
    );
  }
}
