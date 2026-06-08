import 'package:flutter/material.dart';

class EventMeta {
  const EventMeta({
    required this.labelAr,
    required this.label,
    required this.color,
    required this.icon,
    this.mapPriority = 50,
  });

  final String labelAr;
  final String label;
  final Color color;
  final String icon;
  final int mapPriority;
}

const _defaults = <String, EventMeta>{
  'pothole': EventMeta(
    labelAr: 'حفرة',
    label: 'Pothole',
    color: Color(0xFFF97316),
    icon: '🕳',
    mapPriority: 3,
  ),
  'accident': EventMeta(
    labelAr: 'حادث',
    label: 'Accident',
    color: Color(0xFFEF4444),
    icon: '💥',
    mapPriority: 1,
  ),
  'road_closed': EventMeta(
    labelAr: 'طريق مغلق',
    label: 'Road closed',
    color: Color(0xFFDC2626),
    icon: '🚧',
    mapPriority: 2,
  ),
  'traffic_violation': EventMeta(
    labelAr: 'مخالفة',
    label: 'Violation',
    color: Color(0xFFEAB308),
    icon: '⚠',
    mapPriority: 4,
  ),
  'speed_violation': EventMeta(
    labelAr: 'تجاوز سرعة',
    label: 'Speed',
    color: Color(0xFFEAB308),
    icon: '🏎',
    mapPriority: 5,
  ),
};

const highlightTypes = {'pothole', 'accident', 'road_closed'};

Map<String, EventMeta> buildClassMetaFromServer(
  List<Map<String, dynamic>> projectClasses,
  List<Map<String, dynamic>>? alertTypes,
) {
  final meta = Map<String, EventMeta>.from(_defaults);

  for (final cls in projectClasses) {
    final name = cls['name'] as String? ?? '';
    if (name.isEmpty) continue;
    final known = _defaults[name] ?? _defaults[name.toLowerCase()];
    final colorHex = cls['color'] as String?;
    meta[name] = EventMeta(
      labelAr: name,
      label: name,
      color: _parseColor(colorHex) ?? known?.color ?? const Color(0xFF64748B),
      icon: known?.icon ?? '●',
      mapPriority: known?.mapPriority ?? 50,
    );
    meta[name.toLowerCase()] = meta[name]!;
  }

  if (alertTypes != null) {
    for (final a in alertTypes) {
      final type = a['type'] as String? ?? '';
      final name = a['class_name'] as String? ?? a['label'] as String? ?? type;
      meta[type] = EventMeta(
        labelAr: a['label_ar'] as String? ?? name,
        label: a['label'] as String? ?? name,
        color: _parseColor(a['color'] as String?) ??
            _defaults[type]?.color ??
            const Color(0xFF64748B),
        icon: _defaults[type]?.icon ?? '●',
        mapPriority: _defaults[type]?.mapPriority ?? 50,
      );
      if (name.isNotEmpty) meta[name] = meta[type]!;
    }
  }

  return meta;
}

EventMeta getEventMeta(String type, [Map<String, EventMeta>? classMeta]) {
  if (classMeta != null) {
    if (classMeta.containsKey(type)) return classMeta[type]!;
    if (classMeta.containsKey(type.toLowerCase())) {
      return classMeta[type.toLowerCase()]!;
    }
  }
  return _defaults[type] ??
      _defaults[type.toLowerCase()] ??
      EventMeta(
        labelAr: type,
        label: type,
        color: const Color(0xFF64748B),
        icon: '●',
      );
}

Color? _parseColor(String? hex) {
  if (hex == null || hex.isEmpty) return null;
  var h = hex.replaceAll('#', '');
  if (h.length == 6) h = 'FF$h';
  final v = int.tryParse(h, radix: 16);
  if (v == null) return null;
  return Color(v);
}
