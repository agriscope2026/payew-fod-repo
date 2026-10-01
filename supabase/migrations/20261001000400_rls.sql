-- =============================================================================
-- PAYEW · Phase 1 · Row Level Security
-- Every table has RLS enabled. Anonymous users get nothing; access requires an
-- active profile. Program-scoped rows use has_program_access / can_manage_program.
-- =============================================================================

-- Anonymous visitors never read app tables directly.
revoke all on all tables in schema public from anon;

do $$
declare
  t text;
begin
  foreach t in array array[
    'provinces', 'municipalities', 'barangays', 'programs', 'fiscal_years', 'profiles',
    'program_memberships', 'fund_sources', 'expense_classes', 'uacs_codes', 'commodities',
    'units', 'activity_categories', 'beneficiary_types', 'app_settings', 'audit_logs',
    'notifications'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Master lists & fiscal years: readable by any active user, written by superadmin.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'provinces', 'municipalities', 'barangays', 'fund_sources', 'expense_classes',
    'uacs_codes', 'commodities', 'units', 'beneficiary_types', 'fiscal_years', 'app_settings'
  ]
  loop
    execute format(
      'create policy "%1$s: active users read" on public.%1$I for select to authenticated '
      'using ((select public.current_user_role()) is not null)',
      t
    );
    execute format(
      'create policy "%1$s: superadmin insert" on public.%1$I for insert to authenticated '
      'with check ((select public.is_superadmin()))',
      t
    );
    execute format(
      'create policy "%1$s: superadmin update" on public.%1$I for update to authenticated '
      'using ((select public.is_superadmin())) with check ((select public.is_superadmin()))',
      t
    );
    execute format(
      'create policy "%1$s: superadmin delete" on public.%1$I for delete to authenticated '
      'using ((select public.is_superadmin()))',
      t
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Activity categories: global (program_id null) managed by superadmin;
-- program-specific ones by that program's admin.
-- ---------------------------------------------------------------------------
create policy "activity_categories: read" on public.activity_categories
  for select to authenticated
  using (program_id is null and (select public.current_user_role()) is not null
         or public.has_program_access(program_id));

create policy "activity_categories: insert" on public.activity_categories
  for insert to authenticated
  with check (case when program_id is null then (select public.is_superadmin())
                   else public.can_manage_program(program_id) end);

create policy "activity_categories: update" on public.activity_categories
  for update to authenticated
  using (case when program_id is null then (select public.is_superadmin())
              else public.can_manage_program(program_id) end)
  with check (case when program_id is null then (select public.is_superadmin())
                   else public.can_manage_program(program_id) end);

create policy "activity_categories: delete" on public.activity_categories
  for delete to authenticated
  using (case when program_id is null then (select public.is_superadmin())
              else public.can_manage_program(program_id) end);

-- ---------------------------------------------------------------------------
-- Programs
-- ---------------------------------------------------------------------------
create policy "programs: read own or all (superadmin)" on public.programs
  for select to authenticated
  using ((select public.is_superadmin()) or (deleted_at is null and public.has_program_access(id)));

create policy "programs: superadmin insert" on public.programs
  for insert to authenticated
  with check ((select public.is_superadmin()));

-- Program admins may edit their program profile; guard_program_update blocks
-- code/archive/delete changes for non-superadmins.
create policy "programs: manage update" on public.programs
  for update to authenticated
  using (public.can_manage_program(id))
  with check (public.can_manage_program(id));

-- No hard deletes from the client: programs are archived or soft-deleted.

-- ---------------------------------------------------------------------------
-- Profiles
-- Inserts come from the auth trigger; privileged columns (role, is_active,
-- program_id, can_edit_activities, must_change_password, last_login_at) are
-- changed only by SECURITY DEFINER RPCs or Edge Functions (service role).
-- ---------------------------------------------------------------------------
revoke insert, update, delete on public.profiles from authenticated;
grant update (full_name, position, office, province_id, contact_no, avatar_key)
  on public.profiles to authenticated;

create policy "profiles: read self, shared program, or all (superadmin)" on public.profiles
  for select to authenticated
  using (public.can_view_profile(id));

create policy "profiles: update self, own staff, or any (superadmin)" on public.profiles
  for update to authenticated
  using (
    id = (select auth.uid())
    or (select public.is_superadmin())
    or (role = 'program_staff' and public.is_program_admin(program_id))
  )
  with check (
    id = (select auth.uid())
    or (select public.is_superadmin())
    or (role = 'program_staff' and public.is_program_admin(program_id))
  );

-- ---------------------------------------------------------------------------
-- Program memberships
-- ---------------------------------------------------------------------------
revoke update on public.program_memberships from authenticated;

create policy "program_memberships: read" on public.program_memberships
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.has_program_access(program_id)
  );

-- Superadmin may add anyone; a program admin may add/remove staff of own program.
create policy "program_memberships: insert" on public.program_memberships
  for insert to authenticated
  with check (
    (select public.is_superadmin())
    or (
      public.is_program_admin(program_id)
      and exists (select 1 from public.profiles p where p.id = user_id and p.role = 'program_staff')
    )
  );

create policy "program_memberships: delete" on public.program_memberships
  for delete to authenticated
  using (
    (select public.is_superadmin())
    or (
      public.is_program_admin(program_id)
      and exists (select 1 from public.profiles p where p.id = user_id and p.role = 'program_staff')
    )
  );

-- ---------------------------------------------------------------------------
-- Audit logs: superadmin read-only. Rows are written only by triggers.
-- ---------------------------------------------------------------------------
revoke insert, update, delete on public.audit_logs from authenticated;

create policy "audit_logs: superadmin read" on public.audit_logs
  for select to authenticated
  using ((select public.is_superadmin()));

-- ---------------------------------------------------------------------------
-- Notifications: each user sees and updates only their own.
-- ---------------------------------------------------------------------------
revoke insert, update on public.notifications from authenticated;
grant update (is_read, read_at) on public.notifications to authenticated;

create policy "notifications: read own" on public.notifications
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "notifications: update own" on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "notifications: delete own" on public.notifications
  for delete to authenticated
  using (user_id = (select auth.uid()));
