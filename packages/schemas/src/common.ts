import { z } from 'zod';

export const uuid = z.string().uuid();
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
export const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm (24-hour)');
export const e164 = z.string().regex(/^\+[1-9]\d{6,14}$/, 'Use international format, like +919876543210');
export const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex colour like #0F5E73');
export const slug = z
  .string()
  .min(3)
  .max(40)
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])$/, 'Use lowercase letters, numbers and hyphens');

export const sourceSchema = z.enum(['web', 'mobile', 'desktop', 'api', 'system']);
export type Source = z.infer<typeof sourceSchema>;

/** RFC 9457 problem details with a stable machine code and per-field errors. */
export const problemSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  code: z.string(),
  detail: z.string().optional(),
  instance: z.string().optional(),
  requestId: z.string().optional(),
  errors: z.array(z.object({ path: z.string(), message: z.string(), code: z.string().optional() })).optional(),
});
export type Problem = z.infer<typeof problemSchema>;

export interface Page<T> {
  data: T[];
  nextCursor: string | null;
  total?: number;
}

export const idParam = z.object({ id: uuid });

/** Audience claims: a platform token is never accepted by company APIs and vice versa. */
export const tokenAudience = z.enum(['company', 'platform', 'support']);
export type TokenAudience = z.infer<typeof tokenAudience>;
