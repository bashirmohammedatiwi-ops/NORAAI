import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:path_provider/path_provider.dart';

import '../utils/platform_support.dart';
import 'api_exception.dart';
import 'api_service.dart';

class ModelSyncResult {
  const ModelSyncResult({
    required this.ready,
    required this.message,
    this.path,
    this.version,
    this.sha256,
  });

  final bool ready;
  final String message;
  final String? path;
  final String? version;
  final String? sha256;
}

class ModelSync {
  static Future<String> _metaPath() async {
    final dir = await getApplicationDocumentsDirectory();
    return '${dir.path}/norai-model/manifest.json';
  }

  static Future<ModelSyncResult> sync(
    ApiService api,
    String? remoteVersion, {
    void Function(double progress)? onProgress,
  }) async {
    if (!supportsLocalOnnx) {
      return ModelSyncResult(
        ready: true,
        version: remoteVersion,
        message: kIsWeb
            ? 'متصفح — الاكتشاف عبر السيرفر (لا حاجة لتحميل ONNX)'
            : 'المنصة الحالية لا تدعم الموديل المحلي',
      );
    }

    try {
      final manifest = await api.fetchManifest();
      final sha = manifest['sha256'] as String? ?? '';
      final version = manifest['version'] as String? ?? remoteVersion ?? '';
      if (sha.isEmpty) {
        return const ModelSyncResult(ready: false, message: 'بيانات الموديل غير مكتملة على السيرفر');
      }

      final metaPath = await _metaPath();
      final modelPath = await ApiService.modelFilePath();

      var needsDownload = true;
      if (await File(modelPath).exists()) {
        try {
          final cached = jsonDecode(await File(metaPath).readAsString()) as Map<String, dynamic>;
          if (cached['sha256'] == sha) needsDownload = false;
        } catch (_) {}
      }

      if (needsDownload) {
        await api.downloadModel(
          modelPath,
          onProgress: (received, total) {
            if (total != null && total > 0) {
              onProgress?.call(received / total);
            }
          },
        );
        await File(metaPath).writeAsString(jsonEncode(manifest));
        return ModelSyncResult(
          ready: true,
          path: modelPath,
          version: version,
          sha256: sha,
          message: 'تم تحميل الموديل $version',
        );
      }

      return ModelSyncResult(
        ready: true,
        path: modelPath,
        version: version,
        sha256: sha,
        message: 'موديل $version جاهز محلياً',
      );
    } on ApiException catch (e) {
      return ModelSyncResult(ready: false, message: e.displayMessage);
    } catch (e) {
      return ModelSyncResult(ready: false, message: ApiException.fromError(e).displayMessage);
    }
  }
}
