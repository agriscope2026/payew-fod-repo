-- =============================================================================
-- Phase 10: My Tasks, Calendar, Reports
--   my_work_items()           → the caller's inbox (stages, checklist tasks,
--                               directives, approvals, issues)
--   calendar_events()         → dated events in a range, incl. per-package
--                               solicitation/award/delivery/payment dates (B5)
--   report_suppliers()        → Supplier Performance / Awards & Payments
--   report_beneficiaries()    → beneficiaries served in a fiscal year
--
-- All run as security invoker: RLS decides what the caller sees.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- My Tasks
-- ---------------------------------------------------------------------------
create or replace function public.my_work_items()
returns table (
  kind          text,
  item_id       uuid,
  title         text,
  context       text,
  due_date      date,
  status        text,
  priority      text,
  program_id    uuid,
  activity_id   uuid,
  package_id    uuid,
  can_complete  boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  -- Workflow stages assigned to me, or the current stage of an activity/package
  -- I am responsible for when nobody is assigned to it.
  select 'stage', s.id, s.name,
         concat_ws(' · ', a.code, p.code, coalesce(p.title, a.title)),
         s.planned_end, s.status, null::text,
         s.program_id, s.activity_id, s.package_id, false
  from public.activity_stage_progress s
  join public.activities a on a.id = s.activity_id
       and a.deleted_at is null and a.status in ('not_started', 'ongoing')
  left join public.procurement_packages p on p.id = s.package_id
  where s.status in ('pending', 'in_progress')
    and (s.package_id is null or (p.deleted_at is null and p.status in ('not_started', 'ongoing')))
    and (s.assigned_to = (select auth.uid())
         or (s.assigned_to is null
             and case when s.package_id is null
                      then a.current_stage_id = s.id and a.responsible_user_id = (select auth.uid())
                      else p.current_stage_id = s.id and p.responsible_user_id = (select auth.uid())
                 end))

  union all
  -- Checklist tasks assigned to me
  select 'task', t.id, t.title,
         concat_ws(' · ', a.code, p.code, coalesce(p.title, a.title)),
         t.due_date, 'open', case when t.is_required then 'required' end,
         t.program_id, t.activity_id, t.package_id, public.can_edit_activity(t.activity_id)
  from public.activity_tasks t
  join public.activities a on a.id = t.activity_id
       and a.deleted_at is null and a.status in ('not_started', 'ongoing')
  left join public.procurement_packages p on p.id = t.package_id
  where t.assigned_to = (select auth.uid()) and not t.is_done
    and (t.package_id is null or (p.deleted_at is null and p.status in ('not_started', 'ongoing')))

  union all
  -- Directives waiting for my response
  select 'directive', d.id, d.title,
         concat_ws(' · ', case when d.kind = 'overdue_notice' then 'Overdue notice' else 'Directive' end,
                   'from ' || (select pf.full_name from public.profiles pf where pf.id = d.issued_by)),
         d.response_due, r.status, d.priority,
         d.program_id,
         case when d.entity_type = 'activity' then d.entity_id end,
         case when d.entity_type = 'package' then d.entity_id end,
         false
  from public.directive_recipients r
  join public.directives d on d.id = r.directive_id and d.status = 'open'
  where r.user_id = (select auth.uid()) and r.status <> 'responded'

  union all
  -- Approval requests I can decide
  select 'approval', r.id, r.title,
         concat_ws(' · ', 'Requested by ' || (select pf.full_name from public.profiles pf where pf.id = r.requested_by),
                   to_char(r.requested_at at time zone 'Asia/Manila', 'Mon DD')),
         null::date, r.status, r.request_type,
         r.program_id, r.activity_id, r.package_id, false
  from public.approval_requests r
  where r.status = 'pending' and public.can_decide_approval(r.id)

  union all
  -- Issues and risks I own
  select 'issue', i.id, i.title,
         concat_ws(' · ', a.code, initcap(i.kind)),
         i.due_date, i.status, i.severity,
         i.program_id, i.activity_id, i.package_id, false
  from public.issues i
  join public.activities a on a.id = i.activity_id and a.deleted_at is null
  where i.owner_id = (select auth.uid()) and i.status in ('open', 'mitigating');
$$;

grant execute on function public.my_work_items() to authenticated;

-- ---------------------------------------------------------------------------
-- Calendar
-- ---------------------------------------------------------------------------
create or replace function public.calendar_events(
  p_from         date,
  p_to           date,
  p_program_ids  uuid[] default null
)
returns table (
  kind           text,
  ref_id         uuid,
  title          text,
  detail         text,
  start_date     date,
  end_date       date,
  program_id     uuid,
  activity_id    uuid,
  package_id     uuid,
  category_code  text,
  is_done        boolean,
  is_overdue     boolean
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_today date := public.today_ph();
begin
  if p_to < p_from or p_to - p_from > 400 then
    raise exception 'Pick a range of at most 400 days' using errcode = '22023';
  end if;

  return query
  with acts as (
    select a.* from public.activities a
    where a.deleted_at is null and a.status <> 'cancelled'
      and (p_program_ids is null or a.program_id = any (p_program_ids))
  ),
  pkgs as (
    select p.*, c.code as cat_code, a.code as act_code
    from public.procurement_packages p
    join acts a on a.id = p.activity_id
    left join public.procurement_categories c on c.id = p.category_id
    where p.deleted_at is null and p.status <> 'cancelled'
  )
  -- Implementation period
  select 'activity'::text, a.id, a.title, a.code,
         a.start_date, coalesce(a.end_date, a.start_date),
         a.program_id, a.id, null::uuid, null::text,
         a.status = 'completed', false
  from acts a
  where a.start_date is not null
    and a.start_date <= p_to and coalesce(a.end_date, a.start_date) >= p_from

  union all
  select 'activity_due', a.id, a.title, a.code, a.due_date, a.due_date,
         a.program_id, a.id, null, null,
         a.status = 'completed',
         a.status in ('not_started', 'ongoing') and a.due_date < v_today
  from acts a
  where a.due_date between p_from and p_to

  -- Open activity-level stage targets
  union all
  select 'stage_due', s.id, s.name, a.code, s.planned_end, s.planned_end,
         a.program_id, a.id, null, null,
         false, s.planned_end < v_today
  from public.activity_stage_progress s
  join acts a on a.id = s.activity_id and a.status in ('not_started', 'ongoing')
  where s.package_id is null and s.parent_id is null
    and s.status in ('pending', 'in_progress')
    and s.planned_end between p_from and p_to

  -- Package solicitation: the first procurement step that asks for an RFQ / solicitation
  union all
  select 'pkg_solicitation', s.id, p.title, p.code,
         coalesce(s.actual_start, s.planned_start), coalesce(s.actual_start, s.planned_start),
         p.program_id, p.activity_id, p.id, p.cat_code,
         s.status in ('completed', 'skipped', 'in_progress'), false
  from pkgs p
  join lateral (
    select x.* from public.activity_stage_progress x
    where x.package_id = p.id and x.parent_id is null
      and (x.name ilike '%solicit%' or 'RFQ' = any (x.required_documents))
    order by x.sort_order limit 1
  ) s on true
  where coalesce(s.actual_start, s.planned_start) between p_from and p_to

  -- Award: the actual award date, else the planned end of the award step
  union all
  select 'pkg_award', p.id, p.title, p.code, d.on_date, d.on_date,
         p.program_id, p.activity_id, p.id, p.cat_code,
         p.award_date is not null, p.award_date is null and d.on_date < v_today
  from pkgs p
  left join lateral (
    select x.planned_end from public.activity_stage_progress x
    where x.package_id = p.id and x.parent_id is null
      and (x.name ilike '%award%' or 'supplier_id' = any (x.required_fields))
    order by x.sort_order limit 1
  ) s on true
  cross join lateral (select coalesce(p.award_date, s.planned_end) as on_date) d
  where d.on_date between p_from and p_to

  union all
  select 'pkg_due', p.id, p.title, p.code, p.due_date, p.due_date,
         p.program_id, p.activity_id, p.id, p.cat_code,
         p.status = 'closed', p.status in ('not_started', 'ongoing') and p.due_date < v_today
  from pkgs p
  where p.due_date between p_from and p_to

  -- Deliveries (scheduled or actual)
  union all
  select 'delivery', d.id, p.title, concat_ws(' · ', p.code, 'delivery #' || d.delivery_no),
         coalesce(d.delivery_date, d.scheduled_date), coalesce(d.delivery_date, d.scheduled_date),
         p.program_id, p.activity_id, p.id, p.cat_code,
         d.status <> 'scheduled', d.status = 'scheduled' and d.scheduled_date < v_today
  from public.package_deliveries d
  join pkgs p on p.id = d.package_id
  where coalesce(d.delivery_date, d.scheduled_date) between p_from and p_to

  -- Payment due: 7 days after acceptance while the package still has payables
  union all
  select 'payment_due', d.id, p.title, concat_ws(' · ', p.code, 'delivery #' || d.delivery_no),
         d.accepted_date + 7, d.accepted_date + 7,
         p.program_id, p.activity_id, p.id, p.cat_code,
         f.delivered_unpaid <= 0, f.delivered_unpaid > 0 and d.accepted_date + 7 < v_today
  from public.package_deliveries d
  join pkgs p on p.id = d.package_id
  join public.v_package_financial_summary f on f.package_id = p.id
  where d.status = 'accepted' and d.accepted_date + 7 between p_from and p_to
    and (f.delivered_unpaid > 0 or d.accepted_date + 7 < v_today)

  -- Directive response deadlines
  union all
  select 'directive_due', d.id, d.title,
         case when d.kind = 'overdue_notice' then 'Overdue notice' else 'Directive' end,
         d.response_due, d.response_due,
         d.program_id,
         case when d.entity_type = 'activity' then d.entity_id end,
         case when d.entity_type = 'package' then d.entity_id end,
         null, d.status <> 'open', d.status = 'open' and d.response_due < v_today
  from public.directives d
  where d.response_due between p_from and p_to and d.status <> 'withdrawn'
    and (p_program_ids is null or d.program_id = any (p_program_ids))

  -- Issue target dates
  union all
  select 'issue_due', i.id, i.title, a.code, i.due_date, i.due_date,
         i.program_id, i.activity_id, i.package_id, null,
         i.status not in ('open', 'mitigating'),
         i.status in ('open', 'mitigating') and i.due_date < v_today
  from public.issues i
  join acts a on a.id = i.activity_id
  where i.due_date between p_from and p_to;
end;
$$;

grant execute on function public.calendar_events(date, date, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Reports
-- ---------------------------------------------------------------------------
-- Supplier Performance + Awards & Payments (packages awarded in the FY/programs).
create or replace function public.report_suppliers(
  p_fiscal_year_id  uuid,
  p_program_ids     uuid[] default null
)
returns table (
  supplier_id          uuid,
  business_name        text,
  supplier_status      text,
  packages             bigint,
  packages_closed      bigint,
  closed_on_time       bigint,
  packages_late        bigint,
  deliveries           bigint,
  deliveries_on_time   bigint,
  deliveries_late      bigint,
  deliveries_rejected  bigint,
  contract             numeric,
  obligated            numeric,
  accepted             numeric,
  paid                 numeric,
  balance              numeric,
  avg_rating           numeric,
  ratings              bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with pk as (
    select p.*, f.obligated, f.accepted, f.disbursed
    from public.v_packages p
    join public.v_package_financial_summary f on f.package_id = p.id
    where p.deleted_at is null and p.status <> 'cancelled' and p.supplier_id is not null
      and p.fiscal_year_id = p_fiscal_year_id
      and (p_program_ids is null or p.program_id = any (p_program_ids))
  ),
  dl as (
    select d.*, pk.supplier_id from public.package_deliveries d join pk on pk.id = d.package_id
  )
  select s.id, s.business_name, s.status,
         count(*),
         count(*) filter (where pk.status = 'closed'),
         count(*) filter (where pk.status = 'closed'
                            and (pk.due_date is null or (pk.closed_at at time zone 'Asia/Manila')::date <= pk.due_date)),
         count(*) filter (where pk.display_status = 'delayed'),
         (select count(*) from dl where dl.supplier_id = s.id and dl.status <> 'scheduled'),
         (select count(*) from dl where dl.supplier_id = s.id and dl.status <> 'scheduled'
            and dl.status <> 'rejected' and (dl.scheduled_date is null or dl.delivery_date <= dl.scheduled_date)),
         (select count(*) from dl where dl.supplier_id = s.id
            and ((dl.status <> 'scheduled' and dl.delivery_date > dl.scheduled_date)
                 or (dl.status = 'scheduled' and dl.scheduled_date < public.today_ph()))),
         (select count(*) from dl where dl.supplier_id = s.id and dl.status = 'rejected'),
         coalesce(sum(pk.contract_amount), 0),
         coalesce(sum(pk.obligated), 0),
         coalesce(sum(pk.accepted), 0),
         coalesce(sum(pk.disbursed), 0),
         coalesce(sum(pk.contract_amount), 0) - coalesce(sum(pk.disbursed), 0),
         (select round(avg(r.rating), 2) from public.supplier_ratings r
            where r.supplier_id = s.id and r.package_id in (select id from pk where pk.supplier_id = s.id)),
         (select count(*) from public.supplier_ratings r
            where r.supplier_id = s.id and r.package_id in (select id from pk where pk.supplier_id = s.id))
  from pk
  join public.suppliers s on s.id = pk.supplier_id
  group by s.id, s.business_name, s.status
  order by coalesce(sum(pk.contract_amount), 0) desc, s.business_name;
$$;

grant execute on function public.report_suppliers(uuid, uuid[]) to authenticated;

-- Beneficiaries served by activities of the FY/programs (one row per beneficiary).
create or replace function public.report_beneficiaries(
  p_fiscal_year_id  uuid,
  p_program_ids     uuid[] default null
)
returns table (
  beneficiary_id  uuid,
  name            text,
  type_name       text,
  province        text,
  municipality    text,
  members_male    integer,
  members_female  integer,
  members_total   integer,
  members_ip      integer,
  members_youth   integer,
  members_pwd     integer,
  members_senior  integer,
  activities      bigint,
  programs        text,
  participants    bigint,
  amount          numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  select b.id, b.name, t.name, pv.name, m.name,
         b.members_male, b.members_female, b.members_total,
         b.members_ip, b.members_youth, b.members_pwd, b.members_senior,
         count(distinct a.id),
         string_agg(distinct pr.code, ', '),
         coalesce(sum(ab.participants), 0),
         coalesce(sum(ab.amount), 0)
  from public.activity_beneficiaries ab
  join public.activities a on a.id = ab.activity_id
       and a.deleted_at is null and a.status <> 'cancelled' and a.fiscal_year_id = p_fiscal_year_id
  join public.programs pr on pr.id = a.program_id
  join public.beneficiaries b on b.id = ab.beneficiary_id
  join public.beneficiary_types t on t.id = b.type_id
  join public.provinces pv on pv.id = b.province_id
  left join public.municipalities m on m.id = b.municipality_id
  where p_program_ids is null or a.program_id = any (p_program_ids)
  group by b.id, b.name, t.name, pv.name, m.name
  order by pv.name, m.name nulls last, b.name;
$$;

grant execute on function public.report_beneficiaries(uuid, uuid[]) to authenticated;
