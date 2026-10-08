import type { ReactNode } from 'react';
import { cn } from './cn';

export type StatusTone = 'present' | 'absent' | 'leave' | 'late' | 'holiday' | 'non-working' | 'pending';

const TONES: Record<StatusTone, string> = {
  present: 'bg-present-tint border-present',
  absent: 'bg-absent-tint border-absent',
  leave: 'bg-leave-tint border-leave',
  late: 'bg-late-tint border-late',
  holiday: 'bg-holiday-tint border-holiday',
  'non-working': 'bg-non-working-tint border-non-working',
  pending: 'bg-pending-tint border-pending',
};

/** Status is never colour alone: every pill carries a letter code or label. Ink text on a 14% tint keeps AA contrast. */
export function StatusPill({ tone, code, children, className }: { tone: StatusTone; code?: string; children?: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-pill border-b-2 px-2 py-0.5 text-xs font-medium text-ink', TONES[tone], className)}>
      {code && <span className="font-semibold tabular-nums">{code}</span>}
      {children}
    </span>
  );
}

export function LiveDot({ className }: { className?: string }) {
  return <span aria-hidden className={cn('relative inline-flex size-2 rounded-pill bg-live motion-safe:after:absolute motion-safe:after:inset-0 motion-safe:after:animate-ping motion-safe:after:rounded-pill motion-safe:after:bg-live motion-safe:after:opacity-60', className)} />;
}

export function Avatar({ name, online, size = 32 }: { name: string; online?: boolean | undefined; size?: number }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      <span className="inline-flex size-full items-center justify-center rounded-pill bg-brand-hover/10 text-xs font-semibold text-brand" aria-hidden>{initials}</span>
      {online !== undefined && (
        <span aria-label={online ? 'Online' : 'Offline'} className={cn('absolute -bottom-0.5 -right-0.5 size-2.5 rounded-pill border-2 border-surface', online ? 'bg-present' : 'bg-non-working')} />
      )}
    </span>
  );
}

export interface KpiItem {
  label: string;
  value: ReactNode;
  unit?: string;
  delta?: { value: number; good?: 'up' | 'down' };
  hint?: string;
}

/** One ruled band of tabular figures with signed delta chips, not a grid of boxed tiles. */
export function KpiBand({ items }: { items: KpiItem[] }) {
  return (
    <dl className="grid grid-cols-2 divide-rule border-y border-rule bg-surface md:flex md:divide-x">
      {items.map((k) => (
        <div key={k.label} className="flex min-w-0 flex-1 flex-col gap-1 border-b border-rule px-4 py-3 last:border-b-0 md:border-b-0">
          <dt className="text-xs text-muted">{k.label}</dt>
          <dd className="flex flex-wrap items-baseline gap-1.5">
            <span className="text-kpi font-semibold tabular-nums text-ink">{k.value}</span>
            {k.unit && <span className="text-xs text-muted">{k.unit}</span>}
            {k.delta && <DeltaChip {...k.delta} />}
            {k.hint && <span className="block w-full text-xs text-muted">{k.hint}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function DeltaChip({ value, good = 'up' }: { value: number; good?: 'up' | 'down' }) {
  const up = value > 0;
  const positive = value === 0 ? null : (up && good === 'up') || (!up && good === 'down');
  return (
    <span className={cn('inline-flex items-center rounded-input px-1.5 text-xs font-medium tabular-nums', positive === null ? 'bg-non-working-tint text-ink' : positive ? 'bg-present-tint text-ink' : 'bg-absent-tint text-ink')}>
      <span aria-hidden>{value === 0 ? '–' : up ? '▲' : '▼'}</span>
      <span className="ml-0.5">{value > 0 ? '+' : ''}{value}%</span>
    </span>
  );
}
