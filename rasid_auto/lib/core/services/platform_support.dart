import 'package:flutter/foundation.dart';

bool get isNativeMobile => !kIsWeb;
bool get supportsLocalOnnx => !kIsWeb;
bool get supportsVibration => !kIsWeb;
bool get supportsMotionSensors => !kIsWeb;
bool get supportsLocalInference => isNativeMobile;
