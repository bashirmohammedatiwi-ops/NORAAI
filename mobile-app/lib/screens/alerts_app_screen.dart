import 'package:flutter/material.dart';

import '../controllers/drive_session.dart';
import '../utils/event_meta.dart';
import '../utils/map_geo.dart';

class AlertsAppScreen extends StatelessWidget {
  const AlertsAppScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: DriveSessionScope.of(context),
      builder: (context, _) {
        final s = DriveSessionScope.of(context);

        return CustomScrollView(
          slivers: [
            SliverToBoxAdapter(
              child: Padding(
                padding: EdgeInsets.fromLTRB(16, MediaQuery.of(context).padding.top + 8, 16, 0),
                child: const Text(
                  'التنبيهات',
                  style: TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold),
                ),
              ),
            ),
            SliverPadding(
              padding: const EdgeInsets.all(16),
              sliver: SliverList(
                delegate: SliverChildListDelegate([
                  _section('مباشر · AI (${s.liveAlerts.length})'),
                  if (s.liveAlerts.isEmpty)
                    _empty('لا توجد تنبيهات مباشرة')
                  else
                    ...s.liveAlerts.map((a) => _tile(
                          getEventMeta(a.type, s.classMeta),
                          a.label,
                          '${(a.confidence * 100).round()}%',
                        )),
                  const SizedBox(height: 16),
                  _section('قريب · خريطة (${s.nearbyEvents.length})'),
                  if (s.nearbyEvents.isEmpty)
                    _empty('لا توجد أحداث قريبة')
                  else
                    ...s.nearbyEvents.map((e) => _tile(
                          getEventMeta(e.eventType, s.classMeta),
                          getEventMeta(e.eventType, s.classMeta).labelAr,
                          formatDistanceKm(e.distanceKm),
                        )),
                  const SizedBox(height: 80),
                ]),
              ),
            ),
          ],
        );
      },
    );
  }

  Widget _section(String text) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Text(text, style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 13, fontWeight: FontWeight.w600)),
    );
  }

  Widget _empty(String text) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Text(text, style: const TextStyle(color: Color(0xFF64748B), fontSize: 12)),
    );
  }

  Widget _tile(EventMeta meta, String title, String subtitle) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFF1E293B),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: meta.color.withValues(alpha: 0.35)),
      ),
      child: Row(
        children: [
          Text(meta.icon, style: const TextStyle(fontSize: 20)),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600)),
                Text(subtitle, style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 11)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
