-- =============================================================================
-- PAYEW · Phase 1 · Auth helpers, profile provisioning, session RPCs
-- All helpers are SECURITY DEFINER with an empty search_path so that RLS
-- policies can call them without recursive policy evaluation.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Role / scope helpers (used by every RLS policy)
-- ---------------------------------------------------------------------------

-- Role of the signed-in user, or null when signed out / inactive / deleted.
create or replace function public.current_user_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.id = (select auth.uid())
    and p.is_active
    and p.deleted_at is null
$$;

create or replace function public.is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_user_role() = 'superadmin', false)
$$;

-- Programs the signed-in (active) user belongs to. Superadmins are not
-- members; policies combine this with is_superadmin().
create or replace function public.user_program_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.program_id
  from public.program_memberships m
  join public.profiles p on p.id = m.user_id
  join public.programs g on g.id = m.program_id
  where m.user_id = (select auth.uid())
    and p.is_active
    and p.deleted_at is null
    and g.deleted_at is null
$$;

create or replace function public.is_program_admin(p_program_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_user_role() = 'program_admin', false)
     and p_program_id in (select public.user_program_ids())
$$;

-- Read scope: superadmin, or any member of the program.
create or replace function public.has_program_access(p_program_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_superadmin()
      or p_program_id in (select public.user_program_ids())
$$;

-- Write/manage scope: superadmin, or admin of the program.
create or replace function public.can_manage_program(p_program_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_superadmin() or public.is_program_admin(p_program_id)
$$;

-- True when the signed-in user may see the target user's profile:
-- self, viewer is superadmin, target is a superadmin (authors of directives),
-- or the two share at least one program.
create or replace function public.can_view_profile(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id = (select auth.uid())
      or public.is_superadmin()
      or (
        public.current_user_role() is not null
        and exists (select 1 from public.profiles p where p.id = p_user_id and p.role = 'superadmin')
      )
      or exists (
        select 1
        from public.program_memberships m
        where m.user_id = p_user_id
          and m.program_id in (select public.user_program_ids())
      )
$$;

-- ---------------------------------------------------------------------------
-- Profile provisioning from auth.users
-- Role and program come from raw_app_meta_data, which only the service role
-- (Edge Functions) can set, so a user can never self-assign a role.
--   app_metadata: { app_role, program_id | program_code, must_change_password, created_by }
--   user_metadata: { full_name, position }
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta     jsonb := coalesce(new.raw_app_meta_data, '{}'::jsonb);
  v_role     public.app_role := coalesce(nullif(v_meta ->> 'app_role', ''), 'program_staff')::public.app_role;
  v_program  uuid := nullif(v_meta ->> 'program_id', '')::uuid;
begin
  if v_program is null and nullif(v_meta ->> 'program_code', '') is not null then
    select g.id into v_program from public.programs g where g.code = upper(v_meta ->> 'program_code');
  end if;

  insert into public.profiles (id, email, full_name, role, program_id, position, must_change_password, created_by)
  values (
    new.id,
    new.email,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1)),
    v_role,
    case when v_role = 'superadmin' then null else v_program end,
    nullif(new.raw_user_meta_data ->> 'position', ''),
    coalesce((v_meta ->> 'must_change_password')::boolean, false),
    nullif(v_meta ->> 'created_by', '')::uuid
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.handle_user_email_change();

-- Keep the primary program in program_memberships.
create or replace function public.sync_primary_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role <> 'superadmin' and new.program_id is not null then
    insert into public.program_memberships (program_id, user_id, created_by)
    values (new.program_id, new.id, new.created_by)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger sync_primary_membership
  after insert or update of program_id, role on public.profiles
  for each row execute function public.sync_primary_membership();

-- ---------------------------------------------------------------------------
-- Guard: only superadmins may change a program's code, archive or delete it.
-- Program admins may edit the program profile (name, description, color).
-- Calls without a JWT (service role, migrations) are trusted.
-- ---------------------------------------------------------------------------
create or replace function public.guard_program_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or public.is_superadmin() then
    return new;
  end if;
  if new.code is distinct from old.code
     or new.archived_at is distinct from old.archived_at
     or new.deleted_at is distinct from old.deleted_at then
    raise exception 'Only a superadmin can change the program code, archive or delete a program'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger guard_program_update
  before update on public.programs
  for each row execute function public.guard_program_update();

-- ---------------------------------------------------------------------------
-- Session RPCs (called by the frontend)
-- ---------------------------------------------------------------------------

-- Called right after sign-in. Rejects inactive users and stamps last_login_at.
create or replace function public.record_login()
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
begin
  select * into v_profile from public.profiles where id = (select auth.uid());
  if v_profile.id is null then
    raise exception 'No profile exists for this account' using errcode = '42501';
  end if;
  if not v_profile.is_active or v_profile.deleted_at is not null then
    raise exception 'This account is deactivated' using errcode = '42501';
  end if;

  update public.profiles set last_login_at = now() where id = v_profile.id
  returning * into v_profile;
  return v_profile;
end;
$$;

-- Clears the first-login flag after the client has called auth.updateUser({ password }).
create or replace function public.complete_password_change()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles set must_change_password = false where id = (select auth.uid());
$$;

revoke execute on function public.record_login() from public, anon;
revoke execute on function public.complete_password_change() from public, anon;
grant execute on function public.record_login() to authenticated;
grant execute on function public.complete_password_change() to authenticated;
-- Trigger functions are not meant to be called directly.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.handle_user_email_change() from public, anon, authenticated;
revoke execute on function public.sync_primary_membership() from public, anon, authenticated;
