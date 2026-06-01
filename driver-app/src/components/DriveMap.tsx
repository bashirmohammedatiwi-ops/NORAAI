import { useCallback, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import type { NearbyEvent } from '../lib/api';
import { getEventMeta, MAP_HIGHLIGHT_TYPES, type EventMeta } from '../lib/eventMeta';
import { headingWedge, formatDistanceKm } from '../lib/mapGeo';
import { zoomForAccuracy } from '../lib/location';
import MapChrome from './MapChrome';

interface Props {
  lat: number;
  lon: number;
  heading?: number | null;
  accuracy?: number | null;
  events: NearbyEvent[];
  followUser?: boolean;
  classMeta?: Record<string, EventMeta>;
  visible?: boolean;
  locateTick?: number;
  onLocate?: () => void;
  isLocating?: boolean;
  placeName?: string;
  gpsLabel?: string;
  accuracyText?: string;
  online?: boolean;
  vehicleId?: string;
}

const TILE_BASE = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
const TILE_LABELS = '';
const TILE_ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>';

let uid = 0;

function eventIcon(type: string, hot: boolean, dist: number, classMeta?: Record<string, EventMeta>) {
  const m = getEventMeta(type, classMeta);
  const sz = hot ? 48 : 40;
  return L.divIcon({
    className: 'nx-leaflet-icon',
    html: `<div class="nx-pin${hot ? ' nx-pin--hot' : ''}" style="--c:${m.color}">
      <span class="nx-pin__dot">${m.icon}</span>
      ${dist < 3 ? `<em>${formatDistanceKm(dist)}</em>` : ''}
    </div>`,
    iconSize: [sz, sz + 12],
    iconAnchor: [sz / 2, sz / 2],
  });
}

function userIcon(heading: number | null | undefined, id: number) {
  const rot = heading != null && !Number.isNaN(heading) && heading >= 0 ? heading : 0;
  const g = `ug${id}`;
  return L.divIcon({
    className: 'nx-leaflet-icon',
    html: `<div class="nx-you">
      <span class="nx-you__pulse"></span>
      <span class="nx-you__arrow" style="transform:rotate(${rot}deg)">
        <svg viewBox="0 0 60 60" width="60" height="60">
          <defs>
            <linearGradient id="${g}" x1="50%" y1="0%" x2="50%" y2="100%">
              <stop offset="0%" stop-color="#5eead4"/><stop offset="100%" stop-color="#0d9488"/>
            </linearGradient>
          </defs>
          <path d="M30 4 L46 42 C46 42 30 32 30 32 C30 32 14 42 14 42 Z" fill="url(#${g})" stroke="#fff" stroke-width="2.5"/>
        </svg>
      </span>
      <i class="nx-you__core"></i>
    </div>`,
    iconSize: [60, 60],
    iconAnchor: [30, 30],
  });
}

export default function DriveMap({
  lat,
  lon,
  heading,
  accuracy = null,
  events,
  followUser = true,
  classMeta,
  visible = true,
  locateTick = 0,
  onLocate,
  isLocating = false,
  placeName = '',
  gpsLabel = '',
  accuracyText = '',
  online = false,
  vehicleId = '',
}: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const userRef = useRef<L.Marker | null>(null);
  const wedgeRef = useRef<L.Polygon | null>(null);
  const accRef = useRef<L.Circle | null>(null);
  const linksRef = useRef<L.LayerGroup | null>(null);
  const evRef = useRef<L.LayerGroup | null>(null);
  const idRef = useRef(0);
  const [follow, setFollow] = useState(true);
  const followOk = useRef(follow && followUser);
  followOk.current = follow && followUser;

  const center = useCallback(
    (anim = true) => {
      mapRef.current?.flyTo([lat, lon], zoomForAccuracy(accuracy), { animate: anim, duration: anim ? 0.7 : 0 });
    },
    [lat, lon, accuracy]
  );

  useEffect(() => {
    if (!boxRef.current || mapRef.current) return;
    const map = L.map(boxRef.current, { zoomControl: false, attributionControl: true, preferCanvas: true })
      .setView([lat, lon], zoomForAccuracy(accuracy));
    L.tileLayer(TILE_BASE, { attribution: TILE_ATTR, maxZoom: 20, subdomains: 'abcd' }).addTo(map);
    if (TILE_LABELS) L.tileLayer(TILE_LABELS, { maxZoom: 20, subdomains: 'abcd' }).addTo(map);
    linksRef.current = L.layerGroup().addTo(map);
    evRef.current = L.layerGroup().addTo(map);
    userRef.current = L.marker([lat, lon], { icon: userIcon(heading, ++idRef.current), zIndexOffset: 9999 }).addTo(map);
    map.on('dragstart', () => setFollow(false));
    mapRef.current = map;
    const ro = new ResizeObserver(() => map.invalidateSize({ pan: false }));
    ro.observe(boxRef.current);
    requestAnimationFrame(() => map.invalidateSize({ pan: false }));
    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const u = userRef.current;
    if (!map || !u || !visible) return;
    u.setLatLng([lat, lon]);
    u.setIcon(userIcon(heading, ++idRef.current));
    wedgeRef.current?.remove();
    if (heading != null && heading >= 0) {
      wedgeRef.current = L.polygon(headingWedge(lat, lon, heading), {
        fillColor: '#0d9488',
        fillOpacity: 0.14,
        weight: 0,
        interactive: false,
      }).addTo(map);
    }
    accRef.current?.remove();
    if (accuracy != null && accuracy > 0 && accuracy < 50000) {
      accRef.current = L.circle([lat, lon], {
        radius: accuracy,
        color: 'rgba(13,148,136,0.55)',
        fillColor: '#0d9488',
        fillOpacity: 0.08,
        weight: 1.5,
        dashArray: '5 8',
        interactive: false,
      }).addTo(map);
    }
    if (followOk.current) center(true);
  }, [lat, lon, heading, accuracy, visible, center]);

  useEffect(() => {
    if (!locateTick) return;
    setFollow(true);
    center(true);
  }, [locateTick, center]);

  useEffect(() => {
    const evL = evRef.current;
    const lnL = linksRef.current;
    if (!evL || !lnL) return;
    evL.clearLayers();
    lnL.clearLayers();
    const hot = new Set<string>(MAP_HIGHLIGHT_TYPES);
    const near = [...events].sort((a, b) => a.distance_km - b.distance_km);
    for (const e of near.slice(0, 3)) {
      const m = getEventMeta(e.event_type, classMeta);
      L.polyline([[lat, lon], [e.latitude, e.longitude]], {
        color: m.color,
        weight: 2,
        opacity: 0.3,
        dashArray: '6 10',
        interactive: false,
      }).addTo(lnL);
    }
    for (const e of events) {
      const m = getEventMeta(e.event_type, classMeta);
      const h = hot.has(e.event_type as (typeof MAP_HIGHLIGHT_TYPES)[number]);
      L.marker([e.latitude, e.longitude], {
        icon: eventIcon(e.event_type, h, e.distance_km, classMeta),
        zIndexOffset: h ? 500 : 100,
      })
        .bindPopup(`<div class="nx-popup"><b style="color:${m.color}">${m.icon} ${m.labelAr}</b><p>${formatDistanceKm(e.distance_km)}</p></div>`, {
          className: 'nx-popup-wrap',
        })
        .addTo(evL);
    }
  }, [events, classMeta, lat, lon]);

  useEffect(() => {
    if (!visible || !mapRef.current) return;
    center(true);
    mapRef.current.invalidateSize({ pan: false });
  }, [visible, center]);

  return (
    <div className="nx-map">
      <div ref={boxRef} className="nx-map__leaf" />
      <div className="nx-map__shade" aria-hidden="true" />
      <MapChrome
        title={placeName || gpsLabel}
        sub={accuracyText}
        online={online}
        vehicle={vehicleId}
        events={events}
        classMeta={classMeta ?? {}}
        locating={isLocating}
        follow={follow}
        onLocate={() => {
          setFollow(true);
          onLocate?.();
          center(true);
        }}
        onFollow={() => {
          setFollow(true);
          center(true);
        }}
        onZoomIn={() => mapRef.current?.zoomIn()}
        onZoomOut={() => mapRef.current?.zoomOut()}
      />
    </div>
  );
}
