import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../config/app_config.dart';
import '../../core/models/driver_config.dart';
import '../../core/services/api_exception.dart';
import '../../core/services/config_storage.dart';
import '../../core/services/rasid_api_service.dart';
import '../../theme/rasid_theme.dart';

class SetupScreen extends StatefulWidget {
  const SetupScreen({super.key, required this.onReady});

  final ValueChanged<DriverConfig> onReady;

  @override
  State<SetupScreen> createState() => _SetupScreenState();
}

class _SetupScreenState extends State<SetupScreen> {
  final _serverUrl = TextEditingController(text: kDefaultServerUrl);
  final _projectId = TextEditingController();
  final _driverName = TextEditingController();
  final _carNumber = TextEditingController();
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _serverUrl.dispose();
    _projectId.dispose();
    _driverName.dispose();
    _carNumber.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final name = _driverName.text.trim();
    final plate = _carNumber.text.trim();
    final project = _projectId.text.trim();
    if (name.isEmpty || plate.isEmpty || project.isEmpty) {
      setState(() => _error = 'أدخل اسم السائق ورقم السيارة ومعرّف المشروع');
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    final draft = DriverConfig(
      serverUrl: normalizeServerUrl(_serverUrl.text),
      projectId: project,
      deviceId: '',
      vehicleId: plate,
      apiKey: '',
      driverName: name,
    );
    final api = RasidApiService(draft);

    try {
      final healthy = await api.pingHealth();
      if (!healthy) {
        throw ApiException('health', userMessage: 'السيرفر لا يستجيب — تحقق من العنوان');
      }
      final registered = await api.registerDevice(
        projectId: project,
        driverName: name,
        vehicleId: plate,
      );
      await api.fetchConfig();
      await ConfigStorage.save(registered);
      if (!mounted) return;
      widget.onReady(registered);
    } on ApiException catch (e) {
      setState(() => _error = e.displayMessage);
    } catch (e) {
      setState(() => _error = ApiException.fromError(e).displayMessage);
    } finally {
      api.dispose();
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: RasidColors.asphalt,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    'مرحباً في راصد',
                    textAlign: TextAlign.center,
                    style: GoogleFonts.cairo(
                      fontSize: 26,
                      fontWeight: FontWeight.w800,
                      color: RasidColors.safety,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'سجّل بياناتك مرة واحدة — تظهر في لوحة التحكم كمركبة نشطة',
                    textAlign: TextAlign.center,
                    style: GoogleFonts.cairo(color: RasidColors.mistDim, fontSize: 13),
                  ),
                  const SizedBox(height: 28),
                  _field(_driverName, 'اسم السائق', Icons.person_outline),
                  const SizedBox(height: 12),
                  _field(_carNumber, 'رقم السيارة', Icons.directions_car_outlined),
                  const SizedBox(height: 12),
                  _field(_projectId, 'معرّف المشروع (Project ID)', Icons.key_outlined),
                  const SizedBox(height: 12),
                  _field(_serverUrl, 'عنوان السيرفر', Icons.dns_outlined),
                  if (_error != null) ...[
                    const SizedBox(height: 16),
                    Text(
                      _error!,
                      style: GoogleFonts.cairo(color: RasidColors.danger, fontSize: 13),
                    ),
                  ],
                  const SizedBox(height: 24),
                  FilledButton(
                    onPressed: _loading ? null : _submit,
                    style: FilledButton.styleFrom(
                      backgroundColor: RasidColors.safety,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                    ),
                    child: _loading
                        ? const SizedBox(
                            width: 22,
                            height: 22,
                            child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                          )
                        : Text(
                            'تسجيل والبدء',
                            style: GoogleFonts.cairo(fontWeight: FontWeight.w700),
                          ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _field(TextEditingController c, String label, IconData icon) {
    return TextField(
      controller: c,
      decoration: InputDecoration(
        labelText: label,
        prefixIcon: Icon(icon, color: RasidColors.safety),
        filled: true,
        fillColor: RasidColors.asphaltCard,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
      ),
      style: GoogleFonts.cairo(color: Colors.white),
    );
  }
}
