import 'package:flutter/foundation.dart';
import 'package:url_launcher/url_launcher.dart';

/// Iraq emergency numbers + international 911 display.
abstract final class EmergencyService {
  /// Iraq ambulance (works on local networks).
  static const ambulanceIq = '115';

  /// Iraq civil defense / fire.
  static const civilDefenseIq = '104';

  /// Display number (international familiarity).
  static const display911 = '911';

  static Future<bool> dial(String number) async {
    final uri = Uri(scheme: 'tel', path: number);
    try {
      if (await canLaunchUrl(uri)) {
        return launchUrl(uri, mode: LaunchMode.externalApplication);
      }
    } catch (e) {
      debugPrint('dial failed: $e');
    }
    return false;
  }

  static Future<bool> dialAmbulance() => dial(ambulanceIq);

  static Future<bool> dialCivilDefense() => dial(civilDefenseIq);
}
