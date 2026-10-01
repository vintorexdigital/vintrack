import { z } from 'zod';
import { isoDate, uuid } from './common.js';

export const punchBody = z.object({
  /** Omit to toggle: punch in when out, punch out when in. */
  type: z.enum(['in', 'out']).optional(),
  /** Device time for offline punches (ISO 8601). */
  at: z.iso.datetime({ offset: true }).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  accuracy: z.number().min(0).max(100000).optional(),
  address: z.string().max(400).optional(),
  deviceId: z.string().max(100).optional(),
  platform: z.enum(['android', 'ios', 'windows', 'macos', 'web']).optional(),
  comment: z.string().trim().max(500).optional(),
  mockLocation: z.boolean().optional(),
  selfieKey: z.string().max(300).optional(),
  offline: z.boolean().optional(),
  /** Punch on behalf of another employee (needs the override permission). */
  employeeId: uuid.optional(),
});
export type PunchBody = z.infer<typeof punchBody>;

export const dayOverrideBody = z.object({
  code: z.enum(['P', 'HP', 'AB', 'ONW', 'OH']),
  reason: z.string().trim().min(3, 'Give a short reason').max(500),
});

export const rerunBody = z.object({
  from: isoDate,
  to: isoDate,
  employeeIds: z.array(uuid).max(1000).optional(),
  dryRun: z.boolean().default(true),
});

export const registerQuery = z.object({
  /** Any date inside the wanted cycle. Defaults to today. */
  date: isoDate.optional(),
  departmentId: uuid.optional(),
  teamId: uuid.optional(),
  workLocationId: uuid.optional(),
  q: z.string().max(80).optional(),
  directOnly: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

export const breakBody = z.object({ breakTypeId: uuid.optional() });

export const regularizationActionBody = z.object({ comment: z.string().trim().max(500).optional() });
export const bulkRegularizationBody = z.object({ ids: z.array(uuid).min(1).max(200), comment: z.string().trim().max(500).optional() });
