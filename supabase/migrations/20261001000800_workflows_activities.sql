-- =============================================================================
-- PAYEW · Phase 5 · Workflow engine & Activities
--   workflow_templates / workflow_stages      (default + per-program, editable)
--   activities                                (program + FY scoped)
--   activity_stage_progress                   (per-activity snapshot of the workflow)
--   activity_stage_transitions                (who moved what, when, why)
--   activity_tasks                            (checklists; required docs become tasks)
--   activity_beneficiaries                    (who was served, how much)
-- Stage moves go through activity_stage_action(); delay/overdue is computed in
-- v_activities so it is never stale.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.today_ph()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Asia/Manila')::date
$$;

-- Fiscal-year write rules: locked = read-only for everyone; closed = admins only.
create or replace function public.assert_fiscal_year_writable(p_fiscal_year_id uuid, p_program_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_status public.fiscal_year_status;
begin
  if (select auth.uid()) is null or p_fiscal_year_id is null then
    return;
  end if;
  select status into v_status from public.fiscal_years where id = p_fiscal_year_id;
  if v_status = 'locked' then
    raise exception 'This fiscal year is locked; its records are read-only' using errcode = '42501';
  end if;
  if v_status = 'closed' and not public.can_manage_program(p_program_id) then
    raise exception 'This fiscal year is closed; only program admins can make changes' using errcode = '42501';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Workflow templates
-- ---------------------------------------------------------------------------
create table public.workflow_templates (
  id              uuid primary key default gen_random_uuid(),
  program_id      uuid references public.programs (id) on delete cascade, -- null = DA-wide default
  name            text not null check (length(trim(name)) between 2 and 120),
  description     text check (description is null or length(description) <= 1000),
  is_default      boolean not null default false,
  is_active       boolean not null default true,
  copied_from_id  uuid references public.workflow_templates (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid default auth.uid() references auth.users (id) on delete set null
);
create unique index workflow_templates_name_idx
  on public.workflow_templates (coalesce(program_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));
create unique index workflow_templates_one_default_idx
  on public.workflow_templates (coalesce(program_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where is_default and is_active;
create index workflow_templates_program_idx on public.workflow_templates (program_id);

create table public.workflow_stages (
  id                  uuid primary key default gen_random_uuid(),
  template_id         uuid not null references public.workflow_templates (id) on delete cascade,
  parent_id           uuid references public.workflow_stages (id) on delete cascade,
  sort_order          integer not null,
  name                text not null check (length(trim(name)) between 1 and 120),
  description         text check (description is null or length(description) <= 1000),
  phase_key           text not null default 'other' check (phase_key in (
                        'design', 'approval', 'budget', 'procurement', 'delivery', 'inspection',
                        'obligation', 'disbursement', 'liquidation', 'savings', 'closed', 'other')),
  responsible_role    public.app_role,
  expected_days       integer not null default 0 check (expected_days between 0 and 365),
  required_documents  text[] not null default '{}', -- document_types.code
  required_fields     text[] not null default '{}', -- activity columns (+ 'beneficiaries')
  skippable           boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index workflow_stages_template_idx on public.workflow_stages (template_id, parent_id, sort_order);

create trigger set_updated_at before update on public.workflow_templates
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.workflow_stages
  for each row execute function public.set_updated_at();
select public.enable_audit('public.workflow_templates');

-- Default DA-wide template (reference data, needed in every environment).
insert into public.workflow_templates (id, program_id, name, description, is_default)
values ('40000000-0000-4000-8000-000000000001', null, 'Default FOD Workflow',
        'Standard 11-stage flow from activity design to closure.', true);

with stages (id, sort_order, name, phase_key, role, days, docs, fields, skippable, description) as (
  values
    ('40000000-0000-4000-8000-000000000101'::uuid, 1, 'Activity Design / Proposal', 'design', 'program_staff', 7,
     '{DESIGN}'::text[], '{description,objectives,target_output,start_date,budget_amount}'::text[], false,
     'Prepare the activity design: objectives, targets, beneficiaries and budget.'),
    ('40000000-0000-4000-8000-000000000102', 2, 'Review & Approval', 'approval', 'program_admin', 5,
     '{}', '{}', false, 'Program admin / FOD reviews and approves the design.'),
    ('40000000-0000-4000-8000-000000000103', 3, 'Inclusion in PPMP/WFP/APP', 'budget', 'program_admin', 7,
     '{PPMP}', '{budget_amount,fund_source_id}', false, 'Confirm the budget line in the PPMP, WFP and APP.'),
    ('40000000-0000-4000-8000-000000000104', 4, 'Procurement', 'procurement', 'program_admin', 30,
     '{}', '{}', true, 'PR → RFQ/Bidding → Evaluation → Award → PO/Contract. Skip for activities without procurement.'),
    ('40000000-0000-4000-8000-000000000105', 5, 'Implementation / Delivery', 'delivery', 'program_staff', 30,
     '{}', '{}', false, 'Conduct the activity or receive the deliveries.'),
    ('40000000-0000-4000-8000-000000000106', 6, 'Inspection & Acceptance', 'inspection', 'program_staff', 5,
     '{IAR}', '{}', true, 'Inspect and accept deliveries (IAR).'),
    ('40000000-0000-4000-8000-000000000107', 7, 'Obligation (ORS)', 'obligation', 'program_admin', 5,
     '{ORS}', '{}', false, 'Obligate the amount (ORS).'),
    ('40000000-0000-4000-8000-000000000108', 8, 'Disbursement / Payment (DV)', 'disbursement', 'program_admin', 10,
     '{DV}', '{}', false, 'Process payment (DV).'),
    ('40000000-0000-4000-8000-000000000109', 9, 'Liquidation / Reporting', 'liquidation', 'program_staff', 15,
     '{LIQ,REPORT}', '{}', false, 'Liquidate advances and submit the accomplishment report.'),
    ('40000000-0000-4000-8000-000000000110', 10, 'Savings / Realignment', 'savings', 'program_admin', 5,
     '{}', '{}', true, 'Record savings or realignment, if any.'),
    ('40000000-0000-4000-8000-000000000111', 11, 'Closed / Completed', 'closed', 'program_admin', 1,
     '{}', '{}', false, 'Close the activity.')
)
insert into public.workflow_stages
  (id, template_id, sort_order, name, phase_key, responsible_role, expected_days, required_documents, required_fields, skippable, description)
select id, '40000000-0000-4000-8000-000000000001', sort_order, name, phase_key, role::public.app_role, days, docs, fields, skippable, description
from stages;

insert into public.workflow_stages
  (template_id, parent_id, sort_order, name, phase_key, responsible_role, expected_days, required_documents)
values
  ('40000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000104', 1, 'Purchase Request (PR)', 'procurement', 'program_staff', 2, '{PR}'),
  ('40000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000104', 2, 'RFQ / Bidding', 'procurement', 'program_admin', 10, '{RFQ}'),
  ('40000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000104', 3, 'Evaluation', 'procurement', 'program_admin', 5, '{}'),
  ('40000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000104', 4, 'Award', 'procurement', 'program_admin', 3, '{}'),
  ('40000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000104', 5, 'PO / Contract', 'procurement', 'program_admin', 5, '{PO}');

-- ---------------------------------------------------------------------------
-- Activities
-- ---------------------------------------------------------------------------
create table public.activities (
  id                    uuid primary key default gen_random_uuid(),
  program_id            uuid not null references public.programs (id) on delete restrict,
  fiscal_year_id        uuid not null references public.fiscal_years (id) on delete restrict,
  code                  text unique, -- set by trigger: HVC-2026-0001
  title                 text not null check (length(trim(title)) between 3 and 250),
  description           text check (description is null or length(description) <= 5000),
  category_id           uuid references public.activity_categories (id) on delete set null,
  objectives            text check (objectives is null or length(objectives) <= 5000),
  target_output         text check (target_output is null or length(target_output) <= 1000),
  target_outcome        text check (target_outcome is null or length(target_outcome) <= 1000),
  target_quantity       numeric(14, 2) check (target_quantity is null or target_quantity >= 0),
  unit_id               uuid references public.units (id) on delete set null,
  province_id           uuid references public.provinces (id) on delete restrict,
  municipality_id       uuid references public.municipalities (id) on delete restrict,
  barangay_id           uuid references public.barangays (id) on delete restrict,
  venue                 text check (venue is null or length(venue) <= 250),
  start_date            date,
  end_date              date,
  due_date              date,
  delivery_date         date,
  responsible_user_id   uuid references public.profiles (id) on delete set null,
  responsible_unit      text check (responsible_unit is null or length(responsible_unit) <= 120),
  budget_amount         numeric(16, 2) check (budget_amount is null or budget_amount >= 0),
  fund_source_id        uuid references public.fund_sources (id) on delete set null,
  workflow_template_id  uuid references public.workflow_templates (id) on delete set null,
  current_stage_id      uuid, -- FK added after activity_stage_progress exists
  status                text not null default 'not_started'
                        check (status in ('not_started', 'ongoing', 'completed', 'cancelled')),
  cancelled_reason      text,
  completed_at          timestamptz,
  remarks               text check (remarks is null or length(remarks) <= 2000),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at            timestamptz,
  deleted_by            uuid references auth.users (id) on delete set null,
  check (end_date is null or start_date is null or end_date >= start_date)
);
create index activities_program_fy_idx on public.activities (program_id, fiscal_year_id);
create index activities_status_idx on public.activities (status);
create index activities_due_idx on public.activities (due_date);
create index activities_start_idx on public.activities (start_date);
create index activities_responsible_idx on public.activities (responsible_user_id);
create index activities_title_trgm_idx on public.activities using gin (title extensions.gin_trgm_ops);

create trigger set_updated_at before update on public.activities
  for each row execute function public.set_updated_at();
create trigger enforce_location_hierarchy
  before insert or update of province_id, municipality_id, barangay_id on public.activities
  for each row execute function public.enforce_location_hierarchy();

-- Per program + FY running numbers for activity codes.
create table public.activity_counters (
  program_id      uuid not null references public.programs (id) on delete cascade,
  fiscal_year_id  uuid not null references public.fiscal_years (id) on delete cascade,
  last_no         integer not null default 0,
  primary key (program_id, fiscal_year_id)
);
alter table public.activity_counters enable row level security;
revoke all on public.activity_counters from anon, authenticated;

create or replace function public.assign_activity_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_no integer;
  v_code text;
  v_year integer;
begin
  insert into public.activity_counters (program_id, fiscal_year_id, last_no)
  values (new.program_id, new.fiscal_year_id, 1)
  on conflict (program_id, fiscal_year_id) do update set last_no = public.activity_counters.last_no + 1
  returning last_no into v_no;
  select code into v_code from public.programs where id = new.program_id;
  select year into v_year from public.fiscal_years where id = new.fiscal_year_id;
  new.code := format('%s-%s-%s', v_code, v_year, lpad(v_no::text, 4, '0'));
  return new;
end;
$$;

create trigger assign_activity_code before insert on public.activities
  for each row execute function public.assign_activity_code();

-- ---------------------------------------------------------------------------
-- Per-activity workflow snapshot
-- ---------------------------------------------------------------------------
create table public.activity_stage_progress (
  id                  uuid primary key default gen_random_uuid(),
  activity_id         uuid not null references public.activities (id) on delete cascade,
  program_id          uuid not null references public.programs (id) on delete cascade,
  template_stage_id   uuid references public.workflow_stages (id) on delete set null,
  parent_id           uuid references public.activity_stage_progress (id) on delete cascade,
  sort_order          integer not null,
  name                text not null,
  description         text,
  phase_key           text not null default 'other',
  responsible_role    public.app_role,
  expected_days       integer not null default 0,
  required_documents  text[] not null default '{}',
  required_fields     text[] not null default '{}',
  skippable           boolean not null default false,
  status              text not null default 'pending'
                      check (status in ('pending', 'in_progress', 'completed', 'skipped')),
  planned_start       date,
  planned_end         date,
  actual_start        date,
  actual_end          date,
  assigned_to         uuid references public.profiles (id) on delete set null,
  notes               text check (notes is null or length(notes) <= 2000),
  completed_by        uuid references auth.users (id) on delete set null,
  completed_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (planned_end is null or planned_start is null or planned_end >= planned_start),
  check (actual_end is null or actual_start is null or actual_end >= actual_start)
);
create index activity_stage_progress_activity_idx on public.activity_stage_progress (activity_id, parent_id, sort_order);
create index activity_stage_progress_program_idx on public.activity_stage_progress (program_id);
create index activity_stage_progress_due_idx on public.activity_stage_progress (planned_end) where status in ('pending', 'in_progress');
create index activity_stage_progress_assigned_idx on public.activity_stage_progress (assigned_to);

alter table public.activities
  add constraint activities_current_stage_fk
  foreign key (current_stage_id) references public.activity_stage_progress (id) on delete set null;

create trigger set_updated_at before update on public.activity_stage_progress
  for each row execute function public.set_updated_at();

create table public.activity_stage_transitions (
  id            uuid primary key default gen_random_uuid(),
  activity_id   uuid not null references public.activities (id) on delete cascade,
  program_id    uuid not null references public.programs (id) on delete cascade,
  stage_id      uuid references public.activity_stage_progress (id) on delete set null,
  stage_name    text not null,
  action        text not null check (action in ('start', 'complete', 'skip', 'reopen', 'migrate', 'cancel', 'uncancel')),
  from_status   text,
  to_status     text,
  note          text,
  effective_date date,
  created_by    uuid default auth.uid() references auth.users (id) on delete set null,
  created_at    timestamptz not null default now()
);
create index activity_stage_transitions_activity_idx on public.activity_stage_transitions (activity_id, created_at desc);

create table public.activity_tasks (
  id                 uuid primary key default gen_random_uuid(),
  activity_id        uuid not null references public.activities (id) on delete cascade,
  program_id         uuid not null references public.programs (id) on delete cascade,
  stage_progress_id  uuid references public.activity_stage_progress (id) on delete set null,
  title              text not null check (length(trim(title)) between 1 and 250),
  is_required        boolean not null default false,
  is_auto            boolean not null default false, -- generated from required documents
  doc_type_code      text,
  is_done            boolean not null default false,
  done_by            uuid references auth.users (id) on delete set null,
  done_at            timestamptz,
  due_date           date,
  assigned_to        uuid references public.profiles (id) on delete set null,
  sort_order         integer not null default 0,
  created_by         uuid default auth.uid() references auth.users (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index activity_tasks_activity_idx on public.activity_tasks (activity_id, stage_progress_id, sort_order);
create index activity_tasks_assigned_idx on public.activity_tasks (assigned_to) where not is_done;

create trigger set_updated_at before update on public.activity_tasks
  for each row execute function public.set_updated_at();

create table public.activity_beneficiaries (
  activity_id     uuid not null references public.activities (id) on delete cascade,
  beneficiary_id  uuid not null references public.beneficiaries (id) on delete restrict,
  program_id      uuid not null references public.programs (id) on delete cascade,
  participants    integer check (participants is null or participants >= 0),
  quantity        numeric(14, 2) check (quantity is null or quantity >= 0),
  unit_id         uuid references public.units (id) on delete set null,
  amount          numeric(16, 2) check (amount is null or amount >= 0),
  remarks         text check (remarks is null or length(remarks) <= 500),
  created_at      timestamptz not null default now(),
  created_by      uuid default auth.uid() references auth.users (id) on delete set null,
  primary key (activity_id, beneficiary_id)
);
create index activity_beneficiaries_beneficiary_idx on public.activity_beneficiaries (beneficiary_id);

-- Child rows inherit program_id from their activity (clients cannot spoof it)
-- and respect fiscal-year locks.
create or replace function public.inherit_activity_program()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_program uuid;
  v_fy uuid;
begin
  select program_id, fiscal_year_id into v_program, v_fy from public.activities where id = new.activity_id;
  if v_program is null then
    raise exception 'Activity not found' using errcode = '23503';
  end if;
  new.program_id := v_program;
  perform public.assert_fiscal_year_writable(v_fy, v_program);
  return new;
end;
$$;

create trigger inherit_activity_program before insert or update of activity_id on public.activity_tasks
  for each row execute function public.inherit_activity_program();
create trigger inherit_activity_program before insert or update of activity_id on public.activity_beneficiaries
  for each row execute function public.inherit_activity_program();

-- ---------------------------------------------------------------------------
-- Instantiate a workflow for an activity (snapshot + planned dates + doc tasks)
-- ---------------------------------------------------------------------------
create or replace function public.resolve_workflow_template(p_program_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.workflow_templates
  where is_active and is_default and (program_id = p_program_id or program_id is null)
  order by program_id nulls last
  limit 1
$$;

-- Recomputes planned dates for the whole snapshot from the activity start date:
-- top-level stages run back to back; sub-steps run back to back inside their parent.
create or replace function public.plan_activity_stages(p_activity_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cursor date;
  v_sub date;
  s record;
  c record;
begin
  select coalesce(start_date, created_at::date) into v_cursor from public.activities where id = p_activity_id;
  for s in
    select id, expected_days from public.activity_stage_progress
    where activity_id = p_activity_id and parent_id is null order by sort_order
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

create or replace function public.instantiate_activity_workflow(p_activity_id uuid, p_template_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_program uuid;
  s record;
  c record;
  v_parent uuid;
  v_first uuid;
begin
  select program_id into v_program from public.activities where id = p_activity_id;

  for s in
    select * from public.workflow_stages where template_id = p_template_id and parent_id is null order by sort_order
  loop
    insert into public.activity_stage_progress (
      activity_id, program_id, template_stage_id, sort_order, name, description, phase_key,
      responsible_role, expected_days, required_documents, required_fields, skippable
    ) values (
      p_activity_id, v_program, s.id, s.sort_order, s.name, s.description, s.phase_key,
      s.responsible_role, s.expected_days, s.required_documents, s.required_fields, s.skippable
    ) returning id into v_parent;
    v_first := coalesce(v_first, v_parent);

    for c in select * from public.workflow_stages where parent_id = s.id order by sort_order loop
      insert into public.activity_stage_progress (
        activity_id, program_id, template_stage_id, parent_id, sort_order, name, description, phase_key,
        responsible_role, expected_days, required_documents, required_fields, skippable
      ) values (
        p_activity_id, v_program, c.id, v_parent, c.sort_order, c.name, c.description, c.phase_key,
        c.responsible_role, c.expected_days, c.required_documents, c.required_fields, c.skippable
      );
    end loop;
  end loop;

  -- Required documents become checklist tasks on their stage.
  insert into public.activity_tasks (activity_id, program_id, stage_progress_id, title, is_required, is_auto, doc_type_code, sort_order)
  select p_activity_id, v_program, sp.id,
         'Attach ' || coalesce(dt.name, d.code) || ' (' || d.code || ')',
         true, true, d.code, d.ord::integer
  from public.activity_stage_progress sp
  cross join lateral unnest(sp.required_documents) with ordinality as d(code, ord)
  left join public.document_types dt on dt.code = d.code
  where sp.activity_id = p_activity_id;

  update public.activities
  set workflow_template_id = p_template_id, current_stage_id = v_first
  where id = p_activity_id;

  perform public.plan_activity_stages(p_activity_id);
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
  -- Only templates of this program (or the DA-wide ones) may be used.
  if v_template is not null and not exists (
    select 1 from public.workflow_templates t
    where t.id = v_template and t.is_active and (t.program_id is null or t.program_id = new.program_id)
  ) then
    raise exception 'That workflow does not belong to this program' using errcode = '23514';
  end if;
  v_template := coalesce(v_template, public.resolve_workflow_template(new.program_id));
  if v_template is not null then
    perform public.instantiate_activity_workflow(new.id, v_template);
  end if;
  return null;
end;
$$;

create trigger on_activity_created after insert on public.activities
  for each row execute function public.on_activity_created();

create or replace function public.on_activity_start_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.plan_activity_stages(new.id);
  return null;
end;
$$;

create trigger on_activity_start_changed after update of start_date on public.activities
  for each row when (old.start_date is distinct from new.start_date)
  execute function public.on_activity_start_changed();

-- Guards on direct activity edits.
create or replace function public.guard_activity_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    perform public.assert_fiscal_year_writable(new.fiscal_year_id, new.program_id);
    return new;
  end if;
  if new.program_id is distinct from old.program_id or new.fiscal_year_id is distinct from old.fiscal_year_id then
    raise exception 'Program and fiscal year cannot be changed after creation' using errcode = '42501';
  end if;
  perform public.assert_fiscal_year_writable(old.fiscal_year_id, old.program_id);
  if new.deleted_at is distinct from old.deleted_at then
    if not public.can_manage_program(old.program_id) then
      raise exception 'Only program admins can delete or restore activities' using errcode = '42501';
    end if;
    new.deleted_by := case when new.deleted_at is null then null else (select auth.uid()) end;
  end if;
  return new;
end;
$$;

create trigger guard_activity_write before insert or update on public.activities
  for each row execute function public.guard_activity_write();

-- ---------------------------------------------------------------------------
-- Permissions & RLS
-- ---------------------------------------------------------------------------
create or replace function public.can_edit_activity(p_activity_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.activities a
    where a.id = p_activity_id and a.deleted_at is null and public.can_write_program(a.program_id)
  )
$$;

alter table public.workflow_templates enable row level security;
alter table public.workflow_stages enable row level security;
alter table public.activities enable row level security;
alter table public.activity_stage_progress enable row level security;
alter table public.activity_stage_transitions enable row level security;
alter table public.activity_tasks enable row level security;
alter table public.activity_beneficiaries enable row level security;

-- Templates: read DA-wide + own programs; write via RPCs (save/create/set default),
-- plus rename/archive by managers.
revoke insert, delete on public.workflow_templates from authenticated;
revoke update on public.workflow_templates from authenticated;
grant update (name, description, is_active) on public.workflow_templates to authenticated;
revoke insert, update, delete on public.workflow_stages from authenticated;

create policy "workflow_templates: read" on public.workflow_templates
  for select to authenticated
  using (
    case when program_id is null then (select public.current_user_role()) is not null
         else public.has_program_access(program_id) end
  );
create policy "workflow_templates: manage" on public.workflow_templates
  for update to authenticated
  using (case when program_id is null then (select public.is_superadmin()) else public.can_manage_program(program_id) end)
  with check (case when program_id is null then (select public.is_superadmin()) else public.can_manage_program(program_id) end);

create policy "workflow_stages: read" on public.workflow_stages
  for select to authenticated
  using (exists (select 1 from public.workflow_templates t where t.id = template_id));

-- Activities
revoke delete on public.activities from authenticated;
revoke update on public.activities from authenticated;
grant update (
  title, description, category_id, objectives, target_output, target_outcome, target_quantity, unit_id,
  province_id, municipality_id, barangay_id, venue, start_date, end_date, due_date, delivery_date,
  responsible_user_id, responsible_unit, budget_amount, fund_source_id, remarks, deleted_at
) on public.activities to authenticated;

create policy "activities: read" on public.activities
  for select to authenticated
  using (
    public.has_program_access(program_id)
    and (deleted_at is null or public.can_manage_program(program_id))
  );
create policy "activities: insert" on public.activities
  for insert to authenticated
  with check (public.can_write_program(program_id) and status = 'not_started' and deleted_at is null);
create policy "activities: update" on public.activities
  for update to authenticated
  using (public.can_write_program(program_id))
  with check (public.can_write_program(program_id));

-- Stage snapshot: read by program; status changes only via activity_stage_action().
revoke insert, delete on public.activity_stage_progress from authenticated;
revoke update on public.activity_stage_progress from authenticated;
grant update (assigned_to, notes, planned_start, planned_end) on public.activity_stage_progress to authenticated;

create policy "activity_stage_progress: read" on public.activity_stage_progress
  for select to authenticated using (public.has_program_access(program_id));
create policy "activity_stage_progress: plan" on public.activity_stage_progress
  for update to authenticated
  using (public.can_edit_activity(activity_id))
  with check (public.can_edit_activity(activity_id));

revoke insert, update, delete on public.activity_stage_transitions from authenticated;
create policy "activity_stage_transitions: read" on public.activity_stage_transitions
  for select to authenticated using (public.has_program_access(program_id));

create policy "activity_tasks: read" on public.activity_tasks
  for select to authenticated using (public.has_program_access(program_id));
create policy "activity_tasks: insert" on public.activity_tasks
  for insert to authenticated with check (public.can_edit_activity(activity_id) and not is_auto);
create policy "activity_tasks: update" on public.activity_tasks
  for update to authenticated
  using (public.can_edit_activity(activity_id)) with check (public.can_edit_activity(activity_id));
create policy "activity_tasks: delete" on public.activity_tasks
  for delete to authenticated using (public.can_edit_activity(activity_id) and not is_auto);
revoke update on public.activity_tasks from authenticated;
grant update (title, is_done, due_date, assigned_to, sort_order, stage_progress_id) on public.activity_tasks to authenticated;

create or replace function public.stamp_task_done()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_done is distinct from old.is_done then
    new.done_by := case when new.is_done then (select auth.uid()) else null end;
    new.done_at := case when new.is_done then now() else null end;
  end if;
  return new;
end;
$$;
create trigger stamp_task_done before update of is_done on public.activity_tasks
  for each row execute function public.stamp_task_done();

revoke update on public.activity_beneficiaries from authenticated;
grant update (participants, quantity, unit_id, amount, remarks) on public.activity_beneficiaries to authenticated;

create policy "activity_beneficiaries: read" on public.activity_beneficiaries
  for select to authenticated using (public.has_program_access(program_id));
create policy "activity_beneficiaries: insert" on public.activity_beneficiaries
  for insert to authenticated with check (public.can_edit_activity(activity_id));
create policy "activity_beneficiaries: update" on public.activity_beneficiaries
  for update to authenticated
  using (public.can_edit_activity(activity_id)) with check (public.can_edit_activity(activity_id));
create policy "activity_beneficiaries: delete" on public.activity_beneficiaries
  for delete to authenticated using (public.can_edit_activity(activity_id));

select public.enable_audit('public.activities');
select public.enable_audit('public.activity_stage_progress');
select public.enable_audit('public.activity_tasks');
select public.enable_audit('public.activity_beneficiaries');

-- ---------------------------------------------------------------------------
-- Stage actions
-- ---------------------------------------------------------------------------
-- Activity fields (and 'beneficiaries') required by a stage that are still empty.
create or replace function public.activity_missing_fields(p_activity_id uuid, p_fields text[])
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
  select to_jsonb(a) into v_row from public.activities a where a.id = p_activity_id;
  foreach f in array coalesce(p_fields, '{}') loop
    if f = 'beneficiaries' then
      if not exists (select 1 from public.activity_beneficiaries where activity_id = p_activity_id) then
        v_missing := v_missing || f;
      end if;
    elsif nullif(trim(coalesce(v_row ->> f, '')), '') is null then
      v_missing := v_missing || f;
    end if;
  end loop;
  return v_missing;
end;
$$;

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
  v_stage    public.activity_stage_progress;
  v_act      public.activities;
  v_current  uuid;
  v_next     uuid;
  v_date     date := coalesce(p_date, public.today_ph());
  v_missing  text[];
  v_open     integer;
  v_from     text;
begin
  select * into v_stage from public.activity_stage_progress where id = p_stage_id for update;
  if v_stage.id is null then
    raise exception 'Stage not found' using errcode = 'P0002';
  end if;
  select * into v_act from public.activities where id = v_stage.activity_id for update;

  if not public.can_write_program(v_act.program_id) or v_act.deleted_at is not null then
    raise exception 'You are not allowed to update this activity' using errcode = '42501';
  end if;
  perform public.assert_fiscal_year_writable(v_act.fiscal_year_id, v_act.program_id);
  if v_act.status = 'cancelled' then
    raise exception 'This activity is cancelled' using errcode = '42501';
  end if;
  if v_date > public.today_ph() then
    raise exception 'The date cannot be in the future' using errcode = '22023';
  end if;

  -- Current = first top-level stage not yet completed/skipped.
  select id into v_current from public.activity_stage_progress
  where activity_id = v_act.id and parent_id is null and status in ('pending', 'in_progress')
  order by sort_order limit 1;

  v_from := v_stage.status;

  if p_action in ('start', 'complete', 'skip') then
    if v_stage.status in ('completed', 'skipped') then
      raise exception 'This stage is already %', v_stage.status using errcode = '22023';
    end if;
    if coalesce(v_stage.parent_id, v_stage.id) is distinct from v_current then
      raise exception 'Finish the earlier stages first' using errcode = '22023';
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
    v_missing := public.activity_missing_fields(v_act.id, v_stage.required_fields);
    if array_length(v_missing, 1) > 0 then
      raise exception 'Fill in these activity fields first: %', array_to_string(v_missing, ', ')
        using errcode = '23514';
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

    update public.activity_stage_progress
    set status = 'completed', actual_start = coalesce(actual_start, v_date), actual_end = v_date,
        completed_by = (select auth.uid()), completed_at = now()
    where id = v_stage.id returning * into v_stage;

  elsif p_action = 'skip' then
    if not v_stage.skippable then
      raise exception 'This stage cannot be skipped' using errcode = '22023';
    end if;
    if nullif(trim(coalesce(p_note, '')), '') is null then
      raise exception 'Give a reason for skipping' using errcode = '22023';
    end if;
    update public.activity_stage_progress
    set status = 'skipped', actual_end = v_date, completed_by = (select auth.uid()), completed_at = now()
    where id = v_stage.id or (parent_id = v_stage.id and status in ('pending', 'in_progress'))
    ;
    select * into v_stage from public.activity_stage_progress where id = p_stage_id;

  elsif p_action = 'reopen' then
    if not public.can_manage_program(v_act.program_id) then
      raise exception 'Only program admins can move an activity back' using errcode = '42501';
    end if;
    if v_stage.parent_id is not null or v_stage.status not in ('completed', 'skipped') then
      raise exception 'Only a finished main stage can be reopened' using errcode = '22023';
    end if;
    if nullif(trim(coalesce(p_note, '')), '') is null then
      raise exception 'Give a reason for moving back' using errcode = '22023';
    end if;
    -- Later stages (and their sub-steps) return to pending.
    update public.activity_stage_progress sp
    set status = 'pending', actual_start = null, actual_end = null, completed_by = null, completed_at = null
    where sp.activity_id = v_act.id
      and coalesce((select p.sort_order from public.activity_stage_progress p where p.id = sp.parent_id), sp.sort_order)
          > v_stage.sort_order;
    update public.activity_stage_progress
    set status = 'in_progress', actual_end = null, completed_by = null, completed_at = null
    where id = v_stage.id returning * into v_stage;
    update public.activities set status = 'ongoing', completed_at = null where id = v_act.id;

  else
    raise exception 'Unknown action %', p_action using errcode = '22023';
  end if;

  -- Advance the activity pointer after a main stage finishes.
  if p_action in ('complete', 'skip') and v_stage.parent_id is null then
    select id into v_next from public.activity_stage_progress
    where activity_id = v_act.id and parent_id is null and status in ('pending', 'in_progress')
    order by sort_order limit 1;
    if v_next is not null then
      update public.activity_stage_progress
      set status = 'in_progress', actual_start = coalesce(actual_start, v_date)
      where id = v_next and status = 'pending';
    end if;
    update public.activities
    set current_stage_id = v_next,
        status = case when v_next is null then 'completed' else 'ongoing' end,
        completed_at = case when v_next is null then now() else null end
    where id = v_act.id;
  elsif p_action = 'reopen' then
    update public.activities set current_stage_id = v_stage.id where id = v_act.id;
  elsif v_act.status = 'not_started' then
    update public.activities set status = 'ongoing' where id = v_act.id;
  end if;

  insert into public.activity_stage_transitions
    (activity_id, program_id, stage_id, stage_name, action, from_status, to_status, note, effective_date)
  values
    (v_act.id, v_act.program_id, v_stage.id, v_stage.name, p_action, v_from, v_stage.status,
     nullif(trim(coalesce(p_note, '')), ''), v_date);

  return v_stage;
end;
$$;

-- Cancel / restore an activity (Phase 8 routes cancellations through approvals).
create or replace function public.set_activity_cancelled(p_activity_id uuid, p_cancelled boolean, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_act public.activities;
  v_name text;
begin
  select * into v_act from public.activities where id = p_activity_id for update;
  if v_act.id is null or not public.can_manage_program(v_act.program_id) then
    raise exception 'Only program admins can cancel or restore activities' using errcode = '42501';
  end if;
  perform public.assert_fiscal_year_writable(v_act.fiscal_year_id, v_act.program_id);
  if p_cancelled and nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'Give a reason for cancelling' using errcode = '22023';
  end if;

  update public.activities
  set status = case
        when p_cancelled then 'cancelled'
        when current_stage_id is null then 'completed'
        when exists (select 1 from public.activity_stage_progress s
                     where s.activity_id = p_activity_id and s.status <> 'pending') then 'ongoing'
        else 'not_started' end,
      cancelled_reason = case when p_cancelled then trim(p_reason) else null end
  where id = p_activity_id;

  select name into v_name from public.activity_stage_progress where id = v_act.current_stage_id;
  insert into public.activity_stage_transitions
    (activity_id, program_id, stage_id, stage_name, action, note, effective_date)
  values (p_activity_id, v_act.program_id, v_act.current_stage_id, coalesce(v_name, 'Activity'),
          case when p_cancelled then 'cancel' else 'uncancel' end, nullif(trim(coalesce(p_reason, '')), ''),
          public.today_ph());
end;
$$;

-- Re-apply a (changed or different) workflow to an existing activity. Stages whose
-- names match finished stages keep their status and dates; manual tasks are kept.
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
    where t.id = p_template_id and t.is_active and (t.program_id is null or t.program_id = v_act.program_id)
  ) then
    raise exception 'That workflow does not belong to this program' using errcode = '23514';
  end if;

  drop table if exists _old_stages;
  drop table if exists _old_done_docs;
  create temporary table _old_stages on commit drop as
  select lower(s.name) as key, lower(p.name) as parent_key, s.status, s.actual_start, s.actual_end,
         s.completed_by, s.completed_at, s.assigned_to, s.notes
  from public.activity_stage_progress s
  left join public.activity_stage_progress p on p.id = s.parent_id
  where s.activity_id = p_activity_id;

  create temporary table _old_done_docs on commit drop as
  select distinct doc_type_code from public.activity_tasks
  where activity_id = p_activity_id and is_auto and is_done and doc_type_code is not null;

  update public.activities set current_stage_id = null where id = p_activity_id;
  delete from public.activity_tasks where activity_id = p_activity_id and is_auto;
  delete from public.activity_stage_progress where activity_id = p_activity_id;

  perform public.instantiate_activity_workflow(p_activity_id, p_template_id);

  update public.activity_stage_progress s
  set status = o.status, actual_start = o.actual_start, actual_end = o.actual_end,
      completed_by = o.completed_by, completed_at = o.completed_at,
      assigned_to = o.assigned_to, notes = o.notes
  from _old_stages o
  where s.activity_id = p_activity_id
    and lower(s.name) = o.key
    and coalesce((select lower(p.name) from public.activity_stage_progress p where p.id = s.parent_id), '')
        = coalesce(o.parent_key, '');

  update public.activity_tasks t set is_done = true, done_at = now()
  where t.activity_id = p_activity_id and t.is_auto
    and t.doc_type_code in (select doc_type_code from _old_done_docs);

  select id into v_first from public.activity_stage_progress
  where activity_id = p_activity_id and parent_id is null and status in ('pending', 'in_progress')
  order by sort_order limit 1;
  update public.activities
  set current_stage_id = v_first,
      status = case when status = 'cancelled' then 'cancelled'
                    when v_first is null then 'completed'
                    when exists (select 1 from public.activity_stage_progress
                                 where activity_id = p_activity_id and status <> 'pending') then 'ongoing'
                    else 'not_started' end
  where id = p_activity_id;

  insert into public.activity_stage_transitions (activity_id, program_id, stage_name, action, note, effective_date)
  select p_activity_id, v_act.program_id, 'Workflow', 'migrate',
         'Switched to workflow: ' || t.name, public.today_ph()
  from public.workflow_templates t where t.id = p_template_id;
end;
$$;

-- Attaching a document of a required type ticks the matching checklist item.
create or replace function public.tick_document_tasks()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'ready' and new.entity_type = 'activity' and new.document_type_id is not null then
    update public.activity_tasks t
    set is_done = true, done_by = new.uploaded_by, done_at = now()
    from public.document_types d
    where d.id = new.document_type_id
      and t.activity_id = new.entity_id
      and t.doc_type_code = d.code
      and not t.is_done;
  end if;
  return null;
end;
$$;

create trigger tick_document_tasks after insert or update of status, document_type_id on public.attachments
  for each row execute function public.tick_document_tasks();

-- Uploads to an activity must target that activity's program.
create or replace function public.can_upload_attachment(
  p_program_id uuid,
  p_entity_type text,
  p_entity_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when public.current_user_role() is null then false
    when p_entity_type = 'profile' then p_program_id is null and p_entity_id = (select auth.uid())
    when p_entity_type = 'activity' then exists (
      select 1 from public.activities a
      where a.id = p_entity_id and a.program_id = p_program_id and a.deleted_at is null
    ) and public.can_write_program(p_program_id)
    when p_program_id is null then public.is_superadmin()
    else public.can_write_program(p_program_id)
  end
$$;

-- ---------------------------------------------------------------------------
-- Workflow template management RPCs
-- ---------------------------------------------------------------------------
create or replace function public.can_manage_workflow(p_program_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case when p_program_id is null then public.is_superadmin() else public.can_manage_program(p_program_id) end
$$;

-- New template: a copy of p_copy_from (or the DA-wide default) for a program (or DA-wide).
create or replace function public.create_workflow_template(p_program_id uuid, p_name text, p_copy_from uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source uuid := coalesce(p_copy_from, public.resolve_workflow_template(null));
  v_id uuid;
  s record;
  v_parent uuid;
begin
  if not public.can_manage_workflow(p_program_id) then
    raise exception 'You cannot manage workflows here' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.workflow_templates t
    where t.id = v_source and (t.program_id is null or t.program_id = p_program_id)
  ) then
    raise exception 'Source workflow not found' using errcode = 'P0002';
  end if;

  insert into public.workflow_templates (program_id, name, description, copied_from_id, is_default)
  select p_program_id, trim(p_name), t.description, t.id,
         not exists (select 1 from public.workflow_templates d
                     where d.is_default and d.is_active and d.program_id is not distinct from p_program_id)
  from public.workflow_templates t where t.id = v_source
  returning id into v_id;

  for s in select * from public.workflow_stages where template_id = v_source and parent_id is null order by sort_order loop
    insert into public.workflow_stages (template_id, sort_order, name, description, phase_key, responsible_role,
                                        expected_days, required_documents, required_fields, skippable)
    values (v_id, s.sort_order, s.name, s.description, s.phase_key, s.responsible_role,
            s.expected_days, s.required_documents, s.required_fields, s.skippable)
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

-- Replace a template's stages. p_stages:
-- [{ name, description, phase_key, responsible_role, expected_days, required_documents[],
--    required_fields[], skippable, substeps: [ ...same keys... ] }]
-- Existing activities keep their snapshot (template_stage_id becomes null).
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
  v_program uuid;
  s jsonb;
  c jsonb;
  i integer := 0;
  j integer;
  v_parent uuid;
begin
  select program_id into v_program from public.workflow_templates where id = p_template_id;
  if not found then
    raise exception 'Workflow not found' using errcode = 'P0002';
  end if;
  if not public.can_manage_workflow(v_program) then
    raise exception 'You cannot manage this workflow' using errcode = '42501';
  end if;
  if jsonb_typeof(p_stages) <> 'array' or jsonb_array_length(p_stages) = 0 then
    raise exception 'A workflow needs at least one stage' using errcode = '22023';
  end if;

  update public.workflow_templates
  set name = trim(p_name), description = nullif(trim(coalesce(p_description, '')), '')
  where id = p_template_id;

  delete from public.workflow_stages where template_id = p_template_id;

  for s in select value from jsonb_array_elements(p_stages) loop
    i := i + 1;
    insert into public.workflow_stages (template_id, sort_order, name, description, phase_key, responsible_role,
                                        expected_days, required_documents, required_fields, skippable)
    values (
      p_template_id, i, trim(s ->> 'name'), nullif(trim(coalesce(s ->> 'description', '')), ''),
      coalesce(nullif(s ->> 'phase_key', ''), 'other'),
      nullif(s ->> 'responsible_role', '')::public.app_role,
      coalesce((s ->> 'expected_days')::integer, 0),
      coalesce(array(select jsonb_array_elements_text(s -> 'required_documents')), '{}'),
      coalesce(array(select jsonb_array_elements_text(s -> 'required_fields')), '{}'),
      coalesce((s ->> 'skippable')::boolean, false)
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
  v_program uuid;
begin
  select program_id into v_program from public.workflow_templates where id = p_template_id and is_active;
  if not found then
    raise exception 'Workflow not found or archived' using errcode = 'P0002';
  end if;
  if not public.can_manage_workflow(v_program) then
    raise exception 'You cannot manage this workflow' using errcode = '42501';
  end if;
  update public.workflow_templates set is_default = false
  where is_default and program_id is not distinct from v_program and id <> p_template_id;
  update public.workflow_templates set is_default = true where id = p_template_id;
end;
$$;

-- The DA-wide default cannot be archived; archiving a program default clears it.
create or replace function public.guard_workflow_template()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not new.is_active and old.is_active then
    if old.program_id is null and old.is_default then
      raise exception 'The DA-wide default workflow cannot be archived' using errcode = '22023';
    end if;
    new.is_default := false;
  end if;
  return new;
end;
$$;
create trigger guard_workflow_template before update on public.workflow_templates
  for each row execute function public.guard_workflow_template();

-- ---------------------------------------------------------------------------
-- Read model: delay/overdue computed at query time (RLS of base tables applies).
-- ---------------------------------------------------------------------------
create view public.v_activities with (security_invoker = true) as
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
  coalesce(ab.participants, 0) as participants_total
from public.activities a
left join public.activity_stage_progress s on s.id = a.current_stage_id
left join lateral (
  select count(*) filter (where x.status in ('completed', 'skipped')) as done, count(*) as total
  from public.activity_stage_progress x where x.activity_id = a.id and x.parent_id is null
) st on true
left join lateral (
  select count(*) as n, sum(y.participants) as participants
  from public.activity_beneficiaries y where y.activity_id = a.id
) ab on true;

grant select on public.v_activities to authenticated;

-- History of an activity and its child records (audit + transitions), for members.
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
      or (l.table_name in ('activity_stage_progress', 'activity_tasks', 'activity_beneficiaries')
          and (l.new_data ->> 'activity_id' = p_activity_id::text or l.old_data ->> 'activity_id' = p_activity_id::text))
    )
  order by l.occurred_at desc
  limit 500
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.activity_stage_action(uuid, text, text, date)',
    'public.set_activity_cancelled(uuid, boolean, text)',
    'public.apply_workflow_to_activity(uuid, uuid)',
    'public.create_workflow_template(uuid, text, uuid)',
    'public.save_workflow_template(uuid, text, text, jsonb)',
    'public.set_default_workflow_template(uuid)',
    'public.activity_history(uuid)',
    'public.activity_missing_fields(uuid, text[])',
    'public.can_edit_activity(uuid)',
    'public.can_manage_workflow(uuid)',
    'public.resolve_workflow_template(uuid)',
    'public.today_ph()'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  foreach f in array array[
    'public.instantiate_activity_workflow(uuid, uuid)',
    'public.plan_activity_stages(uuid)',
    'public.assign_activity_code()',
    'public.on_activity_created()',
    'public.on_activity_start_changed()',
    'public.inherit_activity_program()',
    'public.tick_document_tasks()'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end;
$$;
