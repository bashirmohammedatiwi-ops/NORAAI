import { useMemo, useState } from 'react';
import type { AlertRecipient, EventType, RoadAlert } from '@/types';
import { guessGovernorate } from '@/lib/constants';

export type CommandSort = 'newest' | 'oldest';

export function useCommandFilters(alerts: RoadAlert[]) {
  const [search, setSearch] = useState('');
  const [recipient, setRecipient] = useState<AlertRecipient | 'all'>('all');
  const [eventType, setEventType] = useState<EventType | 'all'>('all');
  const [governorate, setGovernorate] = useState<string>('all');
  const [sort, setSort] = useState<CommandSort>('newest');

  const filtered = useMemo(() => {
    let list = [...alerts];

    if (recipient !== 'all') list = list.filter((a) => a.recipient === recipient);
    if (eventType !== 'all') list = list.filter((a) => a.event_type === eventType);
    if (governorate !== 'all') {
      list = list.filter((a) => (a.municipality_id ?? guessGovernorate(a.latitude, a.longitude)) === governorate);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (a) =>
          a.event_type.includes(q) ||
          a.recipient.includes(q) ||
          a.device_id?.toLowerCase().includes(q) ||
          a.vehicle_id?.toLowerCase().includes(q) ||
          a.title?.toLowerCase().includes(q) ||
          a.reference?.toLowerCase().includes(q),
      );
    }

    list.sort((a, b) => {
      const ta = new Date(a.created_at).getTime();
      const tb = new Date(b.created_at).getTime();
      return sort === 'newest' ? tb - ta : ta - tb;
    });

    return list;
  }, [alerts, recipient, eventType, governorate, search, sort]);

  const stats = useMemo(() => {
    const byType: Record<string, number> = {};
    const byGov: Record<string, number> = {};
    for (const a of filtered) {
      byType[a.event_type] = (byType[a.event_type] ?? 0) + 1;
      const g = a.municipality_id ?? guessGovernorate(a.latitude, a.longitude);
      byGov[g] = (byGov[g] ?? 0) + 1;
    }
    return { byType, byGov, total: filtered.length };
  }, [filtered]);

  const resetFilters = () => {
    setSearch('');
    setRecipient('all');
    setEventType('all');
    setGovernorate('all');
    setSort('newest');
  };

  const hasFilters =
    search.trim() !== '' ||
    recipient !== 'all' ||
    eventType !== 'all' ||
    governorate !== 'all';

  return {
    search,
    setSearch,
    recipient,
    setRecipient,
    eventType,
    setEventType,
    governorate,
    setGovernorate,
    sort,
    setSort,
    filtered,
    stats,
    resetFilters,
    hasFilters,
  };
}
