-- =============================================================================
-- PAYEW · Phase 7 · Finance
--
-- * finance_plans / finance_plan_rows   WFP, PPMP, APP sheets (Excel-like grid)
-- * allotments                          SARO / sub-allotments, realignments
-- * obligations (ORS)                   many per package or activity
-- * package_deliveries (+ items)        partial deliveries, inspection/acceptance
-- * disbursements (DV)                  many per package, each paying one or
--   + disbursement_obligations          more ORS (staged/partial payments)
-- * savings_entries                     procurement savings (ABC − contract),
--                                       suggested automatically, confirmed by admins
--
-- Writes go through RPCs that apply Settings → "validation_strictness":
-- "block" raises; "warn" saves the record with its warnings in `flags`.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Plans (WFP / PPMP / APP)
-- ---------------------------------------------------------------------------
create table public.finance_plans (
  id              uuid primary key default gen_random_uuid(),
  program_id      uuid not null references public.programs (id) on delete cascade,
  fiscal_year_id  uuid not null references public.fiscal_years (id) on delete restrict,
  plan_type       text not null check (plan_type in ('WFP', 'PPMP', 'APP')),
  status          text not null default 'draft' check (status in ('draft', 'submitted', 'approved')),
  submitted_at    timestamptz,
  submitted_by    uuid references auth.users (id) on delete set null,
  approved_at     timestamptz,
  approved_by     uuid references auth.users (id) on delete set null,
  remarks         text check (remarks is null or length(remarks) <= 2000),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid default auth.uid() references auth.users (id) on delete set null,
  unique (program_id, fiscal_year_id, plan_type)
);

create table public.finance_plan_rows (
  id                   uuid primary key default gen_random_uuid(),
  plan_id              uuid not null references public.finance_plans (id) on delete cascade,
  program_id           uuid not null references public.programs (id) on delete cascade,
  fiscal_year_id       uuid not null references public.fiscal_years (id) on delete restrict,
  sort_order           integer not null default 0,
  activity_id          uuid references public.activities (id) on delete set null,
  package_id           uuid references public.procurement_packages (id) on delete set null,
  description          text not null check (length(trim(description)) between 1 and 500),
  expense_class_id     uuid references public.expense_classes (id) on delete set null,
  uacs_code_id         uuid references public.uacs_codes (id) on delete set null,
  fund_source_id       uuid references public.fund_sources (id) on delete set null,
  procurement_mode_id  uuid references public.procurement_modes (id) on delete set null,
  unit_id              uuid references public.units (id) on delete set null,
  quantity             numeric(14, 2) check (quantity is null or quantity >= 0),
  unit_cost            numeric(16, 2) check (unit_cost is null or unit_cost >= 0),
  amount               numeric(16, 2) not null default 0 check (amount >= 0),
  m01 numeric(16, 2) not null default 0, m02 numeric(16, 2) not null default 0,
  m03 numeric(16, 2) not null default 0, m04 numeric(16, 2) not null default 0,
  m05 numeric(16, 2) not null default 0, m06 numeric(16, 2) not null default 0,
  m07 numeric(16, 2) not null default 0, m08 numeric(16, 2) not null default 0,
  m09 numeric(16, 2) not null default 0, m10 numeric(16, 2) not null default 0,
  m11 numeric(16, 2) not null default 0, m12 numeric(16, 2) not null default 0,
  remarks              text check (remarks is null or length(remarks) <= 1000),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check (least(m01, m02, m03, m04, m05, m06, m07, m08, m09, m10, m11, m12) >= 0)
);
create index finance_plan_rows_plan_idx on public.finance_plan_rows (plan_id, sort_order);
create index finance_plan_rows_activity_idx on public.finance_plan_rows (activity_id);
create index finance_plan_rows_package_idx on public.finance_plan_rows (package_id);

create trigger set_updated_at before update on public.finance_plans
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.finance_plan_rows
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Allotments
-- ---------------------------------------------------------------------------
create table public.allotments (
  id                uuid primary key default gen_random_uuid(),
  program_id        uuid not null references public.programs (id) on delete cascade,
  fiscal_year_id    uuid not null references public.fiscal_years (id) on delete restrict,
  kind              text not null default 'sub_allotment'
                    check (kind in ('saro', 'sub_allotment', 'realignment', 'reversion')),
  allotment_no      text check (allotment_no is null or length(allotment_no) <= 60),
  allotment_date    date not null,
  fund_source_id    uuid references public.fund_sources (id) on delete set null,
  expense_class_id  uuid not null references public.expense_classes (id) on delete restrict,
  uacs_code_id      uuid references public.uacs_codes (id) on delete set null,
  amount            numeric(16, 2) not null check (amount <> 0),
  remarks           text check (remarks is null or length(remarks) <= 1000),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at        timestamptz,
  check (amount > 0 or kind in ('realignment', 'reversion')),
  check (kind <> 'reversion' or amount < 0)
);
create index allotments_program_idx on public.allotments (program_id, fiscal_year_id, expense_class_id);
create trigger set_updated_at before update on public.allotments
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Deliveries
-- ---------------------------------------------------------------------------
create table public.package_deliveries (
  id                uuid primary key default gen_random_uuid(),
  package_id        uuid not null references public.procurement_packages (id) on delete cascade,
  activity_id       uuid not null references public.activities (id) on delete cascade,
  program_id        uuid not null references public.programs (id) on delete cascade,
  fiscal_year_id    uuid not null references public.fiscal_years (id) on delete restrict,
  delivery_no       integer not null,
  status            text not null default 'scheduled'
                    check (status in ('scheduled', 'delivered', 'partial', 'accepted', 'rejected')),
  scheduled_date    date,
  delivery_date     date,
  accepted_date     date,
  dr_no             text check (dr_no is null or length(dr_no) <= 60),
  iar_no            text check (iar_no is null or length(iar_no) <= 60),
  amount            numeric(16, 2) not null default 0 check (amount >= 0),
  remarks           text check (remarks is null or length(remarks) <= 1000),
  exception_remark  text check (exception_remark is null or length(exception_remark) <= 1000),
  flags             text[] not null default '{}',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid default auth.uid() references auth.users (id) on delete set null,
  unique (package_id, delivery_no),
  check (status = 'scheduled' or delivery_date is not null),
  check (status <> 'accepted' or accepted_date is not null),
  check (accepted_date is null or delivery_date is null or accepted_date >= delivery_date)
);
create index package_deliveries_package_idx on public.package_deliveries (package_id);
create index package_deliveries_dates_idx on public.package_deliveries (scheduled_date, status);

create table public.package_delivery_items (
  id           uuid primary key default gen_random_uuid(),
  delivery_id  uuid not null references public.package_deliveries (id) on delete cascade,
  sort_order   integer not null default 0,
  description  text not null check (length(trim(description)) between 1 and 250),
  quantity     numeric(14, 2) not null check (quantity >= 0),
  unit_id      uuid references public.units (id) on delete set null,
  unit_cost    numeric(16, 2) not null default 0 check (unit_cost >= 0),
  amount       numeric(16, 2) generated always as (round(quantity * unit_cost, 2)) stored
);
create index package_delivery_items_delivery_idx on public.package_delivery_items (delivery_id);

