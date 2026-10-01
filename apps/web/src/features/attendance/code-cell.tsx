import { ATTENDANCE_CODES, type AttendanceCode } from '@trackrex/rules';
import { cn } from '@trackrex/ui';

const TONE: Record<string, string> = {
  present: 'bg-present-tint border-present', absent: 'bg-absent-tint border-absent', leave: 'bg-leave-tint border-leave', late: 'bg-late-tint border-late',
  holiday: 'bg-holiday-tint border-holiday', 'non-working': 'bg-non-working-tint border-non-working', pending: 'bg-pending-tint border-pending',
};

export const toneOf = (code: string): string => ATTENDANCE_CODES[code as AttendanceCode]?.token ?? 'non-working';

/** A register cell: letter code in Ink on a 14% tint with a 2px rule in the full status colour. Never colour alone. */
export function CodeCell({ code, secondary, late, deduction, overridden, className }: { code: string; secondary?: string | undefined; late?: boolean | undefined; deduction?: boolean | undefined; overridden?: boolean | undefined; className?: string }) {
  const title = [ATTENDANCE_CODES[code as AttendanceCode]?.title ?? code, secondary && `+ ${ATTENDANCE_CODES[secondary as AttendanceCode]?.title}`, late && 'late mark', deduction && 'deduction', overridden && 'overridden'].filter(Boolean).join(', ');
  return (
    <span title={title} aria-label={title} className={cn('relative inline-flex h-7 min-w-8 items-center justify-center gap-px rounded-[2px] border-b-2 px-1 text-xs font-semibold text-ink tabular-nums', TONE[toneOf(code)], className)}>
      {code}{secondary ? <span className="text-[0.625rem] font-medium">/{secondary}</span> : null}
      {late && <span aria-hidden className="absolute right-0 top-0 size-1.5 rounded-bl bg-late" />}
      {overridden && <span aria-hidden className="absolute bottom-0 left-0 size-1.5 rounded-tr bg-ink" />}
      {deduction && <span aria-hidden className="absolute left-0 top-0 size-1.5 rounded-br bg-absent" />}
    </span>
  );
}
