/** @deprecated Use usePollInterval from PreferencesContext */
import { loadPreferences } from '@/lib/preferences';

export function pollInterval(ms: number): number | false {
  return loadPreferences().autoRefresh ? ms : false;
}

export function showFleetOnMap(): boolean {
  return loadPreferences().showFleetOnMap;
}
