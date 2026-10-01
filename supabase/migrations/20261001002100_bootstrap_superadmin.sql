-- =============================================================================
-- Phase 12: first-account bootstrap
--   Accounts made in the Supabase dashboard carry no PAYEW role or program, so
--   the profile could not be created (a non-superadmin needs a program). Now:
--   * the first account on a system without a superadmin becomes the superadmin;
--   * later accounts without a program are refused with a clear message (create
--     them in PAYEW → Users, which sets the role and program).
-- Public sign-up stays disabled (config.toml / Auth settings).
-- =============================================================================

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

  if v_role <> 'superadmin' and v_program is null then
    if not exists (select 1 from public.profiles p where p.role = 'superadmin' and p.deleted_at is null) then
      v_role := 'superadmin';
    else
      raise exception 'New accounts need a program. Create users in PAYEW → Users (or set app_metadata.program_code).'
        using errcode = '23514';
    end if;
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
