-- =============================================================================
-- Finance sheets: free-form, Excel-like sheets for WFP, PPMP, APP, allotments,
-- ORS and DV, one of each per program and fiscal year.
--
-- * finance_sheets          one row per sheet: kind, template, version (audited)
-- * finance_sheet_data      the sheet itself (cells, formulas, formatting) and an
--                           uploaded draft that is being cleaned up
-- * finance_sheet_versions  the last 30 saved versions, for restoring
-- * dashboard_cards         dashboard cards that show a value from sheet cells
--
-- Contents live outside finance_sheets so the audit log records who saved and
-- when without copying the whole sheet on every save. All writes to sheet
-- contents go through the functions below.
-- =============================================================================

create table public.finance_sheets (
  id              uuid primary key default gen_random_uuid(),
  program_id      uuid not null references public.programs (id) on delete cascade,
  fiscal_year_id  uuid not null references public.fiscal_years (id) on delete restrict,
  kind            text not null
                  check (kind in ('WFP', 'PPMP', 'APP', 'allotments', 'obligations', 'disbursements')),
  template_key    text check (template_key is null or length(template_key) <= 60),
  is_custom       boolean not null default false,
  source_name     text check (source_name is null or length(source_name) <= 200),
  version         integer not null default 1,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid default auth.uid() references auth.users (id) on delete set null,
  updated_by      uuid default auth.uid() references auth.users (id) on delete set null,
  unique (program_id, fiscal_year_id, kind)
);

create trigger set_updated_at before update on public.finance_sheets
  for each row execute function public.set_updated_at();
-- Fixed program and year, and no changes in a locked year.
create trigger guard_finance_sheet before insert or update on public.finance_sheets
  for each row execute function public.guard_allotment();
select public.enable_audit('public.finance_sheets');

create table public.finance_sheet_data (
  sheet_id          uuid primary key references public.finance_sheets (id) on delete cascade,
  data              jsonb not null check (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 8000000),
  draft             jsonb check (draft is null or (jsonb_typeof(draft) = 'object' and octet_length(draft::text) <= 8000000)),
  draft_source      text check (draft_source is null or length(draft_source) <= 200),
  draft_updated_at  timestamptz,
  draft_updated_by  uuid references auth.users (id) on delete set null
);

create table public.finance_sheet_versions (
  id        uuid primary key default gen_random_uuid(),
  sheet_id  uuid not null references public.finance_sheets (id) on delete cascade,
  version   integer not null,
  data      jsonb not null,
  saved_at  timestamptz not null default now(),
  saved_by  uuid references auth.users (id) on delete set null,
  unique (sheet_id, version)
);

alter table public.finance_sheets enable row level security;
alter table public.finance_sheet_data enable row level security;
alter table public.finance_sheet_versions enable row level security;
grant select on public.finance_sheets, public.finance_sheet_data, public.finance_sheet_versions to authenticated;

create policy "finance_sheets: read" on public.finance_sheets
  for select to authenticated using (public.has_program_access(program_id));
create policy "finance_sheet_data: read" on public.finance_sheet_data
  for select to authenticated using (exists (
    select 1 from public.finance_sheets s where s.id = sheet_id and public.has_program_access(s.program_id)
  ));
create policy "finance_sheet_versions: read" on public.finance_sheet_versions
  for select to authenticated using (exists (
    select 1 from public.finance_sheets s where s.id = sheet_id and public.has_program_access(s.program_id)
  ));

-- Locks the sheet and checks the caller may change it.
create or replace function public.lock_finance_sheet(p_sheet_id uuid)
returns public.finance_sheets
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.finance_sheets;
begin
  select * into v from public.finance_sheets where id = p_sheet_id for update;
  if not found or not public.can_write_program(v.program_id) then
    raise exception 'You are not allowed to edit this sheet' using errcode = '42501';
  end if;
  perform public.assert_fiscal_year_writable(v.fiscal_year_id, v.program_id);
  return v;
end;
$$;
revoke execute on function public.lock_finance_sheet(uuid) from public, anon, authenticated;

