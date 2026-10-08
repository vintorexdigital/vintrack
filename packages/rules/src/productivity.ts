export type AppClass = 'productive' | 'unproductive' | 'neutral';

export interface ActivityBucket {
  start: number; // epoch ms
  seconds: number;
  activeSeconds: number;
  idleSeconds: number;
  appClass: AppClass;
}

export interface ProductivityInput {
  /** Punched-in minutes. */
  workingMinutes: number;
  buckets: ActivityBucket[];
  /** When true, divide productive time by recorded time instead of working time. */
  considerRecordedTimeOnly?: boolean;
}

export interface ProductivityResult {
  workingMinutes: number;
  recordedMinutes: number;
  unrecordedMinutes: number;
  idleMinutes: number;
  productiveMinutes: number;
  unproductiveMinutes: number;
  neutralMinutes: number;
  productivityPct: number;
}

const m = (sec: number) => Math.round(sec / 60);

/**
 * Definitions (shown as tooltips in the product): working = punched-in; recorded = covered by agent
 * data; unrecorded = working - recorded; idle = input-free beyond the threshold; productive =
 * recorded, non-idle time in productive apps; productivity % = productive / working (or recorded).
 */
export function computeProductivity(input: ProductivityInput): ProductivityResult {
  let recorded = 0;
  let idle = 0;
  let productive = 0;
  let unproductive = 0;
  let neutral = 0;
  for (const b of input.buckets) {
    recorded += b.seconds;
    idle += b.idleSeconds;
    const active = Math.max(0, b.seconds - b.idleSeconds);
    if (b.appClass === 'productive') productive += active;
    else if (b.appClass === 'unproductive') unproductive += active;
    else neutral += active;
  }
  const recordedMinutes = Math.min(m(recorded), input.workingMinutes);
  const denominator = input.considerRecordedTimeOnly ? recordedMinutes : input.workingMinutes;
  const productiveMinutes = m(productive);
  return {
    workingMinutes: input.workingMinutes,
    recordedMinutes,
    unrecordedMinutes: Math.max(0, input.workingMinutes - recordedMinutes),
    idleMinutes: m(idle),
    productiveMinutes,
    unproductiveMinutes: m(unproductive),
    neutralMinutes: m(neutral),
    productivityPct: denominator > 0 ? Math.min(100, Math.round((productiveMinutes / denominator) * 1000) / 10) : 0,
  };
}

/** Tenant classification with team overrides. Unclassified items count as neutral. */
export function classifyApp(
  name: string,
  catalogue: Record<string, AppClass>,
  overrides: Record<string, AppClass> = {},
): AppClass {
  const key = name.toLowerCase();
  return overrides[key] ?? catalogue[key] ?? 'neutral';
}
