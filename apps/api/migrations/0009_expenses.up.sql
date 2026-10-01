-- Expense categories and claims.

create table expense_categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  name text not null,
  max_amount double precision,
  note_required boolean default false,
  status text default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  delete_reason text,
  version integer not null default 1,
  unique (tenant_id, id)
);
create index expense_categories_tenant_live on expense_categories (tenant_id) where deleted_at is null;
create unique index expense_categories_name_uq on expense_categories (tenant_id, lower(name)) where deleted_at is null and name is not null;
create index expense_categories_name_trgm on expense_categories using gin (lower(name) gin_trgm_ops);
create index expense_categories_status_sort on expense_categories (tenant_id, status, id);
alter table expense_categories enable row level security;
alter table expense_categories force row level security;
create policy tenant_isolation on expense_categories using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
grant select, insert, update, delete on expense_categories to trackrex_app, trackrex_worker;

create table expenses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  code text,
  employee_id uuid not null,
  category_id uuid not null,
  expense_date date not null,
  amount double precision not null,
  currency text,
  merchant text,
  description text,
  customer_id uuid,
  status text default 'pending' check (status in ('pending', 'approved', 'rejected', 'paid', 'cancelled')),
  approved_amount double precision,
  action_by uuid,
  action_at timestamptz,
  action_comment text,
  paid_at timestamptz,
  payment_reference text,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  delete_reason text,
  version integer not null default 1,
  unique (tenant_id, id)
);
create index expenses_tenant_live on expenses (tenant_id) where deleted_at is null;
create unique index expenses_code_uq on expenses (tenant_id, code) where code is not null;
create index expenses_employee_id_ref on expenses (tenant_id, employee_id) where employee_id is not null;
create index expenses_category_id_ref on expenses (tenant_id, category_id) where category_id is not null;
create index expenses_expense_date_sort on expenses (tenant_id, expense_date, id);
create index expenses_amount_sort on expenses (tenant_id, amount, id);
create index expenses_merchant_trgm on expenses using gin (lower(merchant) gin_trgm_ops);
create index expenses_description_trgm on expenses using gin (lower(description) gin_trgm_ops);
create index expenses_customer_id_ref on expenses (tenant_id, customer_id) where customer_id is not null;
create index expenses_status_sort on expenses (tenant_id, status, id);
alter table expenses enable row level security;
alter table expenses force row level security;
create policy tenant_isolation on expenses using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
grant select, insert, update, delete on expenses to trackrex_app, trackrex_worker;



alter table expenses add constraint expenses_employee_id_fk foreign key (tenant_id, employee_id) references employees (tenant_id, id) deferrable initially deferred;
alter table expenses add constraint expenses_category_id_fk foreign key (tenant_id, category_id) references expense_categories (tenant_id, id) deferrable initially deferred;
alter table expenses add constraint expenses_customer_id_fk foreign key (tenant_id, customer_id) references customers (tenant_id, id) deferrable initially deferred;
alter table expenses add constraint expenses_action_by_fk foreign key (tenant_id, action_by) references employees (tenant_id, id) deferrable initially deferred;
