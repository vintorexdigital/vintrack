/** One look at the desktop: which window has focus and how long the person has been away from the keyboard. */
export interface WindowSample {
  at: number; // epoch ms
  app: string;
  title?: string;
  url?: string;
  /** Seconds since the last keyboard or mouse input, from the operating system. */
  idleSeconds: number;
}

export interface WindowSource {
  /** The focused window, or null when nothing is focused (lock screen, no display). */
  sample(): Promise<Omit<WindowSample, 'at' | 'idleSeconds'> | null>;
}

export interface IdleSource { idleSeconds(): number }

export interface ActivityBucket {
  start: string;
  seconds: number;
  activeSeconds: number;
  idleSeconds: number;
  app: string;
  url?: string;
  title?: string;
}

export interface ActivityPolicy { enabled: boolean; windowTitles: 'drop' | 'hash' | 'keep'; fullUrls: boolean; screenshots: boolean }
