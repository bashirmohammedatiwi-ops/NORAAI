import type { RoadAlert } from '@/types';
import { EVENT_META, RECIPIENT_META, alertImageUrl, guessGovernorate, governorateName } from '@/lib/constants';
import { alertBlock, alertLocationLine, alertReference, alertSpeedLine, alertStreet, isSpeedViolationAlert, showsAiConfidence } from '@/lib/alertMeta';
import { formatConfidence, formatRelativeTime } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle2, ExternalLink, MapPin, Camera } from 'lucide-react';
import { useRef, useState, useEffect } from 'react';
import { useUploadAlertEvidence } from '@/hooks/useControlCenter';
import { useToast } from '@/context/ToastContext';

interface AlertCardProps {
  alert: RoadAlert;
  onResolve?: (id: string) => void;
  resolving?: boolean;
  onSelect?: (alert: RoadAlert) => void;
  selected?: boolean;
  compact?: boolean;
}

export function AlertCard({ alert, onResolve, resolving, onSelect, selected, compact }: AlertCardProps) {
  const meta = EVENT_META[alert.event_type] ?? { labelAr: alert.event_type, color: '#64748b', icon: '⚠️' };
  const recipient = RECIPIENT_META[alert.recipient];
  const gov = governorateName(alert.municipality_id ?? guessGovernorate(alert.latitude, alert.longitude));
  const locationLine = alertLocationLine(alert);
  const reference = alertReference(alert);
  const speedLine = alertSpeedLine(alert);
  const speedViolation = isSpeedViolationAlert(alert);
  const excess = typeof alert.metadata?.excess_kmh === 'number' ? alert.metadata.excess_kmh : null;

  return (
    <Card
      className={`overflow-hidden transition-all hover:shadow-md ${selected ? 'ring-2 ring-primary shadow-md' : ''} ${onSelect ? 'cursor-pointer' : ''}`}
      onClick={() => onSelect?.(alert)}
    >
      <div className={compact ? 'flex gap-3 p-3' : 'grid md:grid-cols-[200px_1fr_auto]'}>
        {!compact && (
          <div className="relative aspect-video md:aspect-auto md:min-h-[130px]">
            <img src={alertImageUrl(alert)} alt={meta.labelAr} className="h-full w-full object-cover" loading="lazy" />
            <div className="absolute right-2 top-2 rounded-lg bg-white/95 px-2 py-1 text-xs font-bold shadow-sm" style={{ color: meta.color }}>
              {meta.icon} {meta.labelAr}
            </div>
          </div>
        )}

        <CardContent className={`space-y-2 ${compact ? 'flex-1 p-0' : 'p-4'}`}>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="border bg-white" style={{ borderColor: recipient.color, color: recipient.color }}>
              → {recipient.labelAr}
            </Badge>
            {reference && (
              <Badge className="border bg-white font-mono text-[10px]">{reference}</Badge>
            )}
            {alertBlock(alert) && (
              <Badge className="border bg-white text-[10px]">{alertBlock(alert)}</Badge>
            )}
            <span className="text-xs text-muted-foreground">{formatRelativeTime(alert.created_at)}</span>
          </div>
          <p className="font-semibold text-foreground">{alert.title ?? `تنبيه ${meta.labelAr} — ${gov}`}</p>
          {locationLine && (
            <p className="text-xs text-muted-foreground">{locationLine}</p>
          )}
          {speedLine && (
            <p className="text-xs font-medium text-amber-700">
              🚦 {speedLine}
              {speedViolation && excess != null ? ` · تجاوز +${Math.round(excess)}` : ''}
              {speedViolation ? ' · GPS' : ''}
            </p>
          )}
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{gov}</span>
            {alertStreet(alert) && <span>{alertStreet(alert)}</span>}
            {showsAiConfidence(alert) && (
              <span>ثقة AI: {formatConfidence(alert.confidence)}</span>
            )}
            <span>{alert.latitude.toFixed(4)}, {alert.longitude.toFixed(4)}</span>
            {alert.vehicle_id && <span>🚗 {alert.vehicle_id}</span>}
          </div>
        </CardContent>

        {alert.is_active && onResolve && !compact && (
          <div className="flex items-center border-t border-border p-3 md:border-r md:border-t-0">
            <Button variant="success" size="sm" disabled={resolving} onClick={(e) => { e.stopPropagation(); onResolve(alert.id); }}>
              <CheckCircle2 className="h-4 w-4" />
              إنهاء · إزالة من الخريطة
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

export function AlertDetailPanel({ alert, onClose, onResolve, resolving, projectId }: {
  alert: RoadAlert;
  onClose: () => void;
  onResolve?: (id: string) => void;
  resolving?: boolean;
  projectId?: string;
}) {
  const meta = EVENT_META[alert.event_type] ?? { labelAr: alert.event_type, color: '#64748b', icon: '⚠️' };
  const gov = governorateName(alert.municipality_id ?? guessGovernorate(alert.latitude, alert.longitude));
  const upload = useUploadAlertEvidence(projectId ?? '');
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState(alertImageUrl(alert));
  const reference = alertReference(alert);
  const block = alertBlock(alert);
  const street = alertStreet(alert);
  const speedLine = alertSpeedLine(alert);
  const speedViolation = isSpeedViolationAlert(alert);
  const excess = typeof alert.metadata?.excess_kmh === 'number' ? alert.metadata.excess_kmh : null;
  const neighborhood = typeof alert.metadata?.neighborhood_ar === 'string' ? alert.metadata.neighborhood_ar : null;

  useEffect(() => {
    setPreview(alertImageUrl(alert));
  }, [alert.id, alert.image_url, alert.event_type]);

  async function onPickImage(file: File | undefined) {
    if (!file || !projectId) return;
    try {
      const updated = await upload.mutateAsync({ eventId: alert.id, file });
      if (updated.image_url) setPreview(alertImageUrl(updated));
      toast({ title: 'تم حفظ صورة الموقع', tone: 'success' });
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : 'فشل رفع الصورة', tone: 'error' });
    }
  }

  return (
    <div className="surface-elevated flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h3 className="font-bold">تفاصيل التنبيه</h3>
        <button type="button" onClick={onClose} className="text-sm text-muted-foreground hover:text-foreground">إغلاق</button>
      </div>
      <div className="relative">
        <img src={preview} alt="" className="aspect-video w-full object-cover" />
        {projectId && alert.is_active && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => onPickImage(e.target.files?.[0])}
            />
            <Button
              size="sm"
              variant="secondary"
              className="absolute bottom-3 left-3 shadow-md"
              disabled={upload.isPending}
              onClick={() => fileRef.current?.click()}
            >
              <Camera className="h-4 w-4" />
              {upload.isPending ? 'جاري الرفع…' : 'صورة الموقع'}
            </Button>
          </>
        )}
      </div>
      <div className="flex-1 space-y-3 overflow-auto p-4 text-sm">
        <p className="text-lg font-bold" style={{ color: meta.color }}>{alert.title ?? meta.labelAr}</p>
        {reference && <p><strong>المرجع:</strong> <span className="font-mono">{reference}</span></p>}
        {block && <p><strong>المحلة:</strong> {block}{neighborhood ? ` · ${neighborhood}` : ''}</p>}
        {street && <p><strong>الشارع:</strong> {street}</p>}
        {!block && neighborhood && <p><strong>المنطقة:</strong> {neighborhood}</p>}
        <p><strong>المحافظة:</strong> {gov}</p>
        <p><strong>الجهة:</strong> {RECIPIENT_META[alert.recipient].labelAr}</p>
        {alert.vehicle_id && <p><strong>المركبة:</strong> {alert.vehicle_id}</p>}
        {speedViolation && speedLine ? (
          <p><strong>السرعة:</strong> {speedLine}{excess != null ? ` · تجاوز ${Math.round(excess)} كم/س` : ''} <span className="text-muted-foreground">(GPS)</span></p>
        ) : showsAiConfidence(alert) ? (
          <p><strong>ثقة AI:</strong> {formatConfidence(alert.confidence)}</p>
        ) : null}
        <p><strong>الإحداثيات:</strong> {alert.latitude.toFixed(5)}, {alert.longitude.toFixed(5)}</p>
        <a
          href={`https://www.google.com/maps?q=${alert.latitude},${alert.longitude}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-primary hover:underline"
        >
          <ExternalLink className="h-3.5 w-3.5" /> فتح في خرائط Google
        </a>
      </div>
      {alert.is_active && onResolve && (
        <div className="border-t border-border p-4">
          <Button className="w-full" variant="success" disabled={resolving} onClick={() => onResolve(alert.id)}>
            <CheckCircle2 className="h-4 w-4" /> تأكيد إنهاء التنبيه
          </Button>
        </div>
      )}
    </div>
  );
}
