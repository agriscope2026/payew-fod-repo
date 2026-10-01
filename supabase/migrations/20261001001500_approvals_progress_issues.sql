-- =============================================================================
-- PAYEW · Phase 8 · Approvals, progress updates, issues & risks
--
-- approval_requests: cancellation, extension, stage_skip, workflow_change,
--   supplier_reaward, contract_variation, obligation_exception, realignment.
--   Staff requests are decided by program admins (or the superadmin); program
--   admin requests by the superadmin; nobody decides their own. Approving
--   applies the change at once (same RPCs as direct actions).
-- Gates: extending a started activity/package needs approval for non-admins;
--   Settings → approvals.admin_actions_need_superadmin routes program admins'
--   cancellations, re-awards, contract changes, extensions, workflow changes
--   and realignments through the superadmin too.
-- =============================================================================

insert into public.app_settings (key, value, description) values
  ('approvals', '{"admin_actions_need_superadmin": false, "reminder_days": 3, "progress_update_days": 30}',
   'Approval routing and monitoring reminders')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Approval requests
-- ---------------------------------------------------------------------------
create table public.approval_requests (
  id              uuid primary key default gen_random_uuid(),
  program_id      uuid not null references public.programs (id) on delete cascade,
  fiscal_year_id  uuid not null references public.fiscal_years (id) on delete restrict,
  request_type    text not null check (request_type in (
                    'cancellation', 'extension', 'stage_skip', 'workflow_change', 'supplier_reaward',
                    'contract_variation', 'obligation_exception', 'realignment')),
  entity_type     text not null check (entity_type in ('activity', 'package', 'delivery', 'program')),
  entity_id       uuid not null,
  activity_id     uuid references public.activities (id) on delete cascade,
  package_id      uuid references public.procurement_packages (id) on delete cascade,
  title           text not null check (length(trim(title)) between 3 and 250),
  justification   text not null check (length(trim(justification)) between 3 and 4000),
  payload         jsonb not null default '{}'::jsonb,
  status          text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'withdrawn')),
  requested_by    uuid references public.profiles (id) on delete set null,
  requested_at    timestamptz not null default now(),
  decided_by      uuid references public.profiles (id) on delete set null,
  decided_at      timestamptz,
  decision_note   text check (decision_note is null or length(decision_note) <= 2000),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index approval_requests_program_idx on public.approval_requests (program_id, status);
create index approval_requests_entity_idx on public.approval_requests (entity_type, entity_id);
create index approval_requests_activity_idx on public.approval_requests (activity_id);
create index approval_requests_requester_idx on public.approval_requests (requested_by, status);
-- One pending request per kind per record (program-level realignments can stack).
create unique index approval_requests_one_pending_idx
  on public.approval_requests (request_type, entity_id) where status = 'pending' and request_type <> 'realignment';
create trigger set_updated_at before update on public.approval_requests
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Gates
-- ---------------------------------------------------------------------------
create or replace function public.applying_approval()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(current_setting('payew.approval_apply', true), '') = 'on'
$$;

