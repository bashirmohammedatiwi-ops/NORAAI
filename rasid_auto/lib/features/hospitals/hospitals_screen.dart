import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/models/hospital.dart';
import '../../core/services/drive_session.dart';
import '../../theme/rasid_theme.dart';

class HospitalsScreen extends StatelessWidget {
  const HospitalsScreen({super.key, required this.session});

  final DriveSession session;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: session,
      builder: (context, _) {
        final list = session.nearestHospitals;
        return Scaffold(
          appBar: AppBar(title: const Text('أقرب المستشفيات')),
          body: ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: list.length,
            itemBuilder: (context, i) {
              final h = list[i];
              final km = session.distanceToHospitalKm(h);
              final active = session.navigationTarget?.id == h.id;
              return Container(
                margin: const EdgeInsets.only(bottom: 12),
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: RasidColors.asphaltCard,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(
                    color: active
                        ? RasidColors.safety
                        : h.hasTrauma
                            ? RasidColors.danger.withValues(alpha: 0.45)
                            : RasidColors.lane,
                    width: active ? 1.6 : 1,
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        const Icon(
                          Icons.local_hospital,
                          color: RasidColors.danger,
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            h.nameAr,
                            style: GoogleFonts.cairo(
                              fontWeight: FontWeight.w800,
                              fontSize: 15,
                            ),
                          ),
                        ),
                        Text(
                          '${km.toStringAsFixed(1)} كم',
                          style: const TextStyle(
                            color: RasidColors.amber,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Text(
                      '${h.addressAr} · ${h.typeLabelAr}',
                      style: const TextStyle(
                        color: RasidColors.mistDim,
                        fontSize: 12,
                      ),
                    ),
                    if (h.notesAr != null) ...[
                      const SizedBox(height: 4),
                      Text(h.notesAr!, style: const TextStyle(fontSize: 12)),
                    ],
                    const SizedBox(height: 10),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        if (h.hasEmergency)
                          const Chip(
                            label: Text('طوارئ'),
                            visualDensity: VisualDensity.compact,
                          ),
                        if (h.hasTrauma)
                          const Chip(
                            label: Text('رضوض'),
                            visualDensity: VisualDensity.compact,
                          ),
                        if (h.phone != null)
                          ActionChip(
                            avatar: const Icon(Icons.phone, size: 16),
                            label: Text(h.phone!),
                            onPressed: () =>
                                launchUrl(Uri.parse('tel:${h.phone}')),
                          ),
                        FilledButton.tonalIcon(
                          onPressed: session.routingBusy
                              ? null
                              : () => _go(context, h),
                          icon: session.routingBusy
                              ? const SizedBox(
                                  width: 16,
                                  height: 16,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                  ),
                                )
                              : const Icon(Icons.navigation_rounded, size: 18),
                          label: Text(
                            active ? 'جاري التوجيه' : 'اذهب الآن',
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              );
            },
          ),
        );
      },
    );
  }

  Future<void> _go(BuildContext context, Hospital h) async {
    final ok = await session.navigateToHospital(h);
    if (!context.mounted) return;
    if (ok) {
      Navigator.of(context).popUntil((r) => r.isFirst);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('تم رسم المسار إلى ${h.nameAr}'),
          backgroundColor: RasidColors.asphaltElevated,
        ),
      );
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(session.routingError ?? 'فشل التوجيه'),
          backgroundColor: RasidColors.danger,
        ),
      );
    }
  }
}
