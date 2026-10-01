import { z } from 'zod';
import { uuid } from './common.js';

const lat = z.number().min(-90).max(90);
const lng = z.number().min(-180).max(180);

export const locationPing = z.object({
  at: z.iso.datetime({ offset: true }),
  latitude: lat,
  longitude: lng,
  accuracy: z.number().min(0).max(100000).optional(),
  speed: z.number().min(0).max(300).optional(),
  heading: z.number().min(0).max(360).optional(),
  battery: z.number().int().min(0).max(100).optional(),
  provider: z.enum(['gps', 'network', 'fused']).optional(),
  mockLocation: z.boolean().optional(),
});
export type LocationPing = z.infer<typeof locationPing>;

/** A batch from the mobile app: points collected offline arrive together, oldest first. */
export const pingBatchBody = z.object({
  deviceId: z.string().max(100).optional(),
  pings: z.array(locationPing).min(1).max(500),
});

export const trailQuery = z.object({ employeeId: uuid, date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });

export const taskCheckInBody = z.object({
  latitude: lat.optional(),
  longitude: lng.optional(),
  accuracy: z.number().min(0).max(100000).optional(),
  at: z.iso.datetime({ offset: true }).optional(),
  note: z.string().trim().max(500).optional(),
});

export const taskCompleteBody = z.object({
  latitude: lat.optional(),
  longitude: lng.optional(),
  outcome: z.string().trim().min(2, 'Say how it went').max(2000),
  at: z.iso.datetime({ offset: true }).optional(),
});

export const taskCancelBody = z.object({ reason: z.string().trim().min(3).max(500) });
