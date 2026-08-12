import type { AlertRecipient, EventType } from '@/types';

export const APP_NAME = 'راصد';
export const APP_REGION = 'جمهورية العراق';
export const APP_TAGLINE = 'منصة مراقبة الطرق والذكاء الاصطناعي';

export const EVENT_META: Record<EventType, { labelAr: string; color: string; icon: string }> = {
  accident: { labelAr: 'حادث', color: '#dc2626', icon: '🚨' },
  pothole: { labelAr: 'حفرة', color: '#ea580c', icon: '🕳️' },
  speed_bump: { labelAr: 'مطب سرعة', color: '#ca8a04', icon: '⬆️' },
  manhole: { labelAr: 'بالوعة', color: '#db2777', icon: '⭕' },
  road_crack: { labelAr: 'شقوق', color: '#9333ea', icon: '〰️' },
  barrier: { labelAr: 'حاجز', color: '#64748b', icon: '🚧' },
  road_closed: { labelAr: 'طريق مغلق', color: '#b91c1c', icon: '⛔' },
  traffic_violation: { labelAr: 'مخالفة مرورية', color: '#ca8a04', icon: '🚦' },
  construction: { labelAr: 'أعمال طرق', color: '#d97706', icon: '🏗️' },
  flooded_road: { labelAr: 'فيضان', color: '#2563eb', icon: '🌊' },
};

const FALLBACK_EVENT_META = { labelAr: 'تنبيه', color: '#64748b', icon: '⚠️' };

/** Safe lookup — never throws on unknown event types from API. */
export function eventMeta(type: string) {
  return EVENT_META[type as EventType] ?? { ...FALLBACK_EVENT_META, labelAr: type || FALLBACK_EVENT_META.labelAr };
}

export const RECIPIENT_META: Record<AlertRecipient, { labelAr: string; color: string; desc: string }> = {
  ambulance: { labelAr: 'الإسعاف', color: '#dc2626', desc: 'حوادث وإصابات' },
  police: { labelAr: 'الشرطة', color: '#4f46e5', desc: 'أمن وجرائم' },
  municipality: { labelAr: 'البلدية', color: '#0d9488', desc: 'صيانة وشوارع' },
  traffic: { labelAr: 'المرور', color: '#ca8a04', desc: 'مخالفات وازدحام' },
  fleet: { labelAr: 'الأسطول', color: '#2563eb', desc: 'مركبات راصد' },
  public: { labelAr: 'تنبيه عام', color: '#64748b', desc: 'سائقون ومواطنون' },
};

