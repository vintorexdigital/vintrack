'use client';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { cn } from './cn';
import { IconButton } from './button';

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('rounded-input bg-rule motion-safe:animate-pulse', className)} />;
}

export function EmptyState({ icon, title, hint, action }: { icon?: ReactNode; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      {icon && <div className="text-muted">{icon}</div>}
      <p className="text-section font-semibold text-ink">{title}</p>
      {hint && <p className="max-w-md text-sm text-muted">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Banner({ tone = 'info', children, onDismiss, action }: { tone?: 'info' | 'warn' | 'error'; children: ReactNode; onDismiss?: () => void; action?: ReactNode }) {
  const Icon = tone === 'info' ? Info : AlertTriangle;
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cn('flex items-start gap-3 border-b px-4 py-2 text-sm text-ink', tone === 'info' && 'border-pending bg-pending-tint', tone === 'warn' && 'border-late bg-late-tint', tone === 'error' && 'border-absent bg-absent-tint')}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">{children}</div>
      {action}
      {onDismiss && <IconButton label="Dismiss" onClick={onDismiss} className="-my-2 size-8"><X className="size-4" /></IconButton>}
    </div>
  );
}

interface Toast { id: number; tone: 'success' | 'error' | 'info'; text: string }
const ToastCtx = createContext<(tone: Toast['tone'], text: string) => void>(() => undefined);
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((tone: Toast['tone'], text: string) => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x.slice(-3), { id, tone, text }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), tone === 'error' ? 8000 : 4000);
  }, []);
  const value = useMemo(() => push, [push]);
  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:items-end" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className="pointer-events-auto flex max-w-md items-start gap-2 rounded-overlay border border-rule bg-surface px-3 py-2.5 text-sm text-ink shadow-[var(--shadow-overlay)]">
            {t.tone === 'success' ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-present" aria-hidden /> : <AlertTriangle className={cn('mt-0.5 size-4 shrink-0', t.tone === 'error' ? 'text-absent' : 'text-pending')} aria-hidden />}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
