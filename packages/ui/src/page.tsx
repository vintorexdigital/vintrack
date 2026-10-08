import type { ReactNode } from 'react';
import { cn } from './cn';

/** Page header: title, scope breadcrumb, one primary action, secondary actions. */
export function PageHeader({ title, scope, description, primary, secondary }: { title: string; scope?: string; description?: string; primary?: ReactNode; secondary?: ReactNode }) {
  return (
    <header className="flex flex-col gap-3 px-4 pb-3 pt-4 md:flex-row md:items-end md:justify-between md:px-6">
      <div className="min-w-0">
        {scope && <p className="text-xs text-muted">{scope}</p>}
        <h1 className="truncate text-page font-semibold text-ink">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {secondary}
        {primary}
      </div>
    </header>
  );
}

export function PageBody({ children, className, wide = true }: { children: ReactNode; className?: string; wide?: boolean }) {
  return <div className={cn('px-4 pb-8 md:px-6', !wide && 'mx-auto w-full max-w-[60rem]', className)}>{children}</div>;
}

export function Section({ title, description, children, actions }: { title: string; description?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="border-t border-rule py-5 first:border-t-0">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-section font-semibold text-ink">{title}</h2>
          {description && <p className="text-sm text-muted">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}
