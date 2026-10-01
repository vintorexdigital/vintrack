'use client';
import * as Dialog from '@radix-ui/react-dialog';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { cn } from '@trackrex/ui';
import { api } from '../api/client';
import { useAuth } from '../auth/auth';
import { ADMIN_NAV, EMPLOYEE_NAV, MANAGER_NAV } from './nav';
import { flatten, visibleAdmin, visibleNav } from './nav-utils';
import { useShell } from './shell-state';

interface Result { id: string; label: string; hint: string; href: string }

/** Ctrl or Cmd + K: pages, settings and people. */
export function CommandPalette() {
  const { paletteOpen, setPaletteOpen, mode } = useShell();
  const { can, hasModule } = useAuth();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const vis = { can, hasModule };

  const pages = useMemo<Result[]>(() => {
    const nav = flatten(visibleNav(mode === 'manager' ? MANAGER_NAV : EMPLOYEE_NAV, vis)).filter((i) => i.href).map((i) => ({ id: `p:${i.id}`, label: i.label, hint: 'Page', href: i.href! }));
    const admin = mode === 'manager' ? visibleAdmin(ADMIN_NAV, vis).flatMap((g) => g.items.map((i) => ({ id: `a:${i.href}`, label: i.label, hint: `Admin · ${g.label}`, href: i.href }))) : [];
    return [...nav, ...admin];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, can, hasModule]);

  const people = useQuery({
    queryKey: ['palette-people', q],
    queryFn: () => api<{ data: { id: string; displayName: string; code: string }[] }>('/v1/people/employees', { query: { q, limit: 6 } }),
    enabled: paletteOpen && q.length >= 2 && can('hr.employee.read'),
  });

  const results = useMemo<Result[]>(() => {
    const needle = q.trim().toLowerCase();
    const p = pages.filter((x) => !needle || `${x.label} ${x.hint}`.toLowerCase().includes(needle)).slice(0, 8);
    const e = (people.data?.data ?? []).map((x) => ({ id: `e:${x.id}`, label: x.displayName, hint: `Employee · ${x.code}`, href: `/people/employees/${x.id}` }));
    return [...p, ...e];
  }, [pages, people.data, q]);

  useEffect(() => { setActive(0); }, [q]);
  useEffect(() => { if (!paletteOpen) setQ(''); }, [paletteOpen]);

  const go = (r: Result) => { setPaletteOpen(false); router.push(r.href); };

  return (
    <Dialog.Root open={paletteOpen} onOpenChange={setPaletteOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-[var(--color-overlay)]" />
        <Dialog.Content className="fixed inset-x-3 top-[12vh] z-50 mx-auto max-w-xl overflow-hidden rounded-overlay border border-rule bg-surface shadow-[var(--shadow-overlay)] focus:outline-none">
          <Dialog.Title className="sr-only">Search</Dialog.Title>
          <Dialog.Description className="sr-only">Search pages, settings and people</Dialog.Description>
          <div className="flex items-center gap-2 border-b border-rule px-3">
            <Search className="size-4 text-muted" aria-hidden />
            <input
              autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search pages, settings and people" aria-label="Search" role="combobox" aria-expanded aria-controls="palette-list"
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
                if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
                if (e.key === 'Enter' && results[active]) go(results[active]!);
              }}
              className="min-h-12 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted"
            />
            <kbd className="hidden rounded-input border border-rule px-1.5 py-0.5 text-xs text-muted sm:block">Esc</kbd>
          </div>
          <ul id="palette-list" role="listbox" className="max-h-[50vh] overflow-y-auto p-1">
            {results.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">Nothing found</li>}
            {results.map((r, i) => (
              <li key={r.id} role="option" aria-selected={i === active}>
                <button type="button" onMouseEnter={() => setActive(i)} onClick={() => go(r)} className={cn('flex min-h-11 w-full items-center justify-between gap-3 rounded-input px-3 text-left text-sm', i === active && 'bg-canvas')}>
                  <span className="truncate text-ink">{r.label}</span><span className="shrink-0 text-xs text-muted">{r.hint}</span>
                </button>
              </li>
            ))}
          </ul>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
