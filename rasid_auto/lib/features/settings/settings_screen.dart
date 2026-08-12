import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../core/services/drive_session.dart';
import '../../theme/rasid_theme.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key, required this.session});

  final DriveSession session;

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  late final TextEditingController _nameCtrl;
  late final TextEditingController _phoneCtrl;
  bool _savingProfile = false;
  String? _profileError;
  String? _profileSuccess;

  DriveSession get session => widget.session;

  @override
  void initState() {
    super.initState();
    final cfg = session.driverConfig;
    _nameCtrl = TextEditingController(text: cfg?.driverName ?? '');
    _phoneCtrl = TextEditingController(text: cfg?.phoneNumber ?? '');
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _phoneCtrl.dispose();
    super.dispose();
  }

  Future<void> _saveProfile() async {
    setState(() {
      _savingProfile = true;
      _profileError = null;
      _profileSuccess = null;
    });
    final err = await session.updateDriverProfile(
      driverName: _nameCtrl.text,
      phoneNumber: _phoneCtrl.text,
    );
    if (!mounted) return;
    setState(() {
      _savingProfile = false;
      if (err != null) {
        _profileError = err;
      } else {
        _profileSuccess = 'تم الحفظ — يظهر في لوحة التحكم';
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('الإعدادات')),
      body: ListView(
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom + 16),
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
            child: Text(
              'بيانات المركبة',
              style: GoogleFonts.cairo(
                fontWeight: FontWeight.w700,
                color: RasidColors.safety,
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: TextField(
              controller: _nameCtrl,
              textInputAction: TextInputAction.next,
              autocorrect: false,
              decoration: InputDecoration(
                labelText: 'اسم السائق',
                prefixIcon: const Icon(Icons.person_outline, color: RasidColors.safety),
                filled: true,
                fillColor: RasidColors.asphaltCard,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
              ),
              style: GoogleFonts.cairo(color: Colors.white),
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: TextField(
              controller: _phoneCtrl,
              keyboardType: TextInputType.phone,
              textInputAction: TextInputAction.done,
              autocorrect: false,
              decoration: InputDecoration(
                labelText: 'رقم هاتف المركبة',
                hintText: '07XXXXXXXXX',
                prefixIcon: const Icon(Icons.phone_outlined, color: RasidColors.safety),
                filled: true,
                fillColor: RasidColors.asphaltCard,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
              ),
              style: GoogleFonts.cairo(color: Colors.white),
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: FilledButton.icon(
              onPressed: _savingProfile ? null : _saveProfile,
              icon: _savingProfile
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                    )
                  : const Icon(Icons.save_outlined),
              label: Text(
                _savingProfile ? 'جاري الحفظ…' : 'حفظ وإرسال للوحة التحكم',
                style: GoogleFonts.cairo(fontWeight: FontWeight.w700),
              ),
              style: FilledButton.styleFrom(
                backgroundColor: RasidColors.safety,
                padding: const EdgeInsets.symmetric(vertical: 12),
              ),
            ),
          ),
          if (_profileError != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
              child: Text(
                _profileError!,
                style: GoogleFonts.cairo(color: RasidColors.danger, fontSize: 13),
              ),
            ),
          if (_profileSuccess != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
              child: Text(
                _profileSuccess!,
                style: GoogleFonts.cairo(color: RasidColors.info, fontSize: 13),
              ),
            ),
          ListTile(
            dense: true,
            leading: Icon(
              session.online ? Icons.wifi : Icons.wifi_off,
              color: session.online ? RasidColors.info : RasidColors.mistDim,
            ),
            title: Text(session.online ? 'متصل بلوحة التحكم' : 'غير متصل'),
            subtitle: Text(
              session.driverConfig != null
                  ? '${session.driverConfig!.vehicleId} · ${session.driverConfig!.deviceId}'
                  : 'تحقق من اتصال السيرفر',
              style: GoogleFonts.cairo(fontSize: 12, color: RasidColors.mistDim),
            ),
          ),
          const Divider(height: 32),
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
                  ? '${session.driverConfig!.driverName} · ${session.driverConfig!.vehicleId}'
                  : 'غير متصل — تحقق من السيرفر',
              style: GoogleFonts.cairo(fontSize: 12, color: RasidColors.mistDim),
            ),
          ),
          const SizedBox(height: 24),
          Center(
            child: Text(
              'RASID Auto v1.5.8 · Cloud YOLO',
              style: GoogleFonts.cairo(color: RasidColors.mistDim, fontSize: 12),
            ),
          ),
        ],
      ),
    );
  }
}
