import { z } from 'zod';
import { isoDate } from './common.js';

export const FILTER_OPS = ['eq', 'ne', 'in', 'gt', 'gte', 'lt', 'lte', 'contains'] as const;
export const CHART_TYPES = ['table', 'bar', 'line', 'pie'] as const;
export type ChartType = (typeof CHART_TYPES)[number];

export const rangeSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('last_days'), days: z.number().int().min(1).max(366) }),
  z.object({ mode: z.literal('this_month') }),
  z.object({ mode: z.literal('last_month') }),
  z.object({ mode: z.literal('custom'), from: isoDate, to: isoDate }),
]);
export type ReportRange = z.infer<typeof rangeSchema>;

export const reportFilterSchema = z.object({
  field: z.string().regex(/^[a-z][a-z0-9_]{0,40}$/),
  op: z.enum(FILTER_OPS),
  value: z.union([z.string().max(200), z.number(), z.array(z.string().max(100)).max(50)]),
});

/** What a person builds: pick a dataset, then how to group it, what to total, and how to look at it. Everything is a key into the dataset's allow-list; nothing here is ever SQL. */
export const reportDefinitionSchema = z.object({
  dataset: z.string().regex(/^[a-z][a-z0-9_]{0,40}$/),
  dimensions: z.array(z.string().regex(/^[a-z][a-z0-9_]{0,40}$/)).max(3).default([]),
  measures: z.array(z.string().regex(/^[a-z][a-z0-9_]{0,40}$/)).min(1, 'Choose at least one number to show').max(4),
  filters: z.array(reportFilterSchema).max(8).default([]),
  range: rangeSchema.default({ mode: 'last_days', days: 30 }),
  sort: z.object({ key: z.string(), dir: z.enum(['asc', 'desc']) }).optional(),
  limit: z.number().int().min(1).max(5000).default(500),
  chart: z.enum(CHART_TYPES).default('table'),
});
export type ReportDefinition = z.infer<typeof reportDefinitionSchema>;

export interface DatasetMeta {
  key: string;
  label: string;
  description: string;
  dimensions: { key: string; label: string; kind: 'text' | 'date' | 'month' }[];
  measures: { key: string; label: string; unit: 'count' | 'hours' | 'money' | 'percent' | 'number' }[];
  /** Fields a filter can test. `options` lists the allowed values for choice fields. */
  filters: { key: string; label: string; kind: 'text' | 'choice' | 'number'; options?: string[] }[];
}

export const widgetSchema = z.object({
  id: z.string().regex(/^[a-z0-9_-]{1,40}$/),
  title: z.string().trim().min(1).max(80),
  reportId: z.string().uuid(),
  display: z.enum(['kpi', 'bar', 'line', 'pie', 'table']).default('bar'),
  size: z.enum(['sm', 'md', 'lg']).default('md'),
});
export type DashboardWidget = z.infer<typeof widgetSchema>;
export const widgetsSchema = z.array(widgetSchema).max(24);

export const scheduleBody = z.object({
  reportId: z.string().uuid(),
  frequency: z.enum(['daily', 'weekly', 'monthly']),
  weekday: z.number().int().min(0).max(6).default(1),
  dayOfMonth: z.number().int().min(1).max(28).default(1),
  hour: z.number().int().min(0).max(23).default(8),
  enabled: z.boolean().default(true),
});
