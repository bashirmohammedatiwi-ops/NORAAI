import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:latlong2/latlong.dart';

import '../../core/models/hospital.dart';
import '../../core/services/drive_session.dart';
import '../../theme/rasid_theme.dart';
import '../../widgets/nav_hud.dart';
import '../../widgets/rasid_map.dart';
import '../../widgets/speed_display.dart';
import '../../widgets/vibration_meter.dart';

class MapScreen extends StatefulWidget {
  const MapScreen({super.key, required this.session});

  final DriveSession session;

  @override
  State<MapScreen> createState() => _MapScreenState();
}

class _MapScreenState extends State<MapScreen> {
  final _controller = MapController();

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: widget.session,
      builder: (context, _) => _buildBody(widget.session),
    );
  }

  Widget _buildBody(DriveSession session) {
    final vib = session.accel.latest.vibrationPercent;
    return Scaffold(
      appBar: AppBar(
        title: const Text('الخريطة التفاعلية'),
        actions: [
          IconButton(
            tooltip: 'المستشفيات',
            onPressed: () {
              session.setShowHospitals(!session.showHospitals);
            },
            icon: Icon(
              Icons.local_hospital,
              color: session.showHospitals
                  ? RasidColors.danger
                  : RasidColors.mistDim,
            ),
          ),
          IconButton(
            tooltip: 'المخاطر',
            onPressed: () {
              session.setShowHazards(!session.showHazards);
            },
            icon: Icon(
              Icons.warning_amber_rounded,
              color: session.showHazards
                  ? RasidColors.amber
                  : RasidColors.mistDim,
            ),
          ),
          IconButton(
            tooltip: 'موقعي',
            onPressed: () {
              _controller.move(
                LatLng(session.latitude, session.longitude),
                16,
              );
            },
            icon: const Icon(Icons.my_location_rounded),
          ),
        ],
      ),
      body: Stack(
        children: [
          RasidMap(
            session: session,
            mapController: _controller,
            onHospitalTap: (h) => _navigateTo(h),
          ),
          Positioned(
            top: 12,
            left: 12,
            child: VibrationMeter(percent: vib, size: 78),
          ),
          // Speed + street limit cluster (top-right).
          Positioned(
            top: 12,
            right: 12,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                SpeedReadout(
                  speed: session.speedKmh,
                  limit: session.limitKmh,
                  size: 72,
                ),
                const SizedBox(height: 8),
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 5,
                      ),
                      decoration: BoxDecoration(
                        color: RasidColors.asphaltCard.withValues(alpha: 0.9),
                        borderRadius: BorderRadius.circular(999),
                        border: Border.all(color: RasidColors.lane),
                      ),
                      child: Text(
                        session.zoneNameAr,
                        style: GoogleFonts.cairo(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    SpeedLimitSign(limit: session.limitKmh, size: 46),
                  ],
                ),
              ],
            ),
          ),
          if (session.navigating)
            Positioned(
              top: 110,
              left: 100,
              right: 12,
              child: NavHud(session: session),
            ),
          if (session.overSpeedCountdownSec > 0)
            Positioned(
              top: session.navigating ? 170 : 110,
              left: 16,
              right: 16,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                decoration: BoxDecoration(
                  color: RasidColors.danger.withValues(alpha: 0.92),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Text(
                  'مخالفة خلال ${session.overSpeedCountdownSec} ث · 200,000 د.ع',
                  textAlign: TextAlign.center,
                  style: GoogleFonts.cairo(
                    fontWeight: FontWeight.w800,
                    fontSize: 14,
                    color: Colors.white,
                  ),
                ),
              ),
            ),
          Positioned(
            left: 16,
            right: 16,
            bottom: 24,
            child: Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: RasidColors.asphaltCard.withValues(alpha: 0.94),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: RasidColors.lane),
              ),
              child: Row(
                children: [
                  Icon(
                    Icons.vibration_rounded,
                    color: vib >= 40 ? RasidColors.warning : RasidColors.amber,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      session.navigating
                          ? 'مسار نشط · ${session.events.length} خطر'
                          : 'اهتزاز الطريق ${vib.round()}% · '
                              '${session.events.length} خطر · '
                              '${session.nearestHospitals.length} مستشفى',
                      style: GoogleFonts.cairo(fontSize: 13),
                    ),
                  ),
                  if (session.routingBusy)
                    const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () {
          widget.session.requestTab(2);
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                'التقط صورة للشارع في تبويب «تبليغ»',
                style: GoogleFonts.cairo(),
              ),
              backgroundColor: RasidColors.asphaltElevated,
            ),
          );
        },
        backgroundColor: RasidColors.amber,
        foregroundColor: const Color(0xFF1A1400),
        icon: const Icon(Icons.document_scanner_outlined),
        label: const Text('تبليغ بالصورة'),
      ),
    );
  }

  Future<void> _navigateTo(Hospital h) async {
    final go = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: RasidColors.asphaltElevated,
        title: Text(h.nameAr, style: GoogleFonts.cairo(fontWeight: FontWeight.w800)),
        content: Text(
          'رسم المسار والانتقال إلى وضع القيادة؟',
          style: GoogleFonts.cairo(),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('إلغاء'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('اذهب الآن'),
          ),
        ],
      ),
    );
    if (go != true || !mounted) return;
    final ok = await widget.session.navigateToHospital(h);
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          ok
              ? 'تم رسم المسار إلى ${h.nameAr}'
              : (widget.session.routingError ?? 'فشل التوجيه'),
        ),
        backgroundColor: ok ? RasidColors.asphaltElevated : RasidColors.danger,
      ),
    );
  }
}
