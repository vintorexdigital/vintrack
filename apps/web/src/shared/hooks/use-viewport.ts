'use client';
import { useEffect, useState } from 'react';

export type Viewport = 'phone' | 'tablet' | 'desktop';

/** phone < 768, tablet 768 to 1279, desktop 1280 and up (the shell's default sidebar states). */
export function useViewport(): Viewport {
  const [v, setV] = useState<Viewport>('desktop');
  useEffect(() => {
    const phone = window.matchMedia('(max-width: 767.98px)');
    const wide = window.matchMedia('(min-width: 1280px)');
    const update = () => setV(phone.matches ? 'phone' : wide.matches ? 'desktop' : 'tablet');
    update();
    phone.addEventListener('change', update);
    wide.addEventListener('change', update);
    return () => { phone.removeEventListener('change', update); wide.removeEventListener('change', update); };
  }, []);
  return v;
}

export function useLocalState<T>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    try { const raw = localStorage.getItem(key); if (raw !== null) setValue(JSON.parse(raw) as T); } catch { /* storage unavailable */ }
  }, [key]);
  const set = (v: T) => {
    setValue(v);
    try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* ignore */ }
  };
  return [value, set];
}
