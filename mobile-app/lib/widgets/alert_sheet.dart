import 'package:flutter/material.dart';

import '../models/nearby_event.dart';
import '../theme/app_colors.dart';
import '../utils/event_meta.dart';
import '../utils/map_geo.dart';

class AlertSheet extends StatelessWidget {
  const AlertSheet({
    super.key,
    required this.liveAlerts,
    required this.nearbyEvents,
    required this.classMeta,
  });

  final List<LiveAlert> liveAlerts;
  final List<NearbyEvent> nearbyEvents;
  final Map<String, EventMeta> classMeta;

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      initialChildSize: 0.42,
      minChildSize: 0.18,
      maxChildSize: 0.85,
      builder: (context, scrollController) {
        return Container(
          decoration: BoxDecoration(
            color: AppColors.bgCard.withValues(alpha: 0.95),
            borderRadius: const BorderRadius.vertical(top: Radius.circular(22)),
            border: Border(top: BorderSide(color: AppColors.borderLight.withValues(alpha: 0.5))),
          ),
          child: ListView(
            controller: scrollController,
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  margin: const EdgeInsets.only(bottom: 12),
                  decoration: BoxDecoration(
                    color: AppColors.textMuted,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const Text(
                'التنبيهات',
                style: TextStyle(
                  color: AppColors.textPrimary,
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 12),
              _sectionTitle('مباشر · AI (${liveAlerts.length})'),
              if (liveAlerts.isEmpty)
                _empty('لا توجد تنبيهات مباشرة')
              else
                ...liveAlerts.take(10).map((a) {
                  final meta = getEventMeta(a.type, classMeta);
                  return _alertTile(
                    icon: meta.icon,
                    color: meta.color,
                    title: meta.labelAr,
                    subtitle:
                        '${(a.confidence * 100).round()}% · ${_timeAgo(a.at)}',
                  );
                }),
              const SizedBox(height: 16),
              _sectionTitle('قريب · خريطة (${nearbyEvents.length})'),
              if (nearbyEvents.isEmpty)
                _empty('لا توجد أحداث قريبة')
              else
                ...nearbyEvents.take(12).map((e) {
                  final meta = getEventMeta(e.eventType, classMeta);
                  return _alertTile(
                    icon: meta.icon,
                    color: meta.color,
                    title: meta.labelAr,
                    subtitle: formatDistanceKm(e.distanceKm),
                  );
                }),
            ],
          ),
        );
      },
    );
  }

  Widget _sectionTitle(String text) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Text(
        text,
        style: const TextStyle(
          color: AppColors.textSecondary,
          fontSize: 12,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }

  Widget _empty(String text) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Text(text, style: const TextStyle(color: AppColors.textMuted, fontSize: 12)),
    );
  }

  Widget _alertTile({
    required String icon,
    required Color color,
    required String title,
    required String subtitle,
  }) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: AppColors.bgDeep,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: color.withValues(alpha: 0.35)),
      ),
      child: Row(
        children: [
          Text(icon, style: const TextStyle(fontSize: 18)),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    color: AppColors.textPrimary,
                    fontWeight: FontWeight.w600,
                    fontSize: 13,
                  ),
                ),
                Text(
                  subtitle,
                  style: const TextStyle(color: AppColors.textSecondary, fontSize: 11),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  String _timeAgo(DateTime at) {
    final s = DateTime.now().difference(at).inSeconds;
    if (s < 60) return 'الآن';
    if (s < 3600) return '${s ~/ 60} د';
    return '${s ~/ 3600} س';
  }
}
