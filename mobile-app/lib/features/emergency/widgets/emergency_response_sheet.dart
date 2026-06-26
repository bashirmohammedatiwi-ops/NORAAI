import 'package:flutter/material.dart';

import '../../../theme/app_colors.dart';
import '../models/hospital.dart';
import '../services/emergency_service.dart';
import '../services/hospital_repository.dart';

class EmergencyResponseSheet extends StatelessWidget {
  const EmergencyResponseSheet({
    super.key,
    required this.hospitals,
    required this.selectedHospital,
    required this.routingInProgress,
    required this.routeSummary,
    required this.accidentDetected,
    required this.onDismiss,
    required this.onSelectHospital,
    required this.onClearRoute,
  });

  final List<HospitalWithDistance> hospitals;
  final Hospital? selectedHospital;
  final bool routingInProgress;
  final String? routeSummary;
  final bool accidentDetected;
  final VoidCallback onDismiss;
  final void Function(Hospital hospital) onSelectHospital;
  final VoidCallback onClearRoute;

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.of(context).padding.bottom;
    return Material(
      color: Colors.transparent,
      child: Container(
        constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.78),
        decoration: const BoxDecoration(
          color: Color(0xFF0F172A),
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
          boxShadow: [
            BoxShadow(color: Colors.black54, blurRadius: 24, offset: Offset(0, -4)),
          ],
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 10),
            Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: Colors.white24,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            Flexible(
              child: ListView(
                padding: EdgeInsets.fromLTRB(20, 16, 20, bottom + 16),
                shrinkWrap: true,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              accidentDetected ? '🚨 تم رصد حادث' : '🏥 الطوارئ والمستشفيات',
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 20,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              accidentDetected
                                  ? 'اتصل فوراً واختر أقرب مستشفى'
                                  : 'مستشفيات بغداد — اختر وجهة',
                              style: const TextStyle(color: AppColors.textMuted, fontSize: 13),
                            ),
                          ],
                        ),
                      ),
                      IconButton(
                        onPressed: onDismiss,
                        icon: const Icon(Icons.close_rounded, color: Colors.white54),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  _EmergencyDialCard(),
                  if (selectedHospital != null) ...[
                    const SizedBox(height: 14),
                    _ActiveRouteCard(
                      hospital: selectedHospital!,
                      routeSummary: routeSummary,
                      routingInProgress: routingInProgress,
                      onClear: onClearRoute,
                    ),
                  ],
                  const SizedBox(height: 18),
                  const Text(
                    'أقرب مستشفيات بغداد',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 10),
                  if (hospitals.isEmpty)
                    const Padding(
                      padding: EdgeInsets.all(24),
                      child: Center(child: CircularProgressIndicator(color: AppColors.accent)),
                    )
                  else
                    ...hospitals.map(
                      (item) => _HospitalTile(
                        item: item,
                        selected: selectedHospital?.id == item.hospital.id,
                        loading: routingInProgress && selectedHospital?.id == item.hospital.id,
                        onTap: () => onSelectHospital(item.hospital),
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _EmergencyDialCard extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            AppColors.danger.withValues(alpha: 0.95),
            const Color(0xFFB91C1C),
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(18),
        boxShadow: [
          BoxShadow(
            color: AppColors.danger.withValues(alpha: 0.45),
            blurRadius: 16,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Column(
        children: [
          const Text(
            EmergencyService.display911,
            style: TextStyle(
              color: Colors.white,
              fontSize: 52,
              fontWeight: FontWeight.w900,
              letterSpacing: 2,
              height: 1,
            ),
          ),
          const SizedBox(height: 4),
          const Text(
            'طوارئ — Emergency',
            style: TextStyle(color: Colors.white70, fontSize: 13, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 6),
          const Text(
            'في العراق: اتصل 115 (إسعاف) · 104 (دفاع مدني)',
            textAlign: TextAlign.center,
            style: TextStyle(color: Colors.white60, fontSize: 11),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: FilledButton.icon(
                  onPressed: () => EmergencyService.dialAmbulance(),
                  style: FilledButton.styleFrom(
                    backgroundColor: Colors.white,
                    foregroundColor: AppColors.danger,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                  ),
                  icon: const Icon(Icons.local_hospital_rounded, size: 22),
                  label: const Text('115 إسعاف', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => EmergencyService.dialCivilDefense(),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: Colors.white,
                    side: const BorderSide(color: Colors.white54),
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                  ),
                  icon: const Icon(Icons.local_fire_department_rounded, size: 20),
                  label: const Text('104', style: TextStyle(fontWeight: FontWeight.w700)),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _ActiveRouteCard extends StatelessWidget {
  const _ActiveRouteCard({
    required this.hospital,
    required this.routeSummary,
    required this.routingInProgress,
    required this.onClear,
  });

  final Hospital hospital;
  final String? routeSummary;
  final bool routingInProgress;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.accent.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.accent.withValues(alpha: 0.35)),
      ),
      child: Row(
        children: [
          const Icon(Icons.route_rounded, color: AppColors.accentBright, size: 28),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'مسار إلى ${hospital.nameAr}',
                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 13),
                ),
                const SizedBox(height: 4),
                Text(
                  routingInProgress
                      ? 'جاري حساب المسار...'
                      : (routeSummary ?? '—'),
                  style: const TextStyle(color: AppColors.textMuted, fontSize: 12),
                ),
              ],
            ),
          ),
          if (!routingInProgress)
            TextButton(onPressed: onClear, child: const Text('إلغاء', style: TextStyle(color: AppColors.textMuted))),
        ],
      ),
    );
  }
}

class _HospitalTile extends StatelessWidget {
  const _HospitalTile({
    required this.item,
    required this.selected,
    required this.loading,
    required this.onTap,
  });

  final HospitalWithDistance item;
  final bool selected;
  final bool loading;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final h = item.hospital;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: selected ? AppColors.accent.withValues(alpha: 0.15) : const Color(0xFF1E293B),
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          onTap: loading ? null : onTap,
          borderRadius: BorderRadius.circular(16),
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: (h.hasTrauma ? AppColors.danger : AppColors.info).withValues(alpha: 0.2),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(
                    h.hasTrauma ? Icons.emergency_rounded : Icons.local_hospital_outlined,
                    color: h.hasTrauma ? AppColors.danger : AppColors.info,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        h.nameAr,
                        style: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.w700,
                          fontSize: 14,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        h.addressAr,
                        style: const TextStyle(color: AppColors.textMuted, fontSize: 11),
                      ),
                      const SizedBox(height: 6),
                      Wrap(
                        spacing: 6,
                        runSpacing: 4,
                        children: [
                          _chip(item.distanceLabel, AppColors.accentBright),
                          _chip(h.typeLabelAr, AppColors.textSecondary),
                          if (h.hasEmergency) _chip('طوارئ', AppColors.danger),
                          if (h.hasTrauma) _chip('إصابات', const Color(0xFFF97316)),
                        ],
                      ),
                      if (h.notesAr != null) ...[
                        const SizedBox(height: 4),
                        Text(h.notesAr!, style: const TextStyle(color: AppColors.textMuted, fontSize: 10)),
                      ],
                    ],
                  ),
                ),
                if (loading)
                  const SizedBox(
                    width: 22,
                    height: 22,
                    child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.accent),
                  )
                else
                  Icon(
                    selected ? Icons.check_circle_rounded : Icons.navigation_rounded,
                    color: selected ? AppColors.accentBright : Colors.white38,
                    size: 22,
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _chip(String label, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(label, style: TextStyle(color: color, fontSize: 10, fontWeight: FontWeight.w600)),
    );
  }
}
