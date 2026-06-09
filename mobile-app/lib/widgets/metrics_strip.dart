import 'package:flutter/material.dart';

import '../models/nearby_event.dart';
import '../models/road_speed.dart';
import '../theme/app_colors.dart';
import '../utils/event_meta.dart';
import '../utils/map_geo.dart';

/// شريط مقاييس بسيط — يوضع **تحت** الخريطة أو الكاميرا وليس فوقهما.
class MetricsStrip extends StatelessWidget {
  const MetricsStrip({
    super.key,
    required this.speed,
    required this.roadSpeed,
    this.placeName,
    this.heading,
    this.nearestEvent,
    this.classMeta = const {},
    this.scanning = false,
    this.latencyMs,
    this.vibrationLevel,
    this.vibrationAvailable = true,
    this.extra,
  });

  final double? speed;
  final RoadSpeedResult roadSpeed;
  final String? placeName;
  final double? heading;
  final NearbyEvent? nearestEvent;
  final Map<String, EventMeta> classMeta;
  final bool scanning;
  final int? latencyMs;
  final int? vibrationLevel;
  final bool vibrationAvailable;
  final Widget? extra;

  Color _speedColor() {
    final v = speed?.round();
    final limit = roadSpeed.limit;
    if (v == null || limit <= 0) return AppColors.textPrimary;
    final ratio = v / limit;
    if (ratio >= 1) return AppColors.danger;
    if (ratio >= 0.92) return AppColors.orange;
    return AppColors.accentBright;
  }

  @override
  Widget build(BuildContext context) {
    final v = speed?.round();
    final hazard = nearestEvent;
    EventMeta? hazardMeta;
    if (hazard != null) hazardMeta = getEventMeta(hazard.eventType, classMeta);

    return Material(
      color: AppColors.bgElevated,
      child: SafeArea(
        top: false,
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          decoration: const BoxDecoration(
            border: Border(top: BorderSide(color: AppColors.border)),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                children: [
                  Text(
                    v?.toString() ?? '--',
                    style: TextStyle(
                      color: _speedColor(),
                      fontSize: 32,
                      fontWeight: FontWeight.w900,
                      height: 1,
                    ),
                  ),
                  const SizedBox(width: 4),
                  const Padding(
                    padding: EdgeInsets.only(top: 8),
                    child: Text('كم/س', style: TextStyle(color: AppColors.textMuted, fontSize: 11)),
                  ),
                  const SizedBox(width: 16),
                  _chip(Icons.speed_rounded, 'حد ${roadSpeed.limit.round()}'),
                  if (heading != null) ...[
                    const SizedBox(width: 8),
                    _chip(Icons.navigation_rounded, '${heading!.round()}°'),
                  ],
                  if (vibrationLevel != null && vibrationAvailable) ...[
                    const SizedBox(width: 8),
                    _chip(Icons.vibration_rounded, '$vibrationLevel%'),
                  ],
                  const Spacer(),
                  if (scanning)
                    const Text('AI ●', style: TextStyle(color: AppColors.accentBright, fontSize: 11, fontWeight: FontWeight.w700))
                  else if (latencyMs != null)
                    Text('${latencyMs}ms', style: const TextStyle(color: AppColors.textMuted, fontSize: 11)),
                ],
              ),
              if (placeName != null && placeName!.isNotEmpty) ...[
                const SizedBox(height: 4),
                Align(
                  alignment: Alignment.centerRight,
                  child: Text(
                    placeName!,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(color: AppColors.textSecondary, fontSize: 11),
                  ),
                ),
              ],
              if (hazard != null && hazardMeta != null) ...[
                const SizedBox(height: 6),
                Row(
                  children: [
                    Text(hazardMeta.icon, style: const TextStyle(fontSize: 14)),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        hazardMeta.labelAr,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(color: hazardMeta.color, fontSize: 11, fontWeight: FontWeight.w600),
                      ),
                    ),
                    Text(formatDistanceKm(hazard.distanceKm), style: const TextStyle(color: AppColors.textMuted, fontSize: 10)),
                  ],
                ),
              ],
              if (extra != null) ...[const SizedBox(height: 6), extra!],
            ],
          ),
        ),
      ),
    );
  }

  Widget _chip(IconData icon, String text) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: AppColors.bgCard,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 12, color: AppColors.textMuted),
          const SizedBox(width: 4),
          Text(text, style: const TextStyle(color: AppColors.textSecondary, fontSize: 11, fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}
