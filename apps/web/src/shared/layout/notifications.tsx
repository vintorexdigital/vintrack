'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Drawer, EmptyState, IconButton, cn } from '@trackrex/ui';
import { Bell } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../auth/auth';

interface Item { id: string; type: string; title: string; body: string | null; link: string | null; createdAt: string; readAt: string | null }
interface Prefs { email: boolean; sms: boolean; whatsapp: boolean; push: boolean; hasMobile: boolean; pushDevices: number; providers: Record<'sms' | 'whatsapp' | 'push', { name: string; mock: boolean }> }
interface Inbox { data: Item[]; unread: number }

const ago = (iso: string) => { const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000)); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.floor(m / 60)} h ago` : `${Math.floor(m / 1440)} d ago`; };

/** Bell with an unread count; opens the inbox. Polls once a minute and when the window regains focus. */
export function NotificationsBell() {
  const { me } = useAuth();
  const qc = useQueryClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const q = useQuery({ queryKey: ['notifications', me?.company.id], queryFn: () => api<Inbox>('/v1/notifications'), refetchInterval: 60_000, refetchOnWindowFocus: true, enabled: !!me?.user && !me.support });
  const refresh = () => void qc.invalidateQueries({ queryKey: ['notifications'] });
  const read = useMutation({ mutationFn: (id: string) => api(`/v1/notifications/${id}/read`, { method: 'POST', body: {} }), onSuccess: refresh });
  const readAll = useMutation({ mutationFn: () => api('/v1/notifications/read-all', { method: 'POST', body: {} }), onSuccess: refresh });
  const prefs = useQuery({ queryKey: ['notification-prefs'], queryFn: () => api<Prefs>('/v1/notifications/preferences'), enabled: open });
  const setPref = useMutation({ mutationFn: (patch: Partial<Record<'email' | 'sms' | 'whatsapp' | 'push', boolean>>) => api('/v1/notifications/preferences', { method: 'PUT', body: patch }), onSuccess: () => void qc.invalidateQueries({ queryKey: ['notification-prefs'] }) });
  const unread = q.data?.unread ?? 0;

  return (
    <>
      <span className="relative inline-flex">
        <IconButton label={unread ? `Notifications, ${unread} unread` : 'Notifications'} onClick={() => setOpen(true)}><Bell className="size-5" /></IconButton>
        {unread > 0 && <span aria-hidden className="pointer-events-none absolute -right-0.5 -top-0.5 min-w-4 rounded-pill bg-absent px-1 text-center text-[10px] font-semibold leading-4 text-white">{unread > 9 ? '9+' : unread}</span>}
      </span>
      <Drawer open={open} onOpenChange={setOpen} title="Notifications" footer={<Button onClick={() => readAll.mutate()} disabled={!unread} loading={readAll.isPending}>Mark all as read</Button>}>
        <fieldset className="mb-3 border-b border-rule pb-3">
          <legend className="mb-1 text-xs font-medium text-muted">Also send me, for things that need me or concern me</legend>
          {([
            ['email', 'Email', null],
            ['push', 'Push notification', prefs.data && prefs.data.pushDevices === 0 ? 'Turns on when you sign in on the mobile app.' : null],
            ['sms', 'SMS', prefs.data && !prefs.data.hasMobile ? 'Add a mobile number to your employee record first.' : null],
            ['whatsapp', 'WhatsApp', prefs.data && !prefs.data.hasMobile ? 'Add a mobile number to your employee record first.' : null],
          ] as const).map(([key, label, hint]) => {
            const mock = key !== 'email' && prefs.data?.providers[key]?.mock;
            return (
              <label key={key} className="flex min-h-11 items-center justify-between gap-3 text-sm">
                <span>{label}{mock && <span className="ml-2 rounded-pill bg-pending-tint px-2 py-0.5 text-xs">Mock: not delivered</span>}{hint && <span className="block text-xs text-muted">{hint}</span>}</span>
                <input type="checkbox" className="size-5 accent-[var(--brand-primary)]" checked={prefs.data?.[key] ?? (key === 'email' || key === 'push')} disabled={!prefs.data || setPref.isPending} onChange={(e) => setPref.mutate({ [key]: e.target.checked })} />
              </label>
            );
          })}
        </fieldset>
        {q.data?.data.length === 0 ? <EmptyState title="You are all caught up" hint="Requests, decisions and new tasks appear here." /> : (
          <ul className="-mx-4 divide-y divide-rule">
            {q.data?.data.map((n) => (
              <li key={n.id}>
                <button type="button" className={cn('flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-soft', !n.readAt && 'bg-pending-tint')}
                  onClick={() => { if (!n.readAt) read.mutate(n.id); if (n.link) { setOpen(false); router.push(n.link); } }}>
                  <span aria-hidden className={cn('mt-1.5 size-2 shrink-0 rounded-pill', n.readAt ? 'bg-transparent' : 'bg-brand')} />
                  <span className="min-w-0"><span className="block text-sm font-medium">{n.title}</span>{n.body && <span className="block truncate text-xs text-muted">{n.body}</span>}<span className="block text-xs text-muted">{ago(n.createdAt)}</span></span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Drawer>
    </>
  );
}
