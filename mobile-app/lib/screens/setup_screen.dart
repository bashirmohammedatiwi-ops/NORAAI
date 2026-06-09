import 'package:flutter/material.dart';

import '../config/app_config.dart';
import '../models/driver_config.dart';
import '../services/api_exception.dart';
import '../services/api_service.dart';
import '../services/config_storage.dart';
import '../theme/app_colors.dart';
import '../widgets/nurai_background.dart';

class SetupScreen extends StatefulWidget {
  const SetupScreen({super.key, required this.onReady});

  final ValueChanged<DriverConfig> onReady;

  @override
  State<SetupScreen> createState() => _SetupScreenState();
}

class _SetupScreenState extends State<SetupScreen> {
  final _serverUrl = TextEditingController(text: kDefaultServerUrl);
  final _projectId = TextEditingController();
  final _deviceId = TextEditingController();
  final _vehicleId = TextEditingController();
  final _apiKey = TextEditingController();
  final _speedLimit = TextEditingController(text: '80');
  bool _loading = false;
  String? _error;
  String? _status;

  static const _features = [
    (Icons.radar_rounded, 'اكتشاف AI'),
    (Icons.map_rounded, 'خرائط حية'),
    (Icons.speed_rounded, 'مخالفات سرعة'),
    (Icons.vibration_rounded, 'اهتزاز الطريق'),
  ];

  @override
  void dispose() {
    _serverUrl.dispose();
    _projectId.dispose();
    _deviceId.dispose();
    _vehicleId.dispose();
    _apiKey.dispose();
    _speedLimit.dispose();
    super.dispose();
  }

  Future<void> _connect() async {
    setState(() {
      _loading = true;
      _error = null;
      _status = 'جاري فحص السيرفر...';
    });

    final config = DriverConfig(
      serverUrl: normalizeServerUrl(_serverUrl.text),
      projectId: _projectId.text.trim(),
      deviceId: _deviceId.text.trim(),
      vehicleId: _vehicleId.text.trim(),
      apiKey: _apiKey.text.trim(),
      speedLimit: double.tryParse(_speedLimit.text.trim()) ?? 80,
    );

    final api = ApiService(config);
    try {
      final healthy = await api.pingHealth();
      if (!healthy) {
        throw ApiException(
          'health failed',
          userMessage: 'السيرفر لا يستجيب — تأكد من $kDefaultServerUrl والمنفذ 8080',
        );
      }

      if (mounted) setState(() => _status = 'جاري التحقق من بيانات الجهاز...');
      final cfg = await api.fetchConfig();

      await ConfigStorage.save(config);
      if (!mounted) return;
      widget.onReady(config);

      if (!cfg.modelReady && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(cfg.message ?? 'متصل — لكن الموديل غير جاهز بعد')),
        );
      }
    } on ApiException catch (e) {
      setState(() => _error = e.displayMessage);
    } catch (e) {
      setState(() => _error = ApiException.fromError(e).displayMessage);
    } finally {
      api.dispose();
      if (mounted) {
        setState(() {
          _loading = false;
          _status = null;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: NuraiBackground(
        child: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 440),
                child: GlassCard(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Center(
                        child: Container(
                          width: 72,
                          height: 72,
                          decoration: BoxDecoration(
                            gradient: AppColors.accentGradient(),
                            borderRadius: BorderRadius.circular(20),
                            boxShadow: [
                              BoxShadow(color: AppColors.accent.withValues(alpha: 0.4), blurRadius: 24, offset: const Offset(0, 8)),
                            ],
                          ),
                          alignment: Alignment.center,
                          child: const Text('N', style: TextStyle(color: Colors.white, fontSize: 32, fontWeight: FontWeight.w900)),
                        ),
                      ),
                      const SizedBox(height: 16),
                      const Text(
                        'NURAI Drive',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: AppColors.textPrimary, fontSize: 28, fontWeight: FontWeight.w900, letterSpacing: -0.5),
                      ),
                      const SizedBox(height: 4),
                      const Text(
                        'منصة القيادة الذكية للسائقين',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: AppColors.textSecondary, fontSize: 14),
                      ),
                      const SizedBox(height: 20),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                        children: _features
                            .map(
                              (f) => Column(
                                children: [
                                  Icon(f.$1, color: AppColors.accentBright, size: 22),
                                  const SizedBox(height: 4),
                                  Text(f.$2, style: const TextStyle(color: AppColors.textMuted, fontSize: 9)),
                                ],
                              ),
                            )
                            .toList(),
                      ),
                      const SizedBox(height: 24),
                      _field('رابط السيرفر', _serverUrl, Icons.dns_rounded),
                      Text('الافتراضي: $kDefaultServerUrl', textAlign: TextAlign.center, style: const TextStyle(color: AppColors.textMuted, fontSize: 11)),
                      const SizedBox(height: 12),
                      _field('Project ID', _projectId, Icons.folder_rounded),
                      _field('Device ID', _deviceId, Icons.smartphone_rounded),
                      _field('Vehicle ID', _vehicleId, Icons.directions_car_rounded),
                      _field('API Key', _apiKey, Icons.key_rounded, obscure: true),
                      _field('حد السرعة الاحتياطي', _speedLimit, Icons.speed_rounded),
                      if (_status != null) ...[
                        const SizedBox(height: 12),
                        Row(
                          children: [
                            const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.accent)),
                            const SizedBox(width: 10),
                            Expanded(child: Text(_status!, style: const TextStyle(color: AppColors.textSecondary, fontSize: 12))),
                          ],
                        ),
                      ],
                      if (_error != null) ...[
                        const SizedBox(height: 12),
                        Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: AppColors.danger.withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(color: AppColors.danger.withValues(alpha: 0.35)),
                          ),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Icon(Icons.error_outline_rounded, color: AppColors.danger, size: 20),
                              const SizedBox(width: 10),
                              Expanded(child: Text(_error!, style: const TextStyle(color: Color(0xFFFCA5A5), fontSize: 12))),
                            ],
                          ),
                        ),
                      ],
                      const SizedBox(height: 20),
                      FilledButton.icon(
                        onPressed: _loading ? null : _connect,
                        icon: _loading
                            ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                            : const Icon(Icons.rocket_launch_rounded),
                        label: Text(_loading ? 'جاري الاتصال...' : 'بدء القيادة'),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _field(String label, TextEditingController c, IconData icon, {bool obscure = false}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: TextField(
        controller: c,
        obscureText: obscure,
        style: const TextStyle(color: AppColors.textPrimary),
        decoration: InputDecoration(
          labelText: label,
          prefixIcon: Icon(icon, color: AppColors.textMuted, size: 20),
        ),
      ),
    );
  }
}
