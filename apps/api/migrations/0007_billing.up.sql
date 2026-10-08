-- Plans, invoices and payments. Prices are data so finance can change them without a release.
create table platform.plans (
  key text primary key,
  name text not null,
  prices jsonb not null default '{}',
  active boolean not null default true,
  sort integer not null default 0,
  updated_at timestamptz not null default now()
);
insert into platform.plans (key, name, prices, sort) values
  ('trial', 'Trial', '{"INR":0,"USD":0}', 0),
  ('office', 'Office', '{"INR":9900,"USD":200}', 1),
  ('field', 'Field', '{"INR":14900,"USD":300}', 2),
  ('all_in_one', 'All in one', '{"INR":19900,"USD":400}', 3);

create table platform.invoice_counters (
  year integer primary key,
  last integer not null default 0
);

create table platform.invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  number text not null unique,
  period_start date not null,
  period_end date not null,
  status text not null default 'open' check (status in ('open','paid','void')),
  currency text not null,
  plan_key text not null,
  seats integer not null check (seats > 0),
  lines jsonb not null,
  subtotal_minor bigint not null check (subtotal_minor >= 0),
  tax_rate_bps integer not null default 0,
  tax_minor bigint not null default 0,
  total_minor bigint not null check (total_minor >= 0),
  issued_at timestamptz not null default now(),
  due_at timestamptz not null,
  paid_at timestamptz,
  void_reason text,
  provider text,
  provider_ref text,
  checkout_url text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end >= period_start)
);
create unique index invoices_one_per_period on platform.invoices (tenant_id, period_start) where status <> 'void';
create index invoices_tenant on platform.invoices (tenant_id, issued_at desc);
create index invoices_open_due on platform.invoices (due_at) where status = 'open';
create unique index invoices_provider_ref on platform.invoices (provider, provider_ref) where provider_ref is not null;

create table platform.payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  invoice_id uuid not null references platform.invoices(id) on delete cascade,
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null,
  method text not null,
  reference text,
  provider_event_id text unique,
  received_at timestamptz not null default now(),
  recorded_by uuid
);
create index payments_invoice on platform.payments (invoice_id);

-- A company reads only its own invoices; only the platform role writes them.
alter table platform.invoices enable row level security;
alter table platform.invoices force row level security;
create policy company_read on platform.invoices for select to trackrex_app using (tenant_id = app_tenant_id());
create policy company_checkout on platform.invoices for update to trackrex_app using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
create policy platform_all on platform.invoices to trackrex_platform using (true) with check (true);
create policy worker_all on platform.invoices to trackrex_worker using (true) with check (true);
alter table platform.payments enable row level security;
alter table platform.payments force row level security;
create policy company_read on platform.payments for select to trackrex_app using (tenant_id = app_tenant_id());
create policy platform_all on platform.payments to trackrex_platform using (true) with check (true);
create policy worker_all on platform.payments to trackrex_worker using (true) with check (true);

grant select on platform.plans to trackrex_app;
grant select, insert, update, delete on platform.plans to trackrex_platform, trackrex_worker;
grant select on platform.invoices, platform.payments to trackrex_app;
grant update (provider, provider_ref, checkout_url, updated_at) on platform.invoices to trackrex_app;
grant select, insert, update, delete on platform.invoices, platform.payments, platform.invoice_counters to trackrex_platform, trackrex_worker;
