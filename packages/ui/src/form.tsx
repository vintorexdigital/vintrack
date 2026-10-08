'use client';
import * as Switch from '@radix-ui/react-switch';
import { Info } from 'lucide-react';
import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from './cn';

export interface FieldProps {
  label: string;
  help?: string | undefined;
  error?: string | undefined;
  required?: boolean | undefined;
  children: (id: string, describedBy: string | undefined) => ReactNode;
  className?: string;
}

/** Label, control, help text and error wired together for assistive technology. */
export function Field({ label, help, error, required, children, className }: FieldProps) {
  const id = useId();
  const descId = help || error ? `${id}-desc` : undefined;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
        {required && <span className="ml-0.5 text-absent" aria-hidden> *</span>}
      </label>
      {children(id, descId)}
      {(help || error) && (
        <p id={descId} className={cn('text-xs', error ? 'text-absent' : 'text-muted')} role={error ? 'alert' : undefined}>
          {error ?? help}
        </p>
      )}
    </div>
  );
}

const control =
  'min-h-11 w-full rounded-input border border-rule bg-surface px-3 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none focus-visible:ring-1 focus-visible:ring-brand disabled:bg-canvas disabled:text-muted md:min-h-9 aria-[invalid=true]:border-absent';

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(control, className)} {...rest} />;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(control, 'min-h-24 py-2', className)} {...rest} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(control, 'appearance-none bg-[length:1rem] bg-[right_0.75rem_center] bg-no-repeat pr-8', className)} {...rest}>
      {children}
    </select>
  );
}

export interface ToggleProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  help?: string;
  disabled?: boolean;
}

/** Switch with an inline description; the whole row is the hit target. */
export function Toggle({ checked, onChange, label, help, disabled }: ToggleProps) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-medium text-ink">{label}</label>
        {help && <p className="mt-0.5 flex items-start gap-1 text-xs text-muted"><Info className="mt-0.5 size-3 shrink-0" aria-hidden />{help}</p>}
      </div>
      <Switch.Root
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
        className="relative h-6 w-11 shrink-0 rounded-pill border border-rule bg-canvas transition-colors data-[state=checked]:border-brand data-[state=checked]:bg-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50"
      >
        <Switch.Thumb className="block size-5 translate-x-0.5 rounded-pill bg-surface shadow transition-transform data-[state=checked]:translate-x-[1.35rem]" />
      </Switch.Root>
    </div>
  );
}
