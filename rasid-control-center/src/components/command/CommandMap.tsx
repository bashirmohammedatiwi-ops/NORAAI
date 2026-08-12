import { MapContainer, TileLayer, CircleMarker, Popup, useMap, Marker, ZoomControl } from 'react-leaflet';
import { useEffect, useMemo } from 'react';
import L from 'leaflet';
import type { RoadAlert, FleetDevice } from '@/types';
import { DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM, eventMeta } from '@/lib/constants';
import { alertPopupLines } from '@/lib/alertMeta';
import { MapFocusController, type MapFocusPoint } from '@/components/map/MapFocusController';
import { cn } from '@/lib/utils';
import 'leaflet/dist/leaflet.css';

export type { MapFocusPoint };

/** Fit all alerts when nothing is selected */
function FitAlertsOverview({ alerts, enabled }: { alerts: RoadAlert[]; enabled: boolean }) {
  const map = useMap();
  const boundsKey = useMemo(
    () => alerts.map((a) => `${a.id}:${a.latitude.toFixed(5)}`).join('|'),
    [alerts],
  );

  useEffect(() => {
    if (!enabled || alerts.length === 0) return;
    map.stop();
    if (alerts.length === 1) {
      map.flyTo([alerts[0].latitude, alerts[0].longitude], 14, { duration: 0.5 });
      return;
    }
    const lats = alerts.map((a) => a.latitude);
    const lngs = alerts.map((a) => a.longitude);
    map.fitBounds(
      [
        [Math.min(...lats), Math.min(...lngs)],
        [Math.max(...lats), Math.max(...lngs)],
      ],
      { padding: [72, 72], maxZoom: 14, animate: true },
    );
  }, [enabled, boundsKey, alerts, map]);

  return null;
}

/** Pulsing ring + popup at selected alert */
function SelectedAlertLayer({ alert }: { alert: RoadAlert | null | undefined }) {
  const map = useMap();

  useEffect(() => {
    if (!alert) {
      map.closePopup();
      return;
    }
    const meta = eventMeta(alert.event_type);
    const popup = alertPopupLines(alert);
    const html = `<div class="command-selected-popup">
      <span class="command-selected-popup-type" style="color:${meta.color}">${meta.icon} ${meta.labelAr}</span>
      <strong>${popup.title}</strong>
      ${popup.subtitle ? `<span class="command-selected-popup-sub">${popup.subtitle}</span>` : ''}
    </div>`;

    const t = window.setTimeout(() => {
      L.popup({ className: 'command-popup command-popup-selected', closeButton: true, maxWidth: 280 })
        .setLatLng([alert.latitude, alert.longitude])
        .setContent(html)
        .openOn(map);
    }, 480);

    return () => {
      window.clearTimeout(t);
      map.closePopup();
    };
  }, [alert?.id, alert?.latitude, alert?.longitude, map]);

  if (!alert) return null;

  const color = eventMeta(alert.event_type).color;

  return (
    <>
      <CircleMarker
        center={[alert.latitude, alert.longitude]}
        radius={48}
        pathOptions={{
          color,
          fillColor: color,
          fillOpacity: 0.08,
          weight: 2,
          opacity: 0.55,
          className: 'command-focus-halo',
        }}
      />
      <CircleMarker
        center={[alert.latitude, alert.longitude]}
        radius={28}
        pathOptions={{
          color: 'transparent',
          fillColor: color,
          fillOpacity: 0.15,
          weight: 0,
        }}
      />
    </>
  );
}

function alertIcon(color: string, selected: boolean, critical: boolean) {
  return L.divIcon({
    className: 'command-marker-wrap',
    html: `<div class="command-marker ${selected ? 'command-marker-selected' : ''} ${critical ? 'command-marker-critical' : ''}" style="--marker-color:${color}">
      <span class="command-marker-ring"></span>
      <span class="command-marker-core"></span>
    </div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
}

const vehicleIcon = L.divIcon({
  className: '',
  html: '<div class="command-vehicle-marker"><span></span></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

interface CommandMapProps {
  alerts: RoadAlert[];
  vehicles?: FleetDevice[];
  selectedId?: string | null;
  selectedAlert?: RoadAlert | null;
  focusPoint?: MapFocusPoint | null;
  onSelect?: (alert: RoadAlert) => void;
  showHeat?: boolean;
  className?: string;
  autoFit?: boolean;
}

export function CommandMap({
  alerts,
  vehicles = [],
  selectedId,
  selectedAlert,
  focusPoint,
  onSelect,
  showHeat = false,
  className,
  autoFit = false,
}: CommandMapProps) {
  const center = alerts[0]
    ? ([alerts[0].latitude, alerts[0].longitude] as [number, number])
    : DEFAULT_MAP_CENTER;

  const focusAlert = alerts.find((a) => a.id === selectedId) ?? selectedAlert ?? null;

  return (
    <div className={cn('command-map-root h-full w-full', className)}>
      <MapContainer
        center={center}
        zoom={DEFAULT_MAP_ZOOM}
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
        scrollWheelZoom
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="© OpenStreetMap · العراق"
          maxZoom={19}
        />
        <ZoomControl position="bottomleft" />

        <FitAlertsOverview alerts={alerts} enabled={autoFit && !focusAlert} />
        <MapFocusController
          alert={focusAlert}
          point={focusPoint}
          paddingTopLeft={[300, 120]}
          paddingBottomRight={[380, 80]}
        />
        <SelectedAlertLayer alert={focusAlert} />

        {showHeat &&
          alerts.map((a) => (
            <CircleMarker
              key={`heat-${a.id}`}
              center={[a.latitude, a.longitude]}
              radius={26}
              pathOptions={{
                color: 'transparent',
                fillColor: eventMeta(a.event_type).color,
                fillOpacity: 0.1,
                weight: 0,
              }}
            />
          ))}

        {alerts.map((a) => {
          const meta = eventMeta(a.event_type);
          const selected = selectedId === a.id;
          const critical = a.event_type === 'accident' || a.event_type === 'traffic_violation';
          const popup = alertPopupLines(a);
          return (
            <Marker
              key={a.id}
              position={[a.latitude, a.longitude]}
              icon={alertIcon(meta.color, selected, critical)}
              eventHandlers={{
                click: () => onSelect?.(a),
              }}
              zIndexOffset={selected ? 2000 : critical ? 500 : 0}
            >
              <Popup className="command-popup" minWidth={200}>
                <strong>{popup.title}</strong>
                <br />
                <span className="text-xs text-muted-foreground">{popup.subtitle}</span>
              </Popup>
            </Marker>
          );
        })}

        {vehicles
          .filter((v) => v.is_online && v.latitude != null && v.longitude != null)
          .map((v) => (
            <Marker key={v.id} position={[v.latitude!, v.longitude!]} icon={vehicleIcon}>
              <Popup>{v.driver_name?.trim() || v.vehicle_id} · متصل</Popup>
            </Marker>
          ))}
      </MapContainer>

      {focusAlert && (
        <div className="command-map-focus-badge pointer-events-none absolute right-3 top-3 z-[1000] max-w-[220px] rounded-lg border border-primary/25 bg-card/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
          <p className="font-bold text-primary">📍 موقع محدّد</p>
          <p className="mt-0.5 truncate font-medium text-foreground">
            {focusAlert.title ?? eventMeta(focusAlert.event_type).labelAr}
          </p>
        </div>
      )}
    </div>
  );
}
