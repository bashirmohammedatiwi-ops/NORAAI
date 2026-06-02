export interface DetectionSummary {
  vehicles: {
    found: boolean;
    count: number;
    accident: {
      detected: boolean;
      confidence: number | null;
      class: string | null;
    };
    boxes: { bbox?: number[]; confidence?: number; vehicle_type?: string; label?: string }[];
  };
  road: {
    issues_detected: boolean;
    issue_count: number;
    confidence: number | null;
    issues: { type?: string; confidence: number; bbox?: number[]; event_type?: string | null }[];
  };
}

export function yesNoAr(value: boolean): string {
  return value ? 'نعم' : 'لا';
}

export function yesNoEn(value: boolean): string {
  return value ? 'Yes' : 'No';
}
