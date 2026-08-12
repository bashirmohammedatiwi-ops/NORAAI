export interface UserPreferences {
  compactMode: boolean;
  soundAlerts: boolean;
  autoRefresh: boolean;
  showFleetOnMap: boolean;
  defaultGovFilter: string;
}

const KEY = 'rasid_cc_prefs';

const DEFAULTS: UserPreferences = {
  compactMode: false,
  soundAlerts: false,
  autoRefresh: true,
  showFleetOnMap: true,
  defaultGovFilter: 'all',
};

export function loadPreferences(): UserPreferences {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

export function savePreferences(prefs: Partial<UserPreferences>) {
  const next = { ...loadPreferences(), ...prefs };
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}
