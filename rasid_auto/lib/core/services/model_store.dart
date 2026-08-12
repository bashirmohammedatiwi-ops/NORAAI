import 'dart:convert';
import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

/// On-device segmentation model storage (ONNX + manifest).
class ModelStore {
  ModelStore._();
  static final ModelStore instance = ModelStore._();

  Directory? _dir;

  Future<Directory> get dir async {
    if (_dir != null) return _dir!;
    final docs = await getApplicationDocumentsDirectory();
    _dir = Directory(p.join(docs.path, 'rasid-model'));
    if (!await _dir!.exists()) await _dir!.create(recursive: true);
    return _dir!;
  }

  Future<String> get modelPath async => p.join((await dir).path, 'model.onnx');
  Future<String> get manifestPath async =>
      p.join((await dir).path, 'manifest.json');

  Future<bool> get hasModel async => File(await modelPath).exists();

  Future<Map<String, dynamic>?> readManifest() async {
    final f = File(await manifestPath);
    if (!await f.exists()) return null;
    try {
      return jsonDecode(await f.readAsString()) as Map<String, dynamic>;
    } catch (_) {
      return null;
    }
  }

  Future<Map<String, dynamic>?> readBundledManifest() async {
    try {
      final raw = await rootBundle.loadString('assets/models/manifest.json');
      return jsonDecode(raw) as Map<String, dynamic>;
    } catch (_) {
      return null;
    }
  }

  /// Copy bundled U-Net ONNX + manifest into Documents (overwrites).
  Future<bool> restoreBundledModel() async {
    try {
      final data = await rootBundle.load('assets/models/model.onnx');
      final onnx = File(await modelPath);
      await onnx.writeAsBytes(
        data.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes),
        flush: true,
      );
      final manifestAsset =
          await rootBundle.loadString('assets/models/manifest.json');
      await File(await manifestPath).writeAsString(manifestAsset);
      return true;
    } catch (e) {
      debugPrint('restoreBundledModel failed: $e');
      return false;
    }
  }

  Future<void> ensureDefaults() async {
    final mFile = File(await manifestPath);
    final onnx = File(await modelPath);
    final bundled = await readBundledManifest();
    final local = await readManifest();

    final needsModel = !await onnx.exists();

    if (needsModel) {
      final ok = await restoreBundledModel();
      if (!ok && !await mFile.exists()) {
        await mFile.writeAsString(jsonEncode({
          'name': 'RASID Road Segmentation',
          'task': 'segmentation',
          'format': 'onnx',
          'image_size': 256,
          'resize_mode': 'stretch',
          'normalize': 'div255',
          'layout': 'NHWC',
          'classes': ['background', 'pothole'],
          'mock_fallback': true,
        }));
      }
      return;
    }

    // Model present but stale/wrong manifest from older builds → refresh metadata.
    if (bundled != null) {
      final loc = local;
      final layout = (loc?['layout'] ?? '').toString().toUpperCase();
      final size = (loc?['image_size'] as num?)?.toInt();
      final sameFamily =
          loc != null && loc['source'] == bundled['source'];
      final legacyPlaceholder = loc == null ||
          (loc['source'] == null &&
              (size == 320 || layout == 'NCHW' || loc['normalize'] == null));
      if (sameFamily && loc['version'] != bundled['version']) {
        await mFile.writeAsString(jsonEncode(bundled));
        debugPrint('ModelStore: upgraded same-family bundled manifest');
      } else if (legacyPlaceholder) {
        await mFile.writeAsString(jsonEncode(bundled));
        debugPrint('ModelStore: replaced legacy placeholder manifest');
      }
    }

    if (!await mFile.exists() && bundled != null) {
      await mFile.writeAsString(jsonEncode(bundled));
    }
  }

  Future<bool> importOnnxFromPicker() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.any,
      allowMultiple: false,
      withData: false,
    );
    if (result == null || result.files.isEmpty) return false;
    final path = result.files.single.path;
    if (path == null) return false;
    if (!path.toLowerCase().endsWith('.onnx')) {
      throw Exception('اختر ملف ‎.onnx فقط (Segmentation)');
    }
    await File(path).copy(await modelPath);

    // Prefer sibling manifest.json next to the picked ONNX; else keep bundled.
    final sibling = File(p.join(p.dirname(path), 'manifest.json'));
    if (await sibling.exists()) {
      await sibling.copy(await manifestPath);
    } else {
      final bundled = await readBundledManifest();
      if (bundled != null) {
        await File(await manifestPath).writeAsString(jsonEncode(bundled));
      }
    }
    return true;
  }

  Future<void> clearModel() async {
    final f = File(await modelPath);
    if (await f.exists()) await f.delete();
  }
}
