'use client';
import { Button, IconButton, Menu, Modal, cn } from '@trackrex/ui';
import { Building2, HelpCircle, LayoutGrid, Menu as MenuIcon, Moon, Search, Sun, SunMoon, Contrast, Check, Keyboard } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '../auth/auth';
import { useT } from '../i18n/i18n';
import { LOCALES } from '../i18n/messages';
import { useLocalState } from '../hooks/use-viewport';
import { PunchWidget } from './punch-widget';
import { useShell } from './shell-state';

type Theme = 'system' | 'light' | 'dark' | 'contrast';

function useTheme() {
  const [theme, setTheme] = useLocalState<Theme>('trk.theme', 'system');
  useEffect(() => {
    const el = document.documentElement;
    if (theme === 'system') el.removeAttribute('data-theme');
    else el.setAttribute('data-theme', theme);
  }, [theme]);
  return [theme, setTheme] as const;
}

export function ModeSwitcher() {
  const { mode, setMode, canManage, canEmploy } = useShell();
  const { t } = useT();
  if (!canManage || !canEmploy) return null;
  return (
    <div role="group" aria-label="Mode" className="hidden rounded-button border border-rule bg-canvas p-0.5 lg:flex">
      {(['manager', 'employee'] as const).map((m) => (
        <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)} className={cn('min-h-8 rounded-input px-3 text-xs font-semibold', mode === m ? 'bg-brand text-on-brand' : 'text-muted hover:text-ink')}>
          {t(`mode.${m}`)}
        </button>
      ))}
    </div>
  );
}

function ProfileMenu() {
  const { me, signOut, switchCompany } = useAuth();
  const { locale, setLocale, t } = useT();
  const [theme, setTheme] = useTheme();
  const { mode, setMode, canManage, canEmploy } = useShell();
  if (!me?.user) return null;
  const initials = me.user.name.split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
  const tick = (on: boolean) => (on ? <Check className="size-4" aria-hidden /> : <span className="size-4" />);
  return (
    <Menu
      trigger={<button type="button" aria-label="Account menu" className="inline-flex size-10 items-center justify-center rounded-pill bg-brand/10 text-sm font-semibold text-brand focus-visible:outline-2 focus-visible:outline-brand">{initials}</button>}
      items={[
        { label: `${me.user.name} · ${me.company.name}`, onSelect: () => undefined, disabled: true },
        'separator',
        ...(canManage && canEmploy ? [{ label: mode === 'manager' ? 'Switch to Employee mode' : 'Switch to Manager mode', onSelect: () => setMode(mode === 'manager' ? 'employee' : 'manager'), icon: <LayoutGrid className="size-4" aria-hidden /> }] : []),
        ...me.companies.filter((c) => c.id !== me.company.id).map((c) => ({ label: `Switch to ${c.name}`, onSelect: () => void switchCompany(c.id), icon: <Building2 className="size-4" aria-hidden /> })),
        ...(me.companies.length > 1 || (canManage && canEmploy) ? ['separator' as const] : []),
        ...LOCALES.map((l) => ({ label: `${t('common.language')}: ${l.label}`, onSelect: () => setLocale(l.code), icon: tick(locale === l.code) })),
        'separator',
        ...([['system', 'System theme', SunMoon], ['light', 'Light theme', Sun], ['dark', 'Dark theme', Moon], ['contrast', 'High contrast', Contrast]] as const).map(([k, label, Icon]) => ({ label, onSelect: () => setTheme(k), icon: theme === k ? <Check className="size-4" aria-hidden /> : <Icon className="size-4" aria-hidden /> })),
        'separator',
        { label: t('action.signout'), onSelect: () => void signOut(), danger: true },
      ]}
    />
  );
}

function HelpMenu() {
  const [shortcuts, setShortcuts] = useState(false);
  return (
    <>
      <Menu trigger={<IconButton label="Help"><HelpCircle className="size-5" /></IconButton>} items={[{ label: 'Keyboard shortcuts', onSelect: () => setShortcuts(true), icon: <Keyboard className="size-4" aria-hidden /> }]} />
      <Modal open={shortcuts} onOpenChange={setShortcuts} title="Keyboard shortcuts" footer={<Button onClick={() => setShortcuts(false)}>Close</Button>}>
        <dl className="space-y-2 text-sm">
          {[['Ctrl or Cmd + K', 'Search pages, settings and people'], ['Ctrl or Cmd + B', 'Collapse or expand the sidebar'], ['Esc', 'Close a drawer or dialog']].map(([k, d]) => (
            <div key={k} className="flex items-center justify-between gap-3"><dt><kbd className="rounded-input border border-rule bg-canvas px-1.5 py-0.5 text-xs">{k}</kbd></dt><dd className="text-muted">{d}</dd></div>
          ))}
        </dl>
      </Modal>
    </>
  );
}

export function Topbar() {
  const { me } = useAuth();
  const { toggleSidebar, setPaletteOpen, setLauncherOpen, viewport } = useShell();
  const { t } = useT();
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-rule bg-surface px-3 pt-[env(safe-area-inset-top)] md:px-4 short:h-11">
      {viewport === 'phone' && <IconButton label={t('common.menu')} onClick={toggleSidebar}><MenuIcon className="size-5" /></IconButton>}
      <p className="hidden min-w-0 max-w-[14rem] truncate text-sm font-semibold text-ink md:block" title={me?.company.name}>{me?.company.name}</p>
      <button type="button" onClick={() => setPaletteOpen(true)} aria-label="Search" aria-keyshortcuts="Control+K Meta+K" className="ml-auto flex min-h-11 items-center gap-2 rounded-button border border-rule bg-canvas px-3 text-sm text-muted hover:border-muted md:ml-2 md:min-h-9 md:min-w-56 md:flex-1 md:max-w-sm">
        <Search className="size-4" aria-hidden />
        <span className="hidden md:inline">{t('action.search')}</span>
        <kbd className="ml-auto hidden rounded-input border border-rule bg-surface px-1.5 text-xs md:block">Ctrl K</kbd>
      </button>
      <div className="ml-auto hidden md:block" />
      <PunchWidget compact />
      <ModeSwitcher />
      <IconButton label={t('common.modules')} onClick={() => setLauncherOpen(true)} className="hidden md:inline-flex"><LayoutGrid className="size-5" /></IconButton>
      <HelpMenu />
      <ProfileMenu />
    </header>
  );
}
