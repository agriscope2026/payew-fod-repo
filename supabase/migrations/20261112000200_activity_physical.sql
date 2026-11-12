-- =============================================================================
-- Physical targets of activities, and their link to WFP rows.
--
-- * activity_physical      one row per activity: monthly targets and
--                          accomplishments (BED 2), and, for activities that come
--                          from the WFP sheet, the row they come from and its
--                          budget, obligated and disbursed amounts
-- * sync_wfp_activities()  creates or updates activities from the WFP rows that
--                          have a PAP and a unit of measure, so nobody types them twice
-- =============================================================================

create table public.activity_physical (
  activity_id      uuid primary key references public.activities (id) on delete cascade,
  program_id       uuid not null references public.programs (id) on delete cascade,
  fiscal_year_id   uuid not null references public.fiscal_years (id) on delete restrict,
  monthly_targets  numeric(14, 2)[] not null default array_fill(0::numeric, array[12])
                   check (cardinality(monthly_targets) = 12 and 0 <= all (monthly_targets)),
  monthly_done     numeric(14, 2)[] not null default array_fill(0::numeric, array[12])
                   check (cardinality(monthly_done) = 12 and 0 <= all (monthly_done)),
  status_note      text check (status_note is null or length(status_note) <= 1000),
  unit_label       text check (unit_label is null or length(unit_label) <= 60),
  wfp_sheet_id     uuid references public.finance_sheets (id) on delete set null,
  wfp_row_id       text check (wfp_row_id is null or length(wfp_row_id) <= 40),
  wfp_order        integer,
  wfp_budget       numeric(16, 2),
  wfp_obligated    numeric(16, 2),
  wfp_disbursed    numeric(16, 2),
  -- Set when the row is no longer in the WFP; the activity and its history stay.
  wfp_removed_at   timestamptz,
  updated_at       timestamptz not null default now(),
  updated_by       uuid default auth.uid() references auth.users (id) on delete set null
);
create unique index activity_physical_wfp_row_idx on public.activity_physical (wfp_sheet_id, wfp_row_id)
  where wfp_row_id is not null;
create index activity_physical_scope_idx on public.activity_physical (program_id, fiscal_year_id);

-- Program and year always come from the activity.
create or replace function public.activity_physical_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select a.program_id, a.fiscal_year_id into new.program_id, new.fiscal_year_id
  from public.activities a where a.id = new.activity_id;
  if new.program_id is null then
    raise exception 'Activity not found' using errcode = 'P0002';
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;
revoke execute on function public.activity_physical_scope() from public, anon, authenticated;
create trigger activity_physical_scope before insert or update on public.activity_physical
  for each row execute function public.activity_physical_scope();
create trigger guard_activity_physical before insert or update on public.activity_physical
  for each row execute function public.guard_allotment();
select public.enable_audit('public.activity_physical');

alter table public.activity_physical enable row level security;
-- WFP figures are written only by sync_wfp_activities(). Supabase grants every
-- privilege by default, so take those back before granting the editable columns.
revoke insert, update, delete on public.activity_physical from anon, authenticated;
grant select on public.activity_physical to authenticated;
grant insert (activity_id, monthly_targets, monthly_done, status_note, unit_label)
  on public.activity_physical to authenticated;
grant update (monthly_targets, monthly_done, status_note, unit_label)
  on public.activity_physical to authenticated;

create policy "activity_physical: read" on public.activity_physical
  for select to authenticated using (public.has_program_access(program_id));
create policy "activity_physical: writers add" on public.activity_physical
  for insert to authenticated with check (public.can_write_program(program_id) and wfp_row_id is null);
create policy "activity_physical: writers change" on public.activity_physical
  for update to authenticated
  using (public.can_write_program(program_id)) with check (public.can_write_program(program_id));

-- p_items: [{row_id, title, unit, target, budget, obligated, disbursed}], in sheet order.
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

    insert into public.activity_physical as t (
      activity_id, unit_label, wfp_sheet_id, wfp_row_id, wfp_order, wfp_budget, wfp_obligated, wfp_disbursed
    ) values (
      v_act, v_unit, p_sheet_id, v_item ->> 'row_id', v_order,
      nullif(v_item ->> 'budget', '')::numeric, nullif(v_item ->> 'obligated', '')::numeric,
      nullif(v_item ->> 'disbursed', '')::numeric
    )
    on conflict (activity_id) do update set
      unit_label = excluded.unit_label, wfp_sheet_id = excluded.wfp_sheet_id, wfp_row_id = excluded.wfp_row_id,
      wfp_order = excluded.wfp_order, wfp_budget = excluded.wfp_budget, wfp_obligated = excluded.wfp_obligated,
      wfp_disbursed = excluded.wfp_disbursed, wfp_removed_at = null;
  end loop;

  update public.activity_physical set wfp_removed_at = now()
  where wfp_sheet_id = p_sheet_id and wfp_removed_at is null and not (wfp_row_id = any (v_row_ids));
  get diagnostics v_removed = row_count;

  return jsonb_build_object('created', v_created, 'updated', v_updated, 'removed', v_removed);
end;
$$;
revoke execute on function public.sync_wfp_activities(uuid, jsonb) from public, anon;
grant execute on function public.sync_wfp_activities(uuid, jsonb) to authenticated;
