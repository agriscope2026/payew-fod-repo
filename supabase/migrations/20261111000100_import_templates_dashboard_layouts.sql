-- =============================================================================
-- Data import and dashboard layouts
--   import_templates        Reusable column layouts for Google Sheet / Excel imports.
--   dashboard_layouts       Each user's own dashboard cards, sizes and order.
--   app_settings            'dashboard_default_layout': what a user starts with.
--   import_finance_records  Saves many ORS or DV rows, all-or-nothing.
-- =============================================================================

create table public.import_templates (
  id          uuid primary key default gen_random_uuid(),
  target      text not null check (target in
                ('WFP', 'PPMP', 'APP', 'allotments', 'obligations', 'disbursements', 'activities')),
  name        text not null check (length(trim(name)) between 1 and 120),
  header_row  integer not null default 1 check (header_row between 1 and 200),
  data_row    integer not null default 2 check (data_row between 1 and 500),
  columns     jsonb not null default '[]'::jsonb check (jsonb_typeof(columns) = 'array'),
  source_url  text check (source_url is null or length(source_url) <= 500),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid default auth.uid() references auth.users (id) on delete set null,
  check (data_row > header_row)
);
create unique index import_templates_name_idx on public.import_templates (target, lower(name));
create trigger set_updated_at before update on public.import_templates
  for each row execute function public.set_updated_at();

alter table public.import_templates enable row level security;
grant select, insert, update, delete on public.import_templates to authenticated;

-- Templates are shared: anyone active can use one; its creator or a superadmin changes it.
create policy "import_templates: active users read" on public.import_templates
  for select to authenticated using ((select public.current_user_role()) is not null);
create policy "import_templates: active users insert" on public.import_templates
  for insert to authenticated
  with check ((select public.current_user_role()) is not null and created_by = (select auth.uid()));
create policy "import_templates: owner update" on public.import_templates
  for update to authenticated
  using (created_by = (select auth.uid()) or (select public.is_superadmin()))
  with check (created_by = (select auth.uid()) or (select public.is_superadmin()));
create policy "import_templates: owner delete" on public.import_templates
  for delete to authenticated
  using (created_by = (select auth.uid()) or (select public.is_superadmin()));

create table public.dashboard_layouts (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  layout      jsonb not null check (jsonb_typeof(layout) = 'array'),
  updated_at  timestamptz not null default now()
);
create trigger set_updated_at before update on public.dashboard_layouts
  for each row execute function public.set_updated_at();

alter table public.dashboard_layouts enable row level security;
grant select, insert, update, delete on public.dashboard_layouts to authenticated;

create policy "dashboard_layouts: own read" on public.dashboard_layouts
  for select to authenticated using (user_id = (select auth.uid()));
create policy "dashboard_layouts: own insert" on public.dashboard_layouts
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "dashboard_layouts: own update" on public.dashboard_layouts
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "dashboard_layouts: own delete" on public.dashboard_layouts
  for delete to authenticated using (user_id = (select auth.uid()));

-- An empty list means "use the layout built into the app".
insert into public.app_settings (key, value, description) values
  ('dashboard_default_layout', '[]'::jsonb, 'Dashboard cards, sizes and order that users start with')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Saves every row through save_obligation / save_disbursement, so an import gets
-- the same permission checks and warn/block validations as the forms. One failed
-- row rolls the whole batch back, and the error names the row.
-- ---------------------------------------------------------------------------
create or replace function public.import_finance_records(p_kind text, p_rows jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  r        record;
  v_result jsonb;
  v_saved  integer := 0;
  v_flags  jsonb := '[]'::jsonb;
begin
  if p_kind not in ('obligations', 'disbursements') then
    raise exception 'Unknown import kind %', p_kind using errcode = '22023';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Rows must be a list' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) > 1000 then
    raise exception 'Import at most 1,000 rows at a time' using errcode = '22023';
  end if;

  for r in select value, ord from jsonb_array_elements(p_rows) with ordinality as t(value, ord)
  loop
    begin
      if p_kind = 'obligations' then
        v_result := public.save_obligation(r.value);
      else
        v_result := public.save_disbursement(r.value - 'links', r.value -> 'links');
      end if;
    exception when others then
      raise exception 'Row %: %', r.ord, sqlerrm using errcode = sqlstate;
    end;
    v_saved := v_saved + 1;
    if jsonb_array_length(coalesce(v_result -> 'warnings', '[]'::jsonb)) > 0 then
      v_flags := v_flags || jsonb_build_object('row', r.ord, 'warnings', v_result -> 'warnings');
    end if;
  end loop;

  return jsonb_build_object('saved', v_saved, 'flagged', v_flags);
end;
$$;

revoke all on function public.import_finance_records(text, jsonb) from public, anon;
grant execute on function public.import_finance_records(text, jsonb) to authenticated;
