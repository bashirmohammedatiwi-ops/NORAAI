import 'package:uuid/uuid.dart';

import '../../config/app_config.dart';
import '../models/driver_config.dart';
import 'api_exception.dart';
import 'config_storage.dart';
import 'rasid_api_service.dart';

/// Silent device registration — no setup screen.
class ConfigBootstrap {
  static Future<DriverConfig?> ensureRegistered() async {
    final existing = await ConfigStorage.load();
    if (existing != null && existing.apiKey.isNotEmpty) {
      return existing;
    }

    final draft = DriverConfig(
      serverUrl: kDefaultServerUrl,
      projectId: '',
      deviceId: '',
      vehicleId: '',
      apiKey: '',
      driverName: kDefaultDriverName,
    );
    final api = RasidApiService(draft);
    try {
      if (!await api.pingHealth()) return null;
      final bootstrap = await api.fetchBootstrap();
      final projectId = bootstrap['project_id'] as String? ?? '';
      if (projectId.isEmpty) return null;

      final plate = 'RASID-${const Uuid().v4().substring(0, 6).toUpperCase()}';
      final registered = await api.registerDevice(
        projectId: projectId,
        driverName: kDefaultDriverName,
        vehicleId: plate,
      );
      await ConfigStorage.save(registered);
      return registered;
    } on ApiException {
      return null;
    } catch (_) {
      return null;
    } finally {
      api.dispose();
    }
  }
}
