-- =============================================================================
-- Fix: creating users through Supabase Auth failed with
--   "Database error creating new user".
--   GoTrue's admin createUser inserts auth.users first and sets app_metadata
--   (app_role, program_id) with a later UPDATE in the same transaction. The
--   insert trigger saw no program and refused the account. Now:
--   * the profile is created as soon as the metadata names a role/program
--     (on insert or on the follow-up update);
--   * the first account on a system without a superadmin still becomes the
--     superadmin;
--   * a deferred check at commit still refuses accounts that end up with no
--     program (e.g. added in the Supabase dashboard once a superadmin exists).
-- =============================================================================

create or replace function public.provision_profile(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  u          auth.users;
  v_meta     jsonb;
  v_role     public.app_role;
  v_program  uuid;
begin
  if exists (select 1 from public.profiles p where p.id = p_user_id) then
    return true;
  end if;
  select * into u from auth.users where id = p_user_id;
  if not found then
    return false;
  end if;

  v_meta := coalesce(u.raw_app_meta_data, '{}'::jsonb);
  v_role := coalesce(nullif(v_meta ->> 'app_role', ''), 'program_staff')::public.app_role;
  v_program := nullif(v_meta ->> 'program_id', '')::uuid;
  if v_program is null and nullif(v_meta ->> 'program_code', '') is not null then
    select g.id into v_program from public.programs g where g.code = upper(v_meta ->> 'program_code');
  end if;

  if v_role <> 'superadmin' and v_program is null then
    if exists (select 1 from public.profiles p where p.role = 'superadmin' and p.deleted_at is null) then
      return false; -- the role and program may still arrive in this transaction
    end if;
    v_role := 'superadmin';
  end if;

  insert into public.profiles (id, email, full_name, role, program_id, position, must_change_password, created_by)
  values (
    u.id,
    u.email,
    coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), split_part(u.email, '@', 1)),
    v_role,
    case when v_role = 'superadmin' then null else v_program end,
    nullif(u.raw_user_meta_data ->> 'position', ''),
    coalesce((v_meta ->> 'must_change_password')::boolean, false),
    nullif(v_meta ->> 'created_by', '')::uuid
  );
  return true;
end;
$$;

-- Insert and app_metadata updates: create the profile once the data is there.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.provision_profile(new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_metadata_set on auth.users;
create trigger on_auth_user_metadata_set
  after update of raw_app_meta_data on auth.users
  for each row
  when (old.raw_app_meta_data is distinct from new.raw_app_meta_data)
  execute function public.handle_new_user();

-- At commit: every new account must have a profile by now.
create or replace function public.require_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from auth.users u where u.id = new.id)
     and not public.provision_profile(new.id) then
    raise exception 'New accounts need a program. Create users in PAYEW → Users (or set app_metadata.program_code).'
      using errcode = '23514';
  end if;
  return null;
end;
$$;

drop trigger if exists on_auth_user_requires_profile on auth.users;
create constraint trigger on_auth_user_requires_profile
  after insert on auth.users
  deferrable initially deferred
  for each row execute function public.require_user_profile();

revoke execute on function public.provision_profile(uuid) from public, anon, authenticated;
revoke execute on function public.require_user_profile() from public, anon, authenticated;
