import 'package:flutter/material.dart';

import '../models/nearby_event.dart';
import '../models/road_speed.dart';
import '../utils/event_meta.dart';
import '../utils/map_geo.dart';
import 'speed_gauge.dart';

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
  });

  final double? speed;
  final RoadSpeedResult roadSpeed;
  final String? placeName;
  final String modelStatus;
  final NearbyEvent? nearestEvent;
  final Map<String, EventMeta> classMeta;
  final int? latencyMs;
  final bool scanning;

  @override
  Widget build(BuildContext context) {
    final hazard = nearestEvent;
    EventMeta? hazardMeta;
    if (hazard != null) {
      hazardMeta = getEventMeta(hazard.eventType, classMeta);
    }

    final now = TimeOfDay.now();
    final time =
        '${now.hour.toString().padLeft(2, '0')}:${now.minute.toString().padLeft(2, '0')}';

    return Container(
      margin: const EdgeInsets.fromLTRB(12, 0, 12, 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xF00F172A),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: const Color(0xFF334155)),
        boxShadow: const [
          BoxShadow(color: Color(0x66000000), blurRadius: 16, offset: Offset(0, -4)),
        ],
      ),
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
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      placeName ?? 'جاري تحديد الموقع...',
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'الحد ${roadSpeed.limit.round()} كم/س · ${roadSpeed.sourceLabelAr}'
                      '${roadSpeed.roadName != null ? ' · ${roadSpeed.roadName}' : ''}',
                      style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 10),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      modelStatus,
                      style: const TextStyle(color: Color(0xFF64748B), fontSize: 10),
                    ),
                    if (latencyMs != null || scanning)
                      Text(
                        scanning
                            ? 'AI · جاري المسح...'
                            : 'AI · ${latencyMs}ms',
                        style: TextStyle(
                          color: scanning ? const Color(0xFF2DD4BF) : const Color(0xFF64748B),
                          fontSize: 10,
                        ),
                      ),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(time, style: const TextStyle(color: Color(0xFFCBD5E1), fontSize: 12)),
                  const SizedBox(height: 4),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: roadSpeed.fromRoad
                          ? const Color(0x3322C55E)
                          : const Color(0x33EAB308),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text(
                      roadSpeed.fromRoad ? 'G' : 'LIM',
                      style: TextStyle(
                        color: roadSpeed.fromRoad
                            ? const Color(0xFF22C55E)
                            : const Color(0xFFEAB308),
                        fontSize: 10,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
          if (hazard != null && hazardMeta != null) ...[
            const SizedBox(height: 8),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              decoration: BoxDecoration(
                color: hazardMeta.color.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: hazardMeta.color.withValues(alpha: 0.4)),
              ),
              child: Row(
                children: [
                  Text(hazardMeta.icon, style: const TextStyle(fontSize: 16)),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'أقرب خطر: ${hazardMeta.labelAr}',
                      style: TextStyle(
                        color: hazardMeta.color,
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  Text(
                    formatDistanceKm(hazard.distanceKm),
                    style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 11),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}