export const SEVERITY_META = {
  critical: { labelAr: 'حرج', className: 'bg-red-50 text-red-700 border-red-200' },
  high: { labelAr: 'عالي', className: 'bg-orange-50 text-orange-700 border-orange-200' },
  medium: { labelAr: 'متوسط', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  low: { labelAr: 'منخفض', className: 'bg-slate-50 text-slate-600 border-slate-200' },
};

/** محافظات العراق — 18 محافظة */
export const IRAQ_GOVERNORATES = [
  { id: 'baghdad', nameAr: 'بغداد', capital: 'بغداد', center: [33.3152, 44.3661] as [number, number], population: '8M+' },
  { id: 'basra', nameAr: 'البصرة', capital: 'البصرة', center: [30.5085, 47.7804] as [number, number], population: '2M+' },
  { id: 'nineveh', nameAr: 'نينوى', capital: 'الموصل', center: [36.3566, 43.1640] as [number, number], population: '3.7M' },
  { id: 'erbil', nameAr: 'أربيل', capital: 'أربيل', center: [36.1911, 44.0092] as [number, number], population: '2M+' },
  { id: 'sulaymaniyah', nameAr: 'السليمانية', capital: 'السليمانية', center: [35.5613, 45.4306] as [number, number], population: '900K' },
  { id: 'duhok', nameAr: 'دهوك', capital: 'دهوك', center: [36.8667, 42.9833] as [number, number], population: '1.3M' },
  { id: 'kirkuk', nameAr: 'كركوك', capital: 'كركوك', center: [35.4681, 44.3922] as [number, number], population: '1.7M' },
  { id: 'diyala', nameAr: 'ديالى', capital: 'بعقوبة', center: [33.7731, 45.1495] as [number, number], population: '1.6M' },
  { id: 'anbar', nameAr: 'الأنبار', capital: 'الرمادي', center: [33.4206, 43.3072] as [number, number], population: '1.8M' },
  { id: 'babylon', nameAr: 'بابل', capital: 'الحلة', center: [32.4833, 44.4333] as [number, number], population: '2M' },
  { id: 'karbala', nameAr: 'كربلاء', capital: 'كربلاء', center: [32.6160, 44.0249] as [number, number], population: '1.2M' },
  { id: 'najaf', nameAr: 'النجف', capital: 'النجف', center: [32.0103, 44.3290] as [number, number], population: '1.4M' },
  { id: 'qadisiyyah', nameAr: 'القادسية', capital: 'الديوانية', center: [31.9929, 44.9253] as [number, number], population: '1.3M' },
  { id: 'muthanna', nameAr: 'المثنى', capital: 'السماوة', center: [31.3319, 45.2944] as [number, number], population: '800K' },
  { id: 'dhi_qar', nameAr: 'ذي قار', capital: 'الناصرية', center: [31.0584, 46.2572] as [number, number], population: '2M' },
  { id: 'maysan', nameAr: 'ميسان', capital: 'العمارة', center: [31.8333, 47.1500] as [number, number], population: '1M' },
  { id: 'wasit', nameAr: 'واسط', capital: 'الكوت', center: [32.5128, 45.8181] as [number, number], population: '1.4M' },
  { id: 'salahuddin', nameAr: 'صلاح الدين', capital: 'تكريت', center: [34.5970, 43.6780] as [number, number], population: '1.5M' },
] ;

/** @deprecated use IRAQ_GOVERNORATES */
export const MUNICIPALITIES = IRAQ_GOVERNORATES;

export const DEFAULT_MAP_CENTER: [number, number] = [33.3218, 44.4534];
export const DEFAULT_MAP_ZOOM = 6;

export function eventPlaceholderImage(type: EventType): string {
  const colors: Record<EventType, string> = {
    accident: 'dc2626', pothole: 'ea580c', speed_bump: 'ca8a04', manhole: 'db2777', road_crack: '9333ea', barrier: '64748b',
    road_closed: 'b91c1c', traffic_violation: 'ca8a04', construction: 'd97706', flooded_road: '2563eb',
  };
  const label = EVENT_META[type]?.labelAr ?? type;
  const c = colors[type] ?? '64748b';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
    <rect width="640" height="360" fill="#f8fafc"/>
    <rect x="20" y="20" width="600" height="320" rx="12" fill="#fff" stroke="#${c}" stroke-width="2"/>
    <text x="320" y="155" text-anchor="middle" fill="#${c}" font-size="36" font-family="sans-serif">${label}</text>
    <text x="320" y="200" text-anchor="middle" fill="#64748b" font-size="16" font-family="sans-serif">راصد · العراق · دليل مرئي</text>
    <rect x="20" y="340" width="600" height="4" fill="#007a3d"/><rect x="220" y="340" width="200" height="4" fill="#fff"/><rect x="420" y="340" width="200" height="4" fill="#ce1126"/>
  </svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function alertImageUrl(alert: { event_type: EventType; image_url?: string | null }): string {
  if (alert.image_url) {
    if (alert.image_url.startsWith('http') || alert.image_url.startsWith('data:')) {
      return alert.image_url;
    }
    const base = import.meta.env.VITE_API_URL?.replace(/\/$/, '') ?? '';
    return base ? `${base}${alert.image_url}` : alert.image_url;
  }
  return eventPlaceholderImage(alert.event_type);
}

export function guessGovernorate(lat: number, lng: number): string {
  let best = IRAQ_GOVERNORATES[0];
  let bestDist = Infinity;
  for (const g of IRAQ_GOVERNORATES) {
    const d = Math.hypot(lat - g.center[0], lng - g.center[1]);
    if (d < bestDist) { bestDist = d; best = g; }
  }
  return best.id;
}

export function governorateName(id?: string | null): string {
  return IRAQ_GOVERNORATES.find((g) => g.id === id)?.nameAr ?? 'غير محدد';
}

export function guessMunicipality(lat: number, lng: number): string {
  return guessGovernorate(lat, lng);
}

export function municipalityName(id?: string | null): string {
  return governorateName(id);
}

const VEHICLE_GOV_CODES: Record<string, string> = {
  BGD: 'baghdad',
  BAS: 'basra',
  NAJ: 'najaf',
  KAR: 'karbala',
  ERB: 'erbil',
  NIN: 'nineveh',
  DIY: 'diyala',
  WAS: 'wasit',
};

export function vehicleGovernorate(vehicleId: string): string | null {
  const match = vehicleId.match(/RASID-([A-Z]{3})-/i);
  if (!match) return null;
  return VEHICLE_GOV_CODES[match[1].toUpperCase()] ?? null;
}

export const RECIPIENT_TABS: { id: AlertRecipient | 'all'; label: string }[] = [
  { id: 'all', label: 'الكل' },
  { id: 'ambulance', label: RECIPIENT_META.ambulance.labelAr },
  { id: 'police', label: RECIPIENT_META.police.labelAr },
  { id: 'municipality', label: RECIPIENT_META.municipality.labelAr },
  { id: 'traffic', label: RECIPIENT_META.traffic.labelAr },
  { id: 'fleet', label: RECIPIENT_META.fleet.labelAr },
];
