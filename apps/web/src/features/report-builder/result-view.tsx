'use client';
import { BarChart, DataTable, DonutChart, EmptyState, formatValue, Kpi, LineChart, ValuesTable, type ChartData, type DataColumn, type Unit } from '@trackrex/ui';

export interface BuiltColumn { key: string; label: string; kind: 'dimension' | 'measure'; unit?: Unit }
export interface BuiltResult { range: { from: string; to: string }; columns: BuiltColumn[]; rows: Record<string, string | number | null>[]; truncated: boolean; definition: { chart: 'table' | 'bar' | 'line' | 'pie' } }
export type Display = 'kpi' | 'bar' | 'line' | 'pie' | 'table';

export function toChartData(r: Pick<BuiltResult, 'columns' | 'rows'>): ChartData {
  const dims = r.columns.filter((c) => c.kind === 'dimension');
  const measures = r.columns.filter((c) => c.kind === 'measure');
  return {
    categories: r.rows.map((row) => (dims.length ? dims.map((d) => String(row[d.key] ?? '–')).join(' · ') : 'Total')),
    series: measures.map((m) => ({ key: m.key, label: m.label, unit: m.unit, values: r.rows.map((row) => (row[m.key] === null || row[m.key] === undefined ? null : Number(row[m.key]))) })),
  };
}

export function ResultTable({ result }: { result: BuiltResult }) {
  const cols: DataColumn<Record<string, string | number | null>>[] = result.columns.map((c) => ({
    key: c.key, header: c.label, numeric: c.kind === 'measure',
    cell: (r) => (c.kind === 'measure' ? formatValue(r[c.key] === null ? null : Number(r[c.key]), c.unit) : String(r[c.key] ?? '–')),
  }));
  return <DataTable caption="Report results" columns={cols} rows={result.rows} rowKey={(r) => JSON.stringify(r)} empty={<EmptyState title="No data for this period" />} />;
}

/** One result, shown the way the report (or the dashboard widget) asked for. Falls back to the table when a chart cannot say anything. */
export function ResultView({ result, display }: { result: BuiltResult; display?: Display }) {
  const want: Display = display ?? result.definition.chart;
  if (result.rows.length === 0) return <EmptyState title="No data for this period" hint={`${result.range.from} to ${result.range.to}`} />;
  const data = toChartData(result);
  const measures = result.columns.filter((c) => c.kind === 'measure');
  const hasDims = result.columns.some((c) => c.kind === 'dimension');
  if (want === 'kpi' || (!hasDims && want !== 'table')) {
    return <div className="flex flex-wrap gap-x-8 gap-y-3">{measures.map((m) => <Kpi key={m.key} label={m.label} unit={m.unit} value={data.series.find((s) => s.key === m.key)?.values[0] ?? null} hint={`${result.range.from} to ${result.range.to}`} />)}</div>;
  }
  return (
    <div className="space-y-2">
      {want === 'bar' && <BarChart data={data} />}
      {want === 'line' && <LineChart data={data} />}
      {want === 'pie' && <DonutChart data={data} />}
      {want === 'table' && <ResultTable result={result} />}
      {want !== 'table' && want !== 'line' && <ValuesTable data={data} />}
      {result.truncated && <p className="text-xs text-muted">The list was cut at its limit. Narrow the period or add a filter to see the rest.</p>}
    </div>
  );
}
