import { cn } from './cn';

export type RibbonKind = 'travel' | 'visit' | 'productive' | 'neutral' | 'unproductive' | 'idle' | 'break' | 'unrecorded' | 'worked';

export interface RibbonSegment {
  start: number; // epoch ms
  end: number;
  kind: RibbonKind;
  label?: string;
}

export interface RibbonPin {
  at: number;
  type: 'in' | 'out';
}

const KIND_CLASS: Record<RibbonKind, string> = {
  travel: 'bg-brand',
  visit: 'border-2 border-live bg-surface',
  productive: 'bg-present',
  neutral: 'bg-muted/30',
  unproductive: 'bg-absent/40',
  idle: 'bg-[repeating-linear-gradient(135deg,var(--color-muted)_0_2px,transparent_2px_6px)] opacity-60',
  break: 'bg-holiday',
  unrecorded: 'border border-dotted border-muted bg-transparent',
  worked: 'bg-present/70',
};

export const RIBBON_LEGEND: { kind: RibbonKind; label: string }[] = [
  { kind: 'travel', label: 'Travel' }, { kind: 'visit', label: 'On-site visit' }, { kind: 'productive', label: 'Productive' },
  { kind: 'neutral', label: 'Neutral' }, { kind: 'unproductive', label: 'Unproductive' }, { kind: 'idle', label: 'Idle' },
  { kind: 'break', label: 'Break' }, { kind: 'unrecorded', label: 'Unrecorded' },
];

export interface DayRibbonProps {
  /** Visible window, epoch ms. */
  from: number;
  to: number;
  segments: RibbonSegment[];
  pins?: RibbonPin[];
  now?: number | undefined;
  /** Text summary for screen readers. */
  summary: string;
  height?: number;
  formatTime?: (ms: number) => string;
  className?: string;
  onSegmentClick?: (s: RibbonSegment) => void;
}

const pct = (v: number, from: number, to: number) => Math.min(100, Math.max(0, ((v - from) / (to - from)) * 100));

/**
 * The signature component: one employee-day on a time axis. Segments abut like rail track blocks, punch
 * in and out are pin markers, and the current time is a Marigold line. Colour is never the only cue:
 * each segment has a text label in its tooltip and the whole ribbon has a text summary.
 */
export function DayRibbon({ from, to, segments, pins = [], now, summary, height = 24, formatTime = (ms) => new Date(ms).toISOString().slice(11, 16), className, onSegmentClick }: DayRibbonProps) {
  return (
    <div role="img" aria-label={summary} className={cn('relative w-full', className)} style={{ height: height + 10 }}>
      <div className="absolute inset-x-0 top-[5px] rounded-input bg-canvas" style={{ height }} />
      {segments.map((s, i) => {
        const left = pct(s.start, from, to);
        const width = Math.max(0.3, pct(s.end, from, to) - left);
        return (
          <button
            key={i}
            type="button"
            title={`${s.label ?? s.kind}: ${formatTime(s.start)} to ${formatTime(s.end)}`}
            aria-label={`${s.label ?? s.kind} ${formatTime(s.start)} to ${formatTime(s.end)}`}
            disabled={!onSegmentClick}
            onClick={() => onSegmentClick?.(s)}
            className={cn('absolute top-[5px] rounded-[2px]', KIND_CLASS[s.kind], onSegmentClick && 'cursor-pointer hover:brightness-110')}
            style={{ left: `${left}%`, width: `${width}%`, height }}
          />
        );
      })}
      {pins.map((p, i) => (
        <span key={i} title={`Punch ${p.type} ${formatTime(p.at)}`} className="absolute top-0 flex -translate-x-1/2 flex-col items-center" style={{ left: `${pct(p.at, from, to)}%` }}>
          <span className={cn('block h-[calc(100%+0px)] w-0.5', p.type === 'in' ? 'bg-present' : 'bg-absent')} style={{ height: height + 10 }} />
        </span>
      ))}
      {now !== undefined && now >= from && now <= to && (
        <span aria-hidden className="absolute top-0 -translate-x-1/2" style={{ left: `${pct(now, from, to)}%` }}>
          <span className="block size-0 border-x-[3px] border-t-[5px] border-x-transparent border-t-live" />
          <span className="mx-auto block w-0.5 bg-live" style={{ height: height + 5 }} />
        </span>
      )}
    </div>
  );
}
