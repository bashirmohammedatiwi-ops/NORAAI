export interface EventMeta {
  labelAr: string;
  label: string;
  color: string;
  icon: string;
  mapPriority: number;
}

export const EVENT_META: Record<string, EventMeta> = {
  pothole: { labelAr: 'حفرة', label: 'Pothole', color: '#f97316', icon: '🕳', mapPriority: 3 },
  accident: { labelAr: 'حادث', label: 'Accident', color: '#ef4444', icon: '💥', mapPriority: 1 },
  road_closed: { labelAr: 'طريق مغلق', label: 'Road closed', color: '#dc2626', icon: '🚧', mapPriority: 2 },
  traffic_violation: { labelAr: 'مخالفة', label: 'Violation', color: '#eab308', icon: '⚠', mapPriority: 4 },
  speed_violation: { labelAr: 'تجاوز سرعة', label: 'Speed', color: '#eab308', icon: '🏎', mapPriority: 5 },
  road_crack: { labelAr: 'شقوق', label: 'Crack', color: '#a855f7', icon: '〰', mapPriority: 6 },
  construction: { labelAr: 'أعمال', label: 'Construction', color: '#f59e0b', icon: '🏗', mapPriority: 7 },
};

export const MAP_HIGHLIGHT_TYPES = ['pothole', 'accident', 'road_closed'] as const;

export function buildClassMetaFromServer(
  projectClasses: { name: string; color: string }[],
  alertTypes?: { type: string; label: string; label_ar: string; color: string; class_name?: string }[]
): Record<string, EventMeta> {
  const meta: Record<string, EventMeta> = { ...EVENT_META };

  for (const cls of projectClasses) {
    const key = cls.name;
    const known = EVENT_META[key] ?? EVENT_META[key.toLowerCase()];
    meta[key] = {
      labelAr: key,
      label: key,
      color: cls.color || known?.color || '#64748b',
      icon: known?.icon ?? '●',
      mapPriority: known?.mapPriority ?? 50,
    };
    meta[key.toLowerCase()] = meta[key];
  }

  if (alertTypes) {
    for (const a of alertTypes) {
      const name = a.class_name || a.label;
      meta[a.type] = {
        labelAr: a.label_ar || name,
        label: a.label || name,
        color: a.color,
        icon: EVENT_META[a.type]?.icon ?? '●',
        mapPriority: EVENT_META[a.type]?.mapPriority ?? 50,
      };
      if (name) meta[name] = meta[a.type];
    }
  }

  return meta;
}

export function getEventMeta(type: string, classMeta?: Record<string, EventMeta>): EventMeta {
  if (classMeta?.[type]) return classMeta[type];
  if (classMeta?.[type.toLowerCase()]) return classMeta[type.toLowerCase()];
  return EVENT_META[type] ?? {
    labelAr: type,
    label: type,
    color: '#64748b',
    icon: '●',
    mapPriority: 99,
  };
}
