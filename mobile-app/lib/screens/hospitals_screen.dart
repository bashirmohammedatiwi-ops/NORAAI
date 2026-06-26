import 'package:flutter/material.dart';

import '../controllers/drive_session.dart';
import '../features/emergency/services/hospital_repository.dart';
import '../features/emergency/widgets/emergency_dial_card.dart';
import '../theme/app_colors.dart';

/// Browse Baghdad hospitals anytime — no accident required.
class HospitalsScreen extends StatefulWidget {
  const HospitalsScreen({super.key});

  @override
  State<HospitalsScreen> createState() => _HospitalsScreenState();
}

class _HospitalsScreenState extends State<HospitalsScreen> {
  String _query = '';

  List<HospitalWithDistance> _filtered(DriveSession s) {
    final q = _query.trim().toLowerCase();
    final list = s.nearbyHospitals.isNotEmpty
        ? s.nearbyHospitals
        : HospitalRepository.all
            .map((h) => HospitalWithDistance(hospital: h, distanceM: 0))
            .toList();
    if (q.isEmpty) return list;
    return list.where((item) {
      final h = item.hospital;
      return h.nameAr.toLowerCase().contains(q) ||
          h.nameEn.toLowerCase().contains(q) ||
          h.addressAr.toLowerCase().contains(q);
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: DriveSessionScope.of(context),
      builder: (context, _) {
        final s = DriveSessionScope.of(context);
        final items = _filtered(s);
        final hasGps = s.position != null;

        return Scaffold(
          backgroundColor: AppColors.bgDeep,
          appBar: AppBar(
            backgroundColor: AppColors.bgDeep,
            foregroundColor: Colors.white,
            title: const Text('مستشفيات بغداد'),
            actions: [
              IconButton(
                tooltip: 'الخريطة',
                onPressed: () {
                  s.onNavigateTab?.call(1);
                  Navigator.pop(context);
                },
                icon: const Icon(Icons.map_rounded),
              ),
            ],
          ),
          body: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                child: TextField(
                  onChanged: (v) => setState(() => _query = v),
                  style: const TextStyle(color: Colors.white),
                  decoration: InputDecoration(
                    hintText: 'ابحث عن مستشفى...',
                    hintStyle: TextStyle(color: Colors.white.withValues(alpha: 0.45)),
                    prefixIcon: const Icon(Icons.search_rounded, color: AppColors.textMuted),
                    filled: true,
                    fillColor: const Color(0xFF1E293B),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(14),
                      borderSide: BorderSide.none,
                    ),
                  ),
                ),
              ),
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                  children: [
                    const EmergencyDialCard(compact: true),
                    const SizedBox(height: 16),
                    Row(
                      children: [
                        Text(
                          '${items.length} مستشفى',
                          style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w700,
                            fontSize: 15,
                          ),
                        ),
                        const Spacer(),
                        Text(
                          hasGps ? 'مرتبة حسب القرب' : 'فعّل GPS للمسافة',
                          style: const TextStyle(color: AppColors.textMuted, fontSize: 11),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    if (items.isEmpty)
                      const Padding(
                        padding: EdgeInsets.all(32),
                        child: Center(
                          child: Text('لا نتائج', style: TextStyle(color: AppColors.textMuted)),
                        ),
                      )
                    else
                      ...items.map(
                        (item) => _HospitalBrowseTile(
                          item: item,
                          hasGps: hasGps,
                          selected: s.selectedHospital?.id == item.hospital.id,
                          routing: s.hospitalRouting && s.selectedHospital?.id == item.hospital.id,
                          onNavigate: () => s.navigateToHospitalFromBrowse(item.hospital, context),
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _HospitalBrowseTile extends StatelessWidget {
  const _HospitalBrowseTile({
    required this.item,
    required this.hasGps,
    required this.selected,
    required this.routing,
    required this.onNavigate,
  });

  final HospitalWithDistance item;
  final bool hasGps;
  final bool selected;
  final bool routing;
  final VoidCallback onNavigate;

  @override
  Widget build(BuildContext context) {
    final h = item.hospital;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: selected ? AppColors.accent.withValues(alpha: 0.12) : const Color(0xFF1E293B),
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          onTap: routing ? null : onNavigate,
          borderRadius: BorderRadius.circular(16),
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(
                      h.hasTrauma ? Icons.emergency_rounded : Icons.local_hospital_rounded,
                      color: h.hasTrauma ? AppColors.danger : AppColors.info,
                      size: 26,
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
                              fontSize: 15,
                            ),
                          ),
                          Text(
                            h.nameEn,
                            style: const TextStyle(color: AppColors.textMuted, fontSize: 11),
                          ),
                        ],
                      ),
                    ),
                    if (hasGps && item.distanceM > 0)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: AppColors.accent.withValues(alpha: 0.15),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          item.distanceLabel,
                          style: const TextStyle(
                            color: AppColors.accentBright,
                            fontWeight: FontWeight.w700,
                            fontSize: 12,
                          ),
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(h.addressAr, style: const TextStyle(color: AppColors.textSecondary, fontSize: 12)),
                if (h.notesAr != null) ...[
                  const SizedBox(height: 4),
                  Text(h.notesAr!, style: const TextStyle(color: AppColors.textMuted, fontSize: 11)),
                ],
                const SizedBox(height: 10),
                Wrap(
                  spacing: 6,
                  children: [
                    _tag(h.typeLabelAr, AppColors.textSecondary),
                    if (h.hasEmergency) _tag('طوارئ 24س', AppColors.danger),
                    if (h.hasTrauma) _tag('إصابات', const Color(0xFFF97316)),
                    if (h.beds != null) _tag('${h.beds} سرير', AppColors.textMuted),
                  ],
                ),
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton.icon(
                    onPressed: routing ? null : onNavigate,
                    icon: routing
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                          )
                        : const Icon(Icons.navigation_rounded, size: 20),
                    label: Text(
                      routing ? 'جاري حساب المسار...' : 'عرض المسار على الخريطة',
                      style: const TextStyle(fontWeight: FontWeight.w700),
                    ),
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.accent,
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _tag(String label, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(label, style: TextStyle(color: color, fontSize: 10, fontWeight: FontWeight.w600)),
    );
  }
}
