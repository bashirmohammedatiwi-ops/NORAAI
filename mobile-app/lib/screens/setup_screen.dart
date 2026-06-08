import 'package:flutter/material.dart';

import '../models/driver_config.dart';
import '../services/api_service.dart';
import '../services/config_storage.dart';

class SetupScreen extends StatefulWidget {
  const SetupScreen({super.key, required this.onReady});

  final ValueChanged<DriverConfig> onReady;

  @override
  State<SetupScreen> createState() => _SetupScreenState();
}

class _SetupScreenState extends State<SetupScreen> {
  final _serverUrl = TextEditingController(text: 'https://');
  final _projectId = TextEditingController();
  final _deviceId = TextEditingController();
  final _vehicleId = TextEditingController();
  final _apiKey = TextEditingController();
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _serverUrl.dispose();
    _projectId.dispose();
    _deviceId.dispose();
    _vehicleId.dispose();
    _apiKey.dispose();
    super.dispose();
  }

  Future<void> _connect() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final config = DriverConfig(
      serverUrl: _serverUrl.text.trim(),
      projectId: _projectId.text.trim(),
      deviceId: _deviceId.text.trim(),
      vehicleId: _vehicleId.text.trim(),
      apiKey: _apiKey.text.trim(),
    );
    try {
      await ApiService(config).fetchConfig();
      await ConfigStorage.save(config);
      if (!mounted) return;
      widget.onReady(config);
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
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
                      const SizedBox(height: 20),
                      _field('رابط السيرفر', _serverUrl),
                      _field('Project ID', _projectId),
                      _field('Device ID', _deviceId),
                      _field('Vehicle ID', _vehicleId),
                      _field('API Key', _apiKey, obscure: true),
                      if (_error != null) ...[
                        const SizedBox(height: 8),
                        Text(_error!, style: const TextStyle(color: Color(0xFFF87171), fontSize: 12)),
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
