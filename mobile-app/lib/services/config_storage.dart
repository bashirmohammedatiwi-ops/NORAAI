import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../models/detection.dart';
import '../models/driver_config.dart';

class ConfigStorage {
  static const _key = 'norai_flutter_config';
  static const _modelVersionKey = 'norai_model_version';
  static const _modelShaKey = 'norai_model_sha256';
  static const _serverCfgKey = 'norai_server_config';

  static Future<DriverConfig?> load() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_key);
    if (raw == null) return null;
    try {
      return DriverConfig.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      return null;
    }
  }

  static Future<void> save(DriverConfig config) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_key, jsonEncode(config.toJson()));
  }

  static Future<void> clear() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_key);
    await prefs.remove(_modelVersionKey);
    await prefs.remove(_modelShaKey);
  }

  static Future<({String? version, String? sha256})> loadModelCache() async {
    final prefs = await SharedPreferences.getInstance();
    return (
      version: prefs.getString(_modelVersionKey),
      sha256: prefs.getString(_modelShaKey),
    );
  }

  static Future<void> saveModelCache({String? version, String? sha256}) async {
    final prefs = await SharedPreferences.getInstance();
    if (version != null) {
      await prefs.setString(_modelVersionKey, version);
    }
    if (sha256 != null) {
      await prefs.setString(_modelShaKey, sha256);
    }
  }

  static Future<void> saveServerConfig(ServerConfig config) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_serverCfgKey, jsonEncode(config.toJson()));
  }

  static Future<ServerConfig?> loadServerConfig() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_serverCfgKey);
    if (raw == null) return null;
    try {
      return ServerConfig.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      return null;
    }
  }
}