create trigger set_updated_at before update on public.package_deliveries
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Obligations (ORS)
-- ---------------------------------------------------------------------------
create table public.obligations (
  id                 uuid primary key default gen_random_uuid(),
  program_id         uuid not null references public.programs (id) on delete cascade,
  fiscal_year_id     uuid not null references public.fiscal_years (id) on delete restrict,
  activity_id        uuid not null references public.activities (id) on delete cascade,
  package_id         uuid references public.procurement_packages (id) on delete cascade,
  delivery_id        uuid references public.package_deliveries (id) on delete set null,
  ors_no             text not null check (length(trim(ors_no)) between 1 and 60),
  ors_date           date not null,
  amount             numeric(16, 2) not null check (amount > 0),
  fund_source_id     uuid references public.fund_sources (id) on delete set null,
  expense_class_id   uuid references public.expense_classes (id) on delete set null,
  uacs_code_id       uuid references public.uacs_codes (id) on delete set null,
  payee_supplier_id  uuid references public.suppliers (id) on delete set null,
  payee_name         text check (payee_name is null or length(payee_name) <= 200),
  particulars        text check (particulars is null or length(particulars) <= 1000),
  status             text not null default 'active' check (status in ('active', 'cancelled')),
  cancelled_reason   text,
  flags              text[] not null default '{}',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid default auth.uid() references auth.users (id) on delete set null
);
create unique index obligations_ors_no_idx on public.obligations (fiscal_year_id, lower(ors_no)) where status = 'active';
create index obligations_activity_idx on public.obligations (activity_id);
create index obligations_package_idx on public.obligations (package_id);
create index obligations_program_idx on public.obligations (program_id, fiscal_year_id, expense_class_id);
create trigger set_updated_at before update on public.obligations
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Disbursements (DV)
-- ---------------------------------------------------------------------------
create table public.disbursements (
  id                 uuid primary key default gen_random_uuid(),
  program_id         uuid not null references public.programs (id) on delete cascade,
  fiscal_year_id     uuid not null references public.fiscal_years (id) on delete restrict,
  activity_id        uuid not null references public.activities (id) on delete cascade,
  package_id         uuid references public.procurement_packages (id) on delete cascade,
  dv_no              text not null check (length(trim(dv_no)) between 1 and 60),
  dv_date            date not null,
  gross_amount       numeric(16, 2) not null check (gross_amount > 0),
  tax_withheld       numeric(16, 2) not null default 0 check (tax_withheld >= 0),
  other_deductions   numeric(16, 2) not null default 0 check (other_deductions >= 0),
  net_amount         numeric(16, 2) generated always as (gross_amount - tax_withheld - other_deductions) stored,
  payee_supplier_id  uuid references public.suppliers (id) on delete set null,
  payee_name         text check (payee_name is null or length(payee_name) <= 200),
  check_ada_no       text check (check_ada_no is null or length(check_ada_no) <= 60),
  particulars        text check (particulars is null or length(particulars) <= 1000),
  status             text not null default 'active' check (status in ('active', 'cancelled')),
  cancelled_reason   text,
  flags              text[] not null default '{}',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid default auth.uid() references auth.users (id) on delete set null,
  check (tax_withheld + other_deductions <= gross_amount)
);
create unique index disbursements_dv_no_idx on public.disbursements (fiscal_year_id, lower(dv_no)) where status = 'active';
create index disbursements_activity_idx on public.disbursements (activity_id);
create index disbursements_package_idx on public.disbursements (package_id);
create trigger set_updated_at before update on public.disbursements
  for each row execute function public.set_updated_at();

create table public.disbursement_obligations (
  disbursement_id  uuid not null references public.disbursements (id) on delete cascade,
  obligation_id    uuid not null references public.obligations (id) on delete restrict,
  program_id       uuid not null references public.programs (id) on delete cascade,
  amount           numeric(16, 2) not null check (amount > 0),
  primary key (disbursement_id, obligation_id)
);
create index disbursement_obligations_obligation_idx on public.disbursement_obligations (obligation_id);

