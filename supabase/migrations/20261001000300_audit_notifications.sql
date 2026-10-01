-- =============================================================================
-- PAYEW · Phase 1 · Audit log and notifications
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Audit log
-- ---------------------------------------------------------------------------
create table public.audit_logs (
  id              bigint generated always as identity primary key,
  occurred_at     timestamptz not null default now(),
  actor_id        uuid references auth.users (id) on delete set null,
  action          text not null, -- INSERT | UPDATE | DELETE | SOFT_DELETE | RESTORE | LOGIN
  table_name      text not null,
  record_id       text,
  program_id      uuid,
  old_data        jsonb,
  new_data        jsonb,
  changed_fields  text[]
);
create index audit_logs_occurred_idx on public.audit_logs (occurred_at desc);
create index audit_logs_record_idx on public.audit_logs (table_name, record_id);
create index audit_logs_actor_idx on public.audit_logs (actor_id);
create index audit_logs_program_idx on public.audit_logs (program_id);

-- Generic row-change trigger. Updates that only touch updated_at are skipped;
-- a profile update that only touches last_login_at is recorded as LOGIN.
create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old      jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new      jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_row      jsonb := coalesce(v_new, v_old);
  v_action   text := tg_op;
  v_changed  text[];
  v_record   text;
  v_program  uuid;
begin
  if tg_op = 'UPDATE' then
    select array_agg(n.key order by n.key) into v_changed
    from jsonb_each(v_new) n
    where n.value is distinct from v_old -> n.key
      and n.key not in ('updated_at');

    if v_changed is null then
      return null;
    end if;

    if tg_table_name = 'profiles' and v_changed = array['last_login_at'] then
      v_action := 'LOGIN';
      v_old := null;
      v_new := null;
    elsif v_changed @> array['deleted_at'] then
      v_action := case when v_new ->> 'deleted_at' is null then 'RESTORE' else 'SOFT_DELETE' end;
    end if;
  end if;

  v_record := coalesce(
    v_row ->> 'id',
    case when v_row ? 'program_id' and v_row ? 'user_id'
         then (v_row ->> 'program_id') || ':' || (v_row ->> 'user_id') end,
    v_row ->> 'key'
  );
  v_program := case
    when tg_table_name = 'programs' then (v_row ->> 'id')::uuid
    else nullif(v_row ->> 'program_id', '')::uuid
  end;

  insert into public.audit_logs (actor_id, action, table_name, record_id, program_id, old_data, new_data, changed_fields)
  values ((select auth.uid()), v_action, tg_table_name, v_record, v_program, v_old, v_new, v_changed);

  return null;
end;
$$;

revoke execute on function public.audit_row_change() from public, anon, authenticated;

-- Helper for later migrations: select public.enable_audit('public.activities');
create or replace function public.enable_audit(p_table regclass)
returns void
language plpgsql
set search_path = ''
as $$
begin
  execute format('drop trigger if exists audit_row_change on %s', p_table);
  execute format(
    'create trigger audit_row_change after insert or update or delete on %s '
    'for each row execute function public.audit_row_change()',
    p_table
  );
end;
$$;

revoke execute on function public.enable_audit(regclass) from public, anon, authenticated;

select public.enable_audit('public.profiles');
select public.enable_audit('public.program_memberships');
select public.enable_audit('public.programs');
select public.enable_audit('public.fiscal_years');
select public.enable_audit('public.app_settings');

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
create table public.notifications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  program_id   uuid references public.programs (id) on delete cascade,
  type         text not null, -- comment | mention | directive | directive_due | approval | stage_due | announcement | system ...
  title        text not null,
  body         text,
  link         text, -- in-app deep link, e.g. /activities/<id>#comment-<id>
  entity_type  text,
  entity_id    uuid,
  is_read      boolean not null default false,
  read_at      timestamptz,
  created_at   timestamptz not null default now(),
  created_by   uuid references auth.users (id) on delete set null
);
create index notifications_user_unread_idx on public.notifications (user_id, is_read, created_at desc);
create index notifications_entity_idx on public.notifications (entity_type, entity_id);

-- Internal: used by triggers and scheduled jobs, never by clients directly.
create or replace function public.notify(
  p_user_id      uuid,
  p_type         text,
  p_title        text,
  p_body         text default null,
  p_link         text default null,
  p_program_id   uuid default null,
  p_entity_type  text default null,
  p_entity_id    uuid default null
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (user_id, type, title, body, link, program_id, entity_type, entity_id, created_by)
  values (p_user_id, p_type, p_title, p_body, p_link, p_program_id, p_entity_type, p_entity_id, (select auth.uid()))
  returning id
$$;

revoke execute on function public.notify(uuid, text, text, text, text, uuid, text, uuid) from public, anon, authenticated;

create or replace function public.mark_all_notifications_read()
returns integer
language sql
security definer
set search_path = ''
as $$
  with updated as (
    update public.notifications
    set is_read = true, read_at = now()
    where user_id = (select auth.uid()) and not is_read
    returning 1
  )
  select count(*)::integer from updated
$$;

revoke execute on function public.mark_all_notifications_read() from public, anon;
grant execute on function public.mark_all_notifications_read() to authenticated;

-- Fiscal-year changes are broadcast to every active user.
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
  select p.id, 'system', v_title, '/settings/fiscal-years', 'fiscal_year', new.id, (select auth.uid())
  from public.profiles p
  where p.is_active and p.deleted_at is null and p.id is distinct from (select auth.uid());
  return null;
end;
$$;

revoke execute on function public.notify_fiscal_year_change() from public, anon, authenticated;

create trigger notify_fiscal_year_change
  after insert or update of status on public.fiscal_years
  for each row execute function public.notify_fiscal_year_change();

-- Realtime for the notification bell.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;
