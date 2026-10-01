import { z } from 'zod';
import { e164, slug, uuid } from './common.js';

const identifier = z.string().trim().min(3).max(120);

export const loginBody = z.object({
  identifier,
  password: z.string().min(1).max(200),
  tenant: z.string().trim().max(60).optional(),
  deviceId: z.string().max(100).optional(),
});
export type LoginBody = z.infer<typeof loginBody>;

export const otpRequestBody = z.object({ identifier, tenant: z.string().trim().max(60).optional() });
export const otpVerifyBody = z.object({
  identifier,
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
  tenant: z.string().trim().max(60).optional(),
  deviceId: z.string().max(100).optional(),
});
export const oidcBody = z.object({
  provider: z.enum(['google', 'microsoft']),
  idToken: z.string().min(20),
  tenant: z.string().trim().max(60).optional(),
});
export const selectCompanyBody = z.object({ selectionToken: z.string().min(20), tenantId: uuid });
export const switchCompanyBody = z.object({ tenantId: uuid });
export const refreshBody = z.object({ refreshToken: z.string().min(20).optional() });

export const acceptInvitationBody = z.object({
  token: z.string().min(20),
  name: z.string().trim().min(1).max(120),
  password: z.string().min(1).max(200),
  mobile: e164.optional(),
});

export const roleKeys = z.array(z.string().min(2).max(60)).min(1).max(10);

export const inviteUserBody = z
  .object({
    email: z.string().trim().toLowerCase().email().optional(),
    mobile: e164.optional(),
    name: z.string().trim().max(120).optional(),
    roleKeys,
    employeeId: uuid.optional(),
  })
  .refine((v) => v.email || v.mobile, { message: 'Enter an email address or a mobile number.', path: ['email'] });

export const updateMembershipBody = z.object({
  roleKeys: roleKeys.optional(),
  status: z.enum(['active', 'suspended', 'removed']).optional(),
});

export const RESERVED_SLUGS = ['www', 'app', 'api', 'platform', 'admin', 'support', 'mail', 'status', 'docs', 'help', 'blog', 'static', 'cdn', 'login', 'signup'] as const;

export const provisionBody = z.object({
  name: z.string().trim().min(2).max(120),
  slug: slug.refine((s) => !(RESERVED_SLUGS as readonly string[]).includes(s), 'That name is reserved'),
  legalName: z.string().trim().max(200).optional(),
  country: z.string().length(2).default('IN'),
  timezone: z.string().min(3).max(60).default('Asia/Kolkata'),
  currency: z.string().length(3).default('INR'),
  locale: z.string().max(10).default('en-IN'),
  planKey: z.string().max(40).default('trial'),
  trialDays: z.number().int().min(0).max(90).default(14),
  seatLimit: z.number().int().min(1).max(100000).default(10),
  isDemo: z.boolean().default(false),
  resellerId: uuid.optional(),
  groupId: uuid.optional(),
  owner: z.object({
    name: z.string().trim().min(1).max(120),
    email: z.string().trim().toLowerCase().email(),
    mobile: e164.optional(),
    password: z.string().min(1).max(200).optional(),
  }),
});
export type ProvisionBody = z.infer<typeof provisionBody>;

export const signupBody = provisionBody.pick({ name: true, slug: true, country: true, timezone: true, currency: true, owner: true });

export const tenantStatuses = ['trial', 'active', 'past_due', 'suspended', 'cancelled', 'deleted'] as const;
export type TenantStatus = (typeof tenantStatuses)[number];

export const platformLoginBody = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(200),
  totp: z.string().regex(/^\d{6}$/).optional(),
});

export const supportSessionBody = z.object({
  reason: z.string().trim().min(10, 'Explain why you need access (at least 10 characters).').max(500),
  minutes: z.number().int().min(5).max(480).default(60),
});

export const updateTenantBody = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  planKey: z.string().max(40).optional(),
  seatLimit: z.number().int().min(1).max(100000).optional(),
  featureFlags: z.record(z.string(), z.boolean()).optional(),
  internalNotes: z.string().max(4000).optional(),
  resellerId: uuid.nullable().optional(),
  groupId: uuid.nullable().optional(),
});

export const lifecycleBody = z.object({
  action: z.enum(['suspend', 'restore', 'cancel', 'extend_trial', 'activate', 'mark_past_due', 'delete', 'undelete']),
  reason: z.string().trim().max(500).optional(),
  days: z.number().int().min(1).max(90).optional(),
});

export const companyProfileBody = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  legalName: z.string().trim().max(200).optional(),
  timezone: z.string().min(3).max(60).optional(),
  locale: z.string().max(10).optional(),
});
