import { cn } from './cn';

export type Unit = 'count' | 'hours' | 'money' | 'percent' | 'number' | undefined;
export interface Series { key: string; label: string; unit?: Unit; values: (number | null)[] }
export interface ChartData { categories: string[]; series: Series[] }

/** Colours from the palette, in an order that stays distinguishable together. Values are always printed too, so colour is never the only cue. */
export const SERIES_COLORS = ['var(--brand-primary)', 'var(--status-late)', 'var(--status-leave)', 'var(--status-present)', 'var(--status-holiday)', 'var(--status-absent)'];

export function formatValue(v: number | null | undefined, unit: Unit, locale = 'en-IN'): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '–';
  switch (unit) {
    case 'money': return new Intl.NumberFormat(locale, { style: 'currency', currency: 'INR', maximumFractionDigits: v >= 1000 ? 0 : 2 }).format(v);
    case 'percent': return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(v)}%`;
    case 'hours': return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(v)} h`;
    case 'count': return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(v);
    default: return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(v);
  }
}

function Legend({ series }: { series: Series[] }) {
  if (series.length < 2) return null;
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-label="Legend">
      {series.map((s, i) => <li key={s.key} className="inline-flex items-center gap-1.5"><span aria-hidden className="inline-block size-2.5 rounded-sm" style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }} />{s.label}</li>)}
    </ul>
  );
}

/** Horizontal bars, one group per category. Every bar carries its number, so the chart reads without colour or sight of the bar length. */
export function BarChart({ data, className, maxRows = 12 }: { data: ChartData; className?: string; maxRows?: number }) {
  const rows = data.categories.slice(0, maxRows);
  const max = Math.max(1, ...data.series.flatMap((s) => s.values.slice(0, maxRows).map((v) => v ?? 0)));
  return (
    <div className={cn('space-y-2', className)}>
      <Legend series={data.series} />
      <ul className="space-y-2">
        {rows.map((c, i) => (
          <li key={`${c}-${i}`} className="grid grid-cols-[minmax(0,9rem)_1fr] items-center gap-x-3 gap-y-0.5 text-sm">
            <span className="truncate text-xs text-muted" title={c}>{c}</span>
            <span className="space-y-1">
              {data.series.map((s, si) => {
                const v = s.values[i] ?? null;
                return (
                  <span key={s.key} className="flex items-center gap-2">
                    <span aria-hidden className="h-3 rounded-sm" style={{ width: `${Math.max(v ? 2 : 0, ((v ?? 0) / max) * 100)}%`, background: SERIES_COLORS[si % SERIES_COLORS.length], maxWidth: 'calc(100% - 4.5rem)' }} />
                    <span className="shrink-0 text-xs tabular-nums"><span className="sr-only">{s.label}: </span>{formatValue(v, s.unit)}</span>
                  </span>
                );
              })}
            </span>
          </li>
        ))}
      </ul>
      {data.categories.length > maxRows && <p className="text-xs text-muted">Showing the first {maxRows} of {data.categories.length}. Open the table for all of them.</p>}
    </div>
  );
}

const W = 520;
const H = 200;
const PAD = { l: 44, r: 12, t: 12, b: 28 };

