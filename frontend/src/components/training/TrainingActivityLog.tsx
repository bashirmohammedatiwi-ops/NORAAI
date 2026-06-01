interface ActivityEntry {
  message: string;
  phase?: string;
  progress?: number;
}

interface Props {
  entries: ActivityEntry[];
}

export function TrainingActivityLog({ entries }: Props) {
  if (!entries.length) return null;

  return (
    <div className="rounded-xl border border-border/60 bg-card px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Activity</p>
      <ul className="space-y-1.5 max-h-32 overflow-y-auto">
        {entries.map((entry, idx) => (
          <li key={`${entry.message}-${idx}`} className="flex items-start gap-2 text-xs">
            <span className="shrink-0 font-mono text-muted-foreground w-8 text-right">
              {entry.progress != null ? `${entry.progress}%` : '—'}
            </span>
            <span className="text-foreground/90">{entry.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
