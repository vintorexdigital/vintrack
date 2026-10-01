import { boolean, integer, jsonb, pgSchema, text, timestamp, uuid, numeric, bigserial } from 'drizzle-orm/pg-core';

export const platformSchema = pgSchema('platform');
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'string' });

export const platformUsers = platformSchema.table('platform_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  name: text('name').notNull(),
  role: text('role').notNull(),
  passwordHash: text('password_hash').notNull(),
  totpSecret: text('totp_secret'),
  totpEnabled: boolean('totp_enabled').notNull().default(false),
  ipAllowlist: text('ip_allowlist').array().notNull().default([]),
  status: text('status').notNull().default('active'),
  lastLoginAt: ts('last_login_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const resellers = platformSchema.table('resellers', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  contactEmail: text('contact_email'),
  brand: jsonb('brand').notNull().default({}),
  marginPct: numeric('margin_pct').notNull().default('0'),
  status: text('status').notNull().default('active'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const companyGroups = platformSchema.table('company_groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const tenants = platformSchema.table('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull(),
  name: text('name').notNull(),
  legalName: text('legal_name'),
  country: text('country').notNull().default('IN'),
  timezone: text('timezone').notNull().default('Asia/Kolkata'),
  currency: text('currency').notNull().default('INR'),
  locale: text('locale').notNull().default('en-IN'),
  planKey: text('plan_key').notNull().default('trial'),
  status: text('status').notNull().default('trial'),
  trialEndsAt: ts('trial_ends_at'),
  pastDueSince: ts('past_due_since'),
  suspendedAt: ts('suspended_at'),
  suspendedReason: text('suspended_reason'),
  deletedAt: ts('deleted_at'),
  purgeAfter: ts('purge_after'),
  supportAccessEnabled: boolean('support_access_enabled').notNull().default(false),
  isDemo: boolean('is_demo').notNull().default(false),
  resellerId: uuid('reseller_id'),
  groupId: uuid('group_id'),
  ownerMembershipId: uuid('owner_membership_id'),
  seatLimit: integer('seat_limit').notNull().default(10),
  featureFlags: jsonb('feature_flags').notNull().default({}),
  internalNotes: text('internal_notes'),
  createdBy: uuid('created_by'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const tenantUsage = platformSchema.table('tenant_usage', {
  tenantId: uuid('tenant_id').primaryKey(),
  employeesActive: integer('employees_active').notNull().default(0),
  usersActive: integer('users_active').notNull().default(0),
  lastActivityAt: ts('last_activity_at'),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const users = platformSchema.table('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email'),
  mobile: text('mobile'),
  name: text('name').notNull(),
  passwordHash: text('password_hash'),
  locale: text('locale').notNull().default('en-IN'),
  status: text('status').notNull().default('active'),
  emailVerifiedAt: ts('email_verified_at'),
  mobileVerifiedAt: ts('mobile_verified_at'),
  lastLoginAt: ts('last_login_at'),
  failedLogins: integer('failed_logins').notNull().default(0),
  lockedUntil: ts('locked_until'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const userIdentities = platformSchema.table('user_identities', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  provider: text('provider').notNull(),
  subject: text('subject').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const memberships = platformSchema.table('memberships', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  tenantId: uuid('tenant_id').notNull(),
  roleKeys: text('role_keys').array().notNull().default([]),
  status: text('status').notNull().default('active'),
  employeeId: uuid('employee_id'),
  isOwner: boolean('is_owner').notNull().default(false),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const invitations = platformSchema.table('invitations', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  email: text('email'),
  mobile: text('mobile'),
  name: text('name'),
  roleKeys: text('role_keys').array().notNull().default([]),
  employeeId: uuid('employee_id'),
  tokenHash: text('token_hash').notNull(),
  status: text('status').notNull().default('pending'),
  invitedBy: uuid('invited_by'),
  expiresAt: ts('expires_at').notNull(),
  acceptedAt: ts('accepted_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const ownershipTransfers = platformSchema.table('ownership_transfers', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  fromMembershipId: uuid('from_membership_id').notNull(),
  toMembershipId: uuid('to_membership_id').notNull(),
  status: text('status').notNull().default('pending'),
  expiresAt: ts('expires_at').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
  resolvedAt: ts('resolved_at'),
});

export const supportSessions = platformSchema.table('support_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  staffId: uuid('staff_id').notNull(),
  reason: text('reason').notNull(),
  startedAt: ts('started_at').notNull().defaultNow(),
  expiresAt: ts('expires_at').notNull(),
  endedAt: ts('ended_at'),
  endedReason: text('ended_reason'),
});

export const refreshTokens = platformSchema.table('refresh_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  realm: text('realm').notNull(),
  userId: uuid('user_id'),
  tenantId: uuid('tenant_id'),
  membershipId: uuid('membership_id'),
  familyId: uuid('family_id').notNull(),
  tokenHash: text('token_hash').notNull(),
  expiresAt: ts('expires_at').notNull(),
  usedAt: ts('used_at'),
  revokedAt: ts('revoked_at'),
  deviceId: text('device_id'),
  userAgent: text('user_agent'),
  ip: text('ip'),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const otpChallenges = platformSchema.table('otp_challenges', {
  id: uuid('id').primaryKey().defaultRandom(),
  identifier: text('identifier').notNull(),
  purpose: text('purpose').notNull().default('login'),
  codeHash: text('code_hash').notNull(),
  expiresAt: ts('expires_at').notNull(),
  attempts: integer('attempts').notNull().default(0),
  consumedAt: ts('consumed_at'),
  ip: text('ip'),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const platformAuditLog = platformSchema.table('platform_audit_log', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  at: ts('at').notNull().defaultNow(),
  actorId: uuid('actor_id'),
  actorType: text('actor_type').notNull(),
  tenantId: uuid('tenant_id'),
  action: text('action').notNull(),
  entity: text('entity'),
  entityId: text('entity_id'),
  details: jsonb('details').notNull().default({}),
  ip: text('ip'),
  requestId: text('request_id'),
});
