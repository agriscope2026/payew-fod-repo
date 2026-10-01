-- =============================================================================
-- Phase 9: Dashboard
--   One read-only RPC, dashboard_summary(), returns every dashboard figure for a
--   fiscal year and a set of programs as a single jsonb document:
--   KPIs, allotment/obligation/disbursement by expense class, monthly flow,
--   package funnel, spending by supplier/category, procurement savings,
--   obligation aging, overdue activities/packages, pending deliveries,
--   the caller's "Needs attention" counts and the per-program compliance
--   scorecard (Addendum B5 widgets included).
--
--   It runs as security definer so program staff see program-level aggregates,
--   but it only ever reads programs the caller may access.
-- =============================================================================

create or replace function public.dashboard_summary(
  p_fiscal_year_id uuid,
  p_program_ids    uuid[] default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_today  date := public.today_ph();
  v_fy     public.fiscal_years;
  v_scope  uuid[];
  v_prog   integer := coalesce(
             ((select value from public.app_settings where key = 'approvals') ->> 'progress_update_days')::integer, 30);
  v_result jsonb;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  select * into v_fy from public.fiscal_years where id = p_fiscal_year_id;
  if not found then
    raise exception 'Fiscal year not found' using errcode = 'P0002';
  end if;

  -- Programs requested ∩ programs the caller can access (all requested for superadmins).
  select coalesce(array_agg(p.id), '{}') into v_scope
  from public.programs p
  where p.deleted_at is null and (p_program_ids is null or p.id = any (p_program_ids))
    and (public.is_superadmin() or p.id in (select public.user_program_ids()));

  with
  acts as (
    select a.* from public.v_activities a
    where a.program_id = any (v_scope) and a.fiscal_year_id = p_fiscal_year_id and a.deleted_at is null
  ),
  pkgs as (
    select p.* from public.v_packages p
    where p.program_id = any (v_scope) and p.fiscal_year_id = p_fiscal_year_id and p.deleted_at is null
  ),
  pfin as (
    select f.* from public.v_package_financial_summary f
    where f.program_id = any (v_scope) and f.fiscal_year_id = p_fiscal_year_id and f.status <> 'cancelled'
  ),
  cls as (
    select f.* from public.v_program_finance f
    where f.program_id = any (v_scope) and f.fiscal_year_id = p_fiscal_year_id
  ),
  -- Unpaid part of each active ORS (gross DV amounts linked to it).
  ors as (
    select o.id, o.program_id, o.package_id, o.ors_date, o.amount,
           o.amount - coalesce((select sum(l.amount) from public.disbursement_obligations l
                                join public.disbursements d on d.id = l.disbursement_id and d.status = 'active'
                                where l.obligation_id = o.id), 0) as unpaid
    from public.obligations o
    where o.program_id = any (v_scope) and o.fiscal_year_id = p_fiscal_year_id and o.status = 'active'
  )
  select jsonb_build_object(
    'as_of', v_today,
    'program_ids', to_jsonb(v_scope),

    'kpis', (
      select jsonb_build_object(
        'allotted',  coalesce(sum(c.allotted), 0),
        'planned',   coalesce(sum(c.planned), 0),
        'obligated', coalesce(sum(c.obligated), 0),
        'disbursed', coalesce(sum(c.disbursed), 0),
        -- includes ORS without an expense class, which v_program_finance leaves out
        'obligated_all', (select coalesce(sum(amount), 0) from ors),
        'disbursed_all', (select coalesce(sum(d.gross_amount), 0) from public.disbursements d
                          where d.program_id = any (v_scope) and d.fiscal_year_id = p_fiscal_year_id
                            and d.status = 'active'),
        'budget', (select coalesce(sum(budget_amount), 0) from acts where status <> 'cancelled'),
        'obligated_undelivered', (select coalesce(sum(obligated_undelivered), 0) from pfin),
        'delivered_unpaid',      (select coalesce(sum(delivered_unpaid), 0) from pfin),
        'savings_confirmed', (select coalesce(sum(amount), 0) from public.savings_entries s
                              where s.program_id = any (v_scope) and s.fiscal_year_id = p_fiscal_year_id
                                and s.status = 'confirmed'),
        'savings_suggested', (select coalesce(sum(amount), 0) from public.savings_entries s
                              where s.program_id = any (v_scope) and s.fiscal_year_id = p_fiscal_year_id
                                and s.status = 'suggested')
      )
      from cls c
    ),

    'activities', (
      select jsonb_build_object(
        'total',       count(*) filter (where status <> 'cancelled'),
        'not_started', count(*) filter (where display_status = 'not_started'),
        'ongoing',     count(*) filter (where display_status = 'ongoing'),
        'delayed',     count(*) filter (where display_status = 'delayed'),
        'completed',   count(*) filter (where display_status = 'completed'),
        'cancelled',   count(*) filter (where display_status = 'cancelled')
      )
      from acts
    ),

    -- Procurement status counts packages, not activities (B5).
    'packages', (
      select jsonb_build_object(
        'total',       count(*) filter (where status <> 'cancelled'),
        'not_started', count(*) filter (where display_status = 'not_started'),
        'ongoing',     count(*) filter (where display_status = 'ongoing'),
        'delayed',     count(*) filter (where display_status = 'delayed'),
        'closed',      count(*) filter (where display_status = 'closed'),
        'cancelled',   count(*) filter (where display_status = 'cancelled')
      )
      from pkgs
    ),

    'by_class', (
      select coalesce(jsonb_agg(x order by x.allotted desc, x.code), '[]')
      from (
        select c.expense_class_code as code,
               sum(c.allotted) as allotted, sum(c.planned) as planned,
               sum(c.obligated) as obligated, sum(c.disbursed) as disbursed
        from cls c group by c.expense_class_code
      ) x
    ),

    -- Month by month across the fiscal year (the client accumulates).
    'monthly', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'month', to_char(m, 'YYYY-MM'),
               'obligated', (select coalesce(sum(amount), 0) from ors
                             where date_trunc('month', ors_date) = m),
               'disbursed', (select coalesce(sum(d.gross_amount), 0) from public.disbursements d
                             where d.program_id = any (v_scope) and d.fiscal_year_id = p_fiscal_year_id
                               and d.status = 'active' and date_trunc('month', d.dv_date) = m)
             ) order by m), '[]')
      from generate_series(date_trunc('month', v_fy.start_date::timestamp),
                           date_trunc('month', v_fy.end_date::timestamp), interval '1 month') m
    ),

    -- Open packages by the phase of their current stage (closed counted apart).
    'funnel', (
      select coalesce(jsonb_agg(x), '[]')
      from (
        select case when status = 'closed' then 'closed'
                    when current_phase is null then 'not_started'
                    else current_phase end as phase,
               count(*) as packages,
               coalesce(sum(coalesce(contract_amount, abc_amount)), 0) as amount
        from pkgs where status <> 'cancelled'
        group by 1
      ) x
    ),

    'by_supplier', (
      select coalesce(jsonb_agg(x order by x.contract desc), '[]')
      from (
        select s.id, s.business_name as name, count(*) as packages,
               sum(coalesce(f.contract_amount, 0)) as contract,
               sum(f.disbursed) as paid
        from pfin f join public.suppliers s on s.id = f.supplier_id
        group by s.id, s.business_name
        order by sum(coalesce(f.contract_amount, 0)) desc
        limit 8
      ) x
    ),

    'by_category', (
      select coalesce(jsonb_agg(x order by x.contract desc, x.abc desc), '[]')
      from (
        select coalesce(c.name, 'Uncategorized') as name, c.code,
               count(*) as packages,
               sum(f.abc_amount) as abc,
               sum(coalesce(f.contract_amount, 0)) as contract,
               sum(f.disbursed) as paid
        from pfin f left join public.procurement_categories c on c.id = f.category_id
        group by c.name, c.code
      ) x
    ),

    'savings', (
      select jsonb_build_object(
        'awarded_packages', count(*),
        'abc',      coalesce(sum(abc_amount), 0),
        'contract', coalesce(sum(contract_amount), 0),
        'savings',  coalesce(sum(abc_amount - contract_amount), 0)
      )
      from pfin where contract_amount is not null
    ),

    -- Unpaid obligations by age since the ORS date.
    'aging', (
      select coalesce(jsonb_agg(jsonb_build_object('bucket', b.label, 'count', coalesce(x.n, 0), 'amount', coalesce(x.amt, 0))
                                order by b.ord), '[]')
      from (values (1, '0–30 days'), (2, '31–60 days'), (3, '61–90 days'), (4, 'Over 90 days')) b(ord, label)
      left join (
        select case when v_today - ors_date <= 30 then 1
                    when v_today - ors_date <= 60 then 2
                    when v_today - ors_date <= 90 then 3
                    else 4 end as ord,
               count(*) as n, sum(unpaid) as amt
        from ors where unpaid > 0 group by 1
      ) x on x.ord = b.ord
    ),

    'overdue_activities', (
      select coalesce(jsonb_agg(x), '[]')
      from (
        select a.id, a.code, a.title, a.program_id, a.current_stage_name,
               greatest(a.days_overdue, a.stage_days_late) as days_late,
               a.due_date, a.budget_amount, public.person_name(a.responsible_user_id) as responsible
        from acts a where a.display_status = 'delayed'
        order by greatest(a.days_overdue, a.stage_days_late) desc, a.code
        limit 25
      ) x
    ),

    'overdue_packages', (
      select coalesce(jsonb_agg(x), '[]')
      from (
        select p.id, p.code, p.title, p.program_id, p.activity_id, p.activity_code,
               p.supplier_name, p.current_stage_name,
               greatest(p.days_overdue, p.stage_days_late) as days_late,
               coalesce(p.contract_amount, p.abc_amount) as amount
        from pkgs p where p.display_status = 'delayed'
        order by greatest(p.days_overdue, p.stage_days_late) desc, p.code
        limit 25
      ) x
    ),

    -- Scheduled deliveries due in the next 30 days, plus late ones.
    'pending_deliveries', (
      select coalesce(jsonb_agg(x order by x.scheduled_date, x.package_code), '[]')
      from (
        select d.id, d.delivery_no, d.scheduled_date, d.amount,
               (d.scheduled_date < v_today) as is_late,
               p.id as package_id, p.code as package_code, p.title as package_title,
               p.activity_id, s.business_name as supplier_name
        from public.package_deliveries d
        join public.procurement_packages p on p.id = d.package_id and p.deleted_at is null and p.status <> 'cancelled'
        left join public.suppliers s on s.id = p.supplier_id
        where d.program_id = any (v_scope) and d.fiscal_year_id = p_fiscal_year_id
          and d.status = 'scheduled' and d.scheduled_date <= v_today + 30
        order by d.scheduled_date
        limit 25
      ) x
    ),

    -- What the caller should act on (counts; the page links to the lists).
    'attention', jsonb_build_object(
      'my_directives', (
        select count(*) from public.directive_recipients r
        join public.directives d on d.id = r.directive_id and d.status = 'open'
        where r.user_id = v_uid and r.status <> 'responded'),
      'my_overdue_stages', (
        select count(*) from public.activity_stage_progress s
        join public.activities a on a.id = s.activity_id and a.deleted_at is null
                                and a.status in ('not_started', 'ongoing')
        where s.assigned_to = v_uid and s.status in ('pending', 'in_progress')
          and s.planned_end < v_today and a.fiscal_year_id = p_fiscal_year_id),
      'my_overdue_tasks', (
        select count(*) from public.activity_tasks t
        join public.activities a on a.id = t.activity_id and a.deleted_at is null
                                and a.status in ('not_started', 'ongoing')
        where t.assigned_to = v_uid and not t.is_done and t.due_date < v_today),
      'approvals_to_decide', (
        select count(*) from public.approval_requests r
        where r.status = 'pending' and r.program_id = any (v_scope) and public.can_decide_approval(r.id)),
      'critical_issues', (
        select count(*) from public.issues i
        where i.program_id = any (v_scope) and i.fiscal_year_id = p_fiscal_year_id
          and i.status in ('open', 'mitigating') and i.severity in ('high', 'critical')),
      'overdue_issues', (
        select count(*) from public.issues i
        where i.program_id = any (v_scope) and i.fiscal_year_id = p_fiscal_year_id
          and i.status in ('open', 'mitigating') and i.due_date < v_today),
      'flagged_records', (select coalesce(sum(flagged_records), 0) from pfin),
      'old_payables', (
        select count(*) from pfin
        where delivered_unpaid > 0 and v_today - oldest_unpaid_acceptance > 7),
      'savings_to_confirm', (
        select count(*) from public.savings_entries s
        where s.program_id = any (v_scope) and s.fiscal_year_id = p_fiscal_year_id
          and s.status = 'suggested' and public.can_manage_program(s.program_id)),
      'plans_to_approve', (
        select count(*) from public.finance_plans f
        where f.program_id = any (v_scope) and f.fiscal_year_id = p_fiscal_year_id
          and f.status = 'submitted' and public.can_manage_program(f.program_id)),
      'supplier_docs', (
        select count(distinct s.id) from public.v_suppliers s
        where s.status = 'active' and s.expired_docs + s.expiring_docs > 0 and s.open_packages > 0
          and exists (select 1 from pkgs p where p.supplier_id = s.id and p.status in ('not_started', 'ongoing')))
    ),

    -- Per program: delivery on schedule, monitoring discipline and money.
    'compliance', (
      select coalesce(jsonb_agg(x order by x.code), '[]')
      from (
        select pr.id as program_id, pr.code, pr.name, pr.color,
               (select count(*) from acts a where a.program_id = pr.id and a.status <> 'cancelled') as activities,
               (select count(*) from acts a where a.program_id = pr.id and a.status <> 'cancelled'
                                              and a.display_status <> 'delayed') as on_schedule,
               (select count(*) from acts a where a.program_id = pr.id and a.status = 'ongoing') as ongoing,
               (select count(*) from acts a where a.program_id = pr.id and a.status = 'ongoing'
                  and exists (select 1 from public.progress_updates u
                              where u.activity_id = a.id and u.as_of_date >= v_today - v_prog)) as progress_current,
               (select count(*) from public.directive_recipients r
                  join public.directives d on d.id = r.directive_id
                  where d.program_id = pr.id and d.response_due is not null and d.response_due < v_today
                    and (d.issued_at at time zone 'Asia/Manila')::date between v_fy.start_date and v_fy.end_date) as directives_due,
               (select count(*) from public.directive_recipients r
                  join public.directives d on d.id = r.directive_id
                  where d.program_id = pr.id and d.response_due is not null and d.response_due < v_today
                    and (d.issued_at at time zone 'Asia/Manila')::date between v_fy.start_date and v_fy.end_date
                    and r.status = 'responded'
                    and (r.responded_at at time zone 'Asia/Manila')::date <= d.response_due) as directives_on_time,
               (select coalesce(sum(budget_amount), 0) from acts a where a.program_id = pr.id and a.status <> 'cancelled') as budget,
               (select coalesce(sum(allotted), 0) from cls c where c.program_id = pr.id) as allotted,
               (select coalesce(sum(amount), 0) from ors o where o.program_id = pr.id) as obligated,
               (select coalesce(sum(o.amount - o.unpaid), 0) from ors o where o.program_id = pr.id) as disbursed,
               (select count(*) from public.finance_plans f
                  where f.program_id = pr.id and f.fiscal_year_id = p_fiscal_year_id and f.status = 'approved') as plans_approved,
               (select count(*) from public.issues i
                  where i.program_id = pr.id and i.fiscal_year_id = p_fiscal_year_id
                    and i.status in ('open', 'mitigating') and i.severity in ('high', 'critical')) as critical_issues
        from public.programs pr
        where pr.id = any (v_scope) and pr.archived_at is null and pr.deleted_at is null
      ) x
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.dashboard_summary(uuid, uuid[]) from public, anon;
grant execute on function public.dashboard_summary(uuid, uuid[]) to authenticated;
