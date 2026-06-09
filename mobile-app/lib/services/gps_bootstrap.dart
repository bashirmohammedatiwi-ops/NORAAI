import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';

/// Platform-appropriate location settings.
///
/// Note: on web, never pass [LocationSettings.timeLimit] — geolocator_web passes
/// `Duration.inMicroseconds` to the browser as milliseconds, turning 25s into hours.
LocationSettings locationSettingsForFix({bool highAccuracy = false}) {
  if (kIsWeb) {
    return LocationSettings(
      accuracy: highAccuracy ? LocationAccuracy.high : LocationAccuracy.medium,
    );
  }
  return LocationSettings(
    accuracy: LocationAccuracy.high,
    timeLimit: const Duration(seconds: 12),
  );
}

LocationSettings locationSettingsForStream() {
  if (kIsWeb) {
    return const LocationSettings(
      accuracy: LocationAccuracy.high,
      distanceFilter: 2,
    );
  }
  if (!kIsWeb && Platform.isAndroid) {
    return AndroidSettings(
      accuracy: LocationAccuracy.bestForNavigation,
      distanceFilter: 0,
      intervalDuration: const Duration(milliseconds: 300),
      forceLocationManager: false,
    );
  }
  if (!kIsWeb && Platform.isIOS) {
    return AppleSettings(
      accuracy: LocationAccuracy.bestForNavigation,
      distanceFilter: 0,
      activityType: ActivityType.automotiveNavigation,
      pauseLocationUpdatesAutomatically: false,
      showBackgroundLocationIndicator: false,
    );
  }
  return const LocationSettings(
    accuracy: LocationAccuracy.bestForNavigation,
    distanceFilter: 0,
  );
}

/// Returns `null` when permission cannot be obtained.
Future<String?> ensureLocationPermission() async {
  if (!kIsWeb) {
    final enabled = await Geolocator.isLocationServiceEnabled();
    if (!enabled) {
      return 'خدمة الموقع معطّلة — فعّل GPS من إعدادات الجهاز';
    }

    var perm = await Geolocator.checkPermission();
    if (perm == LocationPermission.denied) {
      perm = await Geolocator.requestPermission();
    }

    if (perm == LocationPermission.deniedForever) {
      return 'صلاحية الموقع مرفوضة — فعّلها من إعدادات التطبيق';
    }
    if (perm == LocationPermission.denied) {
      return 'صلاحية الموقع مرفوضة';
    }
    return null;
  }

  // Web: browser prompts on the first geolocation call — don't use requestPermission()
  // (it calls getCurrentPosition internally and may return deniedForever on timeout).
  final perm = await Geolocator.checkPermission();
  if (perm == LocationPermission.deniedForever) {
    return 'صلاحية الموقع مرفوضة — اضغط على أيقونة القفل في شريط العنوان واسمح بالموقع';
  }
  return null;
}

/// Cached position — mobile/desktop only (unsupported on web).
Future<Position?> readLastKnownPosition() async {
  if (kIsWeb) return null;
  try {
    return await Geolocator.getLastKnownPosition();
  } catch (_) {
    return null;
  }
}

/// Try to get a quick fix with an explicit Dart-side timeout (required on web).
Future<Position?> fetchCurrentPositionFix({bool highAccuracy = false}) async {
  final settings = locationSettingsForFix(highAccuracy: highAccuracy);
  final timeout = kIsWeb ? const Duration(seconds: 15) : const Duration(seconds: 12);
  try {
    return await Geolocator.getCurrentPosition(locationSettings: settings).timeout(timeout);
  } catch (_) {
    return null;
  }
}

String gpsErrorMessage(Object error) {
  final text = error.toString();
  if (text.contains('denied') || text.contains('Permission')) {
    return kIsWeb
        ? 'صلاحية الموقع مرفوضة — اسمح بالموقع من شريط عنوان المتصفح'
        : 'صلاحية الموقع مرفوضة';
  }
  if (text.contains('timeout') || text.contains('Timeout')) {
    return 'انتهت مهلة تحديد الموقع — اضغط إعادة أو اسمح بالموقع من المتصفح';
  }
  if (text.contains('unavailable')) {
    return 'الموقع غير متاح حالياً — حاول في مكان مكشوف أو أعد المحاولة';
  }
  if (kIsWeb) {
    return 'تعذّر تحديد الموقع — اسمح بالموقع من أيقونة القفل بجانب الرابط';
  }
  return 'تعذّر تشغيل خدمة الموقع';
}
