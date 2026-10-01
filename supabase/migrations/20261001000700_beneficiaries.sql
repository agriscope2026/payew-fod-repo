-- =============================================================================
-- PAYEW · Phase 4 · Beneficiaries / Farmers' Associations
-- One region-wide registry (an FA is often served by several programs), so
-- every active user can read it and duplicates are caught across programs.
-- Each record is owned by the program that registered it; only that program's
-- writers (or the superadmin) can edit it, and only managers can trash it.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Name key for duplicate detection: lower-case, punctuation removed, generic
-- words dropped ("Buguias Highland Vegetable Farmers Assn., Inc." → "buguias highland vegetable").
-- ---------------------------------------------------------------------------
create or replace function public.beneficiary_name_key(p_name text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select trim(regexp_replace(
    regexp_replace(
      regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9ñ ]+', ' ', 'g'),
      '\m(the|of|and|ng|sa|farmers?|growers?|producers?|association|assn|assoc|inc|incorporated|cooperative|coop|multi|purpose|mpc|org|organization|group|federation)\M',
      ' ', 'g'
    ),
    '\s+', ' ', 'g'
  ))
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.beneficiaries (
  id                        uuid primary key default gen_random_uuid(),
  registered_by_program_id  uuid references public.programs (id) on delete set null,
  type_id                   uuid not null references public.beneficiary_types (id) on delete restrict,
  name                      text not null check (length(trim(name)) between 2 and 200),
  name_key                  text generated always as (public.beneficiary_name_key(name)) stored,
  registration_no           text check (registration_no is null or length(registration_no) <= 60),
  registration_agency       text check (registration_agency is null or length(registration_agency) <= 60),
  province_id               uuid not null references public.provinces (id) on delete restrict,
  municipality_id           uuid references public.municipalities (id) on delete restrict,
  barangay_id               uuid references public.barangays (id) on delete restrict,
  address_line              text check (address_line is null or length(address_line) <= 200),
  contact_person            text check (contact_person is null or length(contact_person) <= 120),
  contact_no                text check (contact_no is null or length(contact_no) <= 40),
  email                     text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  members_male              integer not null default 0 check (members_male >= 0),
  members_female            integer not null default 0 check (members_female >= 0),
  members_total             integer generated always as (members_male + members_female) stored,
  members_ip                integer not null default 0 check (members_ip >= 0),
  members_youth             integer not null default 0 check (members_youth >= 0),
  members_pwd               integer not null default 0 check (members_pwd >= 0),
  members_senior            integer not null default 0 check (members_senior >= 0),
  area_ha                   numeric(12, 2) check (area_ha is null or area_ha >= 0),
  status                    text not null default 'active' check (status in ('active', 'inactive', 'dissolved')),
  latitude                  numeric(9, 6) check (latitude is null or latitude between -90 and 90),
  longitude                 numeric(9, 6) check (longitude is null or longitude between -180 and 180),
  remarks                   text check (remarks is null or length(remarks) <= 2000),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  created_by                uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at                timestamptz,
  deleted_by                uuid references auth.users (id) on delete set null,
  check ((latitude is null) = (longitude is null)),
  -- Sector counts are subsets of the membership.
  check (members_ip <= members_male + members_female
     and members_youth <= members_male + members_female
     and members_pwd <= members_male + members_female
     and members_senior <= members_male + members_female)
);

create index beneficiaries_name_key_trgm_idx on public.beneficiaries using gin (name_key extensions.gin_trgm_ops);
create index beneficiaries_province_idx on public.beneficiaries (province_id);
create index beneficiaries_municipality_idx on public.beneficiaries (municipality_id);
create index beneficiaries_type_idx on public.beneficiaries (type_id);
create index beneficiaries_program_idx on public.beneficiaries (registered_by_program_id);
create unique index beneficiaries_registration_no_idx
  on public.beneficiaries (lower(registration_no))
  where registration_no is not null and deleted_at is null;

create table public.beneficiary_commodities (
  beneficiary_id  uuid not null references public.beneficiaries (id) on delete cascade,
  commodity_id    uuid not null references public.commodities (id) on delete restrict,
  primary key (beneficiary_id, commodity_id)
);
create index beneficiary_commodities_commodity_idx on public.beneficiary_commodities (commodity_id);

