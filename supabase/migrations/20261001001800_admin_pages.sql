-- =============================================================================
-- Phase 11: Announcements, Trash, Profile activity
--   announcements (+ reads)     memos from the FOD (all programs) or a program
--   publish_due_announcements() notifies readers once an announcement is live
--   trash_items() / restore_trash_item()   one Trash for every soft delete
--   my_recent_activity()        the caller's own audit trail (Profile page)
-- The Audit Log page reads audit_logs directly (superadmin-only RLS, Phase 1).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Announcements
-- ---------------------------------------------------------------------------
create table public.announcements (
  id           uuid primary key default gen_random_uuid(),
  program_id   uuid references public.programs (id) on delete cascade, -- null = all programs
  title        text not null check (length(trim(title)) between 3 and 200),
  body         text not null check (length(trim(body)) between 1 and 10000),
  priority     text not null default 'normal' check (priority in ('normal', 'important', 'urgent')),
  pinned       boolean not null default false,
  publish_at   timestamptz not null default now(),
  expires_at   timestamptz,
  created_by   uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  deleted_by   uuid references auth.users (id) on delete set null,
  check (expires_at is null or expires_at > publish_at)
);
create index announcements_live_idx on public.announcements (publish_at desc) where deleted_at is null;
create index announcements_program_idx on public.announcements (program_id);
create trigger set_updated_at before update on public.announcements
  for each row execute function public.set_updated_at();

-- Which announcements already went out (internal; kept apart so the audit log
-- only shows what people changed).
create table public.announcement_dispatches (
  announcement_id  uuid primary key references public.announcements (id) on delete cascade,
  notified_at      timestamptz not null default now()
);
alter table public.announcement_dispatches enable row level security;
revoke all on public.announcement_dispatches from anon, authenticated;

create table public.announcement_reads (
  announcement_id  uuid not null references public.announcements (id) on delete cascade,
  user_id          uuid not null references public.profiles (id) on delete cascade,
  read_at          timestamptz not null default now(),
  primary key (announcement_id, user_id)
);
create index announcement_reads_user_idx on public.announcement_reads (user_id);

