import { describe, expect, it } from 'vitest';
import { classifyApp, computeProductivity, type ActivityBucket } from './productivity.js';

const b = (appClass: ActivityBucket['appClass'], idle = 0, seconds = 120): ActivityBucket => ({ start: 0, seconds, idleSeconds: idle, activeSeconds: seconds - idle, appClass });

describe('productivity', () => {
  it('derives working, recorded, unrecorded, idle and productive time', () => {
    const buckets = [...Array(10).fill(0).map(() => b('productive')), ...Array(5).fill(0).map(() => b('unproductive', 60)), b('neutral')];
    const r = computeProductivity({ workingMinutes: 60, buckets });
    expect(r).toMatchObject({ recordedMinutes: 32, unrecordedMinutes: 28, idleMinutes: 5, productiveMinutes: 20, unproductiveMinutes: 5, neutralMinutes: 2 });
    expect(r.productivityPct).toBe(33.3);
  });
  it('can divide by recorded time instead', () => {
    const r = computeProductivity({ workingMinutes: 60, considerRecordedTimeOnly: true, buckets: Array(10).fill(0).map(() => b('productive')) });
    expect(r.productivityPct).toBe(100);
  });
  it('handles empty days and caps at 100%', () => {
    expect(computeProductivity({ workingMinutes: 0, buckets: [] }).productivityPct).toBe(0);
    expect(computeProductivity({ workingMinutes: 10, buckets: Array(10).fill(0).map(() => b('productive')) }).productivityPct).toBe(100);
  });
  it('classifies apps with overrides and a neutral default', () => {
    const cat = { code: 'productive' as const, youtube: 'unproductive' as const };
    expect(classifyApp('Code', cat)).toBe('productive');
    expect(classifyApp('YouTube', cat, { youtube: 'neutral' })).toBe('neutral');
    expect(classifyApp('Unknown', cat)).toBe('neutral');
  });
});
