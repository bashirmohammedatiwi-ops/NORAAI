import 'package:flutter/services.dart';

/// Bridges Flutter alerts/status to the Android Auto Car App Service.
class AndroidAutoBridge {
  AndroidAutoBridge._();
  static final AndroidAutoBridge instance = AndroidAutoBridge._();

  static const _channel = MethodChannel('com.rasid.auto/car');

  Future<void> pushStatus({
    required double speedKmh,
    required double limitKmh,
    required String zoneNameAr,
    String? alertTitle,
    String? alertBody,
    bool detecting = false,
    int potholeCount = 0,
    int bumpCount = 0,
    String backendName = '',
    bool navigating = false,
    String navDestName = '',
    double navRemainingM = 0,
    int navEtaMin = 0,
    int vibrationPercent = 0,
    double headingDeg = 0,
    int overSpeedCountdownSec = 0,
    int openFinesCount = 0,
    double latitude = 0,
    double longitude = 0,
    List<Map<String, String>> hospitals = const [],
    List<Map<String, Object>> fines = const [],
    String routePoints = '',
    String hazards = '',
  }) async {
    try {
      await _channel.invokeMethod('pushStatus', {
        'speedKmh': speedKmh,
        'limitKmh': limitKmh,
        'zone': zoneNameAr,
        'alertTitle': alertTitle,
        'alertBody': alertBody,
        'detecting': detecting,
        'potholeCount': potholeCount,
        'bumpCount': bumpCount,
        'backendName': backendName,
        'navigating': navigating,
        'navDestName': navDestName,
        'navRemainingM': navRemainingM,
        'navEtaMin': navEtaMin,
        'vibrationPercent': vibrationPercent,
        'headingDeg': headingDeg,
        'overSpeedCountdownSec': overSpeedCountdownSec,
        'openFinesCount': openFinesCount,
        'latitude': latitude,
        'longitude': longitude,
        'hospitals': hospitals,
        'fines': fines,
        'routePoints': routePoints,
        'hazards': hazards,
      });
    } catch (_) {}
  }

  Future<void> clearAlert() async {
    try {
      await _channel.invokeMethod('clearAlert');
    } catch (_) {}
  }

  Future<Map<String, dynamic>?> pollCarCommand() async {
    try {
      final r = await _channel.invokeMethod<dynamic>('pollCarCommand');
      if (r is Map) {
        return Map<String, dynamic>.from(r);
      }
    } catch (_) {}
    return null;
  }

  /// Audible countdown on the car head unit (and phone when bridged).
  Future<void> playCountdownAlarm(int sec) async {
    try {
      await _channel.invokeMethod('playCountdownAlarm', {'sec': sec});
    } catch (_) {}
  }

  /// Vehicle speed from car hardware (mirrors dash) when the host exposes it.
  /// Returns null if unavailable (typical for phone-projected Android Auto).
  Future<double?> getVehicleSpeed() async {
    try {
      final r = await _channel.invokeMethod<dynamic>('getVehicleSpeed');
      if (r is num) {
        final v = r.toDouble();
        if (v >= 0) return v;
      }
    } catch (_) {}
    return null;
  }
}
