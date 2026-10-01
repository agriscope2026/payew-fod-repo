-- =============================================================================
-- PAYEW · Phase 6B (Addendum B) · Procurement packages & two-level workflow
--
-- An activity has its own stage track (package_id is null) and one parallel
-- track per procurement package (package_id = the package). Both run through
-- the same engine: activity_stage_progress / activity_tasks /
-- activity_stage_transitions carry a nullable package_id, and
-- activity_stage_action() handles either track.
--
-- The activity-level "Procurement & Implementation" stage is a container
-- (tracks_packages): it completes automatically when every non-cancelled
-- package is closed, or by a program admin override with a justification.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Document types used by package workflows
-- ---------------------------------------------------------------------------
insert into public.document_types (code, name, sort_order) values
  ('TOR', 'Technical Specifications / Terms of Reference', 16),
  ('ABSTRACT', 'Abstract of Quotations / Bids', 17),
  ('NOA', 'Notice of Award', 18),
  ('NTP', 'Notice to Proceed', 19),
  ('DR', 'Delivery Receipt / Service Completion', 20)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- Two-level templates
-- ---------------------------------------------------------------------------
alter table public.workflow_templates add column scope text not null default 'activity'
  check (scope in ('activity', 'package'));
drop index public.workflow_templates_name_idx;
drop index public.workflow_templates_one_default_idx;
create unique index workflow_templates_name_idx
  on public.workflow_templates (scope, coalesce(program_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));
