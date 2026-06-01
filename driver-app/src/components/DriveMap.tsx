import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import L from 'leaflet';
import type { NearbyEvent } from '../lib/api';
import { getEventMeta, MAP_HIGHLIGHT_TYPES, type EventMeta } from '../lib/eventMeta';

interface Props {
  lat: number;
  lon: number;
  heading?: number | null;
  events: NearbyEvent[];
  followUser?: boolean;
  classMeta?: Record<string, EventMeta>;
}

function eventIcon(type: string, highlighted: boolean, classMeta?: Record<string, EventMeta>) {
  const meta = getEventMeta(type, classMeta);
  const size = highlighted ? 38 : 32;
  return L.divIcon({
    className: 'drive-map-marker',
    html: `<div class="drive-map-marker__pin" style="--pin-color:${meta.color};--pin-size:${size}px">
      <span class="drive-map-marker__icon">${meta.icon}</span>
    </div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function userIcon(heading: number | null | undefined) {
  const rotation = heading != null && !Number.isNaN(heading) ? heading : 0;
  return L.divIcon({
    className: 'drive-map-user',
    html: `<div class="drive-map-user__arrow" style="transform:rotate(${rotation}deg)"></div>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });
}

export default function DriveMap({ lat, lon, heading, events, followUser = true, classMeta }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const eventLayerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: true,
    }).setView([lat, lon], 15);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      maxZoom: 19,
    }).addTo(map);

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    userMarkerRef.current = L.marker([lat, lon], { icon: userIcon(heading), zIndexOffset: 1000 }).addTo(map);
    eventLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      userMarkerRef.current = null;
      eventLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const userMarker = userMarkerRef.current;
    if (!map || !userMarker) return;

    userMarker.setLatLng([lat, lon]);
    userMarker.setIcon(userIcon(heading));
    if (followUser) {
      map.panTo([lat, lon], { animate: true, duration: 0.6 });
    }
  }, [lat, lon, heading, followUser]);

  useEffect(() => {
    const layer = eventLayerRef.current;
    const map = mapRef.current;
    if (!layer || !map) return;

    layer.clearLayers();
    const highlightSet = new Set<string>(MAP_HIGHLIGHT_TYPES);

    const sorted = [...events].sort((a, b) => {
      const pa = getEventMeta(a.event_type, classMeta).mapPriority;
      const pb = getEventMeta(b.event_type, classMeta).mapPriority;
      return pa - pb;
    });

    for (const event of sorted) {
      const meta = getEventMeta(event.event_type, classMeta);
      const highlighted = highlightSet.has(event.event_type as typeof MAP_HIGHLIGHT_TYPES[number]);
      const marker = L.marker([event.latitude, event.longitude], {
        icon: eventIcon(event.event_type, highlighted, classMeta),
        zIndexOffset: highlighted ? 500 : 100,
      });
      marker.bindPopup(`
        <div class="drive-map-popup">
          <strong style="color:${meta.color}">${meta.icon} ${meta.labelAr}</strong><br/>
          <span>${meta.label}</span><br/>
          ${event.confidence != null ? `الثقة: ${Math.round(event.confidence * 100)}%<br/>` : ''}
          المسافة: ${event.distance_km} km
        </div>
      `);
      marker.addTo(layer);
    }
  }, [events, classMeta]);

  const counts = MAP_HIGHLIGHT_TYPES.map((type) => ({
    type,
    count: events.filter((e) => e.event_type === type).length,
    meta: getEventMeta(type, classMeta),
  }));

  return (
    <div className="drive-map">
      <div ref={containerRef} className="drive-map__canvas" />
      <div className="drive-map__legend">
        {counts.map(({ type, count, meta }) => (
          <span key={type} className="drive-map__legend-item" style={{ '--legend-color': meta.color } as CSSProperties}>
            <span className="drive-map__legend-dot">{meta.icon}</span>
            {meta.labelAr}
            {count > 0 && <strong className="drive-map__legend-count">{count}</strong>}
          </span>
        ))}
      </div>
    </div>
  );
}
