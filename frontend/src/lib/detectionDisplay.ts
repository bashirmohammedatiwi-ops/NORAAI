/** Box colors for Manual Test / inference overlay */

export function normalizeClassName(name: string): string {
  return name.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

export function detectionBoxClass(className: string): string {
  const n = normalizeClassName(className);
  if (n.includes('pothole') || n.includes('crack') || n.includes('road') || n.includes('flooded')) {
    return 'border-orange-500 bg-orange-500/10';
  }
  if (n.includes('accident') || n.includes('damage')) {
    return 'border-red-500 bg-red-500/10';
  }
  return 'border-emerald-500 bg-emerald-500/10';
}

export function detectionLabelClass(className: string): string {
  const n = normalizeClassName(className);
  if (n.includes('pothole') || n.includes('crack') || n.includes('road')) {
    return 'bg-orange-600';
  }
  if (n.includes('accident') || n.includes('damage')) {
    return 'bg-red-600';
  }
  return 'bg-emerald-600';
}