-- Superadmin posts to everyone or any program; program admins to their programs.
create or replace function public.can_post_announcement(p_program_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when public.is_superadmin() then true
    when p_program_id is null then false
    else public.is_program_admin(p_program_id)
  end
$$;

create or replace function public.can_read_announcement(p_program_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_user_role() is not null
     and (p_program_id is null or public.has_program_access(p_program_id))
$$;

revoke execute on function public.can_post_announcement(uuid) from public, anon;
revoke execute on function public.can_read_announcement(uuid) from public, anon;
grant execute on function public.can_post_announcement(uuid) to authenticated;
grant execute on function public.can_read_announcement(uuid) to authenticated;

-- Stamp who deleted; only posters change these columns.
create or replace function public.prepare_announcement()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.deleted_at is distinct from old.deleted_at then
      new.deleted_by := case when new.deleted_at is null then null else (select auth.uid()) end;
    end if;
    if new.program_id is distinct from old.program_id and not public.can_post_announcement(new.program_id) then
      raise exception 'You cannot move this announcement to that program' using errcode = '42501';
    end if;
    new.created_by := old.created_by;
  else
    -- clients are always the author; system jobs and seeds may name one
    new.created_by := coalesce((select auth.uid()), new.created_by);
  end if;
  return new;
end;
$$;

create trigger prepare_announcement before insert or update on public.announcements
  for each row execute function public.prepare_announcement();

alter table public.announcements enable row level security;
alter table public.announcement_reads enable row level security;

create policy "announcements: read" on public.announcements
  for select to authenticated
  using (
    (deleted_at is null and publish_at <= now() and public.can_read_announcement(program_id))
    or public.can_post_announcement(program_id)
  );
create policy "announcements: insert" on public.announcements
  for insert to authenticated with check (public.can_post_announcement(program_id));
create policy "announcements: update" on public.announcements
  for update to authenticated
  using (public.can_post_announcement(program_id)) with check (public.can_post_announcement(program_id));

revoke insert, update, delete on public.announcements from authenticated;
grant insert (program_id, title, body, priority, pinned, publish_at, expires_at) on public.announcements to authenticated;
grant update (program_id, title, body, priority, pinned, publish_at, expires_at, deleted_at) on public.announcements to authenticated;

create policy "announcement_reads: own" on public.announcement_reads
  for select to authenticated using (user_id = (select auth.uid()) or exists (
    select 1 from public.announcements a
    where a.id = announcement_id and public.can_post_announcement(a.program_id)));
revoke insert, update, delete on public.announcement_reads from authenticated;

select public.enable_audit('public.announcements');

create or replace function public.mark_announcement_read(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.announcements a
    where a.id = p_id and a.deleted_at is null and a.publish_at <= now()
      and public.can_read_announcement(a.program_id)
  ) then
    raise exception 'Announcement not found' using errcode = 'P0002';
  end if;
  insert into public.announcement_reads (announcement_id, user_id)
  values (p_id, (select auth.uid()))
  on conflict do nothing;
end;
$$;

revoke execute on function public.mark_announcement_read(uuid) from public, anon;
grant execute on function public.mark_announcement_read(uuid) to authenticated;

create view public.v_announcements with (security_invoker = true) as
select
  a.*,
  p.code as program_code,
  au.full_name as author_name,
  (a.publish_at <= now() and (a.expires_at is null or a.expires_at > now())) as is_live,
  exists (select 1 from public.announcement_reads r
          where r.announcement_id = a.id and r.user_id = (select auth.uid())) as is_read,
  (select count(*) from public.announcement_reads r where r.announcement_id = a.id) as read_count
from public.announcements a
left join public.programs p on p.id = a.program_id
left join public.profiles au on au.id = a.created_by;

grant select on public.v_announcements to authenticated;

-- Notify readers of announcements that are live and not yet announced.
-- Called right after a post and hourly by pg_cron for scheduled ones.
create or replace function public.publish_due_announcements()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  a        record;
  v_sent   integer := 0;
begin
  for a in
    select n.* from public.announcements n
    where n.deleted_at is null and n.publish_at <= now()
      and (n.expires_at is null or n.expires_at > now())
      and not exists (select 1 from public.announcement_dispatches x where x.announcement_id = n.id)
    for update of n skip locked
  loop
    select v_sent + coalesce(sum(public.deliver(
             u.id, 'announcement',
             case a.priority when 'urgent' then 'Urgent: ' when 'important' then 'Important: ' else '' end || a.title,
             left(a.body, 280), '/announcements/' || a.id, a.program_id, 'announcement', a.id,
             'announcement:' || a.id)), 0)
      into v_sent
    from public.profiles u
    where u.is_active and u.deleted_at is null
      and (a.program_id is null or public.user_can_access_program(u.id, a.program_id));
    insert into public.announcement_dispatches (announcement_id) values (a.id) on conflict do nothing;
  end loop;
  return v_sent;
end;
$$;

revoke execute on function public.publish_due_announcements() from public, anon, authenticated;

-- Posts that are already live notify immediately.
create or replace function public.on_announcement_saved()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Rescheduling re-announces.
  if tg_op = 'UPDATE' and new.publish_at is distinct from old.publish_at then
    delete from public.announcement_dispatches where announcement_id = new.id;
  end if;
  if new.deleted_at is null and new.publish_at <= now() then
    perform public.publish_due_announcements();
  end if;
  return null;
end;
$$;

revoke execute on function public.on_announcement_saved() from public, anon, authenticated;

create trigger on_announcement_saved after insert or update of publish_at, deleted_at on public.announcements
  for each row execute function public.on_announcement_saved();

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('payew-announcements', '5 * * * *', 'select public.publish_due_announcements()');
  end if;
exception when others then
  raise notice 'pg_cron not scheduled for announcements: %', sqlerrm;
end;
$$;

-- ---------------------------------------------------------------------------
-- Trash: every soft-deleted record the caller may see (RLS decides)
-- ---------------------------------------------------------------------------
create or replace function public.trash_items()
returns table (
  kind         text,
  item_id      uuid,
  title        text,
  detail       text,
  program_id   uuid,
  deleted_at   timestamptz,
  deleted_by   text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select 'activity', a.id, a.title, a.code, a.program_id, a.deleted_at,
         (select full_name from public.profiles where id = a.deleted_by)
  from public.activities a where a.deleted_at is not null
  union all
  select 'package', p.id, p.title, p.code, p.program_id, p.deleted_at,
         (select full_name from public.profiles where id = p.deleted_by)
  from public.procurement_packages p where p.deleted_at is not null
  union all
  select 'beneficiary', b.id, b.name, b.registration_no, b.registered_by_program_id, b.deleted_at,
         (select full_name from public.profiles where id = b.deleted_by)
  from public.beneficiaries b where b.deleted_at is not null
  union all
  select 'supplier', s.id, s.business_name, s.tin, null, s.deleted_at,
         (select full_name from public.profiles where id = s.deleted_by)
  from public.suppliers s where s.deleted_at is not null
  union all
  -- one row per file (all versions move to Trash together)
  select distinct on (f.version_group_id) 'file', f.id, f.file_name,
         concat_ws(' · ', f.entity_type, 'v' || f.version), f.program_id, f.deleted_at,
         (select full_name from public.profiles where id = f.deleted_by)
  from public.attachments f where f.deleted_at is not null and f.entity_type <> 'profile'
  union all
  select 'allotment', x.id, coalesce(x.allotment_no, 'Allotment of ' || to_char(x.allotment_date, 'Mon DD, YYYY')),
         concat_ws(' · ', upper(x.kind), '₱' || to_char(x.amount, 'FM999,999,999,990.00')), x.program_id, x.deleted_at, null
  from public.allotments x where x.deleted_at is not null
  union all
  select 'announcement', n.id, n.title, null, n.program_id, n.deleted_at,
         (select full_name from public.profiles where id = n.deleted_by)
  from public.announcements n where n.deleted_at is not null
  union all
  select 'program', g.id, g.name, g.code, g.id, g.deleted_at, null
  from public.programs g where g.deleted_at is not null
  union all
  select 'program_archived', g.id, g.name, g.code, g.id, g.archived_at, null
  from public.programs g where g.archived_at is not null and g.deleted_at is null
  union all
  select 'master:' || m.list, m.id, m.name, m.list, null, m.deleted_at, null
  from (
    select 'fund_sources' as list, id, name, deleted_at from public.fund_sources where deleted_at is not null
    union all select 'expense_classes', id, name, deleted_at from public.expense_classes where deleted_at is not null
    union all select 'uacs_codes', id, name, deleted_at from public.uacs_codes where deleted_at is not null
    union all select 'commodities', id, name, deleted_at from public.commodities where deleted_at is not null
    union all select 'units', id, name, deleted_at from public.units where deleted_at is not null
    union all select 'activity_categories', id, name, deleted_at from public.activity_categories where deleted_at is not null
    union all select 'beneficiary_types', id, name, deleted_at from public.beneficiary_types where deleted_at is not null
    union all select 'document_types', id, name, deleted_at from public.document_types where deleted_at is not null
    union all select 'procurement_categories', id, name, deleted_at from public.procurement_categories where deleted_at is not null
    union all select 'procurement_modes', id, name, deleted_at from public.procurement_modes where deleted_at is not null
  ) m
$$;

grant execute on function public.trash_items() to authenticated;

-- Restores through the caller's own permissions (RLS + table triggers).
create or replace function public.restore_trash_item(p_kind text, p_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_rows integer;
  v_list text;
begin
  case p_kind
    when 'activity' then update public.activities set deleted_at = null where id = p_id and deleted_at is not null;
    when 'package' then update public.procurement_packages set deleted_at = null where id = p_id and deleted_at is not null;
    when 'beneficiary' then update public.beneficiaries set deleted_at = null where id = p_id and deleted_at is not null;
    when 'supplier' then update public.suppliers set deleted_at = null where id = p_id and deleted_at is not null;
    when 'file' then
      update public.attachments set deleted_at = null
      where version_group_id = (select version_group_id from public.attachments where id = p_id)
        and deleted_at is not null;
    when 'allotment' then update public.allotments set deleted_at = null where id = p_id and deleted_at is not null;
    when 'announcement' then update public.announcements set deleted_at = null where id = p_id and deleted_at is not null;
    when 'program' then update public.programs set deleted_at = null where id = p_id and deleted_at is not null;
    when 'program_archived' then update public.programs set archived_at = null where id = p_id and archived_at is not null;
    else
      v_list := substring(p_kind from '^master:([a-z_]+)$');
      if v_list is null or v_list not in ('fund_sources', 'expense_classes', 'uacs_codes', 'commodities', 'units',
          'activity_categories', 'beneficiary_types', 'document_types', 'procurement_categories', 'procurement_modes') then
        raise exception 'Unknown item type: %', p_kind using errcode = '22023';
      end if;
      execute format('update public.%I set deleted_at = null where id = $1 and deleted_at is not null', v_list) using p_id;
  end case;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception 'Nothing to restore, or you are not allowed to restore it' using errcode = '42501';
  end if;
end;
$$;

grant execute on function public.restore_trash_item(text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Profile: my own recent changes
-- ---------------------------------------------------------------------------
create or replace function public.my_recent_activity(p_limit integer default 30)
returns table (
  occurred_at     timestamptz,
  action          text,
  table_name      text,
  record_id       text,
  changed_fields  text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select l.occurred_at, l.action, l.table_name, l.record_id, l.changed_fields
  from public.audit_logs l
  where l.actor_id = (select auth.uid())
  order by l.occurred_at desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100)
$$;

revoke execute on function public.my_recent_activity(integer) from public, anon;
grant execute on function public.my_recent_activity(integer) to authenticated;
