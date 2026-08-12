import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { loadPreferences, savePreferences, type UserPreferences } from '@/lib/preferences';

interface PreferencesContextValue {
  preferences: UserPreferences;
  updatePreferences: (patch: Partial<UserPreferences>) => UserPreferences;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [preferences, setPreferences] = useState<UserPreferences>(() => loadPreferences());

  const updatePreferences = useCallback(
    (patch: Partial<UserPreferences>) => {
      const next = savePreferences(patch);
      setPreferences(next);
      if (patch.autoRefresh != null) {
        void qc.invalidateQueries();
      }
      return next;
    },
    [qc],
  );

  const value = useMemo(
    () => ({ preferences, updatePreferences }),
    [preferences, updatePreferences],
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences must be used within PreferencesProvider');
  return ctx;
}

export function usePollInterval(ms: number): number | false {
  const { preferences } = usePreferences();
  return preferences.autoRefresh ? ms : false;
}

export function useShowFleetOnMap(): boolean {
  const { preferences } = usePreferences();
  return preferences.showFleetOnMap;
}
