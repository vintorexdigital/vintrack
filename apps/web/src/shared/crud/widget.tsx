import type { ReactNode } from 'react';
import { cn } from '@trackrex/ui';

/** A ruled home widget: title, optional action, content. Widgets load independently with skeletons. */
export function Widget({ title, action, children, className }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-overlay border border-rule bg-surface', className)}>
      <header className="flex items-center justify-between gap-2 border-b border-rule px-4 py-2.5">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {action}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Meter({ label, value, total, tone }: { label: string; value: number; total: number; tone: 'present' | 'absent' | 'leave' | 'late' }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm"><span>{label}</span><span className="tabular-nums"><span className="font-semibold">{value}</span> <span className="text-muted">{pct}%</span></span></div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-pill bg-canvas" role="img" aria-label={`${label}: ${value} of ${total}`}><div className={cn('h-full rounded-pill', tone === 'present' && 'bg-present', tone === 'absent' && 'bg-absent', tone === 'leave' && 'bg-leave', tone === 'late' && 'bg-late')} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}