/** Lines over an ordered axis (days, months). Points are marked and the table below the chart has every value. */
export function LineChart({ data, className }: { data: ChartData; className?: string }) {
  const n = data.categories.length;
  const max = Math.max(1, ...data.series.flatMap((s) => s.values.map((v) => v ?? 0)));
  const x = (i: number) => PAD.l + (n <= 1 ? (W - PAD.l - PAD.r) / 2 : (i / (n - 1)) * (W - PAD.l - PAD.r));
  const y = (v: number) => PAD.t + (1 - v / max) * (H - PAD.t - PAD.b);
  const ticks = [0, 0.5, 1].map((f) => f * max);
  const step = Math.max(1, Math.ceil(n / 6));
  return (
    <div className={cn('space-y-2', className)}>
      <Legend series={data.series} />
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Line chart of ${data.series.map((s) => s.label).join(', ')} over ${n} points`} className="h-auto w-full">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--color-rule)" strokeWidth={1} />
            <text x={PAD.l - 6} y={y(t) + 4} textAnchor="end" fontSize={10} fill="var(--color-muted)">{formatValue(t, data.series[0]?.unit)}</text>
          </g>
        ))}
        {data.categories.map((c, i) => (i % step === 0 || i === n - 1) && <text key={`${c}-${i}`} x={x(i)} y={H - 8} textAnchor="middle" fontSize={10} fill="var(--color-muted)">{c.length > 10 ? c.slice(5) : c}</text>)}
        {data.series.map((s, si) => {
          const color = SERIES_COLORS[si % SERIES_COLORS.length];
          const pts = s.values.map((v, i) => (v === null ? null : [x(i), y(v)] as const));
          const path = pts.map((p, i) => (p ? `${i === 0 || !pts[i - 1] ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}` : '')).join(' ');
          return (
            <g key={s.key}>
              <path d={path} fill="none" stroke={color} strokeWidth={2} />
              {pts.map((p, i) => p && (si % 2 === 0 ? <circle key={i} cx={p[0]} cy={p[1]} r={3.5} fill={color} /> : <rect key={i} x={p[0] - 3.5} y={p[1] - 3.5} width={7} height={7} fill={color} />))}
            </g>
          );
        })}
      </svg>
      <ValuesTable data={data} />
    </div>
  );
}

/** Share of a total. The legend lists each slice with its number and percentage. */
export function DonutChart({ data, className }: { data: ChartData; className?: string }) {
  const s = data.series[0];
  const vals = (s?.values ?? []).map((v) => Math.max(0, v ?? 0));
  const total = vals.reduce((a, b) => a + b, 0);
  const R = 40;
  const C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div className={cn('flex flex-wrap items-center gap-4', className)}>
      <svg viewBox="0 0 100 100" role="img" aria-label={`Share of ${s?.label ?? 'total'} by ${data.categories.length} groups`} className="size-36 shrink-0 -rotate-90">
        <circle cx="50" cy="50" r={R} fill="none" stroke="var(--color-rule)" strokeWidth={14} />
        {total > 0 && vals.map((v, i) => {
          const len = (v / total) * C;
          const el = <circle key={i} cx="50" cy="50" r={R} fill="none" stroke={SERIES_COLORS[i % SERIES_COLORS.length]} strokeWidth={14} strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset} />;
          offset += len;
          return el;
        })}
      </svg>
      <ul className="min-w-0 flex-1 space-y-1 text-sm">
        {data.categories.map((c, i) => (
          <li key={`${c}-${i}`} className="flex items-center gap-2">
            <span aria-hidden className="inline-block size-2.5 shrink-0 rounded-sm" style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }} />
            <span className="min-w-0 flex-1 truncate" title={c}>{c}</span>
            <span className="tabular-nums">{formatValue(vals[i], s?.unit)}</span>
            <span className="w-10 text-right text-xs tabular-nums text-muted">{total ? `${Math.round((vals[i]! / total) * 100)}%` : ''}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** One big number. */
export function Kpi({ label, value, unit, hint, className }: { label: string; value: number | null; unit?: Unit; hint?: string; className?: string }) {
  return (
    <div className={cn('space-y-0.5', className)}>
      <p className="text-xs text-muted">{label}</p>
      <p className="text-kpi font-semibold tabular-nums">{formatValue(value, unit)}</p>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

/** Every value, as a real table, for people who prefer numbers or use a screen reader. */
export function ValuesTable({ data, className }: { data: ChartData; className?: string }) {
  return (
    <details className={cn('text-xs', className)}>
      <summary className="cursor-pointer text-muted">Show the numbers</summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead><tr><th scope="col" className="py-1 pr-3 font-medium">&nbsp;</th>{data.series.map((s) => <th key={s.key} scope="col" className="py-1 pr-3 font-medium">{s.label}</th>)}</tr></thead>
          <tbody>{data.categories.map((c, i) => <tr key={`${c}-${i}`} className="border-t border-rule"><th scope="row" className="py-1 pr-3 font-normal">{c}</th>{data.series.map((s) => <td key={s.key} className="py-1 pr-3 tabular-nums">{formatValue(s.values[i], s.unit)}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </details>
  );
}
