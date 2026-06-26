import '../../../models/detection.dart';

const _accidentClassKeys = {
  'accident',
  'حادث',
  'حوادث',
  'moderate',
  'severe',
  'vehicle_damage',
  'accident_damage',
  'car_damage',
  'crash',
  'collision',
};

bool isAccidentClassName(String className) {
  final key = className.trim().toLowerCase().replaceAll(' ', '_').replaceAll('-', '_');
  if (_accidentClassKeys.contains(key)) return true;
  return key.contains('accident') || key.contains('crash') || key.contains('حادث');
}

bool isAccidentDetection(DetectionBox box, {double minConfidence = 0.45}) {
  return box.confidence >= minConfidence && isAccidentClassName(box.className);
}

/// Only enable emergency flow when the active model actually has accident classes.
bool modelSupportsAccidentDetection(Iterable<String> classNames) {
  for (final name in classNames) {
    if (isAccidentClassName(name)) return true;
  }
  return false;
}
