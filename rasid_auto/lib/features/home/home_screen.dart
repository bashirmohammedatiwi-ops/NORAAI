import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../core/models/detection.dart';
import '../../core/services/drive_session.dart';
import '../../theme/rasid_theme.dart';
import '../../widgets/glass_card.dart';
import '../../widgets/speed_gauge.dart';
import '../../widgets/stat_chip.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({
    super.key,
    required this.session,
    required this.onOpenDrive,
    required this.onOpenMap,
    required this.onOpenScan,
    required this.onOpenHospitals,
    required this.onOpenFines,
    required this.onOpenSettings,
  });

  final DriveSession session;
  final VoidCallback onOpenDrive;
  final VoidCallback onOpenMap;
  final VoidCallback onOpenScan;
  final VoidCallback onOpenHospitals;
  final VoidCallback onOpenFines;
  final VoidCallback onOpenSettings;

  @override
  Widget build(BuildContext context) {
    final modelReady = session.detectorReady;
    return DecoratedBox(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            Color(0xFF121820),
            RasidColors.asphalt,
            Color(0xFF070A0E),
          ],
        ),
      ),
      child: SafeArea(
        child: CustomScrollView(
          slivers: [
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'RASID',
                            style: GoogleFonts.cairo(
                              fontSize: 36,
                              fontWeight: FontWeight.w900,
                              height: 1,
                              letterSpacing: 1.5,
                              color: RasidColors.amber,
                            ),
                          ),
                          Text(
                            'قيادة ذكية على الجهاز · Android Auto',
                            style: GoogleFonts.cairo(
                              fontSize: 13,
                              color: RasidColors.mistDim,
                            ),
                          ),
                        ],
                      ),
                    ),
                    IconButton(
                      onPressed: onOpenSettings,
                      icon: const Icon(Icons.tune_rounded),
                      color: RasidColors.mist,
                    ),
                  ],
                ),
              ),
            ),
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 22, 20, 0),
                child: GlassCard(
                  child: Row(
                    children: [
                      SpeedGauge(
                        speed: session.speedKmh,
                        limit: session.limitKmh,
                        size: 118,
                      ),
                      const SizedBox(width: 16),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              session.zoneNameAr,
                              style: GoogleFonts.cairo(
                                fontWeight: FontWeight.w700,
                                fontSize: 16,
                              ),
                            ),
                            const SizedBox(height: 6),
                            Text(
                              'الحد ${session.limitKmh.toStringAsFixed(0)} كم/س',
                              style: const TextStyle(color: RasidColors.mistDim),
                            ),
                            const SizedBox(height: 10),
                            Wrap(
                              spacing: 8,
                              runSpacing: 8,
                              children: [
                                StatChip(
                                  label: modelReady
                                      ? 'متصل · Cloud'
                                      : 'غير متصل',
                                  color: modelReady
                                      ? RasidColors.safety
                                      : RasidColors.warning,
                                ),
                                StatChip(
                                  label: session.driving ? 'قيادة' : 'متوقف',
                                  color: session.driving
                                      ? RasidColors.amber
                                      : RasidColors.mistDim,
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 18, 20, 0),
                child: FilledButton.icon(
                  onPressed: () {
                    if (session.driving) {
                      session.stopDriving();
                    } else {
                      session.startDriving();
                    }
                    onOpenDrive();
                  },
                  icon: Icon(
                    session.driving
                        ? Icons.stop_circle_outlined
                        : Icons.play_arrow_rounded,
                  ),
                  label: Text(
                    session.driving ? 'إيقاف القيادة' : 'بدء القيادة الآن',
                  ),
                  style: FilledButton.styleFrom(
                    minimumSize: const Size.fromHeight(54),
                  ),
                ),
              ),
            ),
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(20, 22, 20, 0),
              sliver: SliverGrid.count(
                crossAxisCount: 2,
                mainAxisSpacing: 12,
                crossAxisSpacing: 12,
                childAspectRatio: 1.35,
                children: [
                  _Tile(
                    title: 'الخريطة',
                    subtitle: 'مخاطر ومستشفيات',
                    icon: Icons.map_rounded,
                    color: RasidColors.info,
                    onTap: onOpenMap,
                  ),
                  _Tile(
                    title: 'تبليغ يدوي',
                    subtitle: 'صورة · مسح · إرسال',
                    icon: Icons.document_scanner_outlined,
                    color: RasidColors.safety,
                    onTap: onOpenScan,
                  ),
                  _Tile(
                    title: 'المستشفيات',
                    subtitle: '${session.nearestHospitals.length} قريبة',
                    icon: Icons.local_hospital_rounded,
                    color: RasidColors.danger,
                    onTap: onOpenHospitals,
                  ),
                  _Tile(
                    title: 'الغرامات',
                    subtitle: '${session.fines.length} سجل',
                    icon: Icons.gavel_rounded,
                    color: RasidColors.amber,
                    onTap: onOpenFines,
                  ),
                ],
              ),
            ),
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 22, 20, 28),
                child: GlassCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'آخر تنبيه',
                        style: GoogleFonts.cairo(
                          fontWeight: FontWeight.w700,
                          fontSize: 15,
                        ),
                      ),
                      const SizedBox(height: 8),
                      if (session.lastAlert == null)
                        const Text(
                          'لا توجد تنبيهات بعد — ابدأ القيادة لتفعيل الكشف',
                          style: TextStyle(color: RasidColors.mistDim),
                        )
                      else
                        Row(
                          children: [
                            Icon(
                              hazardIcon(session.lastAlert!.kind),
                              color: hazardColor(session.lastAlert!.kind),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Text(
                                '${session.lastAlert!.labelAr} · '
                                '${(session.lastAlert!.confidence * 100).round()}%',
                              ),
                            ),
                          ],
                        ),
                      const SizedBox(height: 12),
                      Text(
                        session.statusMessage ?? '',
                        style: const TextStyle(
                          color: RasidColors.mistDim,
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Tile extends StatelessWidget {
  const _Tile({
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.color,
    required this.onTap,
  });

  final String title;
  final String subtitle;
  final IconData icon;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: RasidColors.asphaltCard,
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(18),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.16),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(icon, color: color, size: 22),
              ),
              const Spacer(),
              Text(
                title,
                style: GoogleFonts.cairo(
                  fontWeight: FontWeight.w800,
                  fontSize: 16,
                ),
              ),
              Text(
                subtitle,
                style: const TextStyle(color: RasidColors.mistDim, fontSize: 12),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
