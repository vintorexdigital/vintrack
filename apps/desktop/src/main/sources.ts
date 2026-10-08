import { powerMonitor } from 'electron';
import type { IdleSource, WindowSource } from '../agent/types';

export const systemIdle: IdleSource = { idleSeconds: () => powerMonitor.getSystemIdleTime() };

/**
 * The focused window, via the `active-win` package. It is an optional dependency: on macOS it needs the Screen
 * Recording permission to read other apps' window titles; without it we still get the application name.
 */
export const focusedWindow: WindowSource = {
  async sample() {
    try {
      type Win = { owner: { name: string }; title: string; url?: string } | undefined;
      const mod = (await import('active-win')) as unknown as { default?: () => Promise<Win> } & (() => Promise<Win>);
      const w = await (mod.default ?? mod)();
      if (!w) return null;
      return { app: w.owner.name, title: w.title, ...(w.url ? { url: w.url } : {}) };
    } catch {
      return null;
    }
  },
};