create or replace function public.create_finance_sheet(
  p_program_id uuid, p_fiscal_year_id uuid, p_kind text, p_data jsonb, p_template_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.can_write_program(p_program_id) then
    raise exception 'You are not allowed to edit this program''s finance sheets' using errcode = '42501';
  end if;
  insert into public.finance_sheets (program_id, fiscal_year_id, kind, template_key)
  values (p_program_id, p_fiscal_year_id, p_kind, p_template_key)
  on conflict (program_id, fiscal_year_id, kind) do nothing
  returning id into v_id;
  if v_id is null then
    -- Someone else started it first; keep theirs.
    select id into v_id from public.finance_sheets
    where program_id = p_program_id and fiscal_year_id = p_fiscal_year_id and kind = p_kind;
    return v_id;
  end if;
  insert into public.finance_sheet_data (sheet_id, data) values (v_id, p_data);
  return v_id;
end;
$$;

-- Saves the sheet if nobody else saved since p_version was loaded; keeps the old version.
create or replace function public.save_finance_sheet(
  p_sheet_id uuid, p_version integer, p_data jsonb, p_is_custom boolean, p_template_key text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.finance_sheets := public.lock_finance_sheet(p_sheet_id);
begin
  if v.version <> p_version then
    raise exception 'Someone else saved this sheet after you opened it. Your changes were not saved; reload to see theirs.'
      using errcode = '40001';
  end if;
  insert into public.finance_sheet_versions (sheet_id, version, data, saved_at, saved_by)
  select d.sheet_id, v.version, d.data, v.updated_at, v.updated_by
  from public.finance_sheet_data d where d.sheet_id = p_sheet_id;
  update public.finance_sheet_data set data = p_data where sheet_id = p_sheet_id;
  update public.finance_sheets
  set version = version + 1, is_custom = p_is_custom, template_key = p_template_key, updated_by = auth.uid()
  where id = p_sheet_id;
  delete from public.finance_sheet_versions
  where sheet_id = p_sheet_id and version <= v.version - 30;
  return v.version + 1;
end;
$$;

-- Stores (or, with null, discards) an uploaded draft that is still being cleaned up.
create or replace function public.save_finance_sheet_draft(p_sheet_id uuid, p_draft jsonb, p_source text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.lock_finance_sheet(p_sheet_id);
  update public.finance_sheet_data
  set draft = p_draft,
      draft_source = case when p_draft is null then null else coalesce(p_source, draft_source) end,
      draft_updated_at = case when p_draft is null then null else now() end,
      draft_updated_by = case when p_draft is null then null else auth.uid() end
  where sheet_id = p_sheet_id;
end;
$$;

-- Makes the cleaned-up draft the sheet. The draft is a custom layout from a file.
create or replace function public.finalize_finance_sheet(p_sheet_id uuid, p_version integer, p_data jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source text;
  v_version integer;
begin
  select draft_source into v_source from public.finance_sheet_data where sheet_id = p_sheet_id;
  v_version := public.save_finance_sheet(p_sheet_id, p_version, p_data, true, null);
  update public.finance_sheets set source_name = v_source where id = p_sheet_id;
  perform public.save_finance_sheet_draft(p_sheet_id, null);
  return v_version;
end;
$$;

revoke execute on function public.create_finance_sheet(uuid, uuid, text, jsonb, text) from public, anon;
revoke execute on function public.save_finance_sheet(uuid, integer, jsonb, boolean, text) from public, anon;
revoke execute on function public.save_finance_sheet_draft(uuid, jsonb, text) from public, anon;
revoke execute on function public.finalize_finance_sheet(uuid, integer, jsonb) from public, anon;
grant execute on function public.create_finance_sheet(uuid, uuid, text, jsonb, text) to authenticated;
grant execute on function public.save_finance_sheet(uuid, integer, jsonb, boolean, text) to authenticated;
grant execute on function public.save_finance_sheet_draft(uuid, jsonb, text) to authenticated;
grant execute on function public.finalize_finance_sheet(uuid, integer, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Dashboard cards from sheet cells
-- ---------------------------------------------------------------------------
create table public.dashboard_cards (
  id              uuid primary key default gen_random_uuid(),
  sheet_id        uuid not null references public.finance_sheets (id) on delete cascade,
  program_id      uuid not null references public.programs (id) on delete cascade,
  fiscal_year_id  uuid not null references public.fiscal_years (id) on delete cascade,
  title           text not null check (length(trim(title)) between 1 and 80),
  details         text check (details is null or length(details) <= 300),
  -- {r1, c1, r2, c2}: row and column ids, so the card follows inserted rows.
  range           jsonb not null check (jsonb_typeof(range) = 'object'),
  agg             text not null check (agg in ('sum', 'average', 'count', 'min', 'max', 'value')),
  number_format   text not null default 'peso' check (number_format in ('peso', 'number', 'integer', 'percent')),
  sub_label       text check (sub_label is null or length(sub_label) <= 60),
  sub_range       jsonb check (sub_range is null or jsonb_typeof(sub_range) = 'object'),
  sub_agg         text check (sub_agg is null or sub_agg in ('sum', 'average', 'count', 'min', 'max', 'value')),
  -- 'card': its own card. 'budget_line': a line under "Total budget for the year".
  placement       text not null default 'card' check (placement in ('card', 'budget_line')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid default auth.uid() references auth.users (id) on delete set null
);
create index dashboard_cards_scope_idx on public.dashboard_cards (program_id, fiscal_year_id);

-- Program and year always come from the sheet.
create or replace function public.dashboard_card_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select s.program_id, s.fiscal_year_id into new.program_id, new.fiscal_year_id
  from public.finance_sheets s where s.id = new.sheet_id;
  if new.program_id is null then
    raise exception 'Sheet not found' using errcode = 'P0002';
  end if;
  return new;
end;
$$;
revoke execute on function public.dashboard_card_scope() from public, anon, authenticated;
create trigger dashboard_card_scope before insert or update on public.dashboard_cards
  for each row execute function public.dashboard_card_scope();
create trigger set_updated_at before update on public.dashboard_cards
  for each row execute function public.set_updated_at();
select public.enable_audit('public.dashboard_cards');

alter table public.dashboard_cards enable row level security;
grant select, insert, update, delete on public.dashboard_cards to authenticated;

create policy "dashboard_cards: read" on public.dashboard_cards
  for select to authenticated using (public.has_program_access(program_id));
create policy "dashboard_cards: writers add" on public.dashboard_cards
  for insert to authenticated
  with check (public.can_write_program(program_id) and created_by = auth.uid());
create policy "dashboard_cards: owner or admin changes" on public.dashboard_cards
  for update to authenticated
  using (created_by = auth.uid() or public.can_manage_program(program_id))
  with check (public.can_write_program(program_id));
create policy "dashboard_cards: owner or admin removes" on public.dashboard_cards
  for delete to authenticated
  using (created_by = auth.uid() or public.can_manage_program(program_id));
