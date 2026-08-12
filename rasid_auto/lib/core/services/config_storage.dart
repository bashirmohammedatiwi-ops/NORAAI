import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../models/driver_config.dart';

class ConfigStorage {
  static const _key = 'rasid_auto_driver_config';
  static const _setupDoneKey = 'rasid_auto_setup_done';

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
    await prefs.setBool(_setupDoneKey, true);
  }

  static Future<bool> isSetupDone() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(_setupDoneKey) ?? false;
  }

  static Future<void> clear() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_key);
    await prefs.remove(_setupDoneKey);
  }
}
