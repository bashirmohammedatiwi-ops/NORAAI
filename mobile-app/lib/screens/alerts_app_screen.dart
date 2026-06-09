import 'package:flutter/material.dart';

import '../controllers/drive_session.dart';
import '../theme/app_colors.dart';
import '../utils/event_meta.dart';
import '../utils/map_geo.dart';
import '../widgets/nurai_background.dart';
import '../widgets/nurai_header.dart';

class AlertsAppScreen extends StatelessWidget {
  const AlertsAppScreen({super.key});

  String _timeAgo(DateTime at) {
    final diff = DateTime.now().difference(at);
    if (diff.inSeconds < 60) return 'الآن';
    if (diff.inMinutes < 60) return 'منذ ${diff.inMinutes} د';
    if (diff.inHours < 24) return 'منذ ${diff.inHours} س';
    return '${at.hour.toString().padLeft(2, '0')}:${at.minute.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: DriveSessionScope.of(context),
      builder: (context, _) {
        final s = DriveSessionScope.of(context);
        final topPad = MediaQuery.of(context).padding.top;

        return NuraiBackground(
          child: RefreshIndicator(
            color: AppColors.accent,
            onRefresh: () async {
              await s.fetchNearby(force: true);
              await s.syncConfig();
            },
            child: CustomScrollView(
              physics: const AlwaysScrollableScrollPhysics(),
              slivers: [
                SliverToBoxAdapter(
                  child: Padding(
                    padding: EdgeInsets.fromLTRB(20, topPad + 16, 20, 0),
                    child: NuraiHeader(
                      title: 'التنبيهات',
                      subtitle: '${s.alertsCount} تنبيه · ${s.nearbyEvents.length} حدث قريب',
                      trailing: [
                        if (s.alertsCount > 0)
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                            decoration: BoxDecoration(
                              gradient: AppColors.accentGradient(),
                              borderRadius: BorderRadius.circular(20),
                            ),
                            child: Text('${s.alertsCount}', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 13)),
                          ),
                      ],
                    ),
                  ),
                ),
                if (s.nearbyError != null)
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
                      child: Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: AppColors.danger.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(color: AppColors.danger.withValues(alpha: 0.35)),
                        ),
                        child: Row(
                          children: [
                            const Icon(Icons.cloud_off_rounded, color: AppColors.danger, size: 18),
                            const SizedBox(width: 10),
                            Expanded(child: Text(s.nearbyError!, style: const TextStyle(color: Color(0xFFFCA5A5), fontSize: 11))),
                            TextButton(onPressed: () => s.fetchNearby(force: true), child: const Text('إعادة', style: TextStyle(fontSize: 11))),
                          ],
                        ),
                      ),
                    ),
                  ),
                SliverPadding(
                  padding: const EdgeInsets.fromLTRB(20, 20, 20, 110),
                  sliver: SliverList(
                    delegate: SliverChildListDelegate([
                      _section('مباشر · AI (${s.liveAlerts.length})'),
                      if (s.liveAlerts.isEmpty)
                        _empty('لا توجد تنبيهات مباشرة — الاكتشاف يعمل عند فتح الكاميرا أو القيادة')
                      else
                        ...s.liveAlerts.map((a) {
                          final meta = getEventMeta(a.type, s.classMeta);
                          final subtitle = a.speed != null && a.speedLimit != null
                              ? '${a.speed!.round()} كم/س · حد ${a.speedLimit!.round()} · ${_timeAgo(a.at)}'
                              : '${(a.confidence * 100).round()}% · ${_timeAgo(a.at)}';
                          return _tile(
                            meta: meta,
                            title: a.label,
                            subtitle: subtitle,
                            trailing: const Icon(Icons.bolt_rounded, color: AppColors.warning, size: 20),
                          );
                        }),
                      const SizedBox(height: 20),
                      _section('قريب · خريطة (${s.nearbyEvents.length})'),
                      if (s.nearbyEvents.isEmpty)
                        _empty('لا توجد أحداث قريبة ضمن نطاق الخريطة')
                      else
                        ...([...s.nearbyEvents]..sort((a, b) => a.distanceKm.compareTo(b.distanceKm))).map((e) {
                          final meta = getEventMeta(e.eventType, s.classMeta);
                          return _tile(
                            meta: meta,
                            title: meta.labelAr,
                            subtitle: formatDistanceKm(e.distanceKm),
                            trailing: const Icon(Icons.map_outlined, color: AppColors.accentBright, size: 20),
                            onTap: () => s.openEventOnMap(e.latitude, e.longitude),
                          );
                        }),
                    ]),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _section(String text) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Text(text, style: const TextStyle(color: AppColors.textSecondary, fontSize: 13, fontWeight: FontWeight.w700)),
    );
  }

  Widget _empty(String text) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Text(text, style: const TextStyle(color: AppColors.textMuted, fontSize: 12)),
    );
  }

  Widget _tile({
    required EventMeta meta,
    required String title,
    required String subtitle,
    Widget? trailing,
    VoidCallback? onTap,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: AppColors.bgCard.withValues(alpha: 0.7),
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(16),
          child: Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: meta.color.withValues(alpha: 0.3)),
            ),
            child: Row(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      colors: [meta.color.withValues(alpha: 0.25), meta.color.withValues(alpha: 0.08)],
                    ),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  alignment: Alignment.center,
                  child: Text(meta.icon, style: const TextStyle(fontSize: 20)),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(title, style: const TextStyle(color: AppColors.textPrimary, fontWeight: FontWeight.w700, fontSize: 14)),
                      const SizedBox(height: 2),
                      Text(subtitle, style: const TextStyle(color: AppColors.textMuted, fontSize: 11)),
                    ],
                  ),
                ),
                ?trailing,
              ],
            ),
          ),
        ),
      ),
    );
  }
}
