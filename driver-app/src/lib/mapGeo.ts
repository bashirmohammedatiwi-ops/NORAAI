const EARTH_R = 6378137;

export function destinationPoint(
  lat: number,
  lon: number,
  bearingDeg: number,
  distanceM: number
): [number, number] {
  const brng = (bearingDeg * Math.PI) / 180;
  const lat1 = (lat * Math.PI) / 180;
  const lon1 = (lon * Math.PI) / 180;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(distanceM / EARTH_R) +
      Math.cos(lat1) * Math.sin(distanceM / EARTH_R) * Math.cos(brng)
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(brng) * Math.sin(distanceM / EARTH_R) * Math.cos(lat1),
      Math.cos(distanceM / EARTH_R) - Math.sin(lat1) * Math.sin(lat2)
    );
  return [(lat2 * 180) / Math.PI, (lon2 * 180) / Math.PI];
}

export function headingWedge(
  lat: number,
  lon: number,
  headingDeg: number,
  radiusM = 140,
  spreadDeg = 32
): [number, number][] {
  const tip = destinationPoint(lat, lon, headingDeg, radiusM);
  const left = destinationPoint(lat, lon, headingDeg - spreadDeg, radiusM * 0.55);
  const right = destinationPoint(lat, lon, headingDeg + spreadDeg, radiusM * 0.55);
  return [
    [lat, lon],
    left,
    tip,
    right,
  ];
}

export function formatDistanceKm(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(km < 10 ? 1 : 0)} km`;
}

export function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = 6378137;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dlat = ((lat2 - lat1) * Math.PI) / 180;
  const dlon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(p1) * Math.cos(p2) * Math.sin(dlon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(a));
}
