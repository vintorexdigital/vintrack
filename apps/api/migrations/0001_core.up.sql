-- Extensions, roles, schemas, helper functions, platform tables and tenant core tables.
create extension if not exists pgcrypto;
create extension if not exists pg_trgm;
create extension if not exists btree_gist;
create extension if not exists citext;

do $$
begin
  if not exists (select from pg_roles where rolname = 'trackrex_app') then
    create role trackrex_app login password 'trackrex_app' nosuperuser nobypassrls;
  end if;
  if not exists (select from pg_roles where rolname = 'trackrex_platform') then
    create role trackrex_platform login password 'trackrex_platform' nosuperuser nobypassrls;
  end if;
  if not exists (select from pg_roles where rolname = 'trackrex_worker') then
    create role trackrex_worker login password 'trackrex_worker' nosuperuser bypassrls;
  end if;
end $$;

create schema if not exists platform;
grant usage on schema public to trackrex_app, trackrex_platform, trackrex_worker;
grant usage on schema platform to trackrex_app, trackrex_platform, trackrex_worker;

-- Session context set by the API at the start of every transaction (set_config(..., true)).
create function app_tenant_id() returns uuid language sql stable as
  $$ select nullif(current_setting('app.tenant_id', true), '')::uuid $$;
create function app_user_id() returns uuid language sql stable as
  $$ select nullif(current_setting('app.user_id', true), '')::uuid $$;
create function app_employee_id() returns uuid language sql stable as
  $$ select nullif(current_setting('app.employee_id', true), '')::uuid $$;

------------------------------------------------------------------------------------------------
-- Platform schema (outside tenant RLS)
------------------------------------------------------------------------------------------------
create table platform.platform_users (
  id uuid primary key default gen_random_uuid(),
  email citext not null unique,
  name text not null,
  role text not null check (role in ('super_admin','support','finance','onboarding','analyst')),
  password_hash text not null,
  totp_secret text,
  totp_enabled boolean not null default false,
  ip_allowlist text[] not null default '{}',
  status text not null default 'active' check (status in ('active','suspended')),
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table platform.resellers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug citext not null unique,
  contact_email citext,
  brand jsonb not null default '{}',
  margin_pct numeric(5,2) not null default 0,
  status text not null default 'active' check (status in ('active','suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table platform.company_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table platform.tenants (
  id uuid primary key default gen_random_uuid(),
  slug citext not null unique check (slug ~ '^[a-z0-9](?:[a-z0-9-]*[a-z0-9])$'),
  name text not null,
  legal_name text,
  country text not null default 'IN',
  timezone text not null default 'Asia/Kolkata',
  currency text not null default 'INR',
  locale text not null default 'en-IN',
  plan_key text not null default 'trial',
  status text not null default 'trial'
    check (status in ('trial','active','past_due','suspended','cancelled','deleted')),
  trial_ends_at timestamptz,
  past_due_since timestamptz,
  suspended_at timestamptz,
  suspended_reason text,
  deleted_at timestamptz,
  purge_after timestamptz,
  support_access_enabled boolean not null default false,
  is_demo boolean not null default false,
  reseller_id uuid references platform.resellers(id),
  group_id uuid references platform.company_groups(id),
  owner_membership_id uuid,
  seat_limit integer not null default 10,
  feature_flags jsonb not null default '{}',
  internal_notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on platform.tenants (status);
create index on platform.tenants (reseller_id);
create index on platform.tenants (group_id);

create table platform.tenant_domains (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  domain citext not null unique,
  verified boolean not null default false,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

create table platform.tenant_usage (
  tenant_id uuid primary key references platform.tenants(id) on delete cascade,
  employees_active integer not null default 0,
  users_active integer not null default 0,
  last_activity_at timestamptz,
  updated_at timestamptz not null default now()
);

create table platform.users (
  id uuid primary key default gen_random_uuid(),
  email citext unique,
  mobile text unique check (mobile is null or mobile ~ '^\+[1-9][0-9]{6,14}$'),
  name text not null,
  password_hash text,
  locale text not null default 'en-IN',
  status text not null default 'active' check (status in ('active','suspended')),
  email_verified_at timestamptz,
  mobile_verified_at timestamptz,
  last_login_at timestamptz,
  failed_logins integer not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (email is not null or mobile is not null)
);

create table platform.user_identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references platform.users(id) on delete cascade,
  provider text not null check (provider in ('google','microsoft','saml','oidc')),
  subject text not null,
  created_at timestamptz not null default now(),
  unique (provider, subject)
);

create table platform.memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references platform.users(id) on delete cascade,
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  role_keys text[] not null default '{}',
  status text not null default 'active' check (status in ('invited','active','suspended','removed')),
  employee_id uuid,
  is_owner boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, tenant_id)
);
create unique index memberships_one_owner on platform.memberships (tenant_id) where is_owner and status = 'active';
create index on platform.memberships (tenant_id, status);
create index on platform.memberships (employee_id) where employee_id is not null;
alter table platform.tenants
  add constraint tenants_owner_fk foreign key (owner_membership_id) references platform.memberships(id) deferrable initially deferred;

create table platform.company_group_members (
  group_id uuid not null references platform.company_groups(id) on delete cascade,
  user_id uuid not null references platform.users(id) on delete cascade,
  role text not null default 'group_viewer' check (role in ('group_admin','group_viewer')),
  primary key (group_id, user_id)
);

create table platform.invitations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  email citext,
  mobile text,
  name text,
  role_keys text[] not null default '{}',
  employee_id uuid,
  token_hash text not null unique,
  status text not null default 'pending' check (status in ('pending','accepted','revoked','expired')),
  invited_by uuid,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  check (email is not null or mobile is not null)
);
create index on platform.invitations (tenant_id, status);

