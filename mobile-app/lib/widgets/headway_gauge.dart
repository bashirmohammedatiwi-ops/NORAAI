import 'package:flutter/material.dart';

import '../services/following_distance_estimator.dart';
import '../theme/app_colors.dart';

class HeadwayGauge extends StatelessWidget {
  const HeadwayGauge({
    super.key,
    required this.state,
    this.compact = false,
  });

  final FollowingDistanceState state;
  final bool compact;

  Color _color() {
    if (!state.hasLeadVehicle && state.source == FollowingSource.none) {
      return AppColors.textMuted;
    }
    if (state.tooClose) return AppColors.danger;
    final headway = state.headwaySec;
    if (headway != null && headway < state.safeHeadwaySec) {
      return AppColors.orange;
    }
    return AppColors.success;
  }

  @override
  Widget build(BuildContext context) {
    final color = _color();
    final dist = state.distanceM?.round();
    final headway = state.headwaySec;
    final safe = state.safeDistanceM?.round();

    if (compact) {
      return Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            state.hasLeadVehicle ? Icons.social_distance : Icons.straighten,
            color: color,
            size: 20,
          ),
          const SizedBox(height: 2),
          Text(
            dist != null ? '$distم' : (safe != null ? '~$safe' : '--'),
            style: TextStyle(color: color, fontSize: 16, fontWeight: FontWeight.w800),
          ),
          Text(
            headway != null ? '${headway.toStringAsFixed(1)}ث' : 'مسافة',
            style: TextStyle(color: color.withValues(alpha: 0.85), fontSize: 9),
          ),
        ],
      );
    }

    return SizedBox(
      width: 88,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              Icon(Icons.social_distance, color: color, size: 14),
              const SizedBox(width: 4),
              Text(
                'المركبة الأمامية',
                style: TextStyle(color: color, fontSize: 9, fontWeight: FontWeight.w600),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            dist != null ? '$dist م' : '--',
            style: TextStyle(color: color, fontSize: 22, fontWeight: FontWeight.w900, height: 1),
          ),
          if (headway != null)
            Text(
              'فجوة ${headway.toStringAsFixed(1)} ث',
              style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 10),
            ),
          if (safe != null)
            Text(
              'آمن: $safe م · ${state.safeHeadwaySec.toStringAsFixed(0)} ث',
              style: const TextStyle(color: Color(0xFF64748B), fontSize: 8),
            ),
          if (state.tooClose)
            Text(
              'قريب جداً!',
              style: TextStyle(color: color, fontSize: 9, fontWeight: FontWeight.bold),
            )
          else if (state.source == FollowingSource.speedOnly)
            const Text(
              'لا مركبة في الكاميرا',
              style: TextStyle(color: Color(0xFF64748B), fontSize: 8),
            )
          else if (state.source == FollowingSource.camera && state.leadClass != null)
            Text(
              state.leadClass!,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(color: Color(0xFF64748B), fontSize: 8),
            ),
        ],
      ),
    );
  }
}