create trigger set_updated_at before update on public.beneficiaries
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Location consistency: barangay ⊂ municipality ⊂ province. Parents are filled
-- in from the most specific level given; contradictions are rejected.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_location_hierarchy()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_parent uuid;
begin
  if new.barangay_id is not null then
    select municipality_id into v_parent from public.barangays where id = new.barangay_id;
    if new.municipality_id is null then
      new.municipality_id := v_parent;
    elsif new.municipality_id <> v_parent then
      raise exception 'The barangay is not in the selected municipality' using errcode = '23514';
    end if;
  end if;
  if new.municipality_id is not null then
    select province_id into v_parent from public.municipalities where id = new.municipality_id;
    if new.province_id is null then
      new.province_id := v_parent;
    elsif new.province_id <> v_parent then
      raise exception 'The municipality is not in the selected province' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger enforce_location_hierarchy
  before insert or update of province_id, municipality_id, barangay_id on public.beneficiaries
  for each row execute function public.enforce_location_hierarchy();

-- ---------------------------------------------------------------------------
-- Write rules
-- ---------------------------------------------------------------------------
create or replace function public.can_edit_beneficiary(p_beneficiary_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.beneficiaries b
    where b.id = p_beneficiary_id
      and case when b.registered_by_program_id is null then public.is_superadmin()
               else public.can_write_program(b.registered_by_program_id) end
  )
$$;

-- Only superadmins re-assign ownership; only managers trash/restore (stamps deleted_by).
create or replace function public.guard_beneficiary_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;
  if new.registered_by_program_id is distinct from old.registered_by_program_id
     and not public.is_superadmin() then
    raise exception 'Only a superadmin can change the registering program' using errcode = '42501';
  end if;
  if new.deleted_at is distinct from old.deleted_at then
    if not (case when old.registered_by_program_id is null then public.is_superadmin()
                 else public.can_manage_program(old.registered_by_program_id) end) then
      raise exception 'Only program admins can delete or restore beneficiaries' using errcode = '42501';
    end if;
    new.deleted_by := case when new.deleted_at is null then null else (select auth.uid()) end;
  end if;
  return new;
end;
$$;

create trigger guard_beneficiary_update before update on public.beneficiaries
  for each row execute function public.guard_beneficiary_update();

select public.enable_audit('public.beneficiaries');

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.beneficiaries enable row level security;
alter table public.beneficiary_commodities enable row level security;

-- No hard deletes; audit columns (created_*, deleted_by, id) are not client-writable.
revoke delete, update on public.beneficiaries from authenticated;
grant update (
  registered_by_program_id, type_id, name, registration_no, registration_agency,
  province_id, municipality_id, barangay_id, address_line, contact_person, contact_no, email,
  members_male, members_female, members_ip, members_youth, members_pwd, members_senior,
  area_ha, status, latitude, longitude, remarks, deleted_at
) on public.beneficiaries to authenticated;

create policy "beneficiaries: read" on public.beneficiaries
  for select to authenticated
  using (
    (select public.current_user_role()) is not null
    and (
      deleted_at is null
      or case when registered_by_program_id is null then (select public.is_superadmin())
              else public.can_manage_program(registered_by_program_id) end
    )
  );

create policy "beneficiaries: insert" on public.beneficiaries
  for insert to authenticated
  with check (
    case when registered_by_program_id is null then (select public.is_superadmin())
         else public.can_write_program(registered_by_program_id) end
  );

create policy "beneficiaries: update" on public.beneficiaries
  for update to authenticated
  using (
    case when registered_by_program_id is null then (select public.is_superadmin())
         else public.can_write_program(registered_by_program_id) end
  )
  with check (
    case when registered_by_program_id is null then (select public.is_superadmin())
         else public.can_write_program(registered_by_program_id) end
  );

create policy "beneficiary_commodities: read" on public.beneficiary_commodities
  for select to authenticated
  using ((select public.current_user_role()) is not null);

create policy "beneficiary_commodities: insert" on public.beneficiary_commodities
  for insert to authenticated
  with check (public.can_edit_beneficiary(beneficiary_id));

create policy "beneficiary_commodities: delete" on public.beneficiary_commodities
  for delete to authenticated
  using (public.can_edit_beneficiary(beneficiary_id));

-- ---------------------------------------------------------------------------
-- Duplicate detection (fuzzy, pg_trgm). Runs as the caller, so RLS applies.
-- ---------------------------------------------------------------------------
create or replace function public.find_similar_beneficiaries(
  p_name text,
  p_municipality_id uuid default null,
  p_exclude_id uuid default null,
  p_limit integer default 5
)
returns table (
  id uuid,
  name text,
  province_id uuid,
  municipality_id uuid,
  registration_no text,
  similarity real,
  same_municipality boolean
)
language sql
stable
set search_path = ''
as $$
  with q as (select public.beneficiary_name_key(p_name) as key)
  select b.id, b.name, b.province_id, b.municipality_id, b.registration_no,
         extensions.similarity(b.name_key, q.key) as similarity,
         coalesce(b.municipality_id = p_municipality_id, false) as same_municipality
  from public.beneficiaries b, q
  where b.deleted_at is null
    and (p_exclude_id is null or b.id <> p_exclude_id)
    and length(q.key) > 0
    and extensions.similarity(b.name_key, q.key) >= 0.4
  order by (b.name_key = q.key) desc, same_municipality desc, similarity desc
  limit least(greatest(p_limit, 1), 20)