create table platform.ownership_transfers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  from_membership_id uuid not null references platform.memberships(id),
  to_membership_id uuid not null references platform.memberships(id),
  status text not null default 'pending' check (status in ('pending','accepted','declined','cancelled')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table platform.support_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  staff_id uuid not null references platform.platform_users(id),
  reason text not null check (length(reason) >= 10),
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ended_at timestamptz,
  ended_reason text
);
create index on platform.support_sessions (tenant_id, started_at desc);

create table platform.refresh_tokens (
  id uuid primary key default gen_random_uuid(),
  realm text not null check (realm in ('company','platform')),
  user_id uuid,
  tenant_id uuid,
  membership_id uuid,
  family_id uuid not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz,
  device_id text,
  user_agent text,
  ip text,
  created_at timestamptz not null default now()
);
create index on platform.refresh_tokens (family_id);
create index on platform.refresh_tokens (user_id);

create table platform.otp_challenges (
  id uuid primary key default gen_random_uuid(),
  identifier text not null,
  purpose text not null default 'login',
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0,
  consumed_at timestamptz,
  ip text,
  created_at timestamptz not null default now()
);
create index on platform.otp_challenges (identifier, created_at desc);

create table platform.platform_audit_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  actor_id uuid,
  actor_type text not null check (actor_type in ('platform_user','system','user')),
  tenant_id uuid,
  action text not null,
  entity text,
  entity_id text,
  details jsonb not null default '{}',
  ip text,
  request_id text
);
create index on platform.platform_audit_log (tenant_id, at desc);
create index on platform.platform_audit_log (at desc);

-- Tenant-facing roles read platform tables needed for sign-in; platform role never touches tenant data.
grant select, insert, update on all tables in schema platform to trackrex_app;
grant delete on platform.refresh_tokens, platform.otp_challenges, platform.invitations to trackrex_app;
grant select, insert, update, delete on all tables in schema platform to trackrex_platform;
grant usage, select on all sequences in schema platform to trackrex_app, trackrex_platform, trackrex_worker;
grant select, insert, update, delete on all tables in schema platform to trackrex_worker;

------------------------------------------------------------------------------------------------
-- Tenant core tables (public, RLS)
------------------------------------------------------------------------------------------------
create table roles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  key text not null,
  name text not null,
  description text,
  grants jsonb not null default '[]',
  is_system boolean not null default false,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  deleted_at timestamptz, deleted_by uuid, delete_reason text,
  version integer not null default 1,
  unique (tenant_id, id),
  unique (tenant_id, key)
);

create table sequences (
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  key text not null,
  prefix text not null,
  next_value bigint not null default 1,
  padding integer not null default 4,
  primary key (tenant_id, key)
);

create table settings (
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  scope_type text not null default 'tenant' check (scope_type in ('tenant','shift','team','employee')),
  scope_id uuid,
  key text not null,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create unique index settings_unique on settings (tenant_id, scope_type, coalesce(scope_id, '00000000-0000-0000-0000-000000000000'::uuid), key);

create table idempotency_keys (
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  key text not null,
  method text not null,
  path text not null,
  request_hash text not null,
  status_code integer,
  response jsonb,
  created_at timestamptz not null default now(),
  primary key (tenant_id, key)
);

create table outbox (
  id bigserial primary key,
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}',
  actor_user_id uuid,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  attempts integer not null default 0,
  last_error text
);
create index outbox_pending on outbox (id) where processed_at is null;

create table audit_log (
  id uuid not null default gen_random_uuid(),
  at timestamptz not null default now(),
  tenant_id uuid not null,
  actor_user_id uuid,
  actor_membership_id uuid,
  impersonator_id uuid,
  source text not null default 'api' check (source in ('web','mobile','desktop','api','system')),
  ip text,
  user_agent text,
  entity text not null,
  entity_id text,
  action text not null,
  changes jsonb not null default '{}',
  request_id text,
  primary key (id, at)
) partition by range (at);
create index audit_log_entity on audit_log (tenant_id, entity, entity_id, at desc);
create index audit_log_actor on audit_log (tenant_id, actor_user_id, at desc);
create index audit_log_at_brin on audit_log using brin (at);

create table audit_log_default partition of audit_log default;

create function ensure_audit_partitions(months_back int, months_ahead int) returns void
language plpgsql as $$
declare
  m date;
  p text;
begin
  for i in -months_back..months_ahead loop
    m := (date_trunc('month', now()) + make_interval(months => i))::date;
    p := 'audit_log_' || to_char(m, 'YYYYMM');
    if to_regclass('public.' || p) is null then
      execute format('create table %I partition of audit_log for values from (%L) to (%L)',
        p, m, (m + interval '1 month')::date);
      execute format('grant select, insert on %I to trackrex_app, trackrex_worker', p);
    end if;
  end loop;
end $$;
select ensure_audit_partitions(1, 3);

do $$
declare t text;
begin
  foreach t in array array['roles','sequences','settings','idempotency_keys','outbox','audit_log','audit_log_default'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('create policy tenant_isolation on %I using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id())', t);
  end loop;
end $$;

grant select, insert, update, delete on roles, sequences, settings, idempotency_keys to trackrex_app;
grant select, insert, update on outbox to trackrex_app;
grant select, insert on audit_log, audit_log_default to trackrex_app;
grant usage, select on all sequences in schema public to trackrex_app, trackrex_worker;
grant select, insert, update, delete on roles, sequences, settings, idempotency_keys, outbox to trackrex_worker;
grant select, insert on audit_log, audit_log_default to trackrex_worker;
