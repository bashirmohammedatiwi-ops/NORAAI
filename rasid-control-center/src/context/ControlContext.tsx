import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { governorateName } from '@/lib/constants';
import { alertBlock, alertReference, alertStreet } from '@/lib/alertMeta';
import { usePreferences } from '@/context/PreferencesContext';

interface ControlContextValue {
  projectId: string;
  setProjectId: (id: string) => void;
  governorateFilter: string;
  setGovernorateFilter: (id: string) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  wsConnected: boolean;
}

const ControlContext = createContext<ControlContextValue | null>(null);

export function ControlProvider({
  projectId,
  setProjectId,
  wsConnected = false,
  children,
}: {
  projectId: string;
  setProjectId: (id: string) => void;
  wsConnected?: boolean;
  children: ReactNode;
}) {
  const { preferences, updatePreferences } = usePreferences();
  const [governorateFilter, setGovernorateFilterState] = useState(() => preferences.defaultGovFilter || 'all');
  const [searchQuery, setSearchQuery] = useState('');

  const setGovernorateFilter = useCallback(
    (id: string) => {
      setGovernorateFilterState(id);
      updatePreferences({ defaultGovFilter: id });
    },
    [updatePreferences],
  );

  return (
    <ControlContext.Provider
      value={{ projectId, setProjectId, governorateFilter, setGovernorateFilter, searchQuery, setSearchQuery, wsConnected }}
    >
      {children}
    </ControlContext.Provider>
  );
}

export function useControlContext() {
  const ctx = useContext(ControlContext);
  if (!ctx) throw new Error('useControlContext must be used within ControlProvider');
  return ctx;
}

export interface AlertFilterFields {
  event_type: string;
  municipality_id?: string | null;
  latitude: number;
  longitude: number;
  title?: string | null;
  reference?: string | null;
  block_ar?: string | null;
  street_ar?: string | null;
  vehicle_id?: string | null;
  metadata?: Record<string, unknown>;
}

/** Filter alerts by governorate, optional block id, and search */
export function filterAlerts<T extends AlertFilterFields>(
  items: T[],
  governorateFilter: string,
  searchQuery: string,
  guessGov: (lat: number, lng: number) => string,
  blockFilter?: string | null,
): T[] {
  let out = items;
  if (governorateFilter !== 'all') {
    out = out.filter((a) => (a.municipality_id ?? guessGov(a.latitude, a.longitude)) === governorateFilter);
  }
  if (blockFilter) {
    const blockNeedle = blockFilter.replace(/\D/g, '');
    out = out.filter((a) => {
      const block = alertBlock(a);
      if (!block) return false;
      return block.includes(blockFilter) || block.replace(/\D/g, '') === blockNeedle;
    });
  }
  if (searchQuery.trim()) {
    const q = searchQuery.trim().toLowerCase();
    out = out.filter((a) => {
      const govId = a.municipality_id ?? guessGov(a.latitude, a.longitude);
      const govAr = governorateName(govId).toLowerCase();
      const vehicleId = a.vehicle_id ?? (typeof a.metadata?.vehicle_id === 'string' ? a.metadata.vehicle_id : null);
      return (
        a.event_type.includes(q) ||
        (a.title?.toLowerCase().includes(q)) ||
        govId.includes(q) ||
        govAr.includes(q) ||
        (vehicleId?.toLowerCase().includes(q)) ||
        (alertReference(a)?.toLowerCase().includes(q)) ||
        (alertStreet(a)?.toLowerCase().includes(q)) ||
        (alertBlock(a)?.toLowerCase().includes(q))
      );
    });
  }
  return out;
}
