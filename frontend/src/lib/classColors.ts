/** Distinct colors per detection class (Arabic defaults + palette). */

export const DEFAULT_CLASS_COLORS: Record<string, string> = {
  حوادث: '#2563EB',
  حادث: '#2563EB',
  حفر: '#EA580C',
  حفرة: '#EA580C',
  accident: '#2563EB',
  pothole: '#EA580C',
  vehicle_damage: '#2563EB',
  road_crack: '#CA8A04',
};

export const CLASS_COLOR_PALETTE = [
  '#2563EB',
  '#EA580C',
  '#16A34A',
  '#9333EA',
  '#DC2626',
  '#0891B2',
  '#DB2777',
  '#4F46E5',
];

export function colorForClass(name: string, index = 0, apiColor?: string | null): string {
  const trimmed = name.trim();
  if (DEFAULT_CLASS_COLORS[trimmed]) return DEFAULT_CLASS_COLORS[trimmed];
  const lower = trimmed.toLowerCase();
  for (const [key, hex] of Object.entries(DEFAULT_CLASS_COLORS)) {
    if (key.toLowerCase() === lower) return hex;
  }
  if (apiColor && apiColor.toUpperCase() !== '#3B82F6') return apiColor;
  return CLASS_COLOR_PALETTE[index % CLASS_COLOR_PALETTE.length];
}

export function withClassColors<T extends { id: string; name: string; color?: string | null }>(
  classes: T[],
): Array<T & { color: string }> {
  return classes.map((c, i) => ({
    ...c,
    color: colorForClass(c.name, i, c.color),
  }));
}
