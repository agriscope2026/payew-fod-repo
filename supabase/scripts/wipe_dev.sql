-- =============================================================================
-- PAYEW · DEV ONLY · Wipe everything the PAYEW migrations and seed created,
-- so `supabase db push --include-seed` can rebuild the database from scratch.
--
-- Run in Supabase Dashboard → SQL Editor. Destroys all PAYEW data.
-- Never run this on a production project.
-- Leaves Supabase's own schemas (auth, storage, extensions…) intact.
-- =============================================================================

-- 1. Stop the triggers PAYEW added to auth.users.
drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists on_auth_user_email_changed on auth.users;

-- 2. Drop every table, view and sequence in the public schema (PAYEW owns them all).
do $$
declare
  r record;
begin
  for r in select tablename from pg_tables where schemaname = 'public' loop
    execute format('drop table if exists public.%I cascade', r.tablename);
  end loop;
  for r in select viewname from pg_views where schemaname = 'public' loop
    execute format('drop view if exists public.%I cascade', r.viewname);
  end loop;
end;
$$;

-- 3. Drop every PAYEW function in public (skips functions owned by extensions).
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and not exists (
        select 1 from pg_depend d
        where d.objid = p.oid and d.deptype = 'e'
      )
  loop
    execute format('drop function if exists %s cascade', r.sig);
  end loop;
end;
$$;

-- 4. Drop PAYEW enum types.
drop type if exists public.app_role cascade;
drop type if exists public.fiscal_year_status cascade;

-- 5. Remove the seeded demo accounts (profiles were already dropped with the tables).
delete from auth.users where email like '%@payew.local';
-- To remove EVERY account in this project's Auth instead, use:
-- delete from auth.users;

-- 6. Forget migration history so the CLI re-applies all migrations in order.
drop schema if exists supabase_migrations cascade;

-- Check: both should return 0 rows.
select tablename from pg_tables where schemaname = 'public';
select email from auth.users where email like '%@payew.local';
