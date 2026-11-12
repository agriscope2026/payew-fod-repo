-- =============================================================================
-- WFP phase and status on activities.
--
-- * wfp_phase   the Phase / component heading the activity sits under in the WFP
-- * wfp_status  the WFP Status column (a dropdown, e.g. "Accomplished"); kept apart
--               from status_note, which is typed on the Activities page
-- =============================================================================

alter table public.activity_physical
  add column wfp_phase  text check (wfp_phase is null or length(wfp_phase) <= 300),
  add column wfp_status text check (wfp_status is null or length(wfp_status) <= 120);

-- p_items: [{row_id, title, unit, target, budget, obligated, disbursed, phase, status, targets}],
-- in sheet order. targets (12 monthly physical targets, from an uploaded BED 2 tab)
-- only fill activities whose monthly targets are still all zero.
create or replace function public.sync_wfp_activities(p_sheet_id uuid, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sheet    public.finance_sheets;
  v_item     jsonb;
  v_order    integer;
  v_title    text;
  v_unit     text;
  v_unit_id  uuid;
  v_act      uuid;
  v_row_ids  text[] := '{}';
  v_created  integer := 0;
  v_updated  integer := 0;
  v_removed  integer := 0;
  v_targets  numeric[];
  v_zeros    numeric[] := array_fill(0::numeric, array[12]);
begin
  select * into v_sheet from public.finance_sheets where id = p_sheet_id;
  if not found or v_sheet.kind <> 'WFP' or not public.can_write_program(v_sheet.program_id) then
    raise exception 'You are not allowed to update this program''s activities' using errcode = '42501';
  end if;
  perform public.assert_fiscal_year_writable(v_sheet.fiscal_year_id, v_sheet.program_id);
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 2000 then
    raise exception 'Expected a list of at most 2,000 activities' using errcode = '22023';
  end if;

  for v_item, v_order in select value, ordinality::integer from jsonb_array_elements(p_items) with ordinality loop
    v_title := left(regexp_replace(trim(coalesce(v_item ->> 'title', '')), '\s+', ' ', 'g'), 250);
    continue when length(v_title) < 3 or coalesce(v_item ->> 'row_id', '') = '';
    v_row_ids := v_row_ids || (v_item ->> 'row_id');
    v_unit := nullif(left(trim(coalesce(v_item ->> 'unit', '')), 60), '');
    select u.id into v_unit_id from public.units u
    where u.deleted_at is null and (lower(u.name) = lower(v_unit) or lower(u.abbreviation) = lower(v_unit))
    limit 1;

    select p.activity_id into v_act from public.activity_physical p
    join public.activities a on a.id = p.activity_id and a.deleted_at is null
    where p.wfp_sheet_id = p_sheet_id and p.wfp_row_id = v_item ->> 'row_id';
    if v_act is null then
      -- Adopt an activity typed in before, with the same title and no WFP row yet.
      select a.id into v_act from public.activities a
      left join public.activity_physical p on p.activity_id = a.id
      where a.program_id = v_sheet.program_id and a.fiscal_year_id = v_sheet.fiscal_year_id
        and a.deleted_at is null and p.wfp_row_id is null
        and lower(regexp_replace(trim(a.title), '\s+', ' ', 'g')) = lower(v_title)
      order by a.created_at
      limit 1;
    end if;

    if v_act is null then
      insert into public.activities (program_id, fiscal_year_id, title, target_quantity, unit_id, budget_amount)
      values (v_sheet.program_id, v_sheet.fiscal_year_id, v_title,
              nullif(v_item ->> 'target', '')::numeric, v_unit_id, nullif(v_item ->> 'budget', '')::numeric)
      returning id into v_act;
      v_created := v_created + 1;
    else
      update public.activities set
        title = v_title,
        target_quantity = nullif(v_item ->> 'target', '')::numeric,
        unit_id = coalesce(v_unit_id, unit_id),
        budget_amount = nullif(v_item ->> 'budget', '')::numeric
      where id = v_act
        and (title, target_quantity, unit_id, budget_amount) is distinct from
            (v_title, nullif(v_item ->> 'target', '')::numeric, coalesce(v_unit_id, unit_id),
             nullif(v_item ->> 'budget', '')::numeric);
      if found then
        v_updated := v_updated + 1;
      end if;
    end if;

    select array_agg(greatest(coalesce(nullif(x, '')::numeric, 0), 0) order by o) into v_targets
    from jsonb_array_elements_text(case when jsonb_typeof(v_item -> 'targets') = 'array' then v_item -> 'targets' else '[]' end)
      with ordinality as e(x, o);
    if coalesce(cardinality(v_targets), 0) <> 12 then
      v_targets := v_zeros;
    end if;

    insert into public.activity_physical as t (
      activity_id, unit_label, wfp_sheet_id, wfp_row_id, wfp_order, wfp_budget, wfp_obligated, wfp_disbursed,
      wfp_phase, wfp_status, monthly_targets
    ) values (
      v_act, v_unit, p_sheet_id, v_item ->> 'row_id', v_order,
      nullif(v_item ->> 'budget', '')::numeric, nullif(v_item ->> 'obligated', '')::numeric,
      nullif(v_item ->> 'disbursed', '')::numeric,
      nullif(left(trim(coalesce(v_item ->> 'phase', '')), 300), ''),
      nullif(left(trim(coalesce(v_item ->> 'status', '')), 120), ''),
      v_targets
    )
    on conflict (activity_id) do update set
      unit_label = excluded.unit_label, wfp_sheet_id = excluded.wfp_sheet_id, wfp_row_id = excluded.wfp_row_id,
      wfp_order = excluded.wfp_order, wfp_budget = excluded.wfp_budget, wfp_obligated = excluded.wfp_obligated,
      wfp_disbursed = excluded.wfp_disbursed, wfp_phase = excluded.wfp_phase, wfp_status = excluded.wfp_status,
      monthly_targets = case when t.monthly_targets = v_zeros then excluded.monthly_targets else t.monthly_targets end,
      wfp_removed_at = null;
  end loop;

  update public.activity_physical set wfp_removed_at = now()
  where wfp_sheet_id = p_sheet_id and wfp_removed_at is null and not (wfp_row_id = any (v_row_ids));
  get diagnostics v_removed = row_count;

  return jsonb_build_object('created', v_created, 'updated', v_updated, 'removed', v_removed);
end;
$$;