-- Program admins' high-impact actions need the superadmin when the setting is on.
create or replace function public.admin_action_needs_approval(p_program_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
     and not public.applying_approval()
     and not public.is_superadmin()
     and coalesce((select (value ->> 'admin_actions_need_superadmin')::boolean
                   from public.app_settings where key = 'approvals'), false)
$$;

create or replace function public.approval_gate_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or public.applying_approval() then
    return new;
  end if;
  -- Extending a started activity
  if old.due_date is not null and new.due_date > old.due_date and old.status = 'ongoing' then
    if not public.can_manage_program(old.program_id) then
      raise exception 'Extending the due date of an ongoing activity needs approval: use "Request extension"' using errcode = '42501';
    end if;
    if public.admin_action_needs_approval(old.program_id) then
      raise exception 'Extensions need superadmin approval: submit a request' using errcode = '42501';
    end if;
  end if;
  if new.status = 'cancelled' and old.status <> 'cancelled' and public.admin_action_needs_approval(old.program_id) then
    raise exception 'Cancelling needs superadmin approval: submit a request' using errcode = '42501';
  end if;
  if new.workflow_template_id is distinct from old.workflow_template_id and old.workflow_template_id is not null
     and public.admin_action_needs_approval(old.program_id) then
    raise exception 'Changing the workflow needs superadmin approval: submit a request' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger approval_gate_activity before update on public.activities
  for each row execute function public.approval_gate_activity();

create or replace function public.approval_gate_package()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or public.applying_approval() then
    return new;
  end if;
  if old.due_date is not null and new.due_date > old.due_date and old.status = 'ongoing' then
    if not public.can_manage_program(old.program_id) then
      raise exception 'Extending the target date of an ongoing package needs approval: use "Request extension"' using errcode = '42501';
    end if;
    if public.admin_action_needs_approval(old.program_id) then
      raise exception 'Extensions need superadmin approval: submit a request' using errcode = '42501';
    end if;
  end if;
  if public.admin_action_needs_approval(old.program_id) and (
       -- split/merge cancel the originals as part of an allowed restructuring
       (new.status = 'cancelled' and old.status <> 'cancelled'
        and coalesce(new.cancelled_reason, '') <> 'Merged' and coalesce(new.cancelled_reason, '') not like 'Split%')
    or (old.supplier_id is not null and new.supplier_id is distinct from old.supplier_id)
    or (old.supplier_id is not null and new.supplier_id = old.supplier_id
        and new.contract_amount is distinct from old.contract_amount)
    or (new.workflow_template_id is distinct from old.workflow_template_id and old.workflow_template_id is not null)
  ) then
    raise exception 'This change needs superadmin approval: submit a request' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger approval_gate_package before update on public.procurement_packages
  for each row execute function public.approval_gate_package();

create or replace function public.approval_gate_allotment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind in ('realignment', 'reversion') and public.admin_action_needs_approval(new.program_id) then
    raise exception 'Realignments need superadmin approval: submit a request' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger approval_gate_allotment before insert or update on public.allotments
  for each row execute function public.approval_gate_allotment();

-- ---------------------------------------------------------------------------
-- Who may decide
-- ---------------------------------------------------------------------------
create or replace function public.can_decide_approval(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.approval_requests r
    left join public.profiles rq on rq.id = r.requested_by
    where r.id = p_id and r.status = 'pending'
      and r.requested_by is distinct from (select auth.uid())
      and case
            when rq.role in ('program_admin', 'superadmin') then public.is_superadmin()
            else public.can_manage_program(r.program_id)
          end
  )
$$;

-- Approvers to notify for a request.
create or replace function public.approval_deciders(p_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id from public.approval_requests r
  left join public.profiles rq on rq.id = r.requested_by
  join public.profiles p on p.is_active and p.deleted_at is null and p.id is distinct from r.requested_by
  where r.id = p_id
    and case
          when rq.role in ('program_admin', 'superadmin') then p.role = 'superadmin'
          else p.id in (select public.program_managers(r.program_id))
        end
$$;

-- ---------------------------------------------------------------------------
-- Submit / withdraw / decide
-- ---------------------------------------------------------------------------
-- p_entity_type/p_entity_id: activity | package | delivery | program (realignment: program id)
-- p_payload by type:
--   extension         {new_due_date, new_end_date?}
--   stage_skip        {stage_id}
--   workflow_change   {template_id}
--   supplier_reaward  {supplier_id, contract_amount, award_date?, contract_no?}
--   contract_variation{contract_amount}
--   realignment       {scope: 'allotment', from_expense_class_id, to_expense_class_id, amount, savings_entry_id?}
--                   | {scope: 'activity_budget', from_activity_id, to_activity_id, amount}
create or replace function public.submit_approval(
  p_type text,
  p_entity_type text,
  p_entity_id uuid,
  p_justification text,
  p_payload jsonb default '{}'::jsonb,
  p_fiscal_year_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_act    public.activities;
  v_pkg    public.procurement_packages;
  v_dl     public.package_deliveries;
  v_stage  public.activity_stage_progress;
  v_prog   uuid;
  v_fy     uuid;
  v_title  text;
  v_id     uuid;
  v_amt    numeric;
  v_block  text;
begin
  if nullif(trim(coalesce(p_justification, '')), '') is null then
    raise exception 'Give the justification' using errcode = '22023';
  end if;

  if p_entity_type = 'activity' then
    select * into v_act from public.activities where id = p_entity_id and deleted_at is null;
    if v_act.id is null then raise exception 'Activity not found' using errcode = 'P0002'; end if;
    v_prog := v_act.program_id; v_fy := v_act.fiscal_year_id;
  elsif p_entity_type = 'package' then
    select * into v_pkg from public.procurement_packages where id = p_entity_id and deleted_at is null;
    if v_pkg.id is null then raise exception 'Package not found' using errcode = 'P0002'; end if;
    select * into v_act from public.activities where id = v_pkg.activity_id;
    v_prog := v_pkg.program_id; v_fy := v_pkg.fiscal_year_id;
  elsif p_entity_type = 'delivery' then
    select * into v_dl from public.package_deliveries where id = p_entity_id;
    if v_dl.id is null then raise exception 'Delivery not found' using errcode = 'P0002'; end if;
    select * into v_pkg from public.procurement_packages where id = v_dl.package_id;
    select * into v_act from public.activities where id = v_dl.activity_id;
    v_prog := v_dl.program_id; v_fy := v_dl.fiscal_year_id;
  elsif p_entity_type = 'program' then
    v_prog := p_entity_id; v_fy := p_fiscal_year_id;
    if v_fy is null then raise exception 'Choose the fiscal year' using errcode = '22023'; end if;
  else
    raise exception 'Unknown record type %', p_entity_type using errcode = '22023';
  end if;

  if not public.can_write_program(v_prog) then
    raise exception 'You cannot submit requests for this program' using errcode = '42501';
  end if;
  perform public.assert_fiscal_year_writable(v_fy, v_prog);

  case p_type
  when 'cancellation' then
    if p_entity_type = 'activity' then
      if v_act.status in ('cancelled', 'completed') then raise exception 'This activity is already %', v_act.status using errcode = '22023'; end if;
      v_title := 'Cancel activity ' || v_act.code;
    elsif p_entity_type = 'package' then
      if v_pkg.status in ('cancelled', 'closed') then raise exception 'This package is already %', v_pkg.status using errcode = '22023'; end if;
      v_title := 'Cancel package ' || v_pkg.code;
    else raise exception 'Cancellation applies to activities and packages' using errcode = '22023';
    end if;
  when 'extension' then
    if (p_payload ->> 'new_due_date') is null then raise exception 'Give the new due date' using errcode = '22023'; end if;
    if p_entity_type = 'activity' then
      if (p_payload ->> 'new_due_date')::date <= coalesce(v_act.due_date, '-infinity') then
        raise exception 'The new due date must be later than the current one' using errcode = '22023';
      end if;
      v_title := 'Extend ' || v_act.code || ' to ' || to_char((p_payload ->> 'new_due_date')::date, 'FMMon FMDD, YYYY');
    elsif p_entity_type = 'package' then
      if (p_payload ->> 'new_due_date')::date <= coalesce(v_pkg.due_date, '-infinity') then
        raise exception 'The new target date must be later than the current one' using errcode = '22023';
      end if;
      v_title := 'Extend ' || v_pkg.code || ' to ' || to_char((p_payload ->> 'new_due_date')::date, 'FMMon FMDD, YYYY');
    else raise exception 'Extensions apply to activities and packages' using errcode = '22023';
    end if;
  when 'stage_skip' then
    select * into v_stage from public.activity_stage_progress where id = (p_payload ->> 'stage_id')::uuid;
    if v_stage.id is null or v_stage.activity_id <> v_act.id
       or v_stage.package_id is distinct from v_pkg.id then
      raise exception 'That stage is not part of this record' using errcode = '22023';
    end if;
    if v_stage.status in ('completed', 'skipped') then raise exception 'That stage is already finished' using errcode = '22023'; end if;
    v_title := 'Skip "' || v_stage.name || '" on ' || coalesce(v_pkg.code, v_act.code);
  when 'workflow_change' then
    if not exists (select 1 from public.workflow_templates t
                   where t.id = (p_payload ->> 'template_id')::uuid and t.is_active
                     and t.scope = case when p_entity_type = 'package' then 'package' else 'activity' end
                     and (t.program_id is null or t.program_id = v_prog)) then
      raise exception 'Choose a workflow of this program' using errcode = '22023';
    end if;
    v_title := 'Switch ' || coalesce(v_pkg.code, v_act.code) || ' to "'
               || (select name from public.workflow_templates where id = (p_payload ->> 'template_id')::uuid) || '"';
  when 'supplier_reaward' then
    if v_pkg.id is null or v_pkg.supplier_id is null then raise exception 'Only awarded packages can be re-awarded' using errcode = '22023'; end if;
    if (p_payload ->> 'supplier_id')::uuid = v_pkg.supplier_id then raise exception 'Choose a different supplier' using errcode = '22023'; end if;
    if coalesce((p_payload ->> 'contract_amount')::numeric, 0) <= 0 then raise exception 'Give the new contract amount' using errcode = '22023'; end if;
    select string_agg(c ->> 'message', '; ') into v_block
    from jsonb_array_elements(public.supplier_award_check((p_payload ->> 'supplier_id')::uuid)) c where c ->> 'level' = 'block';
    if v_block is not null then raise exception 'Cannot award: %', v_block using errcode = '23514'; end if;
    v_title := 'Re-award ' || v_pkg.code || ' to ' || (select business_name from public.suppliers where id = (p_payload ->> 'supplier_id')::uuid);
  when 'contract_variation' then
    if v_pkg.id is null or v_pkg.supplier_id is null then raise exception 'Only awarded packages have a contract' using errcode = '22023'; end if;
    v_amt := (p_payload ->> 'contract_amount')::numeric;
    if v_amt is null or v_amt < 0 or v_amt = v_pkg.contract_amount then raise exception 'Give a different contract amount' using errcode = '22023'; end if;
    v_title := 'Change ' || v_pkg.code || ' contract from ' || public.peso(v_pkg.contract_amount) || ' to ' || public.peso(v_amt);
  when 'obligation_exception' then
    if v_dl.id is null then raise exception 'Obligation exceptions are about a delivery' using errcode = '22023'; end if;
    v_title := 'Delivery ' || v_dl.delivery_no || ' of ' || v_pkg.code || ' before its ORS';
  when 'realignment' then
    v_amt := (p_payload ->> 'amount')::numeric;
    if v_amt is null or v_amt <= 0 then raise exception 'Give the amount to realign' using errcode = '22023'; end if;
    if p_payload ->> 'scope' = 'allotment' then
      if (p_payload ->> 'from_expense_class_id') is null or (p_payload ->> 'to_expense_class_id') is null
         or p_payload ->> 'from_expense_class_id' = p_payload ->> 'to_expense_class_id' then
        raise exception 'Choose two different expense classes' using errcode = '22023';
      end if;
      v_title := 'Realign ' || public.peso(v_amt) || ' from '
        || (select code from public.expense_classes where id = (p_payload ->> 'from_expense_class_id')::uuid) || ' to '
        || (select code from public.expense_classes where id = (p_payload ->> 'to_expense_class_id')::uuid);
    elsif p_payload ->> 'scope' = 'activity_budget' then
      if not exists (select 1 from public.activities where id = (p_payload ->> 'from_activity_id')::uuid and program_id = v_prog and fiscal_year_id = v_fy)
         or not exists (select 1 from public.activities where id = (p_payload ->> 'to_activity_id')::uuid and program_id = v_prog and fiscal_year_id = v_fy)
         or p_payload ->> 'from_activity_id' = p_payload ->> 'to_activity_id' then
        raise exception 'Choose two different activities of this program and year' using errcode = '22023';
      end if;
      v_title := 'Realign ' || public.peso(v_amt) || ' from '
        || (select code from public.activities where id = (p_payload ->> 'from_activity_id')::uuid) || ' to '
        || (select code from public.activities where id = (p_payload ->> 'to_activity_id')::uuid);
    else
      raise exception 'Realignment scope must be allotment or activity_budget' using errcode = '22023';
    end if;
  else
    raise exception 'Unknown request type %', p_type using errcode = '22023';
  end case;

  insert into public.approval_requests (program_id, fiscal_year_id, request_type, entity_type, entity_id,
    activity_id, package_id, title, justification, payload, requested_by)
  values (v_prog, v_fy, p_type, p_entity_type, p_entity_id, v_act.id, v_pkg.id, v_title, trim(p_justification),
    coalesce(p_payload, '{}'::jsonb), (select auth.uid()))
  returning id into v_id;

  perform public.deliver(u, 'approval', 'Approval needed: ' || v_title, left(trim(p_justification), 200),
                         '/approvals/' || v_id, v_prog, 'approval', v_id)
  from public.approval_deciders(v_id) u;
  return v_id;
exception when unique_violation then
  raise exception 'A request of this kind is already pending for this record' using errcode = '23505';
end;
$$;

create or replace function public.withdraw_approval(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.approval_requests set status = 'withdrawn', decided_at = now()
  where id = p_id and status = 'pending' and requested_by = (select auth.uid());
  if not found then
    raise exception 'Only your own pending requests can be withdrawn' using errcode = '42501';
  end if;
end;
$$;

-- Applies an approved request (runs as the approver, gates bypassed).
create or replace function public.apply_approval(r public.approval_requests)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  p   jsonb := r.payload;
  v_skippable boolean;
  v_amt numeric := (r.payload ->> 'amount')::numeric;
  v_ec  uuid;
begin
  case r.request_type
  when 'cancellation' then
    if r.entity_type = 'activity' then
      perform public.set_activity_cancelled(r.entity_id, true, r.justification);
    else
      perform public.set_package_cancelled(r.entity_id, true, r.justification);
    end if;
  when 'extension' then
    if r.entity_type = 'activity' then
      update public.activities
      set due_date = (p ->> 'new_due_date')::date,
          end_date = coalesce((p ->> 'new_end_date')::date, greatest(end_date, (p ->> 'new_due_date')::date))
      where id = r.entity_id;
    else
      update public.procurement_packages set due_date = (p ->> 'new_due_date')::date where id = r.entity_id;
    end if;
  when 'stage_skip' then
    select skippable into v_skippable from public.activity_stage_progress where id = (p ->> 'stage_id')::uuid;
    update public.activity_stage_progress set skippable = true where id = (p ->> 'stage_id')::uuid;
    perform public.activity_stage_action((p ->> 'stage_id')::uuid, 'skip', 'Approved request: ' || r.justification);
    update public.activity_stage_progress set skippable = v_skippable where id = (p ->> 'stage_id')::uuid;
  when 'workflow_change' then
    if r.entity_type = 'activity' then
      perform public.apply_workflow_to_activity(r.entity_id, (p ->> 'template_id')::uuid);
    else
      perform public.apply_workflow_to_package(r.entity_id, (p ->> 'template_id')::uuid);
    end if;
  when 'supplier_reaward' then
    perform public.reaward_package(r.entity_id, (p ->> 'supplier_id')::uuid, (p ->> 'contract_amount')::numeric,
      r.justification, (p ->> 'award_date')::date, p ->> 'contract_no');
  when 'contract_variation' then
    perform public.award_package(r.entity_id,
      (select supplier_id from public.procurement_packages where id = r.entity_id),
      (p ->> 'contract_amount')::numeric, null, null, null, r.justification);
  when 'obligation_exception' then
    update public.package_deliveries
    set flags = array_replace(flags, 'Delivered before obligation (exception)', 'Delivered before obligation (exception approved)')
    where id = r.entity_id;
  when 'realignment' then
    if p ->> 'scope' = 'allotment' then
      insert into public.allotments (program_id, fiscal_year_id, kind, allotment_no, allotment_date, expense_class_id, amount, remarks)
      values
        (r.program_id, r.fiscal_year_id, 'realignment', 'AR-' || left(r.id::text, 8), public.today_ph(),
         (p ->> 'from_expense_class_id')::uuid, -v_amt, 'Approved realignment: ' || r.title),
        (r.program_id, r.fiscal_year_id, 'realignment', 'AR-' || left(r.id::text, 8), public.today_ph(),
         (p ->> 'to_expense_class_id')::uuid, v_amt, 'Approved realignment: ' || r.title);
      if p ? 'savings_entry_id' then
        update public.savings_entries
        set status = 'confirmed', decided_by = (select auth.uid()), decided_at = now(),
            remarks = 'Realigned via approved request: ' || r.title
        where id = (p ->> 'savings_entry_id')::uuid;
      end if;
    else
      update public.activities set budget_amount = coalesce(budget_amount, 0) - v_amt where id = (p ->> 'from_activity_id')::uuid;
      update public.activities set budget_amount = coalesce(budget_amount, 0) + v_amt where id = (p ->> 'to_activity_id')::uuid;
      if (select budget_amount from public.activities where id = (p ->> 'from_activity_id')::uuid) < 0 then
        raise exception 'The source activity does not have that much budget' using errcode = '23514';
      end if;
    end if;
  end case;
end;
$$;

create or replace function public.decide_approval(p_id uuid, p_decision text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.approval_requests;
begin
  select * into r from public.approval_requests where id = p_id for update;
  if not found then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;
  if not public.can_decide_approval(p_id) then
    raise exception 'You cannot decide this request (requests are decided by a program admin, or by the superadmin when an admin asked)'
      using errcode = '42501';
  end if;
  if p_decision not in ('approved', 'rejected') then
    raise exception 'Decision must be approved or rejected' using errcode = '22023';
  end if;
  if p_decision = 'rejected' and nullif(trim(coalesce(p_note, '')), '') is null then
    raise exception 'Give the reason for rejecting' using errcode = '22023';
  end if;

  if p_decision = 'approved' then
    perform set_config('payew.approval_apply', 'on', true);
    perform public.apply_approval(r);
    perform set_config('payew.approval_apply', '', true);
  elsif r.request_type = 'obligation_exception' then
    update public.package_deliveries
    set flags = array_replace(flags, 'Delivered before obligation (exception)', 'Delivered before obligation (exception rejected)')
    where id = r.entity_id;
  end if;

  update public.approval_requests
  set status = p_decision, decided_by = (select auth.uid()), decided_at = now(),
      decision_note = nullif(trim(coalesce(p_note, '')), '')
  where id = p_id;

  perform public.deliver(r.requested_by, 'approval',
    case when p_decision = 'approved' then 'Approved: ' else 'Rejected: ' end || r.title,
    nullif(trim(coalesce(p_note, '')), ''), '/approvals/' || r.id, r.program_id, 'approval', r.id);
end;
$$;

-- Deliveries recorded before their ORS (obligate-first packages) raise an exception request.
create or replace function public.raise_obligation_exception()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return null;
  end if;
  if 'Delivered before obligation (exception)' = any (new.flags)
     and (tg_op = 'INSERT' or not ('Delivered before obligation (exception)' = any (old.flags)))
     and not exists (select 1 from public.approval_requests
                     where request_type = 'obligation_exception' and entity_id = new.id and status in ('pending', 'approved')) then
    perform public.submit_approval('obligation_exception', 'delivery', new.id,
      coalesce(new.exception_remark, 'Delivered before the ORS was recorded'));
  end if;
  return null;
end;
$$;
create trigger raise_obligation_exception after insert or update of flags on public.package_deliveries
  for each row execute function public.raise_obligation_exception();

-- ---------------------------------------------------------------------------
-- Progress updates
-- ---------------------------------------------------------------------------
create table public.progress_updates (
  id                     uuid primary key default gen_random_uuid(),
  activity_id            uuid not null references public.activities (id) on delete cascade,
  program_id             uuid not null references public.programs (id) on delete cascade,
  fiscal_year_id         uuid not null references public.fiscal_years (id) on delete restrict,
  as_of_date             date not null,
  physical_pct           numeric(5, 2) not null check (physical_pct between 0 and 100),
  quantity_accomplished  numeric(14, 2) check (quantity_accomplished is null or quantity_accomplished >= 0),
  participants_male      integer check (participants_male is null or participants_male >= 0),
  participants_female    integer check (participants_female is null or participants_female >= 0),
  status_flag            text not null default 'on_track' check (status_flag in ('on_track', 'at_risk', 'delayed')),
  narrative              text not null check (length(trim(narrative)) between 3 and 4000),
  next_steps             text check (next_steps is null or length(next_steps) <= 2000),
  -- financial snapshot at the time of the update (from v_activity_financials)
  obligated_snapshot     numeric(16, 2),
  disbursed_snapshot     numeric(16, 2),
  created_by             uuid references public.profiles (id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index progress_updates_activity_idx on public.progress_updates (activity_id, as_of_date desc);
create trigger set_updated_at before update on public.progress_updates
  for each row execute function public.set_updated_at();

create or replace function public.prepare_progress_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_act public.activities;
begin
  select * into v_act from public.activities where id = new.activity_id and deleted_at is null;
  if v_act.id is null then raise exception 'Activity not found' using errcode = '23503'; end if;
  if tg_op = 'UPDATE' and new.activity_id <> old.activity_id then
    raise exception 'A progress update cannot move to another activity' using errcode = '42501';
  end if;
  new.program_id := v_act.program_id;
  new.fiscal_year_id := v_act.fiscal_year_id;
  perform public.assert_fiscal_year_writable(v_act.fiscal_year_id, v_act.program_id);
  if new.as_of_date > public.today_ph() then
    raise exception 'The "as of" date cannot be in the future' using errcode = '22023';
  end if;
  if tg_op = 'INSERT' then
    if (select auth.uid()) is not null then new.created_by := (select auth.uid()); end if;
    select f.obligated, f.disbursed into new.obligated_snapshot, new.disbursed_snapshot
    from public.v_activity_financials f where f.activity_id = new.activity_id;
  end if;
  return new;
end;
$$;
create trigger prepare_progress_update before insert or update on public.progress_updates
  for each row execute function public.prepare_progress_update();

-- ---------------------------------------------------------------------------
-- Issues & risks
-- ---------------------------------------------------------------------------
create table public.issues (
  id              uuid primary key default gen_random_uuid(),
  activity_id     uuid not null references public.activities (id) on delete cascade,
  package_id      uuid references public.procurement_packages (id) on delete set null,
  program_id      uuid not null references public.programs (id) on delete cascade,
  fiscal_year_id  uuid not null references public.fiscal_years (id) on delete restrict,
  kind            text not null default 'issue' check (kind in ('issue', 'risk')),
  title           text not null check (length(trim(title)) between 3 and 200),
  description     text check (description is null or length(description) <= 4000),
  category        text not null default 'other' check (category in (
                    'procurement', 'supplier', 'budget', 'weather', 'beneficiaries', 'logistics',
                    'peace_and_order', 'personnel', 'other')),
  severity        text not null default 'medium' check (severity in ('low', 'medium', 'high', 'critical')),
  likelihood      text check (likelihood is null or likelihood in ('low', 'medium', 'high')),
  status          text not null default 'open' check (status in ('open', 'mitigating', 'resolved', 'accepted', 'closed')),
  owner_id        uuid references public.profiles (id) on delete set null,
  due_date        date,
  mitigation      text check (mitigation is null or length(mitigation) <= 4000),
  resolution      text check (resolution is null or length(resolution) <= 4000),
  resolved_at     timestamptz,
  raised_by       uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (kind = 'risk' or likelihood is null),
  check (status not in ('resolved', 'closed') or resolution is not null)
);
create index issues_activity_idx on public.issues (activity_id, status);
create index issues_program_idx on public.issues (program_id, fiscal_year_id, status);
create index issues_owner_idx on public.issues (owner_id) where status in ('open', 'mitigating');
create trigger set_updated_at before update on public.issues
  for each row execute function public.set_updated_at();

create or replace function public.prepare_issue()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_act public.activities;
begin
  select * into v_act from public.activities where id = new.activity_id and deleted_at is null;
  if v_act.id is null then raise exception 'Activity not found' using errcode = '23503'; end if;
  if tg_op = 'UPDATE' and new.activity_id <> old.activity_id then
    raise exception 'An issue cannot move to another activity' using errcode = '42501';
  end if;
  if new.package_id is not null and not exists (
    select 1 from public.procurement_packages where id = new.package_id and activity_id = new.activity_id) then
    raise exception 'That package belongs to another activity' using errcode = '23514';
  end if;
  new.program_id := v_act.program_id;
  new.fiscal_year_id := v_act.fiscal_year_id;
  if tg_op = 'INSERT' and (select auth.uid()) is not null then
    new.raised_by := (select auth.uid());
  end if;
  if new.owner_id is not null and not public.user_can_access_program(new.owner_id, new.program_id) then
    raise exception 'The owner must be a member of the program' using errcode = '23514';
  end if;
  new.resolved_at := case when new.status in ('resolved', 'closed')
                          then coalesce(case when tg_op = 'UPDATE' then old.resolved_at end, now()) end;
  return new;
end;
$$;
create trigger prepare_issue before insert or update on public.issues
  for each row execute function public.prepare_issue();

create or replace function public.notify_issue()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := (select code from public.activities where id = new.activity_id);
  v_link text := '/activities/' || new.activity_id || '?tab=issues';
begin
  if new.owner_id is not null and (tg_op = 'INSERT' or new.owner_id is distinct from old.owner_id) then
    perform public.deliver(new.owner_id, 'assignment',
      'You own ' || new.kind || ': ' || new.title, v_code || ' · ' || new.severity || ' severity',
      v_link, new.program_id, 'activity', new.activity_id);
  end if;
  if new.severity in ('high', 'critical') and new.status in ('open', 'mitigating')
     and (tg_op = 'INSERT' or old.severity not in ('high', 'critical')) then
    perform public.deliver(m, 'issue',
      initcap(new.severity) || ' ' || new.kind || ' on ' || v_code || ': ' || new.title,
      left(coalesce(new.description, ''), 200), v_link, new.program_id, 'activity', new.activity_id)
    from public.program_managers(new.program_id, new.severity = 'critical') m;
  end if;
  if tg_op = 'UPDATE' and new.status is distinct from old.status and new.status in ('resolved', 'closed') then
    perform public.deliver(new.raised_by, 'issue', initcap(new.kind) || ' ' || new.status || ': ' || new.title,
      new.resolution, v_link, new.program_id, 'activity', new.activity_id);
  end if;
  return null;
end;
$$;
create trigger notify_issue after insert or update of owner_id, severity, status on public.issues
  for each row execute function public.notify_issue();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.approval_requests enable row level security;
alter table public.progress_updates enable row level security;
alter table public.issues enable row level security;

revoke insert, update, delete on public.approval_requests from authenticated;
create policy "approval_requests: read" on public.approval_requests
  for select to authenticated using (public.has_program_access(program_id));

revoke update on public.progress_updates from authenticated;
grant update (as_of_date, physical_pct, quantity_accomplished, participants_male, participants_female,
              status_flag, narrative, next_steps) on public.progress_updates to authenticated;
create policy "progress_updates: read" on public.progress_updates
  for select to authenticated using (public.has_program_access(program_id));
create policy "progress_updates: insert" on public.progress_updates
  for insert to authenticated with check (public.can_edit_activity(activity_id));
create policy "progress_updates: update own" on public.progress_updates
  for update to authenticated
  using (created_by = (select auth.uid()) or public.can_manage_program(program_id))
  with check (public.can_edit_activity(activity_id));
create policy "progress_updates: delete" on public.progress_updates
  for delete to authenticated
  using (created_by = (select auth.uid()) or public.can_manage_program(program_id));

-- Any member of the program can raise an issue; writers, the owner and the raiser can update it.
revoke update on public.issues from authenticated;
grant update (kind, title, description, category, severity, likelihood, status, owner_id, due_date,
              mitigation, resolution, package_id) on public.issues to authenticated;
create policy "issues: read" on public.issues
  for select to authenticated using (public.has_program_access(program_id));
create policy "issues: insert" on public.issues
  for insert to authenticated
  with check (exists (select 1 from public.activities a where a.id = activity_id
                      and a.deleted_at is null and public.has_program_access(a.program_id)));
create policy "issues: update" on public.issues
  for update to authenticated
  using (public.can_write_program(program_id) or owner_id = (select auth.uid()) or raised_by = (select auth.uid()))
  with check (public.has_program_access(program_id));
create policy "issues: delete" on public.issues
  for delete to authenticated using (public.can_manage_program(program_id));

select public.enable_audit('public.approval_requests');
select public.enable_audit('public.progress_updates');
select public.enable_audit('public.issues');

-- ---------------------------------------------------------------------------
-- Read models
-- ---------------------------------------------------------------------------
create view public.v_approval_requests with (security_invoker = true) as
select r.*,
       a.code as activity_code, a.title as activity_title,
       k.code as package_code, k.title as package_title,
       public.can_decide_approval(r.id) as can_decide,
       (r.status = 'pending' and r.requested_by = (select auth.uid())) as can_withdraw
from public.approval_requests r
left join public.activities a on a.id = r.activity_id
left join public.procurement_packages k on k.id = r.package_id;
grant select on public.v_approval_requests to authenticated;

create view public.v_activity_progress with (security_invoker = true) as
select distinct on (u.activity_id) u.*
from public.progress_updates u
order by u.activity_id, u.as_of_date desc, u.created_at desc;
grant select on public.v_activity_progress to authenticated;

create view public.v_issues with (security_invoker = true) as
select i.*, a.code as activity_code, a.title as activity_title, k.code as package_code,
       (i.status in ('open', 'mitigating') and i.due_date < public.today_ph()) as is_overdue,
       case i.severity when 'critical' then 4 when 'high' then 3 when 'medium' then 2 else 1 end
         * case coalesce(i.likelihood, 'medium') when 'high' then 3 when 'medium' then 2 else 1 end as risk_score
from public.issues i
join public.activities a on a.id = i.activity_id
left join public.procurement_packages k on k.id = i.package_id;
grant select on public.v_issues to authenticated;

-- ---------------------------------------------------------------------------
-- Daily monitoring reminders
-- ---------------------------------------------------------------------------
create or replace function public.mutable_notification_types()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['comment', 'mention', 'assignment', 'stage', 'stage_due', 'task_due', 'delivery', 'progress']
$$;

create or replace function public.run_monitoring_reminders(p_today date default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today   date := coalesce(p_today, public.today_ph());
  v_cfg     jsonb := coalesce((select value from public.app_settings where key = 'approvals'), '{}'::jsonb);
  v_days    integer := coalesce((v_cfg ->> 'reminder_days')::integer, 3);
  v_prog    integer := coalesce((v_cfg ->> 'progress_update_days')::integer, 30);
  v_result  jsonb := '{}'::jsonb;
  n         integer;
begin
  if (select auth.uid()) is not null and not public.is_superadmin() then
    raise exception 'Only the superadmin can run the reminder sweep' using errcode = '42501';
  end if;

  -- Pending approvals waiting N+ days: remind the deciders every N days.
  select coalesce(sum(public.deliver(u, 'approval',
           'Still waiting for your decision (' || (v_today - r.requested_at::date) || ' days): ' || r.title,
           left(r.justification, 200), '/approvals/' || r.id, r.program_id, 'approval', r.id,
           'approval_wait:' || r.id || ':' || ((v_today - r.requested_at::date) / v_days))), 0)
  into n
  from public.approval_requests r, public.approval_deciders(r.id) u
  where r.status = 'pending' and v_today - r.requested_at::date >= v_days;
  v_result := v_result || jsonb_build_object('approvals_waiting', n);

  -- Open issues past their target date: owner (or raiser) weekly; critical also to admins.
  select coalesce(sum(public.deliver(x.uid, 'issue',
           'Overdue ' || i.kind || ' (' || (v_today - i.due_date) || ' days): ' || i.title,
           (select code from public.activities where id = i.activity_id) || ' · ' || i.severity || ' severity',
           '/activities/' || i.activity_id || '?tab=issues', i.program_id, 'activity', i.activity_id,
           'issue_overdue:' || i.id || ':' || ((v_today - i.due_date) / 7))), 0)
  into n
  from public.issues i
  cross join lateral (
    select coalesce(i.owner_id, i.raised_by) as uid
    union select m from public.program_managers(i.program_id, false) m where i.severity = 'critical'
  ) x
  where i.status in ('open', 'mitigating') and i.due_date < v_today;
  v_result := v_result || jsonb_build_object('issues_overdue', n);

  -- Ongoing activities without a progress update for N days: responsible person, once per period.
  select coalesce(sum(public.deliver(a.responsible_user_id, 'progress',
           'Progress update due: ' || a.code || ' · ' || a.title,
           coalesce('Last update ' || to_char(p.as_of_date, 'FMMon FMDD, YYYY'), 'No progress update yet'),
           '/activities/' || a.id || '?tab=progress', a.program_id, 'activity', a.id,
           'progress_due:' || a.id || ':' || ((v_today - coalesce(p.as_of_date, a.start_date)) / v_prog))), 0)
  into n
  from public.activities a
  left join public.v_activity_progress p on p.activity_id = a.id
  where a.status = 'ongoing' and a.deleted_at is null and a.responsible_user_id is not null
    and v_today - coalesce(p.as_of_date, a.start_date) >= v_prog;
  v_result := v_result || jsonb_build_object('progress_due', n);

  return v_result || jsonb_build_object('date', v_today);
end;
$$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('payew-monitoring-reminders', '10 23 * * *', 'select public.run_monitoring_reminders()');
  end if;
exception when others then
  raise notice 'pg_cron not scheduled for monitoring reminders: %', sqlerrm;
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
    'public.submit_approval(text, text, uuid, text, jsonb, uuid)',
    'public.withdraw_approval(uuid)',
    'public.decide_approval(uuid, text, text)',
    'public.can_decide_approval(uuid)',
    'public.run_monitoring_reminders(date)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  foreach f in array array[
    'public.apply_approval(public.approval_requests)',
    'public.approval_deciders(uuid)',
    'public.admin_action_needs_approval(uuid)',
    'public.approval_gate_activity()',
    'public.approval_gate_package()',
    'public.approval_gate_allotment()',
    'public.raise_obligation_exception()',
    'public.prepare_progress_update()',
    'public.prepare_issue()',
    'public.notify_issue()'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end;
$$;
