import * as Location from 'expo-location';
import type { Position } from '@trackrex/client-core';

/** One position fix, best effort: a punch must never fail just because the GPS is slow or denied. */
export async function currentPosition(timeoutMs = 8000): Promise<Position | null> {
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== 'granted') return null;
    const fix = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<null>((r) => setTimeout(() => r(null), timeoutMs)),
    ]);
    if (!fix) return null;
    return { latitude: fix.coords.latitude, longitude: fix.coords.longitude, accuracy: fix.coords.accuracy, mock: (fix as { mocked?: boolean }).mocked === true };
  } catch {
    return null;
  }
}

/** Foreground tracking while working. Returns a stop function. Background tracking is not implemented. */
export async function watchWhileWorking(intervalSeconds: number, onPoint: (p: { at: string; latitude: number; longitude: number; accuracy: number | null; speed: number | null; mock: boolean }) => void): Promise<() => void> {
  const perm = await Location.requestForegroundPermissionsAsync();
  if (perm.status !== 'granted') return () => undefined;
  const sub = await Location.watchPositionAsync(
    { accuracy: Location.Accuracy.Balanced, timeInterval: intervalSeconds * 1000, distanceInterval: 20 },
    (l) => onPoint({ at: new Date(l.timestamp).toISOString(), latitude: l.coords.latitude, longitude: l.coords.longitude, accuracy: l.coords.accuracy, speed: l.coords.speed, mock: (l as { mocked?: boolean }).mocked === true }),
  );
  return () => sub.remove();
}
