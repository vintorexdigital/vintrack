'use client';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '../auth/auth';
import { useLocalState, useViewport, type Viewport } from '../hooks/use-viewport';
import type { Mode } from './nav';

export type SidebarState = 'expanded' | 'rail' | 'hidden';

interface ShellState {
  viewport: Viewport;
  sidebar: SidebarState;
  toggleSidebar: () => void;
  drawerOpen: boolean;
  setDrawerOpen: (o: boolean) => void;
  launcherOpen: boolean;
  setLauncherOpen: (o: boolean) => void;
  paletteOpen: boolean;
  setPaletteOpen: (o: boolean) => void;
  mode: Mode;
  setMode: (m: Mode) => void;
  canManage: boolean;
  canEmploy: boolean;
}

const Ctx = createContext<ShellState | null>(null);

/** People with manager-level access can switch modes; the mode changes navigation and defaults, never permissions. */
export function ShellProvider({ children }: { children: ReactNode }) {
  const { me, can } = useAuth();
  const viewport = useViewport();
  const [pref, setPref] = useLocalState<'expanded' | 'rail' | null>('trk.sidebar', null);
  const [modePref, setModePref] = useLocalState<Mode | null>('trk.mode', null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const canManage = can('attendance.register.read') || can('company.settings.read') || can('leave.request.approve') || can('hr.employee.read') && me?.permissions.find((p) => p.permission === 'hr.employee.read')?.scope !== 'self';
  const canEmploy = !!me?.membership.employeeId;
  const mode: Mode = canManage && (modePref === 'manager' || !canEmploy || modePref === null) ? 'manager' : canEmploy ? (modePref ?? 'employee') : 'manager';

  // The stored preference never overrides the hidden state below 768px.
  const sidebar: SidebarState = viewport === 'phone' ? 'hidden' : pref ?? (viewport === 'desktop' ? 'expanded' : 'rail');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        if (viewport === 'phone') setDrawerOpen((o) => !o);
        else setPref(sidebar === 'expanded' ? 'rail' : 'expanded');
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteOpen(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const value = useMemo<ShellState>(() => ({
    viewport, sidebar,
    toggleSidebar: () => (viewport === 'phone' ? setDrawerOpen((o) => !o) : setPref(sidebar === 'expanded' ? 'rail' : 'expanded')),
    drawerOpen, setDrawerOpen, launcherOpen, setLauncherOpen, paletteOpen, setPaletteOpen,
    mode, setMode: (m) => setModePref(m), canManage, canEmploy,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [viewport, sidebar, drawerOpen, launcherOpen, paletteOpen, mode, canManage, canEmploy]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useShell = (): ShellState => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useShell must be used inside ShellProvider');
  return v;
};
