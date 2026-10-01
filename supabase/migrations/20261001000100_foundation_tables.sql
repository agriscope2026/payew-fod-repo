-- =============================================================================
-- PAYEW · Phase 1 · Foundation tables
-- Identity, programs, fiscal years, master lists, settings.
-- Domain tables (activities, finance, comments, ...) arrive in later phases.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.app_role as enum ('superadmin', 'program_admin', 'program_staff');
create type public.fiscal_year_status as enum ('draft', 'open', 'closed', 'locked');

-- ---------------------------------------------------------------------------
-- Shared trigger: maintain updated_at
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Locations (Cordillera: provinces → municipalities/cities → barangays)
-- ---------------------------------------------------------------------------
create table public.provinces (
  id          uuid primary key default gen_random_uuid(),
  psgc_code   text unique,
  name        text not null unique,
  is_city     boolean not null default false, -- Baguio City is listed at province level
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references auth.users (id) on delete set null,
  deleted_at  timestamptz
);

create table public.municipalities (
  id           uuid primary key default gen_random_uuid(),
  province_id  uuid not null references public.provinces (id) on delete restrict,
  psgc_code    text unique,
  name         text not null,
  is_city      boolean not null default false,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references auth.users (id) on delete set null,
  deleted_at   timestamptz,
  unique (province_id, name)
);
create index municipalities_province_idx on public.municipalities (province_id);

create table public.barangays (
  id               uuid primary key default gen_random_uuid(),
  municipality_id  uuid not null references public.municipalities (id) on delete restrict,
  psgc_code        text unique,
  name             text not null,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid references auth.users (id) on delete set null,
  deleted_at       timestamptz,
  unique (municipality_id, name)
);
create index barangays_municipality_idx on public.barangays (municipality_id);

-- ---------------------------------------------------------------------------
-- Programs & fiscal years
-- ---------------------------------------------------------------------------
create table public.programs (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique check (code ~ '^[A-Z0-9_-]{2,20}$'),
  name         text not null check (length(trim(name)) > 0),
  description  text,
  color        text not null default '#15803d' check (color ~ '^#[0-9a-fA-F]{6}$'),
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references auth.users (id) on delete set null,
  deleted_at   timestamptz
);

create table public.fiscal_years (
  id          uuid primary key default gen_random_uuid(),
  year        integer not null unique check (year between 2000 and 2100),
  label       text not null,
  start_date  date not null,
  end_date    date not null,
  status      public.fiscal_year_status not null default 'draft',
  is_current  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references auth.users (id) on delete set null,
  check (end_date > start_date)
);
-- At most one "current" fiscal year.
create unique index fiscal_years_one_current_idx on public.fiscal_years (is_current) where is_current;

-- ---------------------------------------------------------------------------
-- Profiles & program memberships
-- ---------------------------------------------------------------------------
create table public.profiles (
  id                    uuid primary key references auth.users (id) on delete cascade,
  email                 text not null,
  full_name             text not null default '',
  role                  public.app_role not null default 'program_staff',
  program_id            uuid references public.programs (id) on delete set null, -- primary/default program
  position              text,
  office                text,
  province_id           uuid references public.provinces (id) on delete set null,
  contact_no            text,
  avatar_key            text, -- R2 object key
  is_active             boolean not null default true,
  can_edit_activities   boolean not null default false,
  must_change_password  boolean not null default false,
  last_login_at         timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            uuid references auth.users (id) on delete set null,
  deleted_at            timestamptz,
  check (role = 'superadmin' or program_id is not null)
);
create index profiles_program_idx on public.profiles (program_id);
create index profiles_role_idx on public.profiles (role);

-- A program admin may manage several programs; staff normally belong to one.
-- The user's role lives on profiles; this table only grants program scope.
create table public.program_memberships (
  program_id  uuid not null references public.programs (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users (id) on delete set null,
  primary key (program_id, user_id)
);
create index program_memberships_user_idx on public.program_memberships (user_id);

-- ---------------------------------------------------------------------------
-- Master lists (managed in Settings, reused system-wide)
-- ---------------------------------------------------------------------------
create table public.fund_sources (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  description text,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references auth.users (id) on delete set null,
  deleted_at  timestamptz
);

create table public.expense_classes (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique, -- PS / MOOE / CO / FinEx
  name        text not null,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references auth.users (id) on delete set null,
  deleted_at  timestamptz
);

create table public.uacs_codes (
  id                uuid primary key default gen_random_uuid(),
  expense_class_id  uuid not null references public.expense_classes (id) on delete restrict,
  code              text not null unique,
  name              text not null,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid references auth.users (id) on delete set null,
  deleted_at        timestamptz
);
create index uacs_codes_expense_class_idx on public.uacs_codes (expense_class_id);

create table public.commodities (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  category    text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references auth.users (id) on delete set null,
  deleted_at  timestamptz
);

create table public.units (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique,
  abbreviation  text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references auth.users (id) on delete set null,
  deleted_at    timestamptz
);

-- program_id null = global category (superadmin); otherwise program-specific (program admin).
create table public.activity_categories (
  id          uuid primary key default gen_random_uuid(),
  program_id  uuid references public.programs (id) on delete cascade,
  name        text not null,
  description text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references auth.users (id) on delete set null,
  deleted_at  timestamptz
);
create unique index activity_categories_name_idx
  on public.activity_categories (coalesce(program_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

create table public.beneficiary_types (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references auth.users (id) on delete set null,
  deleted_at  timestamptz
);

-- ---------------------------------------------------------------------------
-- Global settings (key/value). Examples: validation strictness, RAG thresholds,
-- overdue-notice template, maintenance banner.
-- ---------------------------------------------------------------------------
create table public.app_settings (
  key          text primary key,
  value        jsonb not null,
  description  text,
  updated_at   timestamptz not null default now(),
  updated_by   uuid references auth.users (id) on delete set null
);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'provinces', 'municipalities', 'barangays', 'programs', 'fiscal_years', 'profiles',
    'fund_sources', 'expense_classes', 'uacs_codes', 'commodities', 'units',
    'activity_categories', 'beneficiary_types', 'app_settings'
  ]
  loop
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      t
    );
  end loop;
end;
$$;
