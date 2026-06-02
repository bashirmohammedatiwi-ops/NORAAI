import { cn } from '@/lib/utils';
import { yesNoAr, yesNoEn, type DetectionSummary } from '@/lib/detectionSummary';
import { Car, AlertTriangle, Construction } from 'lucide-react';

interface Props {
  summary: DetectionSummary;
  className?: string;
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
        ok ? 'bg-red-500/15 text-red-700 dark:text-red-300' : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
      )}
    >
      {label}
    </span>
  );
}

export function DetectionSummaryCard({ summary, className }: Props) {
  const { vehicles, road } = summary;
  const accidentConf = vehicles.accident.confidence;

  return (
    <div className={cn('grid grid-cols-1 sm:grid-cols-2 gap-3', className)}>
      <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-4 space-y-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-blue-800 dark:text-blue-200">
          <Car className="h-4 w-4" />
          المركبات · Vehicles
        </div>
        <div className="text-sm space-y-1.5">
          <p>
            سيارات مكتشفة: <strong>{vehicles.count}</strong>
            <span className="text-muted-foreground text-xs ml-1">({yesNoEn(vehicles.found)} / {yesNoAr(vehicles.found)})</span>
          </p>
          <p className="flex flex-wrap items-center gap-2">
            حادث · Accident:
            <StatusPill ok={vehicles.accident.detected} label={`${yesNoEn(vehicles.accident.detected)} · ${yesNoAr(vehicles.accident.detected)}`} />
            {accidentConf != null && vehicles.accident.detected && (
              <span className="text-xs text-muted-foreground font-mono">
                {(accidentConf * 100).toFixed(0)}%
              </span>
            )}
          </p>
          {!vehicles.found && (
            <p className="text-xs text-muted-foreground">لا توجد مركبة في الصورة.</p>
          )}
          {vehicles.found && !vehicles.accident.detected && (
            <p className="text-xs text-muted-foreground">مركبة موجودة — لم يُؤكَّد حادث بالعتبة الحالية.</p>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-orange-500/30 bg-orange-500/5 p-4 space-y-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-orange-800 dark:text-orange-200">
          <Construction className="h-4 w-4" />
          الطريق · Road
        </div>
        <div className="text-sm space-y-1.5">
          <p className="flex flex-wrap items-center gap-2">
            مشاكل (حفر/تشقق):
            <StatusPill ok={road.issues_detected} label={`${yesNoEn(road.issues_detected)} · ${yesNoAr(road.issues_detected)}`} />
            {road.confidence != null && road.issues_detected && (
              <span className="text-xs text-muted-foreground font-mono">
                {(road.confidence * 100).toFixed(0)}%
              </span>
            )}
          </p>
          {road.issues_detected ? (
            <ul className="text-xs text-muted-foreground space-y-0.5">
              {road.issues.map((issue, i) => (
                <li key={`${issue.type}-${i}`} className="flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3 text-orange-500 shrink-0" />
                  {issue.type} — {(issue.confidence * 100).toFixed(0)}%
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">لا حفر ولا عيوب واضحة على الطريق.</p>
          )}
        </div>
      </div>
    </div>
  );
}
