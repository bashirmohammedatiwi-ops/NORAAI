import 'package:flutter/material.dart';

import '../config/app_config.dart';
import '../models/driver_config.dart';
import '../services/api_exception.dart';
import '../services/api_service.dart';
import '../services/config_storage.dart';

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

  static const _tags = ['حفرة', 'حادث', 'طريق مغلق', 'مخالفة سرعة', 'خريطة حية', 'AI'];

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
          SnackBar(
            content: Text(cfg.message ?? 'متصل — لكن الموديل غير جاهز بعد'),
            backgroundColor: const Color(0xFFF59E0B),
          ),
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
      backgroundColor: const Color(0xFF0F172A),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Card(
                color: const Color(0xFF1E293B),
                child: Padding(
                  padding: const EdgeInsets.all(20),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const Text(
                        'NURAI Drive',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 26,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: 4),
                      const Text(
                        'تطبيق السائق · Flutter',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: Color(0xFF94A3B8)),
                      ),
                      const SizedBox(height: 12),
                      Wrap(
                        spacing: 6,
                        runSpacing: 6,
                        alignment: WrapAlignment.center,
                        children: _tags
                            .map((t) => Chip(
                                  label: Text(t, style: const TextStyle(fontSize: 10)),
                                  backgroundColor: const Color(0xFF0F172A),
                                  side: const BorderSide(color: Color(0xFF334155)),
                                  labelStyle: const TextStyle(color: Color(0xFF94A3B8)),
                                  padding: EdgeInsets.zero,
                                  visualDensity: VisualDensity.compact,
                                ))
                            .toList(),
                      ),
                      const SizedBox(height: 16),
                      _field('رابط السيرفر', _serverUrl),
                      const Text(
                        'السيرفر الافتراضي: $kDefaultServerUrl',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: Color(0xFF64748B), fontSize: 11),
                      ),
                      const SizedBox(height: 8),
                      _field('Project ID', _projectId),
                      _field('Device ID', _deviceId),
                      _field('Vehicle ID', _vehicleId),
                      _field('API Key', _apiKey, obscure: true),
                      _field('حد السرعة الاحتياطي (كم/س)', _speedLimit),
                      if (_status != null) ...[
                        const SizedBox(height: 8),
                        Row(
                          children: [
                            const SizedBox(
                              width: 14,
                              height: 14,
                              child: CircularProgressIndicator(strokeWidth: 2, color: Color(0xFF0D9488)),
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                _status!,
                                style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 11),
                              ),
                            ),
                          ],
                        ),
                      ],
                      if (_error != null) ...[
                        const SizedBox(height: 8),
                        Container(
                          padding: const EdgeInsets.all(10),
                          decoration: BoxDecoration(
                            color: const Color(0x33EF4444),
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(color: const Color(0x66EF4444)),
                          ),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Icon(Icons.error_outline, color: Color(0xFFF87171), size: 18),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  _error!,
                                  style: const TextStyle(color: Color(0xFFF87171), fontSize: 12),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                      const SizedBox(height: 16),
                      FilledButton(
                        onPressed: _loading ? null : _connect,
                        style: FilledButton.styleFrom(
                          backgroundColor: const Color(0xFF0D9488),
                          padding: const EdgeInsets.symmetric(vertical: 14),
                        ),
                        child: Text(_loading ? 'جاري الاتصال...' : 'بدء القيادة'),
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

  Widget _field(String label, TextEditingController c, {bool obscure = false}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 12)),
          const SizedBox(height: 4),
          TextField(
            controller: c,
            obscureText: obscure,
            style: const TextStyle(color: Colors.white),
            decoration: InputDecoration(
              filled: true,
              fillColor: const Color(0xFF0F172A),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
            ),
          ),
        ],
      ),
    );
  }
}
