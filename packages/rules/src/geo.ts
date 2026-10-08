const R = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;

export interface LatLng {
  lat: number;
  lng: number;
}

export interface TrackPoint extends LatLng {
  at: number; // epoch ms
  accuracy?: number | null;
  speed?: number | null;
}

export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export type Fence =
  | { type: 'circle'; center: LatLng; radiusMeters: number }
  | { type: 'polygon'; points: LatLng[] };

export function pointInPolygon(p: LatLng, poly: LatLng[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    const crosses = a.lat > p.lat !== b.lat > p.lat && p.lng < ((b.lng - a.lng) * (p.lat - a.lat)) / (b.lat - a.lat) + a.lng;
    if (crosses) inside = !inside;
  }
  return inside;
}

export function insideFence(p: LatLng, fence: Fence, accuracyMeters = 0): boolean {
  if (fence.type === 'circle') return haversineMeters(p, fence.center) <= fence.radiusMeters + accuracyMeters;
  return pointInPolygon(p, fence.points);
}

/** Drop points with poor accuracy and implausible jumps (speed above `maxSpeedMs`). */
export function cleanTrack(points: TrackPoint[], maxAccuracy = 100, maxSpeedMs = 70): TrackPoint[] {
  const sorted = [...points].sort((a, b) => a.at - b.at).filter((p) => (p.accuracy ?? 0) <= maxAccuracy);
  const out: TrackPoint[] = [];
  for (const p of sorted) {
    const prev = out[out.length - 1];
    if (prev) {
      const dt = (p.at - prev.at) / 1000;
      if (dt > 0 && haversineMeters(prev, p) / dt > maxSpeedMs) continue;
    }
    out.push(p);
  }
  return out;
}

export function trackDistanceMeters(points: TrackPoint[], minStepMeters = 5): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const d = haversineMeters(points[i - 1]!, points[i]!);
    if (d >= minStepMeters) total += d;
  }
  return Math.round(total);
}

export interface Stop {
  center: LatLng;
  arrival: number;
  departure: number;
  minutes: number;
  pointCount: number;
}

/** Stops: 10 minutes or more within `radiusMeters` of the first point of the cluster. */
export function detectStops(points: TrackPoint[], radiusMeters = 100, minMinutes = 10): Stop[] {
  const stops: Stop[] = [];
  let i = 0;
  while (i < points.length) {
    const anchor = points[i]!;
    let j = i + 1;
    while (j < points.length && haversineMeters(anchor, points[j]!) <= radiusMeters) j++;
    const last = points[j - 1]!;
    const minutes = Math.round((last.at - anchor.at) / 60_000);
    if (j - i >= 2 && minutes >= minMinutes) {
      const slice = points.slice(i, j);
      stops.push({
        center: {
          lat: slice.reduce((s, p) => s + p.lat, 0) / slice.length,
          lng: slice.reduce((s, p) => s + p.lng, 0) / slice.length,
        },
        arrival: anchor.at,
        departure: last.at,
        minutes,
        pointCount: slice.length,
      });
      i = j;
    } else i++;
  }
  return stops;
}

export function travelMinutes(points: TrackPoint[], stops: Stop[]): number {
  if (points.length < 2) return 0;
  const span = Math.round((points[points.length - 1]!.at - points[0]!.at) / 60_000);
  return Math.max(0, span - stops.reduce((s, x) => s + x.minutes, 0));
}

export const speedKmh = (a: TrackPoint, b: TrackPoint): number => {
  const dt = (b.at - a.at) / 3_600_000;
  return dt > 0 ? haversineMeters(a, b) / 1000 / dt : 0;
};

export interface PunchLike {
  type: 'in' | 'out';
  at: number; // epoch ms
}

/**
 * Working intervals from a punch history: each punch-in until the next punch-out, or until `now` while
 * still in. Location is only recorded and shown inside these intervals.
 */
export function workingIntervals(punches: PunchLike[], now: number): { start: number; end: number }[] {
  const sorted = [...punches].sort((a, b) => a.at - b.at);
  const out: { start: number; end: number }[] = [];
  let open: number | null = null;
  for (const p of sorted) {
    if (p.type === 'in' && open === null) open = p.at;
    else if (p.type === 'out' && open !== null) { out.push({ start: open, end: p.at }); open = null; }
  }
  if (open !== null) out.push({ start: open, end: Math.max(now, open) });
  return out;
}

export const withinIntervals = (at: number, intervals: { start: number; end: number }[]): boolean => intervals.some((i) => at >= i.start && at <= i.end);
