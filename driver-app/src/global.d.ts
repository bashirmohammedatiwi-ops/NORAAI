export {};

declare global {
  interface Window {
    norai?: {
      platform: string;
      openLocationSettings?: () => Promise<boolean>;
      getNativeLocation?: () => Promise<{
        ok: boolean;
        lat?: number;
        lon?: number;
        accuracy?: number | null;
        speed?: number | null;
        heading?: number | null;
        code?: 'denied' | 'unavailable';
        message?: string;
      }>;
    };
  }
}
