import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import type { RoadAlert } from '@/types';

export interface MapFocusPoint {
  lat: number;
  lng: number;
  zoom: number;
}

function alertZoom(alert: RoadAlert): number {
  if (alert.event_type === 'accident') return 17;
  if (alert.event_type === 'traffic_violation') return 16;
  return 16;
}

/** Pan/zoom map to selected alert or arbitrary focus point */
export function MapFocusController({
  alert,
  point,
  paddingTopLeft,
  paddingBottomRight,
}: {
  alert?: RoadAlert | null;
  point?: MapFocusPoint | null;
  paddingTopLeft?: [number, number];
  paddingBottomRight?: [number, number];
}) {
  const map = useMap();

  useEffect(() => {
    if (alert) {
      map.stop();
      const zoom = alertZoom(alert);
      const lat = alert.latitude;
      const lng = alert.longitude;

      if (paddingTopLeft || paddingBottomRight) {
        const pad = 0.00035;
        map.flyToBounds(
          [
            [lat - pad, lng - pad],
            [lat + pad, lng + pad],
          ],
          {
            maxZoom: zoom,
            duration: 0.55,
            easeLinearity: 0.22,
            animate: true,
            paddingTopLeft,
            paddingBottomRight,
          },
        );
      } else {
        map.flyTo([lat, lng], zoom, {
          duration: 0.55,
          easeLinearity: 0.22,
          animate: true,
        });
      }
      return;
    }
    if (point) {
      map.stop();
      map.flyTo([point.lat, point.lng], point.zoom, {
        duration: 0.7,
        easeLinearity: 0.25,
        animate: true,
      });
    }
  }, [
    alert?.id,
    alert?.latitude,
    alert?.longitude,
    point?.lat,
    point?.lng,
    point?.zoom,
    map,
    paddingTopLeft,
    paddingBottomRight,
  ]);

  return null;
}
