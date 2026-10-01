-- =============================================================================
-- PAYEW · Phase 2 · User administration & settings RPCs
-- Authorization for user management lives here (testable SQL). The admin-users
-- Edge Function only handles what needs the Auth admin API (create user,
-- set password) and calls can_admin_user() / is_program_admin() first.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Session revocation ("force logout")
-- Deleting auth.sessions kills refresh tokens; sessions_revoked_at makes RLS
-- reject access tokens issued before it, so the effect is immediate.
-- ---------------------------------------------------------------------------
alter table public.profiles add column sessions_revoked_at timestamptz;

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
    and (
      p.sessions_revoked_at is null
      or coalesce((select auth.jwt() ->> 'iat')::numeric, 0) > extract(epoch from p.sessions_revoked_at)
    )
$$;

-- user_program_ids() also has to honour revocation.
create or replace function public.user_program_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.program_id
  from public.program_memberships m
  join public.programs g on g.id = m.program_id
  where m.user_id = (select auth.uid())
    and public.current_user_role() is not null
    and g.deleted_at is null
$$;

-- ---------------------------------------------------------------------------
-- Who may manage whom
--   superadmin    → anyone
--   program_admin → active-or-inactive staff who belong to one of the admin's programs
-- ---------------------------------------------------------------------------
create or replace function public.can_admin_user(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when public.is_superadmin() then exists (
      select 1 from public.profiles t where t.id = p_user_id and t.deleted_at is null
    )
    when public.current_user_role() = 'program_admin' then exists (
      select 1
      from public.profiles t
      join public.program_memberships m on m.user_id = t.id
      where t.id = p_user_id
        and t.role = 'program_staff'
        and t.deleted_at is null
        and m.program_id in (select public.user_program_ids())
    )
    else false
  end
$$;

-- ---------------------------------------------------------------------------
-- admin_update_user(user_id, changes)
-- Allowed keys:
--   everyone who can_admin_user: full_name, position, office, contact_no,
--                                province_id, can_edit_activities, is_active
--   superadmin only:            role, program_id, program_ids (array of uuid)
-- ---------------------------------------------------------------------------
create or replace function public.admin_update_user(p_user_id uuid, p_changes jsonb)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller   public.app_role := public.current_user_role();
  v_target   public.profiles;
  v_allowed  text[] := array['full_name', 'position', 'office', 'contact_no', 'province_id',
                              'can_edit_activities', 'is_active'];
  v_key      text;
  v_role     public.app_role;
  v_program  uuid;
  v_programs uuid[];
begin
  if v_caller is null or v_caller = 'program_staff' or not public.can_admin_user(p_user_id) then
    raise exception 'You are not allowed to manage this user' using errcode = '42501';
  end if;
  if v_caller = 'superadmin' then
    v_allowed := v_allowed || array['role', 'program_id', 'program_ids'];
  end if;

  for v_key in select jsonb_object_keys(coalesce(p_changes, '{}'::jsonb)) loop
    if not v_key = any (v_allowed) then
      raise exception 'Field "%" cannot be changed by your role', v_key using errcode = '42501';
    end if;
  end loop;

  if p_user_id = (select auth.uid()) and (p_changes ? 'role' or p_changes ? 'is_active') then
    raise exception 'You cannot change your own role or account status' using errcode = '42501';
  end if;

  select * into v_target from public.profiles where id = p_user_id;

  v_role := coalesce((p_changes ->> 'role')::public.app_role, v_target.role);
  v_program := case
    when v_role = 'superadmin' then null
    when p_changes ? 'program_id' then nullif(p_changes ->> 'program_id', '')::uuid
    else v_target.program_id
  end;
  if v_role <> 'superadmin' and v_program is null then
    raise exception 'A program is required for program admins and staff' using errcode = '23514';
  end if;

  update public.profiles p set
    full_name = case when p_changes ? 'full_name' then trim(p_changes ->> 'full_name') else p.full_name end,
    position = case when p_changes ? 'position' then nullif(trim(p_changes ->> 'position'), '') else p.position end,
    office = case when p_changes ? 'office' then nullif(trim(p_changes ->> 'office'), '') else p.office end,
    contact_no = case when p_changes ? 'contact_no' then nullif(trim(p_changes ->> 'contact_no'), '') else p.contact_no end,
    province_id = case when p_changes ? 'province_id' then nullif(p_changes ->> 'province_id', '')::uuid else p.province_id end,
    can_edit_activities = coalesce((p_changes ->> 'can_edit_activities')::boolean, p.can_edit_activities),
    is_active = coalesce((p_changes ->> 'is_active')::boolean, p.is_active),
    role = v_role,
    program_id = v_program,
    sessions_revoked_at = case
      when (p_changes ->> 'is_active')::boolean is false then now()
      else p.sessions_revoked_at
    end
  where p.id = p_user_id
  returning * into v_target;

  -- Program scope
  if v_role = 'superadmin' then
    delete from public.program_memberships where user_id = p_user_id;
  elsif p_changes ? 'program_ids' and v_role = 'program_admin' then
    select coalesce(array_agg(distinct x::uuid), '{}') into v_programs
    from jsonb_array_elements_text(p_changes -> 'program_ids') x;
    v_programs := v_programs || v_program;
    delete from public.program_memberships
      where user_id = p_user_id and program_id <> all (v_programs);
    insert into public.program_memberships (program_id, user_id, created_by)
      select unnest(v_programs), p_user_id, (select auth.uid())
      on conflict do nothing;
  elsif v_role = 'program_staff' then
    -- Staff belong to exactly one program.
    delete from public.program_memberships where user_id = p_user_id and program_id <> v_program;
  end if;

  if (p_changes ->> 'is_active')::boolean is false then
    delete from auth.sessions where user_id = p_user_id;
  end if;

  return v_target;
end;
$$;

create or replace function public.admin_force_logout(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_admin_user(p_user_id) then
    raise exception 'You are not allowed to manage this user' using errcode = '42501';
  end if;
  update public.profiles set sessions_revoked_at = now() where id = p_user_id;
  delete from auth.sessions where user_id = p_user_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Fiscal years: switch the "current" year atomically (unique partial index).
-- ---------------------------------------------------------------------------
create or replace function public.set_current_fiscal_year(p_fiscal_year_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_superadmin() then
    raise exception 'Only a superadmin can change the current fiscal year' using errcode = '42501';
  end if;
  if not exists (select 1 from public.fiscal_years where id = p_fiscal_year_id) then
    raise exception 'Fiscal year not found' using errcode = 'P0002';
  end if;
  update public.fiscal_years set is_current = false where is_current and id <> p_fiscal_year_id;
  update public.fiscal_years set is_current = true where id = p_fiscal_year_id;
end;
$$;

-- Fiscal-year notifications: admins land on Settings, staff on the dashboard.
create or replace function public.notify_fiscal_year_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
begin
  if tg_op = 'INSERT' then
    v_title := format('Fiscal year %s was created (%s)', new.label, new.status);
  elsif new.status is distinct from old.status then
    v_title := format('Fiscal year %s is now %s', new.label, new.status);
  else
    return null;
  end if;

  insert into public.notifications (user_id, type, title, link, entity_type, entity_id, created_by)
  select p.id, 'system', v_title,
         case when p.role = 'program_staff' then '/dashboard' else '/settings/fiscal-years' end,
         'fiscal_year', new.id, (select auth.uid())
  from public.profiles p
  where p.is_active and p.deleted_at is null and p.id is distinct from (select auth.uid());
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke execute on function public.can_admin_user(uuid) from public, anon;
revoke execute on function public.admin_update_user(uuid, jsonb) from public, anon;
revoke execute on function public.admin_force_logout(uuid) from public, anon;
revoke execute on function public.set_current_fiscal_year(uuid) from public, anon;
grant execute on function public.can_admin_user(uuid) to authenticated, service_role;
grant execute on function public.admin_update_user(uuid, jsonb) to authenticated;
grant execute on function public.admin_force_logout(uuid) to authenticated;
grant execute on function public.set_current_fiscal_year(uuid) to authenticated;
