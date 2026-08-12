import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../core/services/drive_session.dart';
import '../../theme/rasid_theme.dart';

class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key, required this.session});

  final DriveSession session;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('الإعدادات')),
      body: ListView(
        children: [
          SwitchListTile(
            title: const Text('وضع Debug'),
            subtitle: const Text('FPS · latency · sensors · track IDs'),
            value: session.debugMode,
            activeThumbColor: RasidColors.amber,
            onChanged: session.setDebugMode,
          ),
          SwitchListTile(
            title: const Text('تنبيهات اهتزاز'),
            value: session.hapticAlerts,
            activeThumbColor: RasidColors.amber,
            onChanged: session.setHapticAlerts,
          ),
          SwitchListTile(
            title: const Text('إظهار المستشفيات'),
            value: session.showHospitals,
            activeThumbColor: RasidColors.amber,
            onChanged: session.setShowHospitals,
          ),
          SwitchListTile(
            title: const Text('إظهار المخاطر'),
            value: session.showHazards,
            activeThumbColor: RasidColors.amber,
            onChanged: session.setShowHazards,
          ),
          ListTile(
            title: const Text('حد ثقة الكشف'),
            subtitle: Text('${(session.minConfidence * 100).round()}%'),
          ),
          Slider(
            value: session.minConfidence,
            min: 0.15,
            max: 0.8,
            divisions: 13,
            activeColor: RasidColors.amber,
            label: '${(session.minConfidence * 100).round()}%',
            onChanged: session.setMinConfidence,
          ),
          ListTile(
            leading: const Icon(Icons.sync_rounded, color: RasidColors.info),
            title: const Text('مزامنة التنبيهات'),
            subtitle: const Text('جلب آخر التنبيهات من لوحة التحكم'),
            onTap: () => session.syncServerEvents(),
          ),
          const Divider(),
          ListTile(
            leading: const Icon(Icons.phone_android, color: RasidColors.safety),
            title: const Text('Android Auto'),
            subtitle: Text(
              'عند توصيل الهاتف بالسيارة يظهر RASID على شاشة السيارة '
              'مع السرعة والتنبيهات.',
              style: GoogleFonts.cairo(fontSize: 12, color: RasidColors.mistDim),
            ),
          ),
          ListTile(
            leading: const Icon(Icons.cloud_outlined, color: RasidColors.safety),
            title: const Text('كشف Rasid Cloud'),
            subtitle: Text(
              session.driverConfig != null
                  ? '${session.driverConfig!.driverName} · ${session.driverConfig!.vehicleId} · '
                      '${session.online ? "متصل" : "غير متصل"}'
                  : 'أكمل الإعداد من الشاشة الأولى',
              style: GoogleFonts.cairo(fontSize: 12, color: RasidColors.mistDim),
            ),
          ),
          const SizedBox(height: 24),
          Center(
            child: Text(
              'RASID Auto v1.5 · Cloud YOLO',
              style: GoogleFonts.cairo(color: RasidColors.mistDim, fontSize: 12),
            ),
          ),
        ],
      ),
    );
  }
}
