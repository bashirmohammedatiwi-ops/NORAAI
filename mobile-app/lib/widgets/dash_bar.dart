import 'package:flutter/material.dart';

import '../models/nearby_event.dart';
import '../models/road_speed.dart';
import '../services/following_distance_estimator.dart';
import '../theme/app_colors.dart';
import '../utils/event_meta.dart';
import '../utils/map_geo.dart';
import 'headway_gauge.dart';
import 'nurai_background.dart';
import 'speed_gauge.dart';
import 'vibration_meter.dart';

class DashBar extends StatelessWidget {
  const DashBar({
    super.key,
    required this.speed,
    required this.roadSpeed,
    required this.placeName,
    required this.modelStatus,
    required this.nearestEvent,
    required this.classMeta,
    this.latencyMs,
    this.scanning = false,
    this.compact = false,
    this.accuracyM,
    this.vibrationLevel,
    this.vibrationIntensity,
    this.vibrationLabel,
    this.vibrationAvailable = true,
    this.followingDistance,
  });

  final double? speed;
  final RoadSpeedResult roadSpeed;
  final String? placeName;
  final String modelStatus;
  final NearbyEvent? nearestEvent;
  final Map<String, EventMeta> classMeta;
  final int? latencyMs;
  final bool scanning;
  final bool compact;
  final double? accuracyM;
  final int? vibrationLevel;
  final double? vibrationIntensity;
  final String? vibrationLabel;
  final bool vibrationAvailable;
  final FollowingDistanceState? followingDistance;

  @override
  Widget build(BuildContext context) {
    final hazard = nearestEvent;
    EventMeta? hazardMeta;
    if (hazard != null) hazardMeta = getEventMeta(hazard.eventType, classMeta);

    final now = TimeOfDay.now();
    final time = '${now.hour.toString().padLeft(2, '0')}:${now.minute.toString().padLeft(2, '0')}';

    return GlassCard(
      margin: const EdgeInsets.fromLTRB(14, 0, 14, 14),
      padding: EdgeInsets.all(compact ? 12 : 16),
      borderRadius: compact ? 18 : 22,
      borderColor: AppColors.accent.withValues(alpha: 0.2),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SpeedGauge(
                speed: speed,
                limit: roadSpeed.limit,
                fromRoad: roadSpeed.fromRoad,
                limitLabel: roadSpeed.roadName,
                compact: compact,
                accuracyM: accuracyM,
              ),
              if (!compact) ...[
                _divider(),
                if (vibrationLevel != null)
                  VibrationMeter(
                    level: vibrationLevel!,
                    intensityMs2: vibrationIntensity,
                    label: vibrationLabel,
                    available: vibrationAvailable,
                    compact: true,
                  ),
                if (followingDistance != null) ...[
                  _divider(),
                  HeadwayGauge(state: followingDistance!, compact: true),
                ],
              ],
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      placeName ?? 'جاري تحديد الموقع...',
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: AppColors.textPrimary,
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        _miniChip(Icons.speed_rounded, '${roadSpeed.limit.round()} كم/س', AppColors.accent),
                        const SizedBox(width: 6),
                        _miniChip(
                          roadSpeed.fromRoad ? Icons.gps_fixed : Icons.info_outline,
                          roadSpeed.fromRoad ? 'GPS' : 'LIM',
                          roadSpeed.fromRoad ? AppColors.success : AppColors.warning,
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Text(modelStatus, style: const TextStyle(color: AppColors.textMuted, fontSize: 10)),
                    if (latencyMs != null || scanning)
                      Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Text(
                          scanning ? '● AI جاري المسح' : 'AI ${latencyMs}ms',
                          style: TextStyle(
                            color: scanning ? AppColors.accentBright : AppColors.textMuted,
                            fontSize: 10,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(time, style: const TextStyle(color: AppColors.textSecondary, fontSize: 13, fontWeight: FontWeight.w600)),
                  if (compact && vibrationLevel != null) ...[
                    const SizedBox(height: 6),
                    VibrationMeter(
                      level: vibrationLevel!,
                      available: vibrationAvailable,
                      compact: true,
                    ),
                  ],
                ],
              ),
            ],
          ),
          if (hazard != null && hazardMeta != null) ...[
            const SizedBox(height: 12),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [
                    hazardMeta.color.withValues(alpha: 0.2),
                    hazardMeta.color.withValues(alpha: 0.06),
                  ],
                ),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: hazardMeta.color.withValues(alpha: 0.35)),
              ),
              child: Row(
                children: [
                  Text(hazardMeta.icon, style: const TextStyle(fontSize: 18)),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      hazardMeta.labelAr,
                      style: TextStyle(color: hazardMeta.color, fontSize: 12, fontWeight: FontWeight.w700),
                    ),
                  ),
                  Text(formatDistanceKm(hazard.distanceKm), style: const TextStyle(color: AppColors.textSecondary, fontSize: 11)),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _divider() {
    return Container(
      width: 1,
      height: 52,
      margin: const EdgeInsets.symmetric(horizontal: 8),
      color: AppColors.borderLight.withValues(alpha: 0.5),
    );
  }

  Widget _miniChip(IconData icon, String text, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 11, color: color),
          const SizedBox(width: 3),
          Text(text, style: TextStyle(color: color, fontSize: 9, fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}
