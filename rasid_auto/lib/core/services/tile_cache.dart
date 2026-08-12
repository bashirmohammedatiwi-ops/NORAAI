import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

/// Disk-backed OSM/CARTO tile cache for smooth offline map reuse.
class TileCache {
  TileCache._();
  static final TileCache instance = TileCache._();

  Directory? _root;
  final _memory = <String, Uint8List>{};
  static const _maxMemory = 128;

  Future<Directory> get root async {
    if (_root != null) return _root!;
    final docs = await getApplicationDocumentsDirectory();
    _root = Directory(p.join(docs.path, 'map-tiles'));
    if (!await _root!.exists()) await _root!.create(recursive: true);
    return _root!;
  }

  Future<Uint8List?> get(String url) async {
    final key = _key(url);
    final mem = _memory[key];
    if (mem != null) return mem;
    final file = File(p.join((await root).path, key));
    if (await file.exists()) {
      final bytes = await file.readAsBytes();
      _putMem(key, bytes);
      return bytes;
    }
    return null;
  }

  Future<Uint8List?> fetchAndCache(String url) async {
    final cached = await get(url);
    if (cached != null) return cached;
    try {
      final res = await http.get(Uri.parse(url)).timeout(
        const Duration(seconds: 8),
      );
      if (res.statusCode != 200) return null;
      final bytes = res.bodyBytes;
      await put(url, bytes);
      return bytes;
    } catch (e) {
      debugPrint('tile fetch fail: $e');
      return null;
    }
  }

  Future<void> put(String url, Uint8List bytes) async {
    final key = _key(url);
    _putMem(key, bytes);
    final file = File(p.join((await root).path, key));
    await file.writeAsBytes(bytes, flush: false);
  }

  void _putMem(String key, Uint8List bytes) {
    if (_memory.length >= _maxMemory) {
      _memory.remove(_memory.keys.first);
    }
    _memory[key] = bytes;
  }

  String _key(String url) {
    // filesystem-safe
    return url
        .replaceAll(RegExp(r'[^a-zA-Z0-9]'), '_')
        .replaceAll(RegExp(r'_+'), '_');
  }
}
