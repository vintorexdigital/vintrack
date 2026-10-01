import { describe, expect, it } from 'vitest';
import {
  cleanTrack, detectStops, haversineMeters, insideFence, pointInPolygon, speedKmh, trackDistanceMeters,
  travelMinutes, type TrackPoint,
} from './geo.js';

const chennai = { lat: 13.0827, lng: 80.2707 };
const t0 = Date.UTC(2026, 7, 29, 4, 0, 0);
const pt = (lat: number, lng: number, min: number, accuracy = 10): TrackPoint => ({ lat, lng, at: t0 + min * 60_000, accuracy });

describe('geo', () => {
  it('measures distance', () => {
    expect(haversineMeters(chennai, chennai)).toBe(0);
    expect(haversineMeters(chennai, { lat: 13.0827, lng: 80.2807 })).toBeGreaterThan(1000);
    expect(haversineMeters(chennai, { lat: 11.0168, lng: 76.9558 })).toBeGreaterThan(400_000); // to Coimbatore
  });
  it('tests circle and polygon fences', () => {
    const near = { lat: 13.0830, lng: 80.2707 };
    expect(insideFence(near, { type: 'circle', center: chennai, radiusMeters: 100 })).toBe(true);
    expect(insideFence({ lat: 13.09, lng: 80.2707 }, { type: 'circle', center: chennai, radiusMeters: 100 })).toBe(false);
    expect(insideFence({ lat: 13.09, lng: 80.2707 }, { type: 'circle', center: chennai, radiusMeters: 100 }, 1000)).toBe(true);
    const poly = [{ lat: 13, lng: 80 }, { lat: 13, lng: 81 }, { lat: 14, lng: 81 }, { lat: 14, lng: 80 }];
    expect(pointInPolygon({ lat: 13.5, lng: 80.5 }, poly)).toBe(true);
    expect(pointInPolygon({ lat: 15, lng: 80.5 }, poly)).toBe(false);
    expect(insideFence({ lat: 13.5, lng: 80.5 }, { type: 'polygon', points: poly })).toBe(true);
  });
  it('cleans noisy tracks', () => {
    const pts = [pt(13.08, 80.27, 0), pt(13.0805, 80.2705, 1, 500), pt(14.5, 80.27, 2), pt(13.081, 80.2705, 3)];
    const c = cleanTrack(pts);
    expect(c.map((p) => p.at)).toEqual([pts[0]!.at, pts[3]!.at]);
  });
  it('computes distance and speed', () => {
    const pts = [pt(13.08, 80.27, 0), pt(13.09, 80.27, 10), pt(13.0900001, 80.27, 11)];
    const d = trackDistanceMeters(pts);
    expect(d).toBeGreaterThan(1100);
    expect(d).toBeLessThan(1120);
    expect(speedKmh(pts[0]!, pts[1]!)).toBeGreaterThan(6);
    expect(speedKmh(pts[0]!, { ...pts[0]! })).toBe(0);
  });
  it('detects stops of ten minutes or more', () => {
    const pts = [
      pt(13.08, 80.27, 0), pt(13.0801, 80.2701, 4), pt(13.0802, 80.2702, 12), // stop 12 min
      pt(13.1, 80.3, 20), // moving
      pt(13.2, 80.3, 25), pt(13.2001, 80.3001, 30), // only 5 min: not a stop
    ];
    const stops = detectStops(pts);
    expect(stops).toHaveLength(1);
    expect(stops[0]).toMatchObject({ minutes: 12, pointCount: 3 });
    expect(travelMinutes(pts, stops)).toBe(30 - 12);
    expect(travelMinutes([pts[0]!], [])).toBe(0);
  });
});
