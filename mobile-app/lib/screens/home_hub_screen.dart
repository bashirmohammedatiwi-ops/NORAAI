import 'package:flutter/material.dart';

import '../controllers/drive_session.dart';
import '../widgets/app_tile.dart';
import '../widgets/connection_banner.dart';
import '../widgets/speed_gauge.dart';

class HomeHubScreen extends StatelessWidget {
  const HomeHubScreen({super.key, required this.onOpenTab});

  final ValueChanged<int> onOpenTab;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: DriveSessionScope.of(context),
      builder: (context, _) {
        final s = DriveSessionScope.of(context);
        final cfg = s.serverCfg;
        final speed = s.speedKmh;

        return CustomScrollView(
          slivers: [
            SliverToBoxAdapter(
              child: Padding(
                padding: EdgeInsets.fromLTRB(16, MediaQuery.of(context).padding.top + 12, 16, 0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Container(
                          width: 48,
                          height: 48,
                          decoration: BoxDecoration(
                            color: const Color(0xFF0D9488),
                            borderRadius: BorderRadius.circular(14),
                          ),
                          alignment: Alignment.center,
                          child: const Text(
                            'N',
                            style: TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.bold),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text(
                                'NURAI Drive',
                                style: TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.bold),
                              ),
                              Text(
                                '${s.config.vehicleId} · ${s.connectionLabel}',
                                style: TextStyle(
                                  color: s.online ? const Color(0xFF94A3B8) : const Color(0xFFF87171),
                                  fontSize: 12,
                                ),
                              ),
                            ],
                          ),
                        ),
                        IconButton(
                          onPressed: s.logout,
                          icon: const Icon(Icons.logout, color: Color(0xFFF87171)),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    const ConnectionBanner(),
                    const SizedBox(height: 12),
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        gradient: const LinearGradient(
                          colors: [Color(0xFF0F766E), Color(0xFF0D9488)],
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                        ),
                        borderRadius: BorderRadius.circular(18),
                      ),
                      child: Row(
                        children: [
                          SpeedGauge(speed: speed, limit: s.roadSpeed.cached.limit, compact: true),
                          const SizedBox(width: 16),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  s.placeName ??
                                      s.roadSpeed.cached.roadName ??
                                      (s.hasGpsFix ? 'جاري تحديد العنوان...' : (s.gpsError ?? 'جاري تحديد الموقع...')),
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  s.modelStatus,
                                  style: const TextStyle(color: Color(0xCCFFFFFF), fontSize: 11),
                                ),
                                Text(
                                  '${s.eventsCount} حدث · ${s.alertsCount} تنبيه',
                                  style: const TextStyle(color: Color(0xB3FFFFFF), fontSize: 10),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                    if (s.configMessage != null && s.configMessage!.isNotEmpty) ...[
                      const SizedBox(height: 10),
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: const Color(0x33F59E0B),
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(color: const Color(0x66F59E0B)),
                        ),
                        child: Text(s.configMessage!, style: const TextStyle(color: Color(0xFFFDE68A), fontSize: 11)),
                      ),
                    ],
                    const SizedBox(height: 20),
                    const Text(
                      'التطبيقات',
                      style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 4),
                    const Text(
                      'اختر وضع القيادة المناسب',
                      style: TextStyle(color: Color(0xFF64748B), fontSize: 12),
                    ),
                    const SizedBox(height: 12),
                  ],
                ),
              ),
            ),
            SliverPadding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              sliver: SliverGrid(
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 2,
                  mainAxisSpacing: 12,
                  crossAxisSpacing: 12,
                  childAspectRatio: 1.05,
                ),
                delegate: SliverChildListDelegate([
                  AppTile(
                    icon: Icons.map_outlined,
                    label: 'الخرائط',
                    subtitle: 'خريطة حية + أحداث قريبة + سرعة',
                    color: const Color(0xFF2DD4BF),
                    onTap: () => onOpenTab(1),
                  ),
                  AppTile(
                    icon: Icons.videocam_outlined,
                    label: 'الكاميرا',
                    subtitle: 'اكتشاف AI كامل الشاشة',
                    color: const Color(0xFF8B5CF6),
                    badge: s.scanning ? '●' : null,
                    onTap: () => onOpenTab(2),
                  ),
                  AppTile(
                    icon: Icons.psychology_outlined,
                    label: 'الموديل',
                    subtitle: cfg?.modelName ?? 'معلومات الموديل والكلاسات',
                    color: const Color(0xFF0D9488),
                    onTap: () => onOpenTab(3),
                  ),
                  AppTile(
                    icon: Icons.notifications_active_outlined,
                    label: 'التنبيهات',
                    subtitle: 'مباشر + أحداث قريبة',
                    color: const Color(0xFFF97316),
                    badge: s.alertsCount > 0 ? '${s.alertsCount}' : null,
                    onTap: () => onOpenTab(4),
                  ),
                  AppTile(
                    icon: Icons.dashboard_outlined,
                    label: 'قيادة كاملة',
                    subtitle: 'خريطة + كاميرا + لوحة معاً',
                    color: const Color(0xFF3B82F6),
                    onTap: () => onOpenTab(5),
                  ),
                  AppTile(
                    icon: Icons.sync,
                    label: 'مزامنة',
                    subtitle: s.syncingModel ? 'جاري المزامنة...' : 'تحديث الموديل والإعدادات',
                    color: const Color(0xFFEAB308),
                    onTap: s.syncingModel ? () {} : () => s.syncModelNow(),
                  ),
                ]),
              ),
            ),
            const SliverToBoxAdapter(child: SizedBox(height: 100)),
          ],
        );
      },
    );
  }
}
