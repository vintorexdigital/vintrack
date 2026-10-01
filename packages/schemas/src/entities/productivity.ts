import { z } from 'zod';
import { defineEntity, f } from '../entity.js';

export const APP_CLASSES = ['productive', 'unproductive', 'neutral'] as const;

export const appClassifications = defineEntity({
  key: 'app-classes', singular: 'App classification', plural: 'App classifications', module: 'productivity', resource: 'app-class',
  path: '/admin/productivity/app-classes', titleField: 'name', defaultSort: 'name', unique: ['name'], licenseModule: 'desktop_activity',
  fields: {
    name: f.text('Application or website', { required: true, list: true, sort: true, search: true, help: 'The program name (for example "excel") or a website domain (for example "youtube.com"). Not case sensitive.' }),
    kind: f.select('Type', ['app', 'domain'], { default: 'app', list: true, filter: true }),
    appClass: f.select('Counts as', APP_CLASSES, { required: true, default: 'neutral', list: true, filter: true, sort: true }),
  },
  empty: { title: 'Nothing classified yet', hint: 'Mark the applications and websites your teams use as productive, unproductive or neutral. Anything not listed counts as neutral.' },
});

const instant = z.iso.datetime({ offset: true });
export const activityBucket = z.object({
  /** Start of the bucket, aligned by the agent to the minute. */
  start: instant,
  seconds: z.number().int().min(1).max(3600),
  activeSeconds: z.number().int().min(0).max(3600),
  idleSeconds: z.number().int().min(0).max(3600),
  app: z.string().trim().min(1).max(120),
  /** Browser tabs: the page address. The server keeps only the domain unless the company allows full URLs. */
  url: z.string().trim().max(2000).optional(),
  title: z.string().max(300).optional(),
}).refine((b) => b.activeSeconds + b.idleSeconds <= b.seconds + 1, { message: 'Active and idle time exceed the bucket length.' });

export const activityBatchBody = z.object({
  deviceId: z.string().max(100).optional(),
  buckets: z.array(activityBucket).min(1).max(500),
});
export type ActivityBucketInput = z.infer<typeof activityBucket>;

export const productivityQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  employeeId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
});