create unique index workflow_templates_one_default_idx
  on public.workflow_templates (scope, coalesce(program_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where is_default and is_active;

alter table public.workflow_stages add column tracks_packages boolean not null default false;
alter table public.activity_stage_progress add column tracks_packages boolean not null default false;

-- Classic single-supplier template stays available (existing activities use it).
update public.workflow_templates
set name = 'Classic FOD Workflow (single supplier)', is_default = false,
    description = 'Original 11-stage flow with procurement, delivery and payment at activity level.'
where id = '40000000-0000-4000-8000-000000000001';

insert into public.workflow_templates (id, program_id, scope, name, description, is_default) values
  ('40000000-0000-4000-8000-000000000002', null, 'activity', 'Default FOD Workflow',
   'Activity lifecycle; suppliers run in parallel as procurement packages.', true),
  ('40000000-0000-4000-8000-000000000003', null, 'package', 'Default Package Workflow',
   'Per-supplier procurement, delivery, obligation and payment.', true);

with stages (id, sort_order, name, phase_key, role, days, docs, fields, skippable, container, description) as (
  values
    ('40000000-0000-4000-8000-000000000201'::uuid, 1, 'Activity Design / Proposal', 'design', 'program_staff', 7,
     '{DESIGN}'::text[], '{description,objectives,target_output,start_date,budget_amount}'::text[], false, false,
     'Prepare the activity design: objectives, targets, beneficiaries and budget.'),
    ('40000000-0000-4000-8000-000000000202', 2, 'Review & Approval', 'approval', 'program_admin', 5,
     '{}', '{}', false, false, 'Program admin / FOD reviews and approves the design.'),
    ('40000000-0000-4000-8000-000000000203', 3, 'Inclusion in PPMP/WFP/APP', 'budget', 'program_admin', 7,
     '{PPMP}', '{budget_amount,fund_source_id}', false, false, 'Confirm the budget line in the PPMP, WFP and APP.'),
    ('40000000-0000-4000-8000-000000000204', 4, 'Procurement & Implementation', 'procurement', 'program_admin', 60,
     '{}', '{}', true, true,
     'Each supplier runs its own package workflow (Packages tab). Completes when every package is closed.'),
    ('40000000-0000-4000-8000-000000000205', 5, 'Liquidation / Reporting', 'liquidation', 'program_staff', 15,
     '{LIQ,REPORT}', '{}', false, false, 'Liquidate advances and submit the accomplishment report.'),
    ('40000000-0000-4000-8000-000000000206', 6, 'Savings / Realignment', 'savings', 'program_admin', 5,
     '{}', '{}', true, false, 'Record procurement savings or realignment, if any.'),
    ('40000000-0000-4000-8000-000000000207', 7, 'Closed / Completed', 'closed', 'program_admin', 1,
     '{}', '{}', false, false, 'Close the activity.')
)
insert into public.workflow_stages
  (id, template_id, sort_order, name, phase_key, responsible_role, expected_days, required_documents,
   required_fields, skippable, tracks_packages, description)
select id, '40000000-0000-4000-8000-000000000002', sort_order, name, phase_key, role::public.app_role, days, docs,
       fields, skippable, container, description
from stages;

with stages (id, sort_order, name, phase_key, role, days, docs, fields, skippable, description) as (
  values
    ('40000000-0000-4000-8000-000000000301'::uuid, 1, 'Requirement / Specifications', 'design', 'program_staff', 3,
     '{TOR}'::text[], '{description}'::text[], false, 'Technical specifications or terms of reference.'),
    ('40000000-0000-4000-8000-000000000302', 2, 'Purchase Request (PR)', 'procurement', 'program_staff', 2,
     '{PR}', '{abc_amount}', false, 'Prepare and approve the PR.'),
    ('40000000-0000-4000-8000-000000000303', 3, 'Procurement Mode & Solicitation', 'procurement', 'program_admin', 7,
     '{RFQ}', '{procurement_mode_id}', false, 'RFQ, small value procurement, bidding, direct contracting, etc.'),
    ('40000000-0000-4000-8000-000000000304', 4, 'Evaluation & Post-qualification', 'procurement', 'program_admin', 3,
     '{ABSTRACT}', '{}', true, 'Abstract of quotations/bids and post-qualification.'),
    ('40000000-0000-4000-8000-000000000305', 5, 'Award (NOA) and PO / Contract', 'procurement', 'program_admin', 5,
     '{PO}', '{supplier_id,contract_amount,award_date}', false, 'Notice of award, PO or contract, notice to proceed.'),
    ('40000000-0000-4000-8000-000000000306', 6, 'Delivery / Service Rendering', 'delivery', 'program_staff', 15,
     '{DR}', '{}', false, 'Partial deliveries are allowed; record each one.'),
    ('40000000-0000-4000-8000-000000000307', 7, 'Inspection & Acceptance', 'inspection', 'program_staff', 3,
     '{IAR}', '{}', false, 'Inspect and accept each delivery (IAR).'),
    ('40000000-0000-4000-8000-000000000308', 8, 'Obligation (ORS)', 'obligation', 'program_admin', 3,
     '{ORS}', '{}', false, 'Obligate the contract amount (one or more ORS).'),
    ('40000000-0000-4000-8000-000000000309', 9, 'Disbursement / Payment (DV)', 'disbursement', 'program_admin', 7,
     '{DV}', '{}', false, 'Process payment; partial or staged payments are allowed.'),
    ('40000000-0000-4000-8000-000000000310', 10, 'Package Closed', 'closed', 'program_admin', 1,
     '{}', '{}', false, 'Close the package.')
)
insert into public.workflow_stages
  (id, template_id, sort_order, name, phase_key, responsible_role, expected_days, required_documents,
   required_fields, skippable, description)
select id, '40000000-0000-4000-8000-000000000003', sort_order, name, phase_key, role::public.app_role, days, docs,
       fields, skippable, description
from stages;

-- ---------------------------------------------------------------------------
-- Packages
-- ---------------------------------------------------------------------------
create table public.procurement_packages (
  id                    uuid primary key default gen_random_uuid(),
  activity_id           uuid not null references public.activities (id) on delete cascade,
  program_id            uuid not null references public.programs (id) on delete cascade,
  fiscal_year_id        uuid not null references public.fiscal_years (id) on delete restrict,
  package_no            integer not null,
  code                  text not null unique, -- HVC-2026-0001-P02
  title                 text not null check (length(trim(title)) between 2 and 200),
  description           text check (description is null or length(description) <= 2000),
  category_id           uuid references public.procurement_categories (id) on delete set null,
  procurement_mode_id   uuid references public.procurement_modes (id) on delete set null,
  expense_class_id      uuid references public.expense_classes (id) on delete set null,
  uacs_code_id          uuid references public.uacs_codes (id) on delete set null,
  supplier_id           uuid references public.suppliers (id) on delete restrict,
  abc_amount            numeric(16, 2) not null default 0 check (abc_amount >= 0),
  contract_amount       numeric(16, 2) check (contract_amount is null or contract_amount >= 0),
  savings_amount        numeric(16, 2) generated always as (
                          case when contract_amount is not null then abc_amount - contract_amount end) stored,
  award_date            date,
  contract_no           text check (contract_no is null or length(contract_no) <= 60),
  obligation_timing     text not null default 'after_delivery'
                        check (obligation_timing in ('after_delivery', 'before_delivery')),
  status                text not null default 'not_started'
                        check (status in ('not_started', 'ongoing', 'closed', 'cancelled')),
  current_stage_id      uuid,
  workflow_template_id  uuid references public.workflow_templates (id) on delete set null,
  responsible_user_id   uuid references public.profiles (id) on delete set null,
  start_date            date,
  due_date              date,
  closed_at             timestamptz,
  cancelled_reason      text check (cancelled_reason is null or length(cancelled_reason) <= 1000),
  remarks               text check (remarks is null or length(remarks) <= 2000),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at            timestamptz,
  deleted_by            uuid references auth.users (id) on delete set null,
  unique (activity_id, package_no),
  check (due_date is null or start_date is null or due_date >= start_date)
);
create index procurement_packages_activity_idx on public.procurement_packages (activity_id);
create index procurement_packages_program_idx on public.procurement_packages (program_id, fiscal_year_id);
create index procurement_packages_supplier_idx on public.procurement_packages (supplier_id);
create index procurement_packages_status_idx on public.procurement_packages (status);
create index procurement_packages_due_idx on public.procurement_packages (due_date) where status in ('not_started', 'ongoing');

create trigger set_updated_at before update on public.procurement_packages
  for each row execute function public.set_updated_at();

-- Supplier awards per package (keeps previous suppliers after a re-award).
create table public.package_supplier_history (
  id               uuid primary key default gen_random_uuid(),
  package_id       uuid not null references public.procurement_packages (id) on delete cascade,
  activity_id      uuid not null references public.activities (id) on delete cascade,
  program_id       uuid not null references public.programs (id) on delete cascade,
  supplier_id      uuid references public.suppliers (id) on delete set null,
  action           text not null check (action in ('award', 're_award', 'contract_change')),
  contract_amount  numeric(16, 2),
  previous_amount  numeric(16, 2),
  award_date       date,
  reason           text,
  created_by       uuid default auth.uid() references auth.users (id) on delete set null,
  created_at       timestamptz not null default now()
);
create index package_supplier_history_package_idx on public.package_supplier_history (package_id, created_at);
create index package_supplier_history_supplier_idx on public.package_supplier_history (supplier_id);

-- Admin performance remarks per package.
create table public.supplier_ratings (
  id          uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers (id) on delete cascade,
  package_id  uuid not null references public.procurement_packages (id) on delete cascade,
  program_id  uuid not null references public.programs (id) on delete cascade,
  rating      integer check (rating is null or rating between 1 and 5),
  remark      text not null check (length(trim(remark)) between 1 and 2000),
  created_by  uuid default auth.uid() references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index supplier_ratings_supplier_idx on public.supplier_ratings (supplier_id);

-- Package tracks inside the shared engine tables.
alter table public.activity_stage_progress
  add column package_id uuid references public.procurement_packages (id) on delete cascade;
alter table public.activity_tasks
  add column package_id uuid references public.procurement_packages (id) on delete cascade;
alter table public.activity_stage_transitions
  add column package_id uuid references public.procurement_packages (id) on delete cascade;
create index activity_stage_progress_package_idx on public.activity_stage_progress (package_id, parent_id, sort_order)
  where package_id is not null;
create index activity_tasks_package_idx on public.activity_tasks (package_id) where package_id is not null;
create index activity_stage_transitions_package_idx on public.activity_stage_transitions (package_id, created_at desc)
  where package_id is not null;

alter table public.procurement_packages
  add constraint procurement_packages_current_stage_fk
  foreign key (current_stage_id) references public.activity_stage_progress (id) on delete set null;

alter table public.activity_stage_transitions drop constraint activity_stage_transitions_action_check;
alter table public.activity_stage_transitions add constraint activity_stage_transitions_action_check
  check (action in ('start', 'complete', 'skip', 'reopen', 'migrate', 'cancel', 'uncancel',
                    'award', 're_award', 'contract_change', 'split', 'merge', 'reorder'));

-- ---------------------------------------------------------------------------
-- Planning & instantiation
-- ---------------------------------------------------------------------------
drop function public.resolve_workflow_template(uuid);
create or replace function public.resolve_workflow_template(p_program_id uuid, p_scope text default 'activity')
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.workflow_templates
  where is_active and is_default and scope = p_scope and (program_id = p_program_id or program_id is null)
  order by program_id nulls last
  limit 1
$$;

-- Lays out one track's stages back to back from a start date; sub-steps inside their parent.
create or replace function public.plan_stage_track(p_activity_id uuid, p_package_id uuid, p_start date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cursor date := p_start;
  v_sub date;
  s record;
  c record;
begin
  for s in
    select id, expected_days from public.activity_stage_progress
    where activity_id = p_activity_id and package_id is not distinct from p_package_id and parent_id is null
    order by sort_order
  loop
    update public.activity_stage_progress
    set planned_start = v_cursor, planned_end = v_cursor + greatest(s.expected_days - 1, 0)
    where id = s.id;
    v_sub := v_cursor;
    for c in
      select id, expected_days from public.activity_stage_progress where parent_id = s.id order by sort_order
    loop
      update public.activity_stage_progress
      set planned_start = v_sub, planned_end = v_sub + greatest(c.expected_days - 1, 0)
      where id = c.id;
      v_sub := v_sub + greatest(c.expected_days, 1);
    end loop;
    v_cursor := v_cursor + greatest(s.expected_days, 1);
  end loop;
end;
$$;

create or replace function public.plan_activity_stages(p_activity_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_start date;
  p record;
begin
  select coalesce(start_date, created_at::date) into v_start from public.activities where id = p_activity_id;
  perform public.plan_stage_track(p_activity_id, null, v_start);
  -- Packages without their own start date follow the container stage.
  for p in select id from public.procurement_packages where activity_id = p_activity_id and start_date is null loop
    perform public.plan_package_stages(p.id);
  end loop;
end;
$$;

-- Packages start on their own start date, else when the container stage is planned to start.
create or replace function public.plan_package_stages(p_package_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pkg public.procurement_packages;
  v_start date;
begin
  select * into v_pkg from public.procurement_packages where id = p_package_id;
  select coalesce(
           v_pkg.start_date,
           (select s.planned_start from public.activity_stage_progress s
            where s.activity_id = v_pkg.activity_id and s.package_id is null and s.tracks_packages
            order by s.sort_order limit 1),
           a.start_date, a.created_at::date)
  into v_start
  from public.activities a where a.id = v_pkg.activity_id;
  perform public.plan_stage_track(v_pkg.activity_id, p_package_id, v_start);
end;
$$;

-- Copies template stages into a track. For packages, Obligation stages move in
-- front of the first Delivery stage when obligation_timing = 'before_delivery'.
create or replace function public.copy_template_track(
  p_activity_id uuid,
  p_package_id uuid,
  p_template_id uuid,
  p_obligate_first boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_program uuid;
  s record;
  v_parent uuid;
  v_first uuid;
begin
  select program_id into v_program from public.activities where id = p_activity_id;

  for s in
    with top as (
      select st.*,
             (select min(d.sort_order) from public.workflow_stages d
              where d.template_id = p_template_id and d.parent_id is null and d.phase_key = 'delivery') as first_delivery
      from public.workflow_stages st
      where st.template_id = p_template_id and st.parent_id is null
    )
    select top.*,
           row_number() over (order by
             case when p_obligate_first and top.phase_key = 'obligation' and top.first_delivery is not null
                       and top.sort_order > top.first_delivery
                  then top.first_delivery - 0.5 + top.sort_order * 0.001
                  else top.sort_order end) as new_order
    from top
  loop
    insert into public.activity_stage_progress (
      activity_id, program_id, package_id, template_stage_id, sort_order, name, description, phase_key,
      responsible_role, expected_days, required_documents, required_fields, skippable, tracks_packages
    ) values (
      p_activity_id, v_program, p_package_id, s.id, s.new_order, s.name, s.description, s.phase_key,
      s.responsible_role, s.expected_days, s.required_documents, s.required_fields, s.skippable,
      s.tracks_packages and p_package_id is null
    ) returning id into v_parent;

    insert into public.activity_stage_progress (
      activity_id, program_id, package_id, template_stage_id, parent_id, sort_order, name, description, phase_key,
      responsible_role, expected_days, required_documents, required_fields, skippable
    )
    select p_activity_id, v_program, p_package_id, c.id, v_parent, c.sort_order, c.name, c.description, c.phase_key,
           c.responsible_role, c.expected_days, c.required_documents, c.required_fields, c.skippable
    from public.workflow_stages c where c.parent_id = s.id;
  end loop;

  select id into v_first from public.activity_stage_progress
  where activity_id = p_activity_id and package_id is not distinct from p_package_id and parent_id is null
  order by sort_order limit 1;

  -- Required documents become checklist tasks on their stage.
  insert into public.activity_tasks
    (activity_id, program_id, package_id, stage_progress_id, title, is_required, is_auto, doc_type_code, sort_order)
  select p_activity_id, v_program, p_package_id, sp.id,
         'Attach ' || coalesce(dt.name, d.code) || ' (' || d.code || ')',
         true, true, d.code, d.ord::integer
  from public.activity_stage_progress sp
  cross join lateral unnest(sp.required_documents) with ordinality as d(code, ord)
  left join public.document_types dt on dt.code = d.code
  where sp.activity_id = p_activity_id and sp.package_id is not distinct from p_package_id;

  return v_first;
end;
$$;

create or replace function public.instantiate_activity_workflow(p_activity_id uuid, p_template_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_first uuid;
begin
  v_first := public.copy_template_track(p_activity_id, null, p_template_id);
  update public.activities
  set workflow_template_id = p_template_id, current_stage_id = v_first
  where id = p_activity_id;
  perform public.plan_activity_stages(p_activity_id);
end;
$$;

create or replace function public.instantiate_package_workflow(p_package_id uuid, p_template_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pkg public.procurement_packages;
  v_first uuid;
begin
  select * into v_pkg from public.procurement_packages where id = p_package_id;
  v_first := public.copy_template_track(v_pkg.activity_id, p_package_id, p_template_id,
                                        v_pkg.obligation_timing = 'before_delivery');
  update public.procurement_packages
  set workflow_template_id = p_template_id, current_stage_id = v_first
  where id = p_package_id;
  perform public.plan_package_stages(p_package_id);
end;
$$;

create or replace function public.on_activity_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_template uuid := new.workflow_template_id;
begin
  if v_template is not null and not exists (
    select 1 from public.workflow_templates t
    where t.id = v_template and t.is_active and t.scope = 'activity'
      and (t.program_id is null or t.program_id = new.program_id)
  ) then
    raise exception 'That workflow does not belong to this program' using errcode = '23514';
  end if;
  v_template := coalesce(v_template, public.resolve_workflow_template(new.program_id, 'activity'));
  if v_template is not null then
    perform public.instantiate_activity_workflow(new.id, v_template);
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Package write rules
-- ---------------------------------------------------------------------------
create or replace function public.package_missing_fields(p_package_id uuid, p_fields text[])
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_row jsonb;
  v_missing text[] := '{}';
  f text;
begin
  select to_jsonb(p) into v_row from public.procurement_packages p where p.id = p_package_id;
  foreach f in array coalesce(p_fields, '{}') loop
    if nullif(trim(coalesce(v_row ->> f, '')), '') is null then
      v_missing := v_missing || f;
    end if;
  end loop;
  return v_missing;
end;
$$;

-- Validation mode from Settings ("warn" or "block").
create or replace function public.validation_blocks()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select value #>> '{}' from public.app_settings where key = 'validation_strictness'), 'warn') = 'block'
$$;

create or replace function public.prepare_package()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_act      public.activities;
  v_no       integer;
  v_abc      numeric;
  v_rpc      boolean := coalesce(current_setting('payew.package_rpc', true), '') = 'on';
  v_uid      uuid := (select auth.uid());
begin
  if tg_op = 'INSERT' then
    select * into v_act from public.activities where id = new.activity_id for update;
    if v_act.id is null or v_act.deleted_at is not null then
      raise exception 'Activity not found' using errcode = '23503';
    end if;
    if v_act.status = 'cancelled' then
      raise exception 'This activity is cancelled' using errcode = '42501';
    end if;
    new.program_id := v_act.program_id;
    new.fiscal_year_id := v_act.fiscal_year_id;
    if v_uid is not null then
      perform public.assert_fiscal_year_writable(v_act.fiscal_year_id, v_act.program_id);
    end if;
    select coalesce(max(package_no), 0) + 1 into v_no from public.procurement_packages where activity_id = new.activity_id;
    new.package_no := v_no;
    new.code := v_act.code || '-P' || lpad(v_no::text, 2, '0');
    new.status := 'not_started';
    new.current_stage_id := null;
    new.closed_at := null;
    new.deleted_at := null;
    if v_uid is not null and not v_rpc then
      new.cancelled_reason := null;
      if new.supplier_id is not null or new.contract_amount is not null then
        raise exception 'Create the package first, then award it to a supplier' using errcode = '22023';
      end if;
    end if;
    if new.workflow_template_id is not null and not exists (
      select 1 from public.workflow_templates t
      where t.id = new.workflow_template_id and t.is_active and t.scope = 'package'
        and (t.program_id is null or t.program_id = new.program_id)
    ) then
      raise exception 'That package workflow does not belong to this program' using errcode = '23514';
    end if;
  else
    if new.activity_id <> old.activity_id or new.program_id <> old.program_id
       or new.fiscal_year_id <> old.fiscal_year_id or new.package_no <> old.package_no or new.code <> old.code then
      raise exception 'A package cannot move to another activity' using errcode = '42501';
    end if;
    if v_uid is not null then
      perform public.assert_fiscal_year_writable(old.fiscal_year_id, old.program_id);
      if new.deleted_at is distinct from old.deleted_at then
        if not public.can_manage_program(old.program_id) then
          raise exception 'Only program admins can delete or restore packages' using errcode = '42501';
        end if;
        new.deleted_by := case when new.deleted_at is null then null else v_uid end;
      end if;
    end if;
  end if;

  -- Sum of package ABCs vs the activity budget ("block" mode only; the UI warns otherwise).
  if new.status <> 'cancelled' and new.deleted_at is null and public.validation_blocks()
     and (tg_op = 'INSERT' or new.abc_amount is distinct from old.abc_amount) then
    select coalesce(sum(p.abc_amount), 0) + new.abc_amount into v_abc
    from public.procurement_packages p
    where p.activity_id = new.activity_id and p.id <> new.id and p.status <> 'cancelled' and p.deleted_at is null;
    if v_abc > coalesce((select budget_amount from public.activities where id = new.activity_id), 0) then
      raise exception 'Package ABCs (%) would exceed the activity budget', to_char(v_abc, 'FM999,999,999,990.00')
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger prepare_package before insert or update on public.procurement_packages
  for each row execute function public.prepare_package();

create or replace function public.on_package_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.instantiate_package_workflow(
    new.id, coalesce(new.workflow_template_id, public.resolve_workflow_template(new.program_id, 'package')));
  return null;
end;
$$;
create trigger on_package_created after insert on public.procurement_packages
  for each row execute function public.on_package_created();

create or replace function public.on_package_start_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.plan_package_stages(new.id);
  return null;
end;
$$;
create trigger on_package_start_changed after update of start_date on public.procurement_packages
  for each row when (old.start_date is distinct from new.start_date)
  execute function public.on_package_start_changed();

-- ---------------------------------------------------------------------------
-- Derived activity progress: auto-complete the container stage when every
-- non-cancelled package is closed.
-- ---------------------------------------------------------------------------
create or replace function public.sync_activity_from_packages(p_activity_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_act    public.activities;
  v_stage  public.activity_stage_progress;
  v_next   uuid;
  v_today  date := public.today_ph();
begin
  select * into v_act from public.activities where id = p_activity_id;
  if v_act.status in ('cancelled', 'completed') or v_act.current_stage_id is null then
    return;
  end if;
  select * into v_stage from public.activity_stage_progress where id = v_act.current_stage_id;
  if not v_stage.tracks_packages then
    return;
  end if;
  if not exists (select 1 from public.procurement_packages
                 where activity_id = p_activity_id and deleted_at is null and status <> 'cancelled') then
    return;
  end if;
  if exists (select 1 from public.procurement_packages
             where activity_id = p_activity_id and deleted_at is null and status in ('not_started', 'ongoing')) then
    return;
  end if;
  -- Leave it to a person if the stage still has its own open requirements.
  if exists (select 1 from public.activity_tasks where stage_progress_id = v_stage.id and is_required and not is_done)
     or exists (select 1 from public.activity_stage_progress where parent_id = v_stage.id and status not in ('completed', 'skipped'))
     or cardinality(public.activity_missing_fields(p_activity_id, v_stage.required_fields)) > 0 then
    return;
  end if;

  update public.activity_stage_progress
  set status = 'completed', actual_start = coalesce(actual_start, v_today), actual_end = v_today, completed_at = now()
  where id = v_stage.id;
  select id into v_next from public.activity_stage_progress
  where activity_id = p_activity_id and package_id is null and parent_id is null and status in ('pending', 'in_progress')
  order by sort_order limit 1;
  if v_next is not null then
    update public.activity_stage_progress set status = 'in_progress', actual_start = coalesce(actual_start, v_today)
    where id = v_next and status = 'pending';
  end if;
  update public.activities
  set current_stage_id = v_next,
      status = case when v_next is null then 'completed' else 'ongoing' end,
      completed_at = case when v_next is null then now() end
  where id = p_activity_id;
  insert into public.activity_stage_transitions
    (activity_id, program_id, stage_id, stage_name, action, from_status, to_status, note, effective_date)
  values (p_activity_id, v_act.program_id, v_stage.id, v_stage.name, 'complete', v_stage.status, 'completed',
          'All packages closed (automatic)', v_today);
end;
$$;

create or replace function public.on_package_status_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('closed', 'cancelled') or new.deleted_at is not null then
    perform public.sync_activity_from_packages(new.activity_id);
  end if;
  return null;
end;
$$;
create trigger on_package_status_changed
  after update of status, deleted_at on public.procurement_packages
  for each row execute function public.on_package_status_changed();

-- ---------------------------------------------------------------------------
-- Stage engine (both tracks)
-- ---------------------------------------------------------------------------
create or replace function public.activity_stage_action(
  p_stage_id uuid,
  p_action text,
  p_note text default null,
  p_date date default null
)
returns public.activity_stage_progress
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stage     public.activity_stage_progress;
  v_act       public.activities;
  v_pkg       public.procurement_packages;
  v_current   public.activity_stage_progress;
  v_next      uuid;
  v_date      date := coalesce(p_date, public.today_ph());
  v_missing   text[];
  v_open      integer;
  v_from      text;
  v_note      text := nullif(trim(coalesce(p_note, '')), '');
  v_override  boolean := false;
begin
  select * into v_stage from public.activity_stage_progress where id = p_stage_id for update;
  if v_stage.id is null then
    raise exception 'Stage not found' using errcode = 'P0002';
  end if;
  select * into v_act from public.activities where id = v_stage.activity_id for update;
  if v_stage.package_id is not null then
    select * into v_pkg from public.procurement_packages where id = v_stage.package_id for update;
  end if;

  if not public.can_write_program(v_act.program_id) or v_act.deleted_at is not null then
    raise exception 'You are not allowed to update this activity' using errcode = '42501';
  end if;
  perform public.assert_fiscal_year_writable(v_act.fiscal_year_id, v_act.program_id);
  if v_act.status = 'cancelled' then
    raise exception 'This activity is cancelled' using errcode = '42501';
  end if;
  if v_pkg.id is not null then
    if v_pkg.deleted_at is not null then
      raise exception 'This package was deleted' using errcode = '42501';
    end if;
    if v_pkg.status = 'cancelled' then
      raise exception 'This package is cancelled' using errcode = '42501';
    end if;
  end if;
  if v_date > public.today_ph() then
    raise exception 'The date cannot be in the future' using errcode = '22023';
  end if;

  -- Current = first main stage of this track not yet completed/skipped.
  select * into v_current from public.activity_stage_progress
  where activity_id = v_act.id and package_id is not distinct from v_stage.package_id
    and parent_id is null and status in ('pending', 'in_progress')
  order by sort_order limit 1;

  v_from := v_stage.status;

  if p_action in ('start', 'complete', 'skip') then
    if v_stage.status in ('completed', 'skipped') then
      raise exception 'This stage is already %', v_stage.status using errcode = '22023';
    end if;
    if coalesce(v_stage.parent_id, v_stage.id) is distinct from v_current.id then
      raise exception 'Finish "%" first', v_current.name using errcode = '22023';
    end if;
  end if;

  if p_action = 'start' then
    update public.activity_stage_progress
    set status = 'in_progress', actual_start = coalesce(actual_start, v_date)
    where id = v_stage.id returning * into v_stage;
    if v_stage.parent_id is not null then
      update public.activity_stage_progress
      set status = 'in_progress', actual_start = coalesce(actual_start, v_date)
      where id = v_stage.parent_id and status = 'pending';
    end if;

  elsif p_action = 'complete' then
    if v_pkg.id is not null then
      v_missing := public.package_missing_fields(v_pkg.id, v_stage.required_fields);
      if array_length(v_missing, 1) > 0 then
        raise exception 'Fill in these package fields first: %', array_to_string(v_missing, ', ')
          using errcode = '23514';
      end if;
    else
      v_missing := public.activity_missing_fields(v_act.id, v_stage.required_fields);
      if array_length(v_missing, 1) > 0 then
        raise exception 'Fill in these activity fields first: %', array_to_string(v_missing, ', ')
          using errcode = '23514';
      end if;
    end if;
    select count(*) into v_open from public.activity_tasks
    where stage_progress_id = v_stage.id and is_required and not is_done;
    if v_open > 0 then
      raise exception '% required checklist item(s) are not done yet', v_open using errcode = '23514';
    end if;
    select count(*) into v_open from public.activity_stage_progress
    where parent_id = v_stage.id and status not in ('completed', 'skipped');
    if v_open > 0 then
      raise exception 'Complete or skip the % remaining sub-step(s) first', v_open using errcode = '23514';
    end if;
    if v_stage.actual_start is not null and v_date < v_stage.actual_start then
      raise exception 'The completion date is before the stage started' using errcode = '22023';
    end if;
    if v_stage.tracks_packages then
      select count(*) into v_open from public.procurement_packages
      where activity_id = v_act.id and deleted_at is null and status in ('not_started', 'ongoing');
      if v_open > 0 then
        if not public.can_manage_program(v_act.program_id) then
          raise exception '% package(s) are still open. Close them first, or ask a program admin to override', v_open
            using errcode = '23514';
        end if;
        if v_note is null then
          raise exception '% package(s) are still open. Give a justification to override', v_open
            using errcode = '23514';
        end if;
        v_override := true;
      end if;
    end if;

    update public.activity_stage_progress
    set status = 'completed', actual_start = coalesce(actual_start, v_date), actual_end = v_date,
        completed_by = (select auth.uid()), completed_at = now()
    where id = v_stage.id returning * into v_stage;

  elsif p_action = 'skip' then
    if not v_stage.skippable then
      raise exception 'This stage cannot be skipped' using errcode = '22023';
    end if;
    if v_note is null then
      raise exception 'Give a reason for skipping' using errcode = '22023';
    end if;
    update public.activity_stage_progress
    set status = 'skipped', actual_end = v_date, completed_by = (select auth.uid()), completed_at = now()
    where id = v_stage.id or (parent_id = v_stage.id and status in ('pending', 'in_progress'));
    select * into v_stage from public.activity_stage_progress where id = p_stage_id;

  elsif p_action = 'reopen' then
    if not public.can_manage_program(v_act.program_id) then
      raise exception 'Only program admins can move a workflow back' using errcode = '42501';
    end if;
    if v_stage.parent_id is not null or v_stage.status not in ('completed', 'skipped') then
      raise exception 'Only a finished main stage can be reopened' using errcode = '22023';
    end if;
    if v_note is null then
      raise exception 'Give a reason for moving back' using errcode = '22023';
    end if;
    update public.activity_stage_progress sp
    set status = 'pending', actual_start = null, actual_end = null, completed_by = null, completed_at = null
    where sp.activity_id = v_act.id and sp.package_id is not distinct from v_stage.package_id
      and coalesce((select p.sort_order from public.activity_stage_progress p where p.id = sp.parent_id), sp.sort_order)
          > v_stage.sort_order;
    update public.activity_stage_progress
    set status = 'in_progress', actual_end = null, completed_by = null, completed_at = null
    where id = v_stage.id returning * into v_stage;
    if v_pkg.id is not null then
      update public.procurement_packages set status = 'ongoing', closed_at = null, current_stage_id = v_stage.id
      where id = v_pkg.id;
    else
      update public.activities set status = 'ongoing', completed_at = null, current_stage_id = v_stage.id
      where id = v_act.id;
    end if;

  else
    raise exception 'Unknown action %', p_action using errcode = '22023';
  end if;

  -- Advance the track pointer after a main stage finishes.
  if p_action in ('complete', 'skip') and v_stage.parent_id is null then
    select id into v_next from public.activity_stage_progress
    where activity_id = v_act.id and package_id is not distinct from v_stage.package_id
      and parent_id is null and status in ('pending', 'in_progress')
    order by sort_order limit 1;
    if v_next is not null then
      update public.activity_stage_progress
      set status = 'in_progress', actual_start = coalesce(actual_start, v_date)
      where id = v_next and status = 'pending';
    end if;
    if v_pkg.id is not null then
      update public.procurement_packages
      set current_stage_id = v_next,
          status = case when v_next is null then 'closed' else 'ongoing' end,
          closed_at = case when v_next is null then now() end
      where id = v_pkg.id;
    else
      update public.activities
      set current_stage_id = v_next,
          status = case when v_next is null then 'completed' else 'ongoing' end,
          completed_at = case when v_next is null then now() else null end
      where id = v_act.id;
    end if;
  elsif p_action <> 'reopen' then
    if v_pkg.id is not null and v_pkg.status = 'not_started' then
      update public.procurement_packages set status = 'ongoing' where id = v_pkg.id;
    end if;
  end if;
  -- Any movement on a track means the activity is under way.
  if p_action <> 'reopen' then
    update public.activities set status = 'ongoing' where id = v_act.id and status = 'not_started';
  end if;

  insert into public.activity_stage_transitions
    (activity_id, program_id, package_id, stage_id, stage_name, action, from_status, to_status, note, effective_date)
  values
    (v_act.id, v_act.program_id, v_stage.package_id, v_stage.id, v_stage.name, p_action, v_from, v_stage.status,
     case when v_override then 'Override (packages still open): ' || v_note else v_note end, v_date);

  return v_stage;
end;
$$;

-- Re-apply a workflow to an activity's own track (packages are untouched).
create or replace function public.apply_workflow_to_activity(p_activity_id uuid, p_template_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_act public.activities;
  v_first uuid;
begin
  select * into v_act from public.activities where id = p_activity_id for update;
  if v_act.id is null or not public.can_manage_program(v_act.program_id) then
    raise exception 'Only program admins can change an activity''s workflow' using errcode = '42501';
  end if;
  perform public.assert_fiscal_year_writable(v_act.fiscal_year_id, v_act.program_id);
  if not exists (
    select 1 from public.workflow_templates t
    where t.id = p_template_id and t.is_active and t.scope = 'activity'
      and (t.program_id is null or t.program_id = v_act.program_id)
  ) then
    raise exception 'That workflow does not belong to this program' using errcode = '23514';
  end if;

  perform public.rebuild_track(p_activity_id, null, p_template_id, false);

  select id into v_first from public.activity_stage_progress
  where activity_id = p_activity_id and package_id is null and parent_id is null and status in ('pending', 'in_progress')
  order by sort_order limit 1;
  update public.activities
  set workflow_template_id = p_template_id,
      current_stage_id = v_first,
      status = case when status = 'cancelled' then 'cancelled'
                    when v_first is null then 'completed'
                    when exists (select 1 from public.activity_stage_progress
                                 where activity_id = p_activity_id and package_id is null and status <> 'pending')
                         then 'ongoing'
                    else 'not_started' end
  where id = p_activity_id;
  perform public.plan_activity_stages(p_activity_id);

  insert into public.activity_stage_transitions (activity_id, program_id, stage_name, action, note, effective_date)
  select p_activity_id, v_act.program_id, 'Workflow', 'migrate', 'Switched to workflow: ' || t.name, public.today_ph()
  from public.workflow_templates t where t.id = p_template_id;
end;
$$;

-- Rebuilds one track from a template; stages with matching names keep their
-- status/dates/assignee, done document tasks stay done, manual tasks are kept.
create or replace function public.rebuild_track(
  p_activity_id uuid,
  p_package_id uuid,
  p_template_id uuid,
  p_obligate_first boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_first uuid;
begin
  drop table if exists _old_stages;
  drop table if exists _old_done_docs;
  create temporary table _old_stages on commit drop as
  select lower(s.name) as key, lower(p.name) as parent_key, s.status, s.actual_start, s.actual_end,
         s.completed_by, s.completed_at, s.assigned_to, s.notes
  from public.activity_stage_progress s
  left join public.activity_stage_progress p on p.id = s.parent_id
  where s.activity_id = p_activity_id and s.package_id is not distinct from p_package_id;

  create temporary table _old_done_docs on commit drop as
  select distinct doc_type_code from public.activity_tasks
  where activity_id = p_activity_id and package_id is not distinct from p_package_id
    and is_auto and is_done and doc_type_code is not null;

  if p_package_id is null then
    update public.activities set current_stage_id = null where id = p_activity_id;
  else
    update public.procurement_packages set current_stage_id = null where id = p_package_id;
  end if;
  delete from public.activity_tasks
  where activity_id = p_activity_id and package_id is not distinct from p_package_id and is_auto;
  delete from public.activity_stage_progress
  where activity_id = p_activity_id and package_id is not distinct from p_package_id;

  v_first := public.copy_template_track(p_activity_id, p_package_id, p_template_id, p_obligate_first);

  update public.activity_stage_progress s
  set status = o.status, actual_start = o.actual_start, actual_end = o.actual_end,
      completed_by = o.completed_by, completed_at = o.completed_at,
      assigned_to = o.assigned_to, notes = o.notes
  from _old_stages o
  where s.activity_id = p_activity_id and s.package_id is not distinct from p_package_id
    and lower(s.name) = o.key
    and coalesce((select lower(p.name) from public.activity_stage_progress p where p.id = s.parent_id), '')
        = coalesce(o.parent_key, '');

  update public.activity_tasks t set is_done = true, done_at = now()
  where t.activity_id = p_activity_id and t.package_id is not distinct from p_package_id and t.is_auto
    and t.doc_type_code in (select doc_type_code from _old_done_docs);
  return v_first;
end;
$$;

-- ---------------------------------------------------------------------------
-- Package RPCs
-- ---------------------------------------------------------------------------
create or replace function public.lock_package(p_package_id uuid, p_manage boolean)
returns public.procurement_packages
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pkg public.procurement_packages;
begin
  select * into v_pkg from public.procurement_packages where id = p_package_id for update;
  if v_pkg.id is null or v_pkg.deleted_at is not null then
    raise exception 'Package not found' using errcode = 'P0002';
  end if;
  if p_manage and not public.can_manage_program(v_pkg.program_id) then
    raise exception 'Only program admins can do this' using errcode = '42501';
  end if;
  if not p_manage and not public.can_write_program(v_pkg.program_id) then
    raise exception 'You are not allowed to update this package' using errcode = '42501';
  end if;
  perform public.assert_fiscal_year_writable(v_pkg.fiscal_year_id, v_pkg.program_id);
  if exists (select 1 from public.activities where id = v_pkg.activity_id and status = 'cancelled') then
    raise exception 'This activity is cancelled' using errcode = '42501';
  end if;
  return v_pkg;
end;
$$;

create or replace function public.log_package_event(
  p_pkg public.procurement_packages, p_action text, p_note text
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.activity_stage_transitions
    (activity_id, program_id, package_id, stage_id, stage_name, action, note, effective_date)
  values (p_pkg.activity_id, p_pkg.program_id, p_pkg.id, p_pkg.current_stage_id,
          p_pkg.code || ' · ' || p_pkg.title, p_action, p_note, public.today_ph())
$$;

-- Award (first time) or correct the award of the same supplier. Returns warnings.
create or replace function public.award_package(
  p_package_id          uuid,
  p_supplier_id         uuid,
  p_contract_amount     numeric,
  p_award_date          date default null,
  p_contract_no         text default null,
  p_procurement_mode_id uuid default null,
  p_reason              text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pkg     public.procurement_packages := public.lock_package(p_package_id, false);
  v_checks  jsonb := public.supplier_award_check(p_supplier_id, coalesce(p_award_date, public.today_ph()));
  v_block   text;
  v_name    text;
begin
  if v_pkg.status = 'cancelled' then
    raise exception 'This package is cancelled' using errcode = '22023';
  end if;
  if v_pkg.supplier_id is not null and v_pkg.supplier_id <> p_supplier_id then
    raise exception 'This package is already awarded. Use Re-award to change the supplier' using errcode = '22023';
  end if;
  if p_contract_amount is null or p_contract_amount < 0 then
    raise exception 'Enter the contract amount' using errcode = '22023';
  end if;
  if p_award_date > public.today_ph() then
    raise exception 'The award date cannot be in the future' using errcode = '22023';
  end if;
  select string_agg(c ->> 'message', '; ') into v_block
  from jsonb_array_elements(v_checks) c where c ->> 'level' = 'block';
  if v_block is not null then
    raise exception 'Cannot award: %', v_block using errcode = '23514';
  end if;
  if v_pkg.supplier_id is not null and v_pkg.contract_amount is distinct from p_contract_amount then
    if not public.can_manage_program(v_pkg.program_id) then
      raise exception 'Changing the contract amount needs a program admin' using errcode = '42501';
    end if;
    if nullif(trim(coalesce(p_reason, '')), '') is null then
      raise exception 'Give a reason for the contract amount change' using errcode = '22023';
    end if;
  end if;
  if p_contract_amount > v_pkg.abc_amount then
    v_checks := v_checks || jsonb_build_object('level', 'warn', 'message', 'Contract amount is above the ABC');
  end if;

  perform set_config('payew.package_rpc', 'on', true);
  update public.procurement_packages
  set supplier_id = p_supplier_id,
      contract_amount = p_contract_amount,
      award_date = coalesce(p_award_date, award_date, public.today_ph()),
      contract_no = coalesce(nullif(trim(coalesce(p_contract_no, '')), ''), contract_no),
      procurement_mode_id = coalesce(p_procurement_mode_id, procurement_mode_id)
  where id = p_package_id
  returning * into v_pkg;
  perform set_config('payew.package_rpc', '', true);

  insert into public.package_supplier_history
    (package_id, activity_id, program_id, supplier_id, action, contract_amount, previous_amount, award_date, reason)
  select v_pkg.id, v_pkg.activity_id, v_pkg.program_id, p_supplier_id,
         case when exists (select 1 from public.package_supplier_history h where h.package_id = v_pkg.id)
              then 'contract_change' else 'award' end,
         p_contract_amount,
         (select h.contract_amount from public.package_supplier_history h
          where h.package_id = v_pkg.id order by h.created_at desc limit 1),
         v_pkg.award_date, nullif(trim(coalesce(p_reason, '')), '');

  select business_name into v_name from public.suppliers where id = p_supplier_id;
  perform public.log_package_event(v_pkg, 'award',
    'Awarded to ' || v_name || ' for ' || to_char(p_contract_amount, 'FM999,999,999,990.00')
    || coalesce(' — ' || nullif(trim(coalesce(p_reason, '')), ''), ''));
  return v_checks;
end;
$$;

-- Change supplier after failed bidding / non-delivery. Keeps the old award in history.
create or replace function public.reaward_package(
  p_package_id      uuid,
  p_supplier_id     uuid,
  p_contract_amount numeric,
  p_reason          text,
  p_award_date      date default null,
  p_contract_no     text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pkg     public.procurement_packages := public.lock_package(p_package_id, true);
  v_checks  jsonb := public.supplier_award_check(p_supplier_id, coalesce(p_award_date, public.today_ph()));
  v_block   text;
  v_old     text;
  v_new     text;
begin
  if v_pkg.status = 'cancelled' then
    raise exception 'This package is cancelled' using errcode = '22023';
  end if;
  if v_pkg.supplier_id is null then
    raise exception 'This package has not been awarded yet' using errcode = '22023';
  end if;
  if v_pkg.supplier_id = p_supplier_id then
    raise exception 'Choose a different supplier' using errcode = '22023';
  end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'Give a reason for the re-award' using errcode = '22023';
  end if;
  if p_contract_amount is null or p_contract_amount < 0 then
    raise exception 'Enter the contract amount' using errcode = '22023';
  end if;
  select string_agg(c ->> 'message', '; ') into v_block
  from jsonb_array_elements(v_checks) c where c ->> 'level' = 'block';
  if v_block is not null then
    raise exception 'Cannot award: %', v_block using errcode = '23514';
  end if;
  if p_contract_amount > v_pkg.abc_amount then
    v_checks := v_checks || jsonb_build_object('level', 'warn', 'message', 'Contract amount is above the ABC');
  end if;

  select business_name into v_old from public.suppliers where id = v_pkg.supplier_id;
  select business_name into v_new from public.suppliers where id = p_supplier_id;

  perform set_config('payew.package_rpc', 'on', true);
  update public.procurement_packages
  set supplier_id = p_supplier_id, contract_amount = p_contract_amount,
      award_date = coalesce(p_award_date, public.today_ph()),
      contract_no = nullif(trim(coalesce(p_contract_no, '')), '')
  where id = p_package_id
  returning * into v_pkg;
  perform set_config('payew.package_rpc', '', true);

  insert into public.package_supplier_history
    (package_id, activity_id, program_id, supplier_id, action, contract_amount, award_date, reason)
  values (v_pkg.id, v_pkg.activity_id, v_pkg.program_id, p_supplier_id, 're_award', p_contract_amount,
          v_pkg.award_date, trim(p_reason));
  perform public.log_package_event(v_pkg, 're_award', 'Re-awarded from ' || v_old || ' to ' || v_new || ': ' || trim(p_reason));
  return v_checks;
end;
$$;

create or replace function public.set_package_cancelled(p_package_id uuid, p_cancelled boolean, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pkg public.procurement_packages := public.lock_package(p_package_id, true);
begin
  if p_cancelled and nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'Give a reason for cancelling' using errcode = '22023';
  end if;
  if p_cancelled = (v_pkg.status = 'cancelled') then
    return;
  end if;
  update public.procurement_packages
  set status = case
        when p_cancelled then 'cancelled'
        when current_stage_id is null then 'closed'
        when exists (select 1 from public.activity_stage_progress s
                     where s.package_id = p_package_id and s.status <> 'pending') then 'ongoing'
        else 'not_started' end,
      cancelled_reason = case when p_cancelled then trim(p_reason) end
  where id = p_package_id
  returning * into v_pkg;
  perform public.log_package_event(v_pkg, case when p_cancelled then 'cancel' else 'uncancel' end,
                                   nullif(trim(coalesce(p_reason, '')), ''));
end;
$$;

create or replace function public.set_package_obligation_timing(p_package_id uuid, p_timing text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pkg   public.procurement_packages := public.lock_package(p_package_id, false);
  v_ids   uuid[];
  v_obl   uuid[];
  v_rest  uuid[];
  v_pos   integer;
  i       integer;
begin
  if p_timing not in ('after_delivery', 'before_delivery') then
    raise exception 'Unknown timing %', p_timing using errcode = '22023';
  end if;
  if p_timing = v_pkg.obligation_timing then
    return;
  end if;
  if exists (select 1 from public.activity_stage_progress
             where package_id = p_package_id and parent_id is null
               and phase_key in ('obligation', 'delivery', 'inspection') and status <> 'pending') then
    raise exception 'Delivery or obligation has already started; reorder is no longer possible' using errcode = '22023';
  end if;

  select array_agg(id order by sort_order) filter (where phase_key = 'obligation'),
         array_agg(id order by sort_order) filter (where phase_key <> 'obligation')
  into v_obl, v_rest
  from public.activity_stage_progress where package_id = p_package_id and parent_id is null;

  if v_obl is not null then
    if p_timing = 'before_delivery' then
      -- before the first delivery stage
      select min(k) into v_pos from generate_subscripts(v_rest, 1) k
      where (select phase_key from public.activity_stage_progress where id = v_rest[k]) = 'delivery';
    else
      -- after the last delivery/inspection stage
      select max(k) + 1 into v_pos from generate_subscripts(v_rest, 1) k
      where (select phase_key from public.activity_stage_progress where id = v_rest[k]) in ('delivery', 'inspection');
    end if;
    v_pos := coalesce(v_pos, coalesce(array_length(v_rest, 1), 0) + 1);
    v_ids := coalesce(v_rest[1:v_pos - 1], '{}') || v_obl || coalesce(v_rest[v_pos:], '{}');
    for i in 1 .. array_length(v_ids, 1) loop
      update public.activity_stage_progress set sort_order = i where id = v_ids[i];
    end loop;
  end if;

  update public.procurement_packages set obligation_timing = p_timing where id = p_package_id returning * into v_pkg;
  perform public.plan_package_stages(p_package_id);
  perform public.log_package_event(v_pkg, 'reorder',
    case when p_timing = 'before_delivery' then 'Obligation moved before delivery'
         else 'Obligation moved after delivery and inspection' end);
end;
$$;

create or replace function public.apply_workflow_to_package(p_package_id uuid, p_template_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pkg   public.procurement_packages := public.lock_package(p_package_id, true);
  v_first uuid;
begin
  if not exists (
    select 1 from public.workflow_templates t
    where t.id = p_template_id and t.is_active and t.scope = 'package'
      and (t.program_id is null or t.program_id = v_pkg.program_id)
  ) then
    raise exception 'That package workflow does not belong to this program' using errcode = '23514';
  end if;
  perform public.rebuild_track(v_pkg.activity_id, p_package_id, p_template_id, v_pkg.obligation_timing = 'before_delivery');
  select id into v_first from public.activity_stage_progress
  where package_id = p_package_id and parent_id is null and status in ('pending', 'in_progress')
  order by sort_order limit 1;
  update public.procurement_packages
  set workflow_template_id = p_template_id, current_stage_id = v_first,
      status = case when status = 'cancelled' then 'cancelled'
                    when v_first is null then 'closed'
                    when exists (select 1 from public.activity_stage_progress
                                 where package_id = p_package_id and status <> 'pending') then 'ongoing'
                    else 'not_started' end
  where id = p_package_id
  returning * into v_pkg;
  perform public.plan_package_stages(p_package_id);
  perform public.log_package_event(v_pkg, 'migrate',
    'Switched to workflow: ' || (select name from public.workflow_templates where id = p_template_id));
end;
$$;

-- Split an unawarded package into parts: [{title, abc_amount}]. The original is cancelled.
create or replace function public.split_package(p_package_id uuid, p_parts jsonb, p_reason text)
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pkg   public.procurement_packages := public.lock_package(p_package_id, true);
  v_ids   uuid[] := '{}';
  v_id    uuid;
  v_codes text;
  part    jsonb;
begin
  if v_pkg.status = 'cancelled' then
    raise exception 'This package is cancelled' using errcode = '22023';
  end if;
  if v_pkg.supplier_id is not null then
    raise exception 'Awarded packages cannot be split' using errcode = '22023';
  end if;
  if jsonb_typeof(p_parts) <> 'array' or jsonb_array_length(p_parts) < 2 then
    raise exception 'Split into at least two packages' using errcode = '22023';
  end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'Give a reason for the split' using errcode = '22023';
  end if;

  -- Cancel first so the budget check doesn't count the original twice.
  update public.procurement_packages set status = 'cancelled', cancelled_reason = 'Split: ' || trim(p_reason)
  where id = p_package_id;

  for part in select value from jsonb_array_elements(p_parts) loop
    insert into public.procurement_packages (
      activity_id, title, description, category_id, procurement_mode_id, expense_class_id, uacs_code_id,
      abc_amount, obligation_timing, workflow_template_id, responsible_user_id, start_date, due_date
    ) values (
      v_pkg.activity_id, trim(part ->> 'title'), v_pkg.description, v_pkg.category_id, v_pkg.procurement_mode_id,
      v_pkg.expense_class_id, v_pkg.uacs_code_id, coalesce((part ->> 'abc_amount')::numeric, 0),
      v_pkg.obligation_timing, v_pkg.workflow_template_id, v_pkg.responsible_user_id, v_pkg.start_date, v_pkg.due_date
    ) returning id into v_id;
    v_ids := v_ids || v_id;
  end loop;

  select string_agg(code, ', ' order by package_no) into v_codes from public.procurement_packages where id = any (v_ids);
  update public.procurement_packages set cancelled_reason = 'Split into ' || v_codes || ': ' || trim(p_reason)
  where id = p_package_id returning * into v_pkg;
  perform public.log_package_event(v_pkg, 'split', v_pkg.cancelled_reason);
  return v_ids;
end;
$$;

-- Merge unawarded packages of one activity into a new package (originals cancelled).
create or replace function public.merge_packages(p_package_ids uuid[], p_title text, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_first  public.procurement_packages;
  v_pkg    public.procurement_packages;
  v_id     uuid;
  v_abc    numeric := 0;
  v_code   text;
  pid      uuid;
begin
  if coalesce(cardinality(p_package_ids), 0) < 2 then
    raise exception 'Choose at least two packages to merge' using errcode = '22023';
  end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'Give a reason for the merge' using errcode = '22023';
  end if;
  foreach pid in array p_package_ids loop
    v_pkg := public.lock_package(pid, true);
    if v_first.id is null then
      v_first := v_pkg;
    end if;
    if v_pkg.activity_id <> v_first.activity_id then
      raise exception 'Only packages of the same activity can be merged' using errcode = '22023';
    end if;
    if v_pkg.supplier_id is not null or v_pkg.status = 'cancelled' then
      raise exception '% is awarded or cancelled and cannot be merged', v_pkg.code using errcode = '22023';
    end if;
    v_abc := v_abc + v_pkg.abc_amount;
  end loop;

  update public.procurement_packages set status = 'cancelled', cancelled_reason = 'Merged' where id = any (p_package_ids);

  insert into public.procurement_packages (
    activity_id, title, description, category_id, procurement_mode_id, expense_class_id, uacs_code_id,
    abc_amount, obligation_timing, workflow_template_id, responsible_user_id, start_date, due_date
  ) values (
    v_first.activity_id, coalesce(nullif(trim(coalesce(p_title, '')), ''), v_first.title), v_first.description,
    v_first.category_id, v_first.procurement_mode_id, v_first.expense_class_id, v_first.uacs_code_id, v_abc,
    v_first.obligation_timing, v_first.workflow_template_id, v_first.responsible_user_id, v_first.start_date,
    v_first.due_date
  ) returning id, code into v_id, v_code;

  for v_pkg in
    update public.procurement_packages set cancelled_reason = 'Merged into ' || v_code || ': ' || trim(p_reason)
    where id = any (p_package_ids) returning *
  loop
    perform public.log_package_event(v_pkg, 'merge', v_pkg.cancelled_reason);
  end loop;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.procurement_packages enable row level security;
alter table public.package_supplier_history enable row level security;
alter table public.supplier_ratings enable row level security;

revoke delete, update on public.procurement_packages from authenticated;
grant update (
  title, description, category_id, procurement_mode_id, expense_class_id, uacs_code_id, abc_amount,
  award_date, contract_no, responsible_user_id, start_date, due_date, remarks, deleted_at
) on public.procurement_packages to authenticated;

create policy "procurement_packages: read" on public.procurement_packages
  for select to authenticated
  using (public.has_program_access(program_id) and (deleted_at is null or public.can_manage_program(program_id)));
create policy "procurement_packages: insert" on public.procurement_packages
  for insert to authenticated with check (public.can_edit_activity(activity_id));
create policy "procurement_packages: update" on public.procurement_packages
  for update to authenticated
  using (public.can_write_program(program_id)) with check (public.can_write_program(program_id));

revoke insert, update, delete on public.package_supplier_history from authenticated;
create policy "package_supplier_history: read" on public.package_supplier_history
  for select to authenticated using (public.has_program_access(program_id));

create or replace function public.prepare_supplier_rating()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pkg public.procurement_packages;
begin
  select * into v_pkg from public.procurement_packages where id = new.package_id;
  if v_pkg.supplier_id is null then
    raise exception 'Rate a package after it is awarded' using errcode = '22023';
  end if;
  new.program_id := v_pkg.program_id;
  if new.supplier_id is null then
    new.supplier_id := v_pkg.supplier_id;
  elsif not exists (select 1 from public.package_supplier_history h
                    where h.package_id = new.package_id and h.supplier_id = new.supplier_id) then
    raise exception 'That supplier was never awarded this package' using errcode = '22023';
  end if;
  if (select auth.uid()) is not null then
    new.created_by := (select auth.uid());
  end if;
  return new;
end;
$$;
create trigger prepare_supplier_rating before insert on public.supplier_ratings
  for each row execute function public.prepare_supplier_rating();

revoke update on public.supplier_ratings from authenticated;
create policy "supplier_ratings: admins read" on public.supplier_ratings
  for select to authenticated using ((select public.can_manage_suppliers()));
create policy "supplier_ratings: program admins add" on public.supplier_ratings
  for insert to authenticated with check (public.can_manage_program(program_id));
create policy "supplier_ratings: delete own" on public.supplier_ratings
  for delete to authenticated using (created_by = (select auth.uid()) or (select public.is_superadmin()));

-- Engine tables: package rows follow the same program-scoped policies;
-- manual checklist items on a package must belong to that package's activity.
create or replace function public.inherit_task_package()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.stage_progress_id is not null then
    select package_id into new.package_id from public.activity_stage_progress
    where id = new.stage_progress_id and activity_id = new.activity_id;
  elsif new.package_id is not null and not exists (
    select 1 from public.procurement_packages where id = new.package_id and activity_id = new.activity_id) then
    raise exception 'That package belongs to another activity' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger inherit_task_package before insert or update of stage_progress_id, package_id on public.activity_tasks
  for each row execute function public.inherit_task_package();
grant update (package_id) on public.activity_tasks to authenticated;

select public.enable_audit('public.procurement_packages');
select public.enable_audit('public.supplier_ratings');

-- ---------------------------------------------------------------------------
-- Read models
-- ---------------------------------------------------------------------------
create view public.v_packages with (security_invoker = true) as
select
  p.*,
  a.code          as activity_code,
  a.title         as activity_title,
  sup.business_name as supplier_name,
  sup.status      as supplier_status,
  cat.code        as category_code,
  cat.name        as category_name,
  m.name          as procurement_mode_name,
  s.name          as current_stage_name,
  s.phase_key     as current_phase,
  s.status        as current_stage_status,
  s.planned_end   as current_stage_due,
  coalesce(st.done, 0)  as stages_done,
  coalesce(st.total, 0) as stages_total,
  st.planned_start,
  st.planned_end,
  (p.status in ('not_started', 'ongoing') and p.due_date is not null and p.due_date < public.today_ph()) as is_overdue,
  case when p.status in ('not_started', 'ongoing') and p.due_date < public.today_ph()
       then public.today_ph() - p.due_date else 0 end as days_overdue,
  (p.status in ('not_started', 'ongoing') and s.planned_end is not null and s.planned_end < public.today_ph()) as stage_overdue,
  case when p.status in ('not_started', 'ongoing') and s.planned_end < public.today_ph()
       then public.today_ph() - s.planned_end else 0 end as stage_days_late,
  case
    when p.status = 'cancelled' then 'cancelled'
    when p.status = 'closed' then 'closed'
    when (p.due_date < public.today_ph()) or (s.planned_end < public.today_ph()) then 'delayed'
    else p.status
  end as display_status
from public.procurement_packages p
join public.activities a on a.id = p.activity_id
left join public.suppliers sup on sup.id = p.supplier_id
left join public.procurement_categories cat on cat.id = p.category_id
left join public.procurement_modes m on m.id = p.procurement_mode_id
left join public.activity_stage_progress s on s.id = p.current_stage_id
left join lateral (
  select count(*) filter (where x.status in ('completed', 'skipped')) as done, count(*) as total,
         min(x.planned_start) as planned_start, max(x.planned_end) as planned_end
  from public.activity_stage_progress x where x.package_id = p.id and x.parent_id is null
) st on true;

grant select on public.v_packages to authenticated;

create or replace view public.v_activities with (security_invoker = true) as
select
  a.*,
  s.name          as current_stage_name,
  s.phase_key     as current_phase,
  s.status        as current_stage_status,
  s.planned_end   as current_stage_due,
  (a.status in ('not_started', 'ongoing') and a.due_date is not null and a.due_date < public.today_ph()) as is_overdue,
  case when a.status in ('not_started', 'ongoing') and a.due_date < public.today_ph()
       then public.today_ph() - a.due_date else 0 end as days_overdue,
  (a.status in ('not_started', 'ongoing') and s.planned_end is not null and s.planned_end < public.today_ph()) as stage_overdue,
  case when a.status in ('not_started', 'ongoing') and s.planned_end < public.today_ph()
       then public.today_ph() - s.planned_end else 0 end as stage_days_late,
  case
    when a.status = 'cancelled' then 'cancelled'
    when a.status = 'completed' then 'completed'
    when (a.due_date < public.today_ph()) or (s.planned_end < public.today_ph()) then 'delayed'
    else a.status
  end as display_status,
  coalesce(st.done, 0)  as stages_done,
  coalesce(st.total, 0) as stages_total,
  coalesce(ab.n, 0)     as beneficiaries_count,
  coalesce(ab.participants, 0) as participants_total,
  coalesce(pk.total, 0)     as packages_total,
  coalesce(pk.closed, 0)    as packages_closed,
  coalesce(pk.cancelled, 0) as packages_cancelled,
  coalesce(pk.overdue, 0)   as packages_overdue,
  coalesce(pk.abc, 0)       as packages_abc_total,
  coalesce(pk.contract, 0)  as packages_contract_total,
  s.tracks_packages         as current_stage_tracks_packages
from public.activities a
left join public.activity_stage_progress s on s.id = a.current_stage_id
left join lateral (
  select count(*) filter (where x.status in ('completed', 'skipped')) as done, count(*) as total
  from public.activity_stage_progress x where x.activity_id = a.id and x.package_id is null and x.parent_id is null
) st on true
left join lateral (
  select count(*) as n, sum(y.participants) as participants
  from public.activity_beneficiaries y where y.activity_id = a.id
) ab on true
left join lateral (
  select count(*) filter (where p.status <> 'cancelled') as total,
         count(*) filter (where p.status = 'closed') as closed,
         count(*) filter (where p.status = 'cancelled') as cancelled,
         count(*) filter (where p.status in ('not_started', 'ongoing') and (
           p.due_date < public.today_ph()
           or exists (select 1 from public.activity_stage_progress cs
                      where cs.id = p.current_stage_id and cs.planned_end < public.today_ph()))) as overdue,
         sum(p.abc_amount) filter (where p.status <> 'cancelled') as abc,
         sum(p.contract_amount) filter (where p.status <> 'cancelled') as contract
  from public.procurement_packages p where p.activity_id = a.id and p.deleted_at is null
) pk on true;

create view public.v_suppliers with (security_invoker = true) as
select
  s.*,
  coalesce(pk.total, 0)       as packages_count,
  coalesce(pk.open, 0)        as open_packages,
  coalesce(pk.awarded, 0)     as awarded_total,
  pk.last_award_date,
  (select count(*) from (values (s.philgeps_expiry), (s.permit_expiry)) e(d) where e.d < public.today_ph())
    + coalesce(dc.expired, 0) as expired_docs,
  (select count(*) from (values (s.philgeps_expiry), (s.permit_expiry)) e(d)
   where e.d between public.today_ph() and public.today_ph() + 30)
    + coalesce(dc.expiring, 0) as expiring_docs,
  least(s.philgeps_expiry, s.permit_expiry, dc.next_expiry) as next_expiry
from public.suppliers s
left join lateral (
  select count(*) as total,
         count(*) filter (where p.status in ('not_started', 'ongoing')) as open,
         sum(p.contract_amount) filter (where p.status <> 'cancelled') as awarded,
         max(p.award_date) as last_award_date
  from public.procurement_packages p where p.supplier_id = s.id and p.deleted_at is null
) pk on true
left join lateral (
  select count(*) filter (where d.expires_on < public.today_ph()) as expired,
         count(*) filter (where d.expires_on between public.today_ph() and public.today_ph() + 30) as expiring,
         min(d.expires_on) filter (where d.expires_on >= public.today_ph()) as next_expiry
  from public.supplier_documents d where d.supplier_id = s.id
) dc on true;

grant select on public.v_suppliers to authenticated;

-- History of an activity, its packages and child records.
create or replace function public.activity_history(p_activity_id uuid)
returns table (
  occurred_at timestamptz,
  actor_id uuid,
  action text,
  table_name text,
  changed_fields text[],
  old_data jsonb,
  new_data jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select l.occurred_at, l.actor_id, l.action, l.table_name, l.changed_fields, l.old_data, l.new_data
  from public.audit_logs l
  join public.activities a on a.id = p_activity_id
  where public.has_program_access(a.program_id)
    and (
      (l.table_name = 'activities' and l.record_id = p_activity_id::text)
      or (l.table_name in ('activity_stage_progress', 'activity_tasks', 'activity_beneficiaries', 'procurement_packages')
          and (l.new_data ->> 'activity_id' = p_activity_id::text or l.old_data ->> 'activity_id' = p_activity_id::text))
    )
  order by l.occurred_at desc
  limit 500
$$;

-- ---------------------------------------------------------------------------
-- Template management (scope-aware)
-- ---------------------------------------------------------------------------
drop function public.create_workflow_template(uuid, text, uuid);
create or replace function public.create_workflow_template(
  p_program_id uuid,
  p_name text,
  p_copy_from uuid default null,
  p_scope text default 'activity'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source uuid;
  v_scope text;
  v_id uuid;
  s record;
  v_parent uuid;
begin
  if not public.can_manage_workflow(p_program_id) then
    raise exception 'You cannot manage workflows here' using errcode = '42501';
  end if;
  v_source := coalesce(p_copy_from, public.resolve_workflow_template(null, coalesce(p_scope, 'activity')));
  select t.scope into v_scope from public.workflow_templates t
  where t.id = v_source and (t.program_id is null or t.program_id = p_program_id);
  if v_scope is null then
    raise exception 'Source workflow not found' using errcode = 'P0002';
  end if;

  insert into public.workflow_templates (program_id, scope, name, description, copied_from_id, is_default)
  select p_program_id, v_scope, trim(p_name), t.description, t.id,
         not exists (select 1 from public.workflow_templates d
                     where d.is_default and d.is_active and d.scope = v_scope
                       and d.program_id is not distinct from p_program_id)
  from public.workflow_templates t where t.id = v_source
  returning id into v_id;

  for s in select * from public.workflow_stages where template_id = v_source and parent_id is null order by sort_order loop
    insert into public.workflow_stages (template_id, sort_order, name, description, phase_key, responsible_role,
                                        expected_days, required_documents, required_fields, skippable, tracks_packages)
    values (v_id, s.sort_order, s.name, s.description, s.phase_key, s.responsible_role,
            s.expected_days, s.required_documents, s.required_fields, s.skippable, s.tracks_packages)
    returning id into v_parent;
    insert into public.workflow_stages (template_id, parent_id, sort_order, name, description, phase_key, responsible_role,
                                        expected_days, required_documents, required_fields, skippable)
    select v_id, v_parent, c.sort_order, c.name, c.description, c.phase_key, c.responsible_role,
           c.expected_days, c.required_documents, c.required_fields, c.skippable
    from public.workflow_stages c where c.parent_id = s.id;
  end loop;
  return v_id;
end;
$$;

create or replace function public.save_workflow_template(
  p_template_id uuid,
  p_name text,
  p_description text,
  p_stages jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tpl public.workflow_templates;
  s jsonb;
  c jsonb;
  i integer := 0;
  j integer;
  v_parent uuid;
begin
  select * into v_tpl from public.workflow_templates where id = p_template_id;
  if not found then
    raise exception 'Workflow not found' using errcode = 'P0002';
  end if;
  if not public.can_manage_workflow(v_tpl.program_id) then
    raise exception 'You cannot manage this workflow' using errcode = '42501';
  end if;
  if jsonb_typeof(p_stages) <> 'array' or jsonb_array_length(p_stages) = 0 then
    raise exception 'A workflow needs at least one stage' using errcode = '22023';
  end if;
  if (select count(*) from jsonb_array_elements(p_stages) x where coalesce((x ->> 'tracks_packages')::boolean, false)) > 1 then
    raise exception 'Only one stage can hold the procurement packages' using errcode = '22023';
  end if;
  if v_tpl.scope = 'package' and exists (
    select 1 from jsonb_array_elements(p_stages) x where coalesce((x ->> 'tracks_packages')::boolean, false)) then
    raise exception 'Package workflows cannot contain a packages stage' using errcode = '22023';
  end if;

  update public.workflow_templates
  set name = trim(p_name), description = nullif(trim(coalesce(p_description, '')), '')
  where id = p_template_id;

  delete from public.workflow_stages where template_id = p_template_id;

  for s in select value from jsonb_array_elements(p_stages) loop
    i := i + 1;
    insert into public.workflow_stages (template_id, sort_order, name, description, phase_key, responsible_role,
                                        expected_days, required_documents, required_fields, skippable, tracks_packages)
    values (
      p_template_id, i, trim(s ->> 'name'), nullif(trim(coalesce(s ->> 'description', '')), ''),
      coalesce(nullif(s ->> 'phase_key', ''), 'other'),
      nullif(s ->> 'responsible_role', '')::public.app_role,
      coalesce((s ->> 'expected_days')::integer, 0),
      coalesce(array(select jsonb_array_elements_text(s -> 'required_documents')), '{}'),
      coalesce(array(select jsonb_array_elements_text(s -> 'required_fields')), '{}'),
      coalesce((s ->> 'skippable')::boolean, false),
      coalesce((s ->> 'tracks_packages')::boolean, false)
    ) returning id into v_parent;

    j := 0;
    for c in select value from jsonb_array_elements(coalesce(s -> 'substeps', '[]'::jsonb)) loop
      j := j + 1;
      insert into public.workflow_stages (template_id, parent_id, sort_order, name, description, phase_key,
                                          responsible_role, expected_days, required_documents, required_fields, skippable)
      values (
        p_template_id, v_parent, j, trim(c ->> 'name'), nullif(trim(coalesce(c ->> 'description', '')), ''),
        coalesce(nullif(c ->> 'phase_key', ''), coalesce(nullif(s ->> 'phase_key', ''), 'other')),
        nullif(c ->> 'responsible_role', '')::public.app_role,
        coalesce((c ->> 'expected_days')::integer, 0),
        coalesce(array(select jsonb_array_elements_text(c -> 'required_documents')), '{}'),
        coalesce(array(select jsonb_array_elements_text(c -> 'required_fields')), '{}'),
        coalesce((c ->> 'skippable')::boolean, false)
      );
    end loop;
  end loop;
end;
$$;

create or replace function public.set_default_workflow_template(p_template_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tpl public.workflow_templates;
begin
  select * into v_tpl from public.workflow_templates where id = p_template_id and is_active;
  if not found then
    raise exception 'Workflow not found or archived' using errcode = 'P0002';
  end if;
  if not public.can_manage_workflow(v_tpl.program_id) then
    raise exception 'You cannot manage this workflow' using errcode = '42501';
  end if;
  update public.workflow_templates set is_default = false
  where is_default and scope = v_tpl.scope and program_id is not distinct from v_tpl.program_id and id <> p_template_id;
  update public.workflow_templates set is_default = true where id = p_template_id;
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
    'public.award_package(uuid, uuid, numeric, date, text, uuid, text)',
    'public.reaward_package(uuid, uuid, numeric, text, date, text)',
    'public.set_package_cancelled(uuid, boolean, text)',
    'public.set_package_obligation_timing(uuid, text)',
    'public.apply_workflow_to_package(uuid, uuid)',
    'public.split_package(uuid, jsonb, text)',
    'public.merge_packages(uuid[], text, text)',
    'public.create_workflow_template(uuid, text, uuid, text)',
    'public.resolve_workflow_template(uuid, text)',
    'public.package_missing_fields(uuid, text[])'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  foreach f in array array[
    'public.plan_stage_track(uuid, uuid, date)',
    'public.plan_package_stages(uuid)',
    'public.copy_template_track(uuid, uuid, uuid, boolean)',
    'public.instantiate_package_workflow(uuid, uuid)',
    'public.rebuild_track(uuid, uuid, uuid, boolean)',
    'public.prepare_package()',
    'public.on_package_created()',
    'public.on_package_start_changed()',
    'public.on_package_status_changed()',
    'public.sync_activity_from_packages(uuid)',
    'public.lock_package(uuid, boolean)',
    'public.log_package_event(public.procurement_packages, text, text)',
    'public.validation_blocks()',
    'public.prepare_supplier_rating()',
    'public.inherit_task_package()'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end;
$$;
