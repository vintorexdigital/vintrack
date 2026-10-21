import { Loader2 } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-on-brand hover:bg-brand-hover active:bg-brand-active border border-transparent shadow-[0_6px_16px_-6px_var(--brand-primary)]',
  secondary: 'bg-soft text-ink border border-transparent hover:bg-soft-strong',
  danger: 'bg-surface text-absent border border-absent hover:bg-absent hover:text-surface',
  ghost: 'bg-transparent text-ink border border-transparent hover:bg-soft',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
  size?: 'sm' | 'md';
  icon?: ReactNode;
}

/** Named for its outcome ("Approve leave", "Punch in"). 44px touch target below md, compact above. */
export function Button({ variant = 'secondary', size = 'md', loading, icon, className, children, disabled, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-2 rounded-button font-semibold transition duration-150 active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50',
        size === 'md' ? 'min-h-11 px-4 text-sm md:min-h-9 md:px-3' : 'min-h-11 px-3 text-sm md:min-h-8 md:px-2.5',
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required: icons are never shown without an accessible name. */
  label: string;
  children: ReactNode;
}

export function IconButton({ label, className, children, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex size-11 shrink-0 items-center justify-center rounded-button text-muted transition-colors duration-150 hover:bg-soft hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50 md:size-9',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
