import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
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

  static Future<String> _hashFile(File file) async {
    final digest = await sha256.bind(file.openRead()).first;
    return digest.toString().toLowerCase();
  }

  /// Quick check: valid local ONNX file matching expected SHA (no network).
  static Future<ModelSyncResult?> tryLocalReady(String expectedSha) async {
    if (!supportsLocalOnnx || !supportsLocalInference) return null;
    final sha = expectedSha.toLowerCase();
    if (sha.isEmpty) return null;

    final modelPath = await ApiService.modelFilePath();
    final modelFile = File(modelPath);
    if (!await modelFile.exists()) return null;
    if (await modelFile.length() < 50_000) return null;

    try {
      final fileSha = await _hashFile(modelFile);
      if (fileSha != sha) return null;

      String? version;
      try {
        final metaPath = await _metaPath();
        final cached = jsonDecode(await File(metaPath).readAsString()) as Map<String, dynamic>;
        version = cached['version'] as String?;
      } catch (_) {}

      return ModelSyncResult(
        ready: true,
        path: modelPath,
        version: version ?? sha.substring(0, 16),
        sha256: sha,
        message: 'موديل ${version ?? sha.substring(0, 16)} جاهز محلياً',
      );
    } catch (e) {
      debugPrint('ModelSync.tryLocalReady failed: $e');
      return null;
    }
  }

  static Future<ModelSyncResult> sync(
    ApiService api,
    String? remoteVersion, {
    String? expectedSha256,
    void Function(double progress)? onProgress,
  }) async {
    if (!supportsLocalOnnx || !supportsLocalInference) {
      return ModelSyncResult(
        ready: true,
        version: remoteVersion,
        message: kIsWeb
            ? 'متصفح — الاكتشاف عبر السيرفر'
            : 'اكتشاف عبر السيرفر — لا حاجة لتحميل ONNX',
      );
    }

    try {
      onProgress?.call(0.02);
      final manifest = await api.fetchManifest();
      final sha = (manifest['sha256'] as String? ?? '').toLowerCase();
      final version = manifest['version'] as String? ?? remoteVersion ?? '';
      final sizeMb = (manifest['model_size_mb'] as num?)?.toDouble();
      final expectedBytes = sizeMb != null && sizeMb > 0 ? (sizeMb * 1024 * 1024).round() : null;

      if (sha.isEmpty) {
        return const ModelSyncResult(ready: false, message: 'بيانات الموديل غير مكتملة على السيرفر');
      }

      if (expectedSha256 != null && expectedSha256.toLowerCase() != sha) {
        debugPrint('ModelSync: server sha changed since config fetch');
      }

      final localReady = await tryLocalReady(sha);
      if (localReady != null) {
        onProgress?.call(1.0);
        return localReady;
      }

      final metaPath = await _metaPath();
      final modelPath = await ApiService.modelFilePath();

      if (await File(modelPath).exists()) {
        try {
          final cached = jsonDecode(await File(metaPath).readAsString()) as Map<String, dynamic>;
          final cachedSha = (cached['sha256'] as String? ?? '').toLowerCase();
          if (cachedSha == sha) {
            final fileSha = await _hashFile(File(modelPath));
            if (fileSha == sha) {
              onProgress?.call(1.0);
              return ModelSyncResult(
                ready: true,
                path: modelPath,
                version: version,
                sha256: sha,
                message: 'موديل $version جاهز محلياً',
              );
            }
            debugPrint('ModelSync: local file sha mismatch ($fileSha != $sha), re-downloading');
          }
        } catch (e) {
          debugPrint('ModelSync: cache read failed: $e');
        }
      }

      const maxAttempts = 3;
      Object? lastError;
      for (var attempt = 1; attempt <= maxAttempts; attempt++) {
        final tmpPath = '$modelPath.part';
        try {
          await File(tmpPath).parent.create(recursive: true);
          if (await File(tmpPath).exists()) await File(tmpPath).delete();

          onProgress?.call(0.05);
          await api.downloadModel(
            tmpPath,
            expectedBytes: expectedBytes,
            onProgress: (received, total) {
              final denom = total;
              if (denom != null && denom > 0) {
                onProgress?.call((0.05 + (received / denom) * 0.92).clamp(0.05, 0.97));
              } else {
                final estMb = received / (1024 * 1024);
                onProgress?.call((0.05 + estMb * 0.15).clamp(0.05, 0.97));
              }
            },
          );

          final tmpFile = File(tmpPath);
          final fileLen = await tmpFile.length();
          if (fileLen < 50_000) {
            await tmpFile.delete();
            throw ApiException(
              'file too small',
              userMessage: 'الملف المحمّل صغير جداً ($fileLen بايت) — أعد المحاولة',
            );
          }

          onProgress?.call(0.98);
          final fileSha = await _hashFile(tmpFile);
          if (fileSha != sha) {
            await tmpFile.delete();
            throw ApiException(
              'sha mismatch',
              userMessage:
                  'فشل التحقق من الموديل — أعد المحاولة ($attempt/$maxAttempts)',
            );
          }

          if (await File(modelPath).exists()) await File(modelPath).delete();
          await tmpFile.copy(modelPath);
          await tmpFile.delete();
          await File(metaPath).writeAsString(jsonEncode(manifest));
          onProgress?.call(1.0);

          return ModelSyncResult(
            ready: true,
            path: modelPath,
            version: version,
            sha256: sha,
            message: 'تم تحميل الموديل $version (${sizeMb?.toStringAsFixed(1) ?? "?"} MB)',
          );
        } catch (e) {
          lastError = e;
          debugPrint('ModelSync attempt $attempt failed: $e');
          if (await File(tmpPath).exists()) {
            try {
              await File(tmpPath).delete();
            } catch (_) {}
          }
          if (attempt < maxAttempts) {
            await Future<void>.delayed(Duration(seconds: attempt * 4));
          }
        }
      }

      final msg = lastError is ApiException
          ? lastError.displayMessage
          : ApiException.fromError(lastError ?? 'unknown').displayMessage;
      return ModelSyncResult(
        ready: false,
        message: '$msg — بعد $maxAttempts محاولات. اضغط «مزامنة» للمحاولة يدوياً.',
      );
    } on ApiException catch (e) {
      return ModelSyncResult(ready: false, message: e.displayMessage);
    } catch (e) {
      return ModelSyncResult(ready: false, message: ApiException.fromError(e).displayMessage);
    }
  }

}