$$;

-- Batch version for Excel import: best match per input row.
-- p_rows: [{ "name": "...", "municipality_id": "..." }, ...] (array order = row index)
create or replace function public.match_beneficiaries(p_rows jsonb)
returns table (idx integer, id uuid, name text, similarity real, same_municipality boolean)
language sql
stable
set search_path = ''
as $$
  select r.idx::integer - 1, m.id, m.name, m.similarity, m.same_municipality
  from jsonb_array_elements(p_rows) with ordinality as r(value, idx)
  cross join lateral public.find_similar_beneficiaries(
    r.value ->> 'name',
    nullif(r.value ->> 'municipality_id', '')::uuid,
    null,
    1
  ) m
  where m.similarity >= 0.6
$$;

-- ---------------------------------------------------------------------------
-- Bulk import (all-or-nothing). Runs as the caller: RLS and triggers apply to
-- every row, so a user can only import into programs they can write to.
-- p_rows: array of beneficiary fields plus "commodity_ids": [uuid, ...]
-- ---------------------------------------------------------------------------
create or replace function public.import_beneficiaries(p_program_id uuid, p_rows jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  r       jsonb;
  v_id    uuid;
  v_count integer := 0;
begin
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'Nothing to import' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) > 2000 then
    raise exception 'Import at most 2,000 rows at a time' using errcode = '22023';
  end if;

  for r in select value from jsonb_array_elements(p_rows) loop
    insert into public.beneficiaries (
      registered_by_program_id, type_id, name, registration_no, registration_agency,
      province_id, municipality_id, barangay_id, address_line, contact_person, contact_no, email,
      members_male, members_female, members_ip, members_youth, members_pwd, members_senior,
      area_ha, status, latitude, longitude, remarks
    ) values (
      p_program_id,
      (r ->> 'type_id')::uuid,
      trim(r ->> 'name'),
      nullif(trim(r ->> 'registration_no'), ''),
      nullif(trim(r ->> 'registration_agency'), ''),
      (r ->> 'province_id')::uuid,
      nullif(r ->> 'municipality_id', '')::uuid,
      nullif(r ->> 'barangay_id', '')::uuid,
      nullif(trim(r ->> 'address_line'), ''),
      nullif(trim(r ->> 'contact_person'), ''),
      nullif(trim(r ->> 'contact_no'), ''),
      nullif(trim(r ->> 'email'), ''),
      coalesce((r ->> 'members_male')::integer, 0),
      coalesce((r ->> 'members_female')::integer, 0),
      coalesce((r ->> 'members_ip')::integer, 0),
      coalesce((r ->> 'members_youth')::integer, 0),
      coalesce((r ->> 'members_pwd')::integer, 0),
      coalesce((r ->> 'members_senior')::integer, 0),
      nullif(r ->> 'area_ha', '')::numeric,
      coalesce(nullif(r ->> 'status', ''), 'active'),
      nullif(r ->> 'latitude', '')::numeric,
      nullif(r ->> 'longitude', '')::numeric,
      nullif(trim(r ->> 'remarks'), '')
    )
    returning id into v_id;

    insert into public.beneficiary_commodities (beneficiary_id, commodity_id)
    select v_id, c::uuid
    from jsonb_array_elements_text(coalesce(r -> 'commodity_ids', '[]'::jsonb)) c
    on conflict do nothing;

    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke execute on function public.find_similar_beneficiaries(text, uuid, uuid, integer) from public, anon;
revoke execute on function public.match_beneficiaries(jsonb) from public, anon;
revoke execute on function public.import_beneficiaries(uuid, jsonb) from public, anon;
revoke execute on function public.can_edit_beneficiary(uuid) from public, anon;
grant execute on function public.find_similar_beneficiaries(text, uuid, uuid, integer) to authenticated;
grant execute on function public.match_beneficiaries(jsonb) to authenticated;
grant execute on function public.import_beneficiaries(uuid, jsonb) to authenticated;
grant execute on function public.can_edit_beneficiary(uuid) to authenticated;
