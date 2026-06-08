import 'dart:convert';
import 'dart:io';

import 'package:path_provider/path_provider.dart';

import '../models/driver_config.dart';
import 'api_service.dart';

class ModelSyncResult {
  const ModelSyncResult({
    required this.ready,
    required this.message,
    this.path,
    this.version,
  });

  final bool ready;
  final String message;
  final String? path;
  final String? version;
}

class ModelSync {
  static Future<String> _metaPath() async {
    final dir = await getApplicationDocumentsDirectory();
    return '${dir.path}/norai-model/manifest.json';
  }

  static Future<ModelSyncResult> sync(
    DriverConfig config,
    String? remoteVersion,
  ) async {
    final api = ApiService(config);
    try {
      final manifest = await api.fetchManifest();
      final sha = manifest['sha256'] as String? ?? '';
      final version = manifest['version'] as String? ?? remoteVersion ?? '';
      final metaPath = await _metaPath();
      final modelPath = await ApiService.modelFilePath();

      var needsDownload = true;
      if (await File(modelPath).exists()) {
        try {
          final cached = jsonDecode(await File(metaPath).readAsString())
              as Map<String, dynamic>;
          if (cached['sha256'] == sha) needsDownload = false;
        } catch (_) {}
      }

      if (needsDownload) {
        await api.downloadModel(modelPath);
        await File(metaPath).writeAsString(jsonEncode(manifest));
      }

      return ModelSyncResult(
        ready: true,
        path: modelPath,
        version: version,
        message: needsDownload ? 'تم تحميل الموديل $version' : 'موديل $version جاهز',
      );
    } catch (e) {
      return ModelSyncResult(ready: false, message: 'فشل مزامنة الموديل: $e');
    }
  }
}
