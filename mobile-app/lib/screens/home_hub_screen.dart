import 'package:flutter/material.dart';

import '../controllers/drive_session.dart';
import '../theme/app_colors.dart';
import '../widgets/app_tile.dart';
import '../widgets/connection_banner.dart';
import '../widgets/headway_gauge.dart';
import '../widgets/nurai_background.dart';
import '../widgets/nurai_header.dart';
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
        final topPad = MediaQuery.of(context).padding.top;

        return NuraiBackground(
          child: CustomScrollView(
            physics: const BouncingScrollPhysics(),
            slivers: [
              SliverToBoxAdapter(
                child: Padding(
                  padding: EdgeInsets.fromLTRB(20, topPad + 16, 20, 0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      NuraiHeader(
                        title: 'NURAI Drive',
                        subtitle: '${s.config.vehicleId} · ${s.connectionLabel}',
                        trailing: [
                          IconButton(
                            onPressed: s.logout,
                            style: IconButton.styleFrom(
                              backgroundColor: AppColors.danger.withValues(alpha: 0.12),
                            ),
                            icon: const Icon(Icons.logout_rounded, color: AppColors.danger, size: 20),
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),
                      const ConnectionBanner(),
                      const SizedBox(height: 16),
                      _HeroCockpit(s: s, speed: speed),
                      if (s.configMessage != null && s.configMessage!.isNotEmpty) ...[
                        const SizedBox(height: 12),
                        _infoBanner(s.configMessage!),
                      ],
                      const SizedBox(height: 28),
                      const Text(
                        'وضع القيادة',
                        style: TextStyle(
                          color: AppColors.textPrimary,
                          fontSize: 20,
                          fontWeight: FontWeight.w800,
                          letterSpacing: -0.3,
                        ),
                      ),
                      const SizedBox(height: 4),
                      const Text(
                        'اختر التجربة المناسبة لرحلتك',
                        style: TextStyle(color: AppColors.textMuted, fontSize: 13),
                      ),
                      const SizedBox(height: 16),
                    ],
                  ),
                ),
              ),
              SliverPadding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                sliver: SliverGrid(
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 2,
                    mainAxisSpacing: 14,
                    crossAxisSpacing: 14,
                    childAspectRatio: 0.92,
                  ),
                  delegate: SliverChildListDelegate([
                    AppTile(
                      icon: Icons.dashboard_customize_rounded,
                      label: 'قيادة كاملة',
                      subtitle: 'خريطة + كاميرا + لوحة قيادة',
                      color: AppColors.info,
                      large: true,
                      onTap: () => onOpenTab(5),
                    ),
                    AppTile(
                      icon: Icons.map_rounded,
                      label: 'الخرائط',
                      subtitle: 'ملاحة حية وأحداث',
                      color: AppColors.accentBright,
                      onTap: () => onOpenTab(1),
                    ),
                    AppTile(
                      icon: Icons.videocam_rounded,
                      label: 'الكاميرا',
                      subtitle: 'اكتشاف AI مباشر',
                      color: AppColors.purple,
                      badge: s.scanning ? '●' : null,
                      onTap: () => onOpenTab(2),
                    ),
                    AppTile(
                      icon: Icons.notifications_active_rounded,
                      label: 'التنبيهات',
                      subtitle: 'مباشر + قريب',
                      color: AppColors.orange,
                      badge: s.alertsCount > 0 ? '${s.alertsCount}' : null,
                      onTap: () => onOpenTab(4),
                    ),
                    AppTile(
                      icon: Icons.psychology_rounded,
                      label: 'الموديل',
                      subtitle: cfg?.modelName ?? 'ONNX والكلاسات',
                      color: AppColors.accent,
                      onTap: () => onOpenTab(3),
                    ),
                    AppTile(
                      icon: Icons.cloud_sync_rounded,
                      label: 'مزامنة',
                      subtitle: s.syncingModel
                          ? '${(s.modelSyncProgress * 100).round()}%'
                          : (s.lastSyncText ?? 'تحديث الإعدادات'),
                      color: AppColors.warning,
                      badge: s.syncingModel ? '…' : null,
                      onTap: s.syncingModel ? null : () => s.syncModelNow(),
                    ),
                  ]),
                ),
              ),
              const SliverToBoxAdapter(child: SizedBox(height: 110)),
            ],
          ),
        );
      },
    );
  }

  Widget _infoBanner(String msg) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.warning.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.warning.withValues(alpha: 0.3)),
      ),
      child: Row(
        children: [
          const Icon(Icons.info_outline_rounded, color: AppColors.warning, size: 18),
          const SizedBox(width: 10),
          Expanded(child: Text(msg, style: const TextStyle(color: Color(0xFFFDE68A), fontSize: 12))),
        ],
      ),
    );
  }
}

class _HeroCockpit extends StatelessWidget {
  const _HeroCockpit({required this.s, required this.speed});

  final DriveSession s;
  final double? speed;

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      padding: const EdgeInsets.all(18),
      borderColor: AppColors.accent.withValues(alpha: 0.25),
      child: Column(
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SpeedGauge(
                speed: speed,
                limit: s.roadSpeed.cached.limit,
                compact: false,
                accuracyM: s.gpsAccuracyM,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      s.placeName ??
                          s.roadSpeed.cached.roadName ??
                          (s.hasGpsFix ? 'جاري تحديد العنوان...' : (s.gpsError ?? 'انتظر إشارة GPS...')),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: AppColors.textPrimary,
                        fontWeight: FontWeight.w700,
                        fontSize: 14,
                        height: 1.3,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: [
                        _tag(Icons.speed_rounded, 'حد ${s.roadSpeed.cached.limit.round()}', AppColors.accent),
                        if (s.usesLocalInference)
                          _tag(Icons.memory_rounded, 'ONNX', AppColors.purple),
                        if (s.scanning) _tag(Icons.radar_rounded, 'AI', AppColors.accentBright),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Text(
                      s.modelStatus,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(color: AppColors.textMuted, fontSize: 10),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              StatPill(
                icon: Icons.vibration_rounded,
                label: 'اهتزاز',
                value: s.vibrationSensorAvailable ? '${s.vibrationLevel}%' : '—',
                color: AppColors.accentBright,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: AppColors.bgDeep.withValues(alpha: 0.5),
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: AppColors.border),
                  ),
                  child: HeadwayGauge(state: s.followingDistance, compact: true),
                ),
              ),
              const SizedBox(width: 8),
              StatPill(
                icon: Icons.warning_amber_rounded,
                label: 'تنبيهات',
                value: '${s.alertsCount}',
                color: AppColors.orange,
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _tag(IconData icon, String text, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withValues(alpha: 0.25)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 12, color: color),
          const SizedBox(width: 4),
          Text(text, style: TextStyle(color: color, fontSize: 10, fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}
