-- Obligated and disbursed amounts carried on WFP lines, for sheets that track
-- them without ORS or DV numbers. The dashboard uses these only for a program
-- and year that has no ORS records, so the two sources are never added together.

alter table public.finance_plan_rows
  add column obligated numeric(16, 2) not null default 0 check (obligated >= 0),
  add column disbursed numeric(16, 2) not null default 0 check (disbursed >= 0);

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
         m07 numeric, m08 numeric, m09 numeric, m10 numeric, m11 numeric, m12 numeric, remarks text,
         obligated numeric, disbursed numeric);

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
    m01, m02, m03, m04, m05, m06, m07, m08, m09, m10, m11, m12, remarks, obligated, disbursed
  )
  select coalesce(r.id, gen_random_uuid()), p_plan_id, v_plan.program_id, v_plan.fiscal_year_id, r.sort_order,
         r.activity_id, coalesce(r.package_id, null), trim(r.description), r.expense_class_id, r.uacs_code_id,
         r.fund_source_id, r.procurement_mode_id, r.unit_id, r.quantity, r.unit_cost,
         case when r.quantity is not null and r.unit_cost is not null then round(r.quantity * r.unit_cost, 2)
              else coalesce(r.amount, 0) end,
         coalesce(r.m01, 0), coalesce(r.m02, 0), coalesce(r.m03, 0), coalesce(r.m04, 0), coalesce(r.m05, 0),
         coalesce(r.m06, 0), coalesce(r.m07, 0), coalesce(r.m08, 0), coalesce(r.m09, 0), coalesce(r.m10, 0),
         coalesce(r.m11, 0), coalesce(r.m12, 0), nullif(trim(coalesce(r.remarks, '')), ''),
         coalesce(r.obligated, 0), coalesce(r.disbursed, 0)
  from _rows r
  on conflict (id) do update set
    sort_order = excluded.sort_order, activity_id = excluded.activity_id, package_id = excluded.package_id,
    description = excluded.description, expense_class_id = excluded.expense_class_id,
    uacs_code_id = excluded.uacs_code_id, fund_source_id = excluded.fund_source_id,
    procurement_mode_id = excluded.procurement_mode_id, unit_id = excluded.unit_id,
    quantity = excluded.quantity, unit_cost = excluded.unit_cost, amount = excluded.amount,
    m01 = excluded.m01, m02 = excluded.m02, m03 = excluded.m03, m04 = excluded.m04, m05 = excluded.m05,
    m06 = excluded.m06, m07 = excluded.m07, m08 = excluded.m08, m09 = excluded.m09, m10 = excluded.m10,
    m11 = excluded.m11, m12 = excluded.m12, remarks = excluded.remarks,
    obligated = excluded.obligated, disbursed = excluded.disbursed
  where t.plan_id = p_plan_id;

  get diagnostics v_n = row_count;
  update public.finance_plans set updated_at = now() where id = p_plan_id;
  return v_n;
end;
$$;

create view public.v_wfp_reported with (security_invoker = true) as
select
  r.program_id,
  r.fiscal_year_id,
  sum(r.obligated) as obligated,
  sum(r.disbursed) as disbursed,
  exists (
    select 1 from public.obligations o
    where o.program_id = r.program_id and o.fiscal_year_id = r.fiscal_year_id and o.status = 'active'
  ) as has_ors
from public.finance_plan_rows r
join public.finance_plans f on f.id = r.plan_id and f.plan_type = 'WFP'
group by r.program_id, r.fiscal_year_id;

grant select on public.v_wfp_reported to authenticated;
