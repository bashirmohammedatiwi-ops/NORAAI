import 'package:flutter/foundation.dart';

/// Native iOS/Android — full local ONNX + filesystem.
bool get isNativeMobile => !kIsWeb;

/// Local ONNX download requires a filesystem (not available on web).
bool get supportsLocalOnnx => !kIsWeb;

/// Haptic feedback is mobile-only.
bool get supportsVibration => !kIsWeb;

/// On web, driver detection always goes through the API.
String effectiveInferenceMode(String? serverMode) {
  if (kIsWeb) return 'server';
  return serverMode ?? 'local';
}

String inferenceModeLabel(String? serverMode) {
  final mode = effectiveInferenceMode(serverMode);
  if (kIsWeb && serverMode == 'local') {
    return 'سيرفر (متصفح)';
  }
  return mode == 'local' ? 'محلي ONNX' : 'سيرفر';
}