-- ---------------------------------------------------------------------------
-- Savings
-- ---------------------------------------------------------------------------
create table public.savings_entries (
  id              uuid primary key default gen_random_uuid(),
  program_id      uuid not null references public.programs (id) on delete cascade,
  fiscal_year_id  uuid not null references public.fiscal_years (id) on delete restrict,
  activity_id     uuid not null references public.activities (id) on delete cascade,
  package_id      uuid references public.procurement_packages (id) on delete cascade,
  source          text not null check (source in ('procurement', 'unutilized', 'realignment')),
  amount          numeric(16, 2) not null check (amount > 0),
  status          text not null default 'suggested' check (status in ('suggested', 'confirmed', 'dismissed')),
  decided_by      uuid references auth.users (id) on delete set null,
  decided_at      timestamptz,
  remarks         text check (remarks is null or length(remarks) <= 1000),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index savings_entries_package_idx on public.savings_entries (package_id) where source = 'procurement';
create index savings_entries_program_idx on public.savings_entries (program_id, fiscal_year_id, status);
create trigger set_updated_at before update on public.savings_entries
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Validation helpers
-- ---------------------------------------------------------------------------
-- Collected problems: [] → ok; in "block" mode they raise, in "warn" mode they become flags.
create or replace function public.finance_enforce(p_problems text[])
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(cardinality(p_problems), 0) > 0 and public.validation_blocks() then
    raise exception '%', array_to_string(p_problems, ' ') using errcode = '23514';
  end if;
  return coalesce(p_problems, '{}');
end;
$$;

create or replace function public.peso(p numeric)
returns text
language sql
immutable
set search_path = ''
as $$
  select '₱' || to_char(coalesce(p, 0), 'FM999,999,999,990.00')
$$;

-- Obligations vs allotments for a program/FY/expense class (active rows only).
create or replace function public.allotment_balance(p_program_id uuid, p_fiscal_year_id uuid, p_expense_class_id uuid)
returns table (allotted numeric, obligated numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce((select sum(a.amount) from public.allotments a
              where a.program_id = p_program_id and a.fiscal_year_id = p_fiscal_year_id
                and a.expense_class_id = p_expense_class_id and a.deleted_at is null), 0),
    coalesce((select sum(o.amount) from public.obligations o
              where o.program_id = p_program_id and o.fiscal_year_id = p_fiscal_year_id
                and o.expense_class_id = p_expense_class_id and o.status = 'active'), 0)
$$;

-- ---------------------------------------------------------------------------
-- Obligations RPC
-- ---------------------------------------------------------------------------
-- p: {id?, activity_id, package_id?, delivery_id?, ors_no, ors_date, amount, fund_source_id?,
--     expense_class_id?, uacs_code_id?, payee_supplier_id?, payee_name?, particulars?}
create or replace function public.save_obligation(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id      uuid := nullif(p ->> 'id', '')::uuid;
  v_old     public.obligations;
  v_act     public.activities;
  v_pkg     public.procurement_packages;
  v_amount  numeric := (p ->> 'amount')::numeric;
  v_date    date := (p ->> 'ors_date')::date;
  v_ec      uuid;
  v_cap     numeric;
  v_total   numeric;
  v_bal     record;
  v_problems text[] := '{}';
  v_flags   text[];
begin
  if v_id is not null then
    select * into v_old from public.obligations where id = v_id for update;
    if not found or v_old.status <> 'active' then
      raise exception 'ORS not found or cancelled' using errcode = 'P0002';
    end if;
  end if;
  select * into v_act from public.activities
  where id = coalesce((p ->> 'activity_id')::uuid, v_old.activity_id) and deleted_at is null for update;
  if v_act.id is null or not public.can_write_program(v_act.program_id) then
    raise exception 'You are not allowed to record obligations for this activity' using errcode = '42501';
  end if;
  perform public.assert_fiscal_year_writable(v_act.fiscal_year_id, v_act.program_id);
  if v_act.status = 'cancelled' then
    raise exception 'This activity is cancelled' using errcode = '42501';
  end if;
  if nullif(p ->> 'package_id', '') is not null then
    select * into v_pkg from public.procurement_packages
    where id = (p ->> 'package_id')::uuid and activity_id = v_act.id and deleted_at is null for update;
    if v_pkg.id is null then
      raise exception 'That package is not part of this activity' using errcode = '22023';
    end if;
    if v_pkg.status = 'cancelled' then
      raise exception 'This package is cancelled' using errcode = '22023';
    end if;
  end if;
  if v_amount is null or v_amount <= 0 then
    raise exception 'Enter the ORS amount' using errcode = '22023';
  end if;
  if v_date is null or v_date > public.today_ph() then
    raise exception 'The ORS date is required and cannot be in the future' using errcode = '22023';
  end if;
  if nullif(trim(coalesce(p ->> 'ors_no', '')), '') is null then
    raise exception 'Enter the ORS number' using errcode = '22023';
  end if;
  if nullif(p ->> 'delivery_id', '') is not null and not exists (
    select 1 from public.package_deliveries d where d.id = (p ->> 'delivery_id')::uuid and d.package_id = v_pkg.id) then
    raise exception 'That delivery belongs to another package' using errcode = '22023';
  end if;

  v_ec := coalesce(nullif(p ->> 'expense_class_id', '')::uuid, v_pkg.expense_class_id);

  -- Package: total ORS ≤ contract (or ABC before award)
  if v_pkg.id is not null then
    v_cap := coalesce(v_pkg.contract_amount, v_pkg.abc_amount);
    select coalesce(sum(amount), 0) + v_amount into v_total from public.obligations
    where package_id = v_pkg.id and status = 'active' and id is distinct from v_id;
    if v_total > v_cap then
      v_problems := v_problems || format('Obligations for %s (%s) exceed the %s (%s).', v_pkg.code,
        public.peso(v_total), case when v_pkg.contract_amount is null then 'ABC' else 'contract amount' end,
        public.peso(v_cap));
    end if;
  end if;
  -- Activity: total ORS ≤ budget
  if v_act.budget_amount is not null then
    select coalesce(sum(amount), 0) + v_amount into v_total from public.obligations
    where activity_id = v_act.id and status = 'active' and id is distinct from v_id;
    if v_total > v_act.budget_amount then
      v_problems := v_problems || format('Obligations for %s (%s) exceed its budget (%s).', v_act.code,
        public.peso(v_total), public.peso(v_act.budget_amount));
    end if;
  end if;
  -- Program: ORS ≤ allotment for the expense class
  if v_ec is not null then
    select * into v_bal from public.allotment_balance(v_act.program_id, v_act.fiscal_year_id, v_ec);
    v_total := v_bal.obligated - coalesce(case when v_old.expense_class_id = v_ec then v_old.amount end, 0) + v_amount;
    if v_total > v_bal.allotted then
      v_problems := v_problems || format('Obligations under %s (%s) exceed the allotment (%s).',
        (select code from public.expense_classes where id = v_ec), public.peso(v_total), public.peso(v_bal.allotted));
    end if;
  end if;
  v_flags := public.finance_enforce(v_problems);

  if v_id is null then
    insert into public.obligations (
      program_id, fiscal_year_id, activity_id, package_id, delivery_id, ors_no, ors_date, amount,
      fund_source_id, expense_class_id, uacs_code_id, payee_supplier_id, payee_name, particulars, flags
    ) values (
      v_act.program_id, v_act.fiscal_year_id, v_act.id, v_pkg.id, nullif(p ->> 'delivery_id', '')::uuid,
      trim(p ->> 'ors_no'), v_date, v_amount,
      coalesce(nullif(p ->> 'fund_source_id', '')::uuid, v_act.fund_source_id), v_ec,
      coalesce(nullif(p ->> 'uacs_code_id', '')::uuid, v_pkg.uacs_code_id),
      coalesce(nullif(p ->> 'payee_supplier_id', '')::uuid, v_pkg.supplier_id),
      nullif(trim(coalesce(p ->> 'payee_name', '')), ''), nullif(trim(coalesce(p ->> 'particulars', '')), ''),
      v_flags
    ) returning id into v_id;
  else
    update public.obligations set
      package_id = v_pkg.id, delivery_id = nullif(p ->> 'delivery_id', '')::uuid,
      ors_no = trim(p ->> 'ors_no'), ors_date = v_date, amount = v_amount,
      fund_source_id = nullif(p ->> 'fund_source_id', '')::uuid, expense_class_id = v_ec,
      uacs_code_id = nullif(p ->> 'uacs_code_id', '')::uuid,
      payee_supplier_id = nullif(p ->> 'payee_supplier_id', '')::uuid,
      payee_name = nullif(trim(coalesce(p ->> 'payee_name', '')), ''),
      particulars = nullif(trim(coalesce(p ->> 'particulars', '')), ''), flags = v_flags
    where id = v_id;
    -- An edit cannot drop below what has already been paid against it.
    if (select coalesce(sum(l.amount), 0) from public.disbursement_obligations l
        join public.disbursements d on d.id = l.disbursement_id and d.status = 'active'
        where l.obligation_id = v_id) > v_amount then
      raise exception 'This ORS has already been paid beyond %', public.peso(v_amount) using errcode = '23514';
    end if;
  end if;
  return jsonb_build_object('id', v_id, 'warnings', to_jsonb(v_flags));
exception when unique_violation then
  raise exception 'ORS number % is already used this fiscal year', trim(p ->> 'ors_no') using errcode = '23505';
end;
$$;

create or replace function public.cancel_obligation(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.obligations;
begin
  select * into v from public.obligations where id = p_id for update;
  if not found or not public.can_manage_program(v.program_id) then
    raise exception 'Only program admins can cancel an ORS' using errcode = '42501';
  end if;
  perform public.assert_fiscal_year_writable(v.fiscal_year_id, v.program_id);
  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'Give a reason for cancelling' using errcode = '22023';
  end if;
  if exists (select 1 from public.disbursement_obligations l
             join public.disbursements d on d.id = l.disbursement_id and d.status = 'active'
             where l.obligation_id = p_id) then
    raise exception 'Cancel the DVs that pay this ORS first' using errcode = '23514';
  end if;
  update public.obligations set status = 'cancelled', cancelled_reason = trim(p_reason) where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Deliveries RPC
-- ---------------------------------------------------------------------------
-- p: {id?, package_id, status, scheduled_date?, delivery_date?, accepted_date?, dr_no?, iar_no?,
--     amount?, remarks?, exception_remark?}; p_items: [{description, quantity, unit_id?, unit_cost}]
create or replace function public.save_delivery(p jsonb, p_items jsonb default '[]'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id       uuid := nullif(p ->> 'id', '')::uuid;
  v_old      public.package_deliveries;
  v_pkg      public.procurement_packages;
  v_status   text := coalesce(nullif(p ->> 'status', ''), 'scheduled');
  v_amount   numeric;
  v_total    numeric;
  v_items    integer := coalesce(jsonb_array_length(p_items), 0);
  v_problems text[] := '{}';
  v_flags    text[];
  v_exc      text := nullif(trim(coalesce(p ->> 'exception_remark', '')), '');
  v_no       integer;
begin
  if v_id is not null then
    select * into v_old from public.package_deliveries where id = v_id for update;
    if not found then
      raise exception 'Delivery not found' using errcode = 'P0002';
    end if;
  end if;
  select * into v_pkg from public.procurement_packages
  where id = coalesce((p ->> 'package_id')::uuid, v_old.package_id) and deleted_at is null for update;
  if v_pkg.id is null or not public.can_write_program(v_pkg.program_id) then
    raise exception 'You are not allowed to record deliveries for this package' using errcode = '42501';
  end if;
  perform public.assert_fiscal_year_writable(v_pkg.fiscal_year_id, v_pkg.program_id);
  if v_pkg.status = 'cancelled' then
    raise exception 'This package is cancelled' using errcode = '22023';
  end if;
  if v_pkg.supplier_id is null then
    raise exception 'Award the package before recording deliveries' using errcode = '22023';
  end if;
  if v_status not in ('scheduled', 'delivered', 'partial', 'accepted', 'rejected') then
    raise exception 'Unknown delivery status %', v_status using errcode = '22023';
  end if;
  if (p ->> 'delivery_date')::date > public.today_ph() or (p ->> 'accepted_date')::date > public.today_ph() then
    raise exception 'Delivery and acceptance dates cannot be in the future' using errcode = '22023';
  end if;

  v_amount := case when v_items > 0
                   then (select coalesce(sum(round((i ->> 'quantity')::numeric * coalesce((i ->> 'unit_cost')::numeric, 0), 2)), 0)
                         from jsonb_array_elements(p_items) i)
                   else coalesce((p ->> 'amount')::numeric, 0) end;

  -- Delivered value (excluding scheduled/rejected) ≤ contract amount.
  if v_status not in ('scheduled', 'rejected') then
    select coalesce(sum(amount), 0) + v_amount into v_total from public.package_deliveries
    where package_id = v_pkg.id and status not in ('scheduled', 'rejected') and id is distinct from v_id;
    if v_total > v_pkg.contract_amount then
      v_problems := v_problems || format('Deliveries for %s (%s) exceed the contract amount (%s).',
        v_pkg.code, public.peso(v_total), public.peso(v_pkg.contract_amount));
    end if;
  end if;
  v_flags := public.finance_enforce(v_problems);

  -- Configured order says obligate first: delivering without an ORS is an exception needing a remark.
  if v_status not in ('scheduled', 'rejected') and v_pkg.obligation_timing = 'before_delivery'
     and not exists (select 1 from public.obligations where package_id = v_pkg.id and status = 'active') then
    if v_exc is null then
      raise exception 'This package obligates before delivery, but no ORS is recorded yet. Record the ORS first, or give a remark for this exception.'
        using errcode = '23514';
    end if;
    v_flags := array_append(v_flags, 'Delivered before obligation (exception)');
  end if;
  if v_status = 'accepted' and nullif(trim(coalesce(p ->> 'iar_no', '')), '') is null then
    v_flags := array_append(v_flags, 'Accepted without an IAR number');
  end if;

  if v_id is null then
    select coalesce(max(delivery_no), 0) + 1 into v_no from public.package_deliveries where package_id = v_pkg.id;
    insert into public.package_deliveries (
      package_id, activity_id, program_id, fiscal_year_id, delivery_no, status, scheduled_date, delivery_date,
      accepted_date, dr_no, iar_no, amount, remarks, exception_remark, flags
    ) values (
      v_pkg.id, v_pkg.activity_id, v_pkg.program_id, v_pkg.fiscal_year_id, v_no, v_status,
      (p ->> 'scheduled_date')::date, (p ->> 'delivery_date')::date,
      case when v_status = 'accepted' then coalesce((p ->> 'accepted_date')::date, (p ->> 'delivery_date')::date) end,
      nullif(trim(coalesce(p ->> 'dr_no', '')), ''), nullif(trim(coalesce(p ->> 'iar_no', '')), ''),
      v_amount, nullif(trim(coalesce(p ->> 'remarks', '')), ''), v_exc, v_flags
    ) returning id into v_id;
  else
    update public.package_deliveries set
      status = v_status, scheduled_date = (p ->> 'scheduled_date')::date, delivery_date = (p ->> 'delivery_date')::date,
      accepted_date = case when v_status = 'accepted'
                           then coalesce((p ->> 'accepted_date')::date, (p ->> 'delivery_date')::date) end,
      dr_no = nullif(trim(coalesce(p ->> 'dr_no', '')), ''), iar_no = nullif(trim(coalesce(p ->> 'iar_no', '')), ''),
      amount = v_amount, remarks = nullif(trim(coalesce(p ->> 'remarks', '')), ''),
      exception_remark = coalesce(v_exc, exception_remark), flags = v_flags
    where id = v_id;
  end if;

  delete from public.package_delivery_items where delivery_id = v_id;
  insert into public.package_delivery_items (delivery_id, sort_order, description, quantity, unit_id, unit_cost)
  select v_id, i.ord, trim(i.value ->> 'description'), (i.value ->> 'quantity')::numeric,
         nullif(i.value ->> 'unit_id', '')::uuid, coalesce((i.value ->> 'unit_cost')::numeric, 0)
  from jsonb_array_elements(p_items) with ordinality as i(value, ord);

  return jsonb_build_object('id', v_id, 'warnings', to_jsonb(v_flags));
end;
$$;

create or replace function public.delete_delivery(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.package_deliveries;
begin
  select * into v from public.package_deliveries where id = p_id for update;
  if not found then
    raise exception 'Delivery not found' using errcode = 'P0002';
  end if;
  if not (public.can_manage_program(v.program_id)
          or (v.status = 'scheduled' and public.can_write_program(v.program_id))) then
    raise exception 'Only program admins can delete a recorded delivery' using errcode = '42501';
  end if;
  perform public.assert_fiscal_year_writable(v.fiscal_year_id, v.program_id);
  delete from public.package_deliveries where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Disbursements RPC
-- ---------------------------------------------------------------------------
-- p: {id?, activity_id, package_id?, dv_no, dv_date, gross_amount, tax_withheld?, other_deductions?,
--     payee_supplier_id?, payee_name?, check_ada_no?, particulars?}
-- p_links: [{obligation_id, amount}] — must add up to the gross amount.
create or replace function public.save_disbursement(p jsonb, p_links jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id       uuid := nullif(p ->> 'id', '')::uuid;
  v_old      public.disbursements;
  v_act      public.activities;
  v_pkg      public.procurement_packages;
  v_gross    numeric := (p ->> 'gross_amount')::numeric;
  v_date     date := (p ->> 'dv_date')::date;
  v_sum      numeric;
  v_problems text[] := '{}';
  v_flags    text[];
  l          record;
  v_paid     numeric;
  v_accepted numeric;
begin
  if v_id is not null then
    select * into v_old from public.disbursements where id = v_id for update;
    if not found or v_old.status <> 'active' then
      raise exception 'DV not found or cancelled' using errcode = 'P0002';
    end if;
  end if;
  select * into v_act from public.activities
  where id = coalesce((p ->> 'activity_id')::uuid, v_old.activity_id) and deleted_at is null for update;
  if v_act.id is null or not public.can_write_program(v_act.program_id) then
    raise exception 'You are not allowed to record disbursements for this activity' using errcode = '42501';
  end if;
  perform public.assert_fiscal_year_writable(v_act.fiscal_year_id, v_act.program_id);
  if nullif(p ->> 'package_id', '') is not null then
    select * into v_pkg from public.procurement_packages
    where id = (p ->> 'package_id')::uuid and activity_id = v_act.id and deleted_at is null;
    if v_pkg.id is null then
      raise exception 'That package is not part of this activity' using errcode = '22023';
    end if;
  end if;
  if v_gross is null or v_gross <= 0 then
    raise exception 'Enter the gross amount' using errcode = '22023';
  end if;
  if v_date is null or v_date > public.today_ph() then
    raise exception 'The DV date is required and cannot be in the future' using errcode = '22023';
  end if;
  if nullif(trim(coalesce(p ->> 'dv_no', '')), '') is null then
    raise exception 'Enter the DV number' using errcode = '22023';
  end if;
  if jsonb_typeof(p_links) <> 'array' or jsonb_array_length(p_links) = 0 then
    raise exception 'Choose the ORS this DV pays' using errcode = '22023';
  end if;
  select coalesce(sum((x ->> 'amount')::numeric), 0) into v_sum from jsonb_array_elements(p_links) x;
  if v_sum <> v_gross then
    raise exception 'The amounts charged to ORS (%) must add up to the gross amount (%)',
      public.peso(v_sum), public.peso(v_gross) using errcode = '22023';
  end if;

  for l in
    select o.*, (x ->> 'amount')::numeric as link_amount
    from jsonb_array_elements(p_links) x
    left join public.obligations o on o.id = (x ->> 'obligation_id')::uuid
  loop
    if l.id is null or l.status <> 'active' or l.activity_id <> v_act.id
       or l.package_id is distinct from v_pkg.id then
      raise exception 'Each ORS must be active and belong to the same % as the DV',
        case when v_pkg.id is null then 'activity (activity-level)' else 'package' end using errcode = '22023';
    end if;
    if l.link_amount <= 0 then
      raise exception 'Amounts charged to an ORS must be positive' using errcode = '22023';
    end if;
    select coalesce(sum(dl.amount), 0) into v_paid from public.disbursement_obligations dl
    join public.disbursements d on d.id = dl.disbursement_id and d.status = 'active'
    where dl.obligation_id = l.id and dl.disbursement_id is distinct from v_id;
    if v_paid + l.link_amount > l.amount then
      v_problems := v_problems || format('ORS %s would be paid %s, more than its %s.',
        l.ors_no, public.peso(v_paid + l.link_amount), public.peso(l.amount));
    end if;
  end loop;
  v_flags := public.finance_enforce(v_problems);

  -- Paying more than what was accepted is an advance payment: always flagged, never blocked.
  if v_pkg.id is not null then
    select coalesce(sum(amount), 0) into v_accepted from public.package_deliveries
    where package_id = v_pkg.id and status = 'accepted';
    select coalesce(sum(gross_amount), 0) + v_gross into v_paid from public.disbursements
    where package_id = v_pkg.id and status = 'active' and id is distinct from v_id;
    if v_paid > v_accepted then
      v_flags := array_append(v_flags, format('Paid %s against %s of accepted deliveries (advance payment).',
        public.peso(v_paid), public.peso(v_accepted)));
    end if;
  end if;

  if v_id is null then
    insert into public.disbursements (
      program_id, fiscal_year_id, activity_id, package_id, dv_no, dv_date, gross_amount, tax_withheld,
      other_deductions, payee_supplier_id, payee_name, check_ada_no, particulars, flags
    ) values (
      v_act.program_id, v_act.fiscal_year_id, v_act.id, v_pkg.id, trim(p ->> 'dv_no'), v_date, v_gross,
      coalesce((p ->> 'tax_withheld')::numeric, 0), coalesce((p ->> 'other_deductions')::numeric, 0),
      coalesce(nullif(p ->> 'payee_supplier_id', '')::uuid, v_pkg.supplier_id),
      nullif(trim(coalesce(p ->> 'payee_name', '')), ''), nullif(trim(coalesce(p ->> 'check_ada_no', '')), ''),
      nullif(trim(coalesce(p ->> 'particulars', '')), ''), v_flags
    ) returning id into v_id;
  else
    update public.disbursements set
      package_id = v_pkg.id, dv_no = trim(p ->> 'dv_no'), dv_date = v_date, gross_amount = v_gross,
      tax_withheld = coalesce((p ->> 'tax_withheld')::numeric, 0),
      other_deductions = coalesce((p ->> 'other_deductions')::numeric, 0),
      payee_supplier_id = nullif(p ->> 'payee_supplier_id', '')::uuid,
      payee_name = nullif(trim(coalesce(p ->> 'payee_name', '')), ''),
      check_ada_no = nullif(trim(coalesce(p ->> 'check_ada_no', '')), ''),
      particulars = nullif(trim(coalesce(p ->> 'particulars', '')), ''), flags = v_flags
    where id = v_id;
  end if;

  delete from public.disbursement_obligations where disbursement_id = v_id;
  insert into public.disbursement_obligations (disbursement_id, obligation_id, program_id, amount)
  select v_id, (x ->> 'obligation_id')::uuid, v_act.program_id, (x ->> 'amount')::numeric
  from jsonb_array_elements(p_links) x;

  return jsonb_build_object('id', v_id, 'warnings', to_jsonb(v_flags));
exception when unique_violation then
  raise exception 'DV number % is already used this fiscal year (or an ORS is listed twice)', trim(p ->> 'dv_no')
    using errcode = '23505';
end;
$$;

create or replace function public.cancel_disbursement(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.disbursements;
begin
  select * into v from public.disbursements where id = p_id for update;
  if not found or not public.can_manage_program(v.program_id) then
    raise exception 'Only program admins can cancel a DV' using errcode = '42501';
  end if;
  perform public.assert_fiscal_year_writable(v.fiscal_year_id, v.program_id);
  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'Give a reason for cancelling' using errcode = '22023';
  end if;
  update public.disbursements set status = 'cancelled', cancelled_reason = trim(p_reason) where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Plans RPCs
-- ---------------------------------------------------------------------------
create or replace function public.ensure_finance_plan(p_program_id uuid, p_fiscal_year_id uuid, p_plan_type text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.has_program_access(p_program_id) then
    raise exception 'No access to this program' using errcode = '42501';
  end if;
  select id into v_id from public.finance_plans
  where program_id = p_program_id and fiscal_year_id = p_fiscal_year_id and plan_type = p_plan_type;
  if v_id is null then
    if not public.can_write_program(p_program_id) then
      return null; -- read-only users simply see "no plan yet"
    end if;
    insert into public.finance_plans (program_id, fiscal_year_id, plan_type)
    values (p_program_id, p_fiscal_year_id, p_plan_type)
    on conflict (program_id, fiscal_year_id, plan_type) do nothing
    returning id into v_id;
    if v_id is null then
      select id into v_id from public.finance_plans
      where program_id = p_program_id and fiscal_year_id = p_fiscal_year_id and plan_type = p_plan_type;
    end if;
  end if;
  return v_id;
end;
$$;

-- Replaces a draft plan's rows with p_rows (in order). Rows keep their id when given.
create or replace function public.save_plan_rows(p_plan_id uuid, p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.finance_plans;
  v_ids  uuid[];
  v_n    integer;
  v_bad  text;
begin
  select * into v_plan from public.finance_plans where id = p_plan_id for update;
  if not found or not public.can_write_program(v_plan.program_id) then
    raise exception 'You are not allowed to edit this plan' using errcode = '42501';
  end if;
  perform public.assert_fiscal_year_writable(v_plan.fiscal_year_id, v_plan.program_id);
  if v_plan.status <> 'draft' then
    raise exception 'This plan is %; return it to draft to edit', v_plan.status using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Rows must be a list' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) > 3000 then
    raise exception 'A plan can have at most 3,000 rows' using errcode = '22023';
  end if;

  drop table if exists _rows;
  create temporary table _rows on commit drop as
  select (r.ord - 1)::integer as sort_order, x.*
  from jsonb_array_elements(p_rows) with ordinality as r(value, ord),
       jsonb_to_record(r.value) as x(
         id uuid, activity_id uuid, package_id uuid, description text, expense_class_id uuid, uacs_code_id uuid,
         fund_source_id uuid, procurement_mode_id uuid, unit_id uuid, quantity numeric, unit_cost numeric,
         amount numeric, m01 numeric, m02 numeric, m03 numeric, m04 numeric, m05 numeric, m06 numeric,
         m07 numeric, m08 numeric, m09 numeric, m10 numeric, m11 numeric, m12 numeric, remarks text);

  select string_agg('row ' || (sort_order + 1), ', ') into v_bad from _rows
  where nullif(trim(coalesce(description, '')), '') is null;
  if v_bad is not null then
    raise exception 'Particulars are required (%)', v_bad using errcode = '22023';
  end if;
  select string_agg('row ' || (r.sort_order + 1), ', ') into v_bad from _rows r
  left join public.activities a on a.id = r.activity_id
  left join public.procurement_packages k on k.id = r.package_id
  where (r.activity_id is not null and (a.id is null or a.program_id <> v_plan.program_id or a.fiscal_year_id <> v_plan.fiscal_year_id))
     or (r.package_id is not null and (k.id is null or k.program_id <> v_plan.program_id or k.fiscal_year_id <> v_plan.fiscal_year_id
                                        or (r.activity_id is not null and k.activity_id <> r.activity_id)));
  if v_bad is not null then
    raise exception 'Linked activity/package must be in this program and year (%)', v_bad using errcode = '22023';
  end if;

  select array_agg(id) into v_ids from _rows where id is not null;
  delete from public.finance_plan_rows where plan_id = p_plan_id and not (id = any (coalesce(v_ids, '{}')));

  insert into public.finance_plan_rows as t (
    id, plan_id, program_id, fiscal_year_id, sort_order, activity_id, package_id, description, expense_class_id,
    uacs_code_id, fund_source_id, procurement_mode_id, unit_id, quantity, unit_cost, amount,
    m01, m02, m03, m04, m05, m06, m07, m08, m09, m10, m11, m12, remarks
  )
  select coalesce(r.id, gen_random_uuid()), p_plan_id, v_plan.program_id, v_plan.fiscal_year_id, r.sort_order,
         r.activity_id, coalesce(r.package_id, null), trim(r.description), r.expense_class_id, r.uacs_code_id,
         r.fund_source_id, r.procurement_mode_id, r.unit_id, r.quantity, r.unit_cost,
         case when r.quantity is not null and r.unit_cost is not null then round(r.quantity * r.unit_cost, 2)
              else coalesce(r.amount, 0) end,
         coalesce(r.m01, 0), coalesce(r.m02, 0), coalesce(r.m03, 0), coalesce(r.m04, 0), coalesce(r.m05, 0),
         coalesce(r.m06, 0), coalesce(r.m07, 0), coalesce(r.m08, 0), coalesce(r.m09, 0), coalesce(r.m10, 0),
         coalesce(r.m11, 0), coalesce(r.m12, 0), nullif(trim(coalesce(r.remarks, '')), '')
  from _rows r
  on conflict (id) do update set
    sort_order = excluded.sort_order, activity_id = excluded.activity_id, package_id = excluded.package_id,
    description = excluded.description, expense_class_id = excluded.expense_class_id,
    uacs_code_id = excluded.uacs_code_id, fund_source_id = excluded.fund_source_id,
    procurement_mode_id = excluded.procurement_mode_id, unit_id = excluded.unit_id,
    quantity = excluded.quantity, unit_cost = excluded.unit_cost, amount = excluded.amount,
    m01 = excluded.m01, m02 = excluded.m02, m03 = excluded.m03, m04 = excluded.m04, m05 = excluded.m05,
    m06 = excluded.m06, m07 = excluded.m07, m08 = excluded.m08, m09 = excluded.m09, m10 = excluded.m10,
    m11 = excluded.m11, m12 = excluded.m12, remarks = excluded.remarks
  where t.plan_id = p_plan_id;

  get diagnostics v_n = row_count;
  update public.finance_plans set updated_at = now() where id = p_plan_id;
  return v_n;
end;
$$;

create or replace function public.set_plan_status(p_plan_id uuid, p_status text, p_remarks text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.finance_plans;
begin
  select * into v from public.finance_plans where id = p_plan_id for update;
  if not found then
    raise exception 'Plan not found' using errcode = 'P0002';
  end if;
  perform public.assert_fiscal_year_writable(v.fiscal_year_id, v.program_id);
  if p_status = 'submitted' then
    if v.status <> 'draft' or not public.can_write_program(v.program_id) then
      raise exception 'Only a draft plan can be submitted, by someone who can edit it' using errcode = '42501';
    end if;
    update public.finance_plans set status = 'submitted', submitted_at = now(), submitted_by = (select auth.uid()),
           remarks = coalesce(nullif(trim(coalesce(p_remarks, '')), ''), remarks)
    where id = p_plan_id;
    perform public.deliver(m, 'approval', v.plan_type || ' submitted for approval',
      (select code from public.programs where id = v.program_id) || ' · FY ' ||
      (select label from public.fiscal_years where id = v.fiscal_year_id),
      '/finance?tab=plans&plan=' || v.plan_type, v.program_id, 'finance_plan', v.id)
    from public.program_managers(v.program_id) m;
  elsif p_status in ('approved', 'draft') then
    if not public.can_manage_program(v.program_id) then
      raise exception 'Only program admins can approve or reopen a plan' using errcode = '42501';
    end if;
    update public.finance_plans
    set status = p_status,
        approved_at = case when p_status = 'approved' then now() end,
        approved_by = case when p_status = 'approved' then (select auth.uid()) end,
        remarks = coalesce(nullif(trim(coalesce(p_remarks, '')), ''), remarks)
    where id = p_plan_id;
    if v.submitted_by is not null then
      perform public.deliver(v.submitted_by, 'approval',
        v.plan_type || case when p_status = 'approved' then ' approved' else ' returned to draft' end,
        nullif(trim(coalesce(p_remarks, '')), ''), '/finance?tab=plans&plan=' || v.plan_type,
        v.program_id, 'finance_plan', v.id);
    end if;
  else
    raise exception 'Unknown plan status %', p_status using errcode = '22023';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Savings: suggested from awards (ABC − contract), confirmed by admins
-- ---------------------------------------------------------------------------
create or replace function public.sync_procurement_savings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_amount numeric := case when new.status <> 'cancelled' and new.deleted_at is null
                           then new.savings_amount end;
begin
  if v_amount is null or v_amount <= 0 then
    delete from public.savings_entries where package_id = new.id and source = 'procurement' and status = 'suggested';
    return null;
  end if;
  insert into public.savings_entries (program_id, fiscal_year_id, activity_id, package_id, source, amount)
  values (new.program_id, new.fiscal_year_id, new.activity_id, new.id, 'procurement', v_amount)
  on conflict (package_id) where source = 'procurement' do update
    set amount = excluded.amount,
        -- a changed amount needs a fresh decision
        status = case when public.savings_entries.amount = excluded.amount then public.savings_entries.status else 'suggested' end;
  return null;
end;
$$;
create trigger sync_procurement_savings
  after insert or update of abc_amount, contract_amount, status, deleted_at on public.procurement_packages
  for each row execute function public.sync_procurement_savings();

create or replace function public.decide_savings(p_id uuid, p_status text, p_remarks text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.savings_entries;
begin
  select * into v from public.savings_entries where id = p_id for update;
  if not found or not public.can_manage_program(v.program_id) then
    raise exception 'Only program admins can confirm savings' using errcode = '42501';
  end if;
  perform public.assert_fiscal_year_writable(v.fiscal_year_id, v.program_id);
  if p_status not in ('suggested', 'confirmed', 'dismissed') then
    raise exception 'Unknown status %', p_status using errcode = '22023';
  end if;
  update public.savings_entries
  set status = p_status, decided_by = (select auth.uid()), decided_at = now(),
      remarks = coalesce(nullif(trim(coalesce(p_remarks, '')), ''), remarks)
  where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Guards: program/FY locks on direct writes (allotments) and audit
-- ---------------------------------------------------------------------------
create or replace function public.guard_allotment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (new.program_id <> old.program_id or new.fiscal_year_id <> old.fiscal_year_id) then
    raise exception 'Program and fiscal year cannot be changed' using errcode = '42501';
  end if;
  perform public.assert_fiscal_year_writable(new.fiscal_year_id, new.program_id);
  return new;
end;
$$;
create trigger guard_allotment before insert or update on public.allotments
  for each row execute function public.guard_allotment();

select public.enable_audit('public.finance_plans');
select public.enable_audit('public.finance_plan_rows');
select public.enable_audit('public.allotments');
select public.enable_audit('public.package_deliveries');
select public.enable_audit('public.obligations');
select public.enable_audit('public.disbursements');
select public.enable_audit('public.savings_entries');

-- ---------------------------------------------------------------------------
-- RLS: program-scoped reads; writes through RPCs (allotments: admins directly)
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'finance_plans', 'finance_plan_rows', 'allotments', 'package_deliveries', 'obligations',
    'disbursements', 'disbursement_obligations', 'savings_entries'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke insert, update, delete on public.%I from authenticated', t);
    execute format(
      'create policy "%1$s: read" on public.%1$I for select to authenticated using (public.has_program_access(program_id))', t);
  end loop;
end;
$$;

alter table public.package_delivery_items enable row level security;
revoke insert, update, delete on public.package_delivery_items from authenticated;
create policy "package_delivery_items: read" on public.package_delivery_items
  for select to authenticated
  using (exists (select 1 from public.package_deliveries d where d.id = delivery_id));

grant insert, update on public.allotments to authenticated;
revoke update on public.allotments from authenticated;
grant update (kind, allotment_no, allotment_date, fund_source_id, expense_class_id, uacs_code_id, amount, remarks, deleted_at)
  on public.allotments to authenticated;
create policy "allotments: admins insert" on public.allotments
  for insert to authenticated with check (public.can_manage_program(program_id));
create policy "allotments: admins update" on public.allotments
  for update to authenticated
  using (public.can_manage_program(program_id)) with check (public.can_manage_program(program_id));
drop policy "allotments: read" on public.allotments;
create policy "allotments: read" on public.allotments
  for select to authenticated
  using (public.has_program_access(program_id) and (deleted_at is null or public.can_manage_program(program_id)));

-- ---------------------------------------------------------------------------
-- Read models
-- ---------------------------------------------------------------------------
create view public.v_package_financial_summary with (security_invoker = true) as
select
  p.id as package_id, p.activity_id, p.program_id, p.fiscal_year_id, p.code, p.title, p.status,
  p.supplier_id, p.category_id, p.obligation_timing,
  p.abc_amount,
  p.contract_amount,
  coalesce(p.contract_amount, p.abc_amount) as ceiling,
  coalesce(o.total, 0) as obligated,
  coalesce(dl.delivered, 0) as delivered,
  coalesce(dl.accepted, 0) as accepted,
  coalesce(dv.gross, 0) as disbursed,
  coalesce(dv.net, 0) as disbursed_net,
  coalesce(p.contract_amount, p.abc_amount) - coalesce(o.total, 0) as unobligated_balance,
  greatest(coalesce(o.total, 0) - coalesce(dl.accepted, 0), 0) as obligated_undelivered,
  greatest(coalesce(dl.accepted, 0) - coalesce(dv.gross, 0), 0) as delivered_unpaid,
  coalesce(o.total, 0) - coalesce(dv.gross, 0) as unpaid_obligations,
  case when coalesce(p.contract_amount, p.abc_amount) > 0
       then round(coalesce(o.total, 0) / coalesce(p.contract_amount, p.abc_amount) * 100, 1) end as obligated_pct,
  case when p.contract_amount > 0 then round(coalesce(dl.accepted, 0) / p.contract_amount * 100, 1) end as delivered_pct,
  case when p.contract_amount > 0 then round(coalesce(dv.gross, 0) / p.contract_amount * 100, 1) end as paid_pct,
  coalesce(o.flagged, 0) + coalesce(dl.flagged, 0) + coalesce(dv.flagged, 0) as flagged_records,
  dl.oldest_unpaid_acceptance
from public.procurement_packages p
left join lateral (
  select sum(amount) as total, count(*) filter (where cardinality(flags) > 0) as flagged
  from public.obligations where package_id = p.id and status = 'active'
) o on true
left join lateral (
  select sum(amount) filter (where status not in ('scheduled', 'rejected')) as delivered,
         sum(amount) filter (where status = 'accepted') as accepted,
         count(*) filter (where cardinality(flags) > 0) as flagged,
         min(accepted_date) filter (where status = 'accepted') as oldest_unpaid_acceptance
  from public.package_deliveries where package_id = p.id
) dl on true
left join lateral (
  select sum(gross_amount) as gross, sum(net_amount) as net, count(*) filter (where cardinality(flags) > 0) as flagged
  from public.disbursements where package_id = p.id and status = 'active'
) dv on true
where p.deleted_at is null;

grant select on public.v_package_financial_summary to authenticated;

create view public.v_activity_financials with (security_invoker = true) as
select
  a.id as activity_id, a.program_id, a.fiscal_year_id, a.code, a.title,
  a.budget_amount,
  coalesce(pk.abc, 0) as packages_abc,
  coalesce(pk.contract, 0) as packages_contract,
  coalesce(o.pkg, 0) as obligated_packages,
  coalesce(o.direct, 0) as obligated_direct,
  coalesce(o.pkg, 0) + coalesce(o.direct, 0) as obligated,
  coalesce(dv.pkg, 0) + coalesce(dv.direct, 0) as disbursed,
  coalesce(dv.direct, 0) as disbursed_direct,
  coalesce(dl.accepted, 0) as accepted,
  coalesce(a.budget_amount, 0) - coalesce(o.pkg, 0) - coalesce(o.direct, 0) as unobligated,
  greatest(coalesce(dl.accepted, 0) - coalesce(dv.pkg, 0), 0) as payables,
  case when a.budget_amount > 0
       then round((coalesce(o.pkg, 0) + coalesce(o.direct, 0)) / a.budget_amount * 100, 1) end as utilization_pct,
  coalesce(sv.confirmed, 0) as savings_confirmed,
  coalesce(sv.suggested, 0) as savings_suggested
from public.activities a
left join lateral (
  select sum(abc_amount) as abc, sum(contract_amount) as contract
  from public.procurement_packages where activity_id = a.id and deleted_at is null and status <> 'cancelled'
) pk on true
left join lateral (
  select sum(amount) filter (where package_id is not null) as pkg, sum(amount) filter (where package_id is null) as direct
  from public.obligations where activity_id = a.id and status = 'active'
) o on true
left join lateral (
  select sum(gross_amount) filter (where package_id is not null) as pkg,
         sum(gross_amount) filter (where package_id is null) as direct
  from public.disbursements where activity_id = a.id and status = 'active'
) dv on true
left join lateral (
  select sum(amount) filter (where status = 'accepted') as accepted
  from public.package_deliveries where activity_id = a.id
) dl on true
left join lateral (
  select sum(amount) filter (where status = 'confirmed') as confirmed,
         sum(amount) filter (where status = 'suggested') as suggested
  from public.savings_entries where activity_id = a.id
) sv on true
where a.deleted_at is null;

grant select on public.v_activity_financials to authenticated;

-- Program × FY × expense class: allotment, plan (WFP), obligation, disbursement.
create view public.v_program_finance with (security_invoker = true) as
with keys as (
  select program_id, fiscal_year_id, expense_class_id from public.allotments where deleted_at is null
  union select program_id, fiscal_year_id, expense_class_id from public.obligations where status = 'active' and expense_class_id is not null
  union select r.program_id, r.fiscal_year_id, r.expense_class_id from public.finance_plan_rows r
        join public.finance_plans f on f.id = r.plan_id and f.plan_type = 'WFP' where r.expense_class_id is not null
)
select
  k.program_id, k.fiscal_year_id, k.expense_class_id,
  e.code as expense_class_code,
  coalesce((select sum(amount) from public.allotments x
            where x.program_id = k.program_id and x.fiscal_year_id = k.fiscal_year_id
              and x.expense_class_id = k.expense_class_id and x.deleted_at is null), 0) as allotted,
  coalesce((select sum(r.amount) from public.finance_plan_rows r join public.finance_plans f on f.id = r.plan_id
            where f.plan_type = 'WFP' and r.program_id = k.program_id and r.fiscal_year_id = k.fiscal_year_id
              and r.expense_class_id = k.expense_class_id), 0) as planned,
  coalesce((select sum(amount) from public.obligations x
            where x.program_id = k.program_id and x.fiscal_year_id = k.fiscal_year_id
              and x.expense_class_id = k.expense_class_id and x.status = 'active'), 0) as obligated,
  coalesce((select sum(l.amount) from public.disbursement_obligations l
            join public.disbursements d on d.id = l.disbursement_id and d.status = 'active'
            join public.obligations x on x.id = l.obligation_id
            where x.program_id = k.program_id and x.fiscal_year_id = k.fiscal_year_id
              and x.expense_class_id = k.expense_class_id), 0) as disbursed
from keys k
join public.expense_classes e on e.id = k.expense_class_id;

grant select on public.v_program_finance to authenticated;

-- Accepted but unpaid deliveries per package (payables), with age.
create view public.v_payables with (security_invoker = true) as
select f.*, a.code as activity_code, a.title as activity_title, s.business_name as supplier_name,
       public.today_ph() - f.oldest_unpaid_acceptance as days_outstanding
from public.v_package_financial_summary f
join public.activities a on a.id = f.activity_id
left join public.suppliers s on s.id = f.supplier_id
where f.delivered_unpaid > 0;

grant select on public.v_payables to authenticated;

-- ---------------------------------------------------------------------------
-- Daily finance reminders (deliveries & payments)
-- ---------------------------------------------------------------------------
create or replace function public.mutable_notification_types()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['comment', 'mention', 'assignment', 'stage', 'stage_due', 'task_due', 'delivery']
$$;

create or replace function public.run_finance_reminders(p_today date default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today  date := coalesce(p_today, public.today_ph());
  v_result jsonb := '{}'::jsonb;
  n        integer;
begin
  if (select auth.uid()) is not null and not public.is_superadmin() then
    raise exception 'Only the superadmin can run the reminder sweep' using errcode = '42501';
  end if;

  -- Deliveries due tomorrow
  select coalesce(sum(public.deliver(
           coalesce(p.responsible_user_id, a.responsible_user_id), 'delivery',
           'Delivery due tomorrow: ' || p.code || ' (' || coalesce(s.business_name, 'supplier') || ')',
           p.title, '/activities/' || p.activity_id || '/packages/' || p.id || '?tab=finance',
           p.program_id, 'package', p.id, 'delivery_due:' || d.id || ':' || d.scheduled_date)), 0)
  into n
  from public.package_deliveries d
  join public.procurement_packages p on p.id = d.package_id and p.status in ('not_started', 'ongoing') and p.deleted_at is null
  join public.activities a on a.id = p.activity_id
  left join public.suppliers s on s.id = p.supplier_id
  where d.status = 'scheduled' and d.scheduled_date = v_today + 1;
  v_result := v_result || jsonb_build_object('delivery_due', n);

  -- Late deliveries: day 1, then weekly
  select coalesce(sum(public.deliver(
           x.uid, 'delivery',
           'Delivery late by ' || (v_today - d.scheduled_date) || ' day(s): ' || p.code || ' ('
             || coalesce(s.business_name, 'supplier') || ')',
           p.title || ' — scheduled ' || to_char(d.scheduled_date, 'FMMon FMDD, YYYY'),
           '/activities/' || p.activity_id || '/packages/' || p.id || '?tab=finance',
           p.program_id, 'package', p.id, 'delivery_late:' || d.id || ':' || v_today)), 0)
  into n
  from public.package_deliveries d
  join public.procurement_packages p on p.id = d.package_id and p.status in ('not_started', 'ongoing') and p.deleted_at is null
  join public.activities a on a.id = p.activity_id
  left join public.suppliers s on s.id = p.supplier_id
  cross join lateral (
    select coalesce(p.responsible_user_id, a.responsible_user_id) as uid
    union select m from public.program_managers(p.program_id, false) m
  ) x
  where d.status = 'scheduled' and d.scheduled_date < v_today and (v_today - d.scheduled_date) % 7 = 1;
  v_result := v_result || jsonb_build_object('delivery_late', n);

  -- Accepted deliveries still unpaid after 7 days → program admins (once per package per week)
  select coalesce(sum(public.deliver(
           m, 'payment',
           'Payment pending ' || f.days_outstanding || ' days: ' || f.code || ' (' || coalesce(f.supplier_name, 'supplier') || ')',
           public.peso(f.delivered_unpaid) || ' accepted but unpaid · ' || f.title,
           '/activities/' || f.activity_id || '/packages/' || f.package_id || '?tab=finance',
           f.program_id, 'package', f.package_id,
           'payment_pending:' || f.package_id || ':' || (f.days_outstanding / 7))), 0)
  into n
  from public.v_payables f, public.program_managers(f.program_id, false) m
  where f.days_outstanding >= 7;
  v_result := v_result || jsonb_build_object('payment_pending', n);

  return v_result || jsonb_build_object('date', v_today);
end;
$$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('payew-finance-reminders', '5 23 * * *', 'select public.run_finance_reminders()');
  end if;
exception when others then
  raise notice 'pg_cron not scheduled for finance reminders: %', sqlerrm;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.save_obligation(jsonb)',
    'public.cancel_obligation(uuid, text)',
    'public.save_delivery(jsonb, jsonb)',
    'public.delete_delivery(uuid)',
    'public.save_disbursement(jsonb, jsonb)',
    'public.cancel_disbursement(uuid, text)',
    'public.ensure_finance_plan(uuid, uuid, text)',
    'public.save_plan_rows(uuid, jsonb)',
    'public.set_plan_status(uuid, text, text)',
    'public.decide_savings(uuid, text, text)',
    'public.run_finance_reminders(date)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  foreach f in array array[
    'public.finance_enforce(text[])',
    'public.allotment_balance(uuid, uuid, uuid)',
    'public.peso(numeric)',
    'public.sync_procurement_savings()',
    'public.guard_allotment()'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end;
$$;
