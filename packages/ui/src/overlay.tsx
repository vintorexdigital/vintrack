'use client';
import * as Dialog from '@radix-ui/react-dialog';
import * as Dropdown from '@radix-ui/react-dropdown-menu';
import * as Tooltip from '@radix-ui/react-tooltip';
import * as Tabs from '@radix-ui/react-tabs';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from './cn';
import { IconButton } from './button';

export interface DrawerProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** md and up: slide-over from the right. Below md it is always a full-screen sheet. */
  width?: 'md' | 'lg' | 'xl';
}

/** Right-hand drawer on desktop, full-screen sheet below md. */
export function Drawer({ open, onOpenChange, title, description, children, footer, width = 'md' }: DrawerProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-[var(--color-overlay)]" />
        <Dialog.Content
          className={cn(
            'fixed inset-0 z-50 flex flex-col bg-surface shadow-[var(--shadow-overlay)] focus:outline-none md:left-auto md:rounded-l-overlay md:border-l md:border-rule',
            width === 'md' ? 'md:w-[28rem]' : width === 'lg' ? 'md:w-[40rem]' : 'md:w-[56rem]',
            'max-w-full',
          )}
        >
          <header className="flex items-start justify-between gap-3 border-b border-rule px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <div className="min-w-0">
              <Dialog.Title className="truncate text-section font-semibold text-ink">{title}</Dialog.Title>
              {description ? <Dialog.Description className="text-sm text-muted">{description}</Dialog.Description> : <Dialog.Description className="sr-only">{title}</Dialog.Description>}
            </div>
            <Dialog.Close asChild><IconButton label="Close"><X className="size-5" /></IconButton></Dialog.Close>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
          {footer && <footer className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t border-rule bg-surface px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</footer>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function Modal({ open, onOpenChange, title, description, children, footer }: Omit<DrawerProps, 'width'>) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-[var(--color-overlay)]" />
        <Dialog.Content className="fixed inset-0 z-50 flex flex-col bg-surface focus:outline-none md:inset-auto md:left-1/2 md:top-1/2 md:max-h-[85vh] md:w-[32rem] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-overlay md:border md:border-rule md:shadow-[var(--shadow-overlay)]">
          <header className="flex items-start justify-between gap-3 border-b border-rule px-4 py-3">
            <div>
              <Dialog.Title className="text-section font-semibold text-ink">{title}</Dialog.Title>
              {description ? <Dialog.Description className="text-sm text-muted">{description}</Dialog.Description> : <Dialog.Description className="sr-only">{title}</Dialog.Description>}
            </div>
            <Dialog.Close asChild><IconButton label="Close"><X className="size-5" /></IconButton></Dialog.Close>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
          {footer && <footer className="flex flex-wrap justify-end gap-2 border-t border-rule px-4 py-3">{footer}</footer>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export interface MenuItem {
  label: string;
  onSelect: () => void;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
}

export function Menu({ trigger, items, align = 'end' }: { trigger: ReactNode; items: (MenuItem | 'separator')[]; align?: 'start' | 'end' }) {
  return (
    <Dropdown.Root>
      <Dropdown.Trigger asChild>{trigger}</Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content align={align} sideOffset={4} className="z-50 min-w-48 rounded-overlay border border-rule bg-surface p-1 shadow-[var(--shadow-overlay)]">
          {items.map((it, i) =>
            it === 'separator' ? (
              <Dropdown.Separator key={i} className="my-1 h-px bg-rule" />
            ) : (
              <Dropdown.Item
                key={it.label}
                disabled={it.disabled}
                onSelect={it.onSelect}
                className={cn('flex min-h-11 cursor-pointer items-center gap-2 rounded-input px-2.5 text-sm outline-none data-[disabled]:opacity-50 data-[highlighted]:bg-canvas md:min-h-8', it.danger ? 'text-absent' : 'text-ink')}
              >
                {it.icon}
                {it.label}
              </Dropdown.Item>
            ),
          )}
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}

export function Tip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip.Provider delayDuration={300}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content sideOffset={6} className="z-50 max-w-64 rounded-input bg-ink px-2 py-1 text-xs text-canvas">{label}</Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}

export interface TabDef {
  value: string;
  label: string;
  content: ReactNode;
}

export function TabsView({ tabs, value, onValueChange, defaultValue }: { tabs: TabDef[]; value?: string; onValueChange?: (v: string) => void; defaultValue?: string }) {
  return (
    <Tabs.Root {...(value !== undefined ? { value } : { defaultValue: defaultValue ?? tabs[0]?.value })} {...(onValueChange ? { onValueChange } : {})}>
      <Tabs.List className="flex gap-1 overflow-x-auto border-b border-rule" aria-label="Sections">
        {tabs.map((t) => (
          <Tabs.Trigger key={t.value} value={t.value} className="min-h-11 shrink-0 border-b-2 border-transparent px-3 text-sm font-medium text-muted hover:text-ink data-[state=active]:border-brand data-[state=active]:text-ink md:min-h-9">
            {t.label}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
      {tabs.map((t) => (
        <Tabs.Content key={t.value} value={t.value} className="pt-4 focus:outline-none">{t.content}</Tabs.Content>
      ))}
    </Tabs.Root>
  );
}
