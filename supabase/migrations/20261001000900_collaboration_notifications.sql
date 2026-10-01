-- =============================================================================
-- PAYEW · Phase 6 · Comments, notes, directives and the notification system
--
-- * comments    threaded discussion on any record (activity, beneficiary,
--               directive; later phases extend entity_* helpers), @mentions
-- * notes       private or program-visible notes pinned to a record
-- * directives  instructions from admins to people, with acknowledgement,
--               response (and proposed date) and escalation; "Send Overdue
--               Notice" is a directive of kind 'overdue_notice'
-- * deliver()   single entry point for notifications: per-user muting,
--               de-duplication, never notifies the actor
-- * run_notification_sweep()  daily reminders + escalation (pg_cron)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Settings (also present in seed.sql for dev; inserted here for production)
-- ---------------------------------------------------------------------------
insert into public.app_settings (key, value, description) values
  ('overdue_notice_template',
   '{"title": "Overdue activity: {title}", "body": "Activity {title} was due on {date} ({n} days overdue). Please provide a status update and revised target date.", "response_days": 5}',
   'Default composer text for "Send Overdue Notice"'),
  ('reminders',
   '{"stage_due_days": 2, "directive_due_days": 1, "activity_escalation_days": [1, 7, 30], "directive_escalation_days": [1, 3, 7]}',
   'Daily reminder sweep: days-before reminders and escalation thresholds (days overdue for level 1, 2, 3)')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Notification plumbing
-- ---------------------------------------------------------------------------
alter table public.notifications add column dedupe_key text;
create unique index notifications_dedupe_idx on public.notifications (user_id, dedupe_key)
  where dedupe_key is not null;

-- Per-user preferences: {"muted": ["comment", "assignment", ...]}
alter table public.profiles add column notification_prefs jsonb not null default '{}'::jsonb
  check (jsonb_typeof(notification_prefs) = 'object');
grant update (notification_prefs) on public.profiles to authenticated;

-- Types a user may mute. Directives, escalations and system notices always arrive.
create or replace function public.mutable_notification_types()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['comment', 'mention', 'assignment', 'stage', 'stage_due', 'task_due']
$$;

-- Internal: inserts one notification unless the recipient is the actor, is
-- inactive, muted the type, or already got this dedupe key. Returns 1 if sent.
create or replace function public.deliver(
  p_user_id      uuid,
  p_type         text,
  p_title        text,
  p_body         text default null,
  p_link         text default null,
  p_program_id   uuid default null,
  p_entity_type  text default null,
  p_entity_id    uuid default null,
  p_dedupe_key   text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_user_id is null or p_user_id is not distinct from (select auth.uid()) then
    return 0;
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = p_user_id and p.is_active and p.deleted_at is null
      and not (
        p_type = any (public.mutable_notification_types())
        and coalesce(p.notification_prefs -> 'muted', '[]'::jsonb) ? p_type
      )
  ) then
    return 0;
  end if;

  insert into public.notifications
    (user_id, type, title, body, link, program_id, entity_type, entity_id, created_by, dedupe_key)
  values
    (p_user_id, p_type, left(p_title, 300), left(p_body, 1000), p_link, p_program_id,
     p_entity_type, p_entity_id, (select auth.uid()), p_dedupe_key)
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.person_name(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(nullif(trim(p.full_name), ''), p.email, 'Someone')
  from public.profiles p where p.id = p_user_id
$$;

-- Does another user (not the caller) have access to a program?
create or replace function public.user_can_access_program(p_user_id uuid, p_program_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_user_id and p.is_active and p.deleted_at is null
      and (
        p.role = 'superadmin'
        or exists (
          select 1 from public.program_memberships m
          join public.programs g on g.id = m.program_id and g.deleted_at is null
          where m.user_id = p_user_id and m.program_id = p_program_id
        )
      )
  )
$$;

-- Managers of a program: its admins plus superadmins (optionally only one level).
create or replace function public.program_managers(p_program_id uuid, p_include_superadmins boolean default true)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id from public.profiles p
  where p.is_active and p.deleted_at is null
    and (
      (p.role = 'program_admin'
       and exists (select 1 from public.program_memberships m where m.user_id = p.id and m.program_id = p_program_id))
      or (p_include_superadmins and p.role = 'superadmin')
    )
$$;

-- ---------------------------------------------------------------------------
-- Directives (tables first: entity helpers below refer to them)
-- ---------------------------------------------------------------------------
create table public.directives (
  id                 uuid primary key default gen_random_uuid(),
  program_id         uuid not null references public.programs (id) on delete cascade,
  kind               text not null default 'directive' check (kind in ('directive', 'overdue_notice')),
  title              text not null check (length(trim(title)) between 3 and 200),
  body               text not null check (length(trim(body)) between 1 and 5000),
  priority           text not null default 'normal' check (priority in ('normal', 'high', 'urgent')),
  entity_type        text check (entity_type in ('activity', 'beneficiary')),
  entity_id          uuid,
  response_due       date,
  status             text not null default 'open' check (status in ('open', 'closed', 'withdrawn')),
  issued_by          uuid references public.profiles (id) on delete set null,
  issued_at          timestamptz not null default now(),
  closed_at          timestamptz,
  closed_by          uuid references auth.users (id) on delete set null,
  close_note         text check (close_note is null or length(close_note) <= 2000),
  escalation_level   integer not null default 0,
  last_escalated_at  timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check ((entity_type is null) = (entity_id is null))
);
create index directives_program_idx on public.directives (program_id, status);
create index directives_entity_idx on public.directives (entity_type, entity_id);
create index directives_issued_by_idx on public.directives (issued_by);

create table public.directive_recipients (
  directive_id     uuid not null references public.directives (id) on delete cascade,
  user_id          uuid not null references public.profiles (id) on delete cascade,
  program_id       uuid not null references public.programs (id) on delete cascade,
  status           text not null default 'pending' check (status in ('pending', 'acknowledged', 'responded')),
  acknowledged_at  timestamptz,
  responded_at     timestamptz,
  response         text check (response is null or length(response) <= 5000),
  proposed_date    date,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  primary key (directive_id, user_id)
);
create index directive_recipients_user_idx on public.directive_recipients (user_id, status);

create trigger set_updated_at before update on public.directives
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.directive_recipients
  for each row execute function public.set_updated_at();

create or replace function public.can_view_directive(p_directive_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.directives d
    where d.id = p_directive_id
      and (select public.current_user_role()) is not null
      and (
        d.issued_by = (select auth.uid())
        or public.can_manage_program(d.program_id)
        or exists (select 1 from public.directive_recipients r
                   where r.directive_id = d.id and r.user_id = (select auth.uid()))
      )
  )
$$;

create or replace function public.user_can_view_directive(p_user_id uuid, p_directive_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.directives d
    where d.id = p_directive_id
      and (
        d.issued_by = p_user_id
        or p_user_id in (select public.program_managers(d.program_id))
        or exists (select 1 from public.directive_recipients r
                   where r.directive_id = d.id and r.user_id = p_user_id)
      )
  )
$$;

-- ---------------------------------------------------------------------------
-- Generic record ("entity") helpers. Later phases add types with create or replace.
-- ---------------------------------------------------------------------------
create or replace function public.entity_program(p_entity_type text, p_entity_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select case p_entity_type
    when 'activity' then (select a.program_id from public.activities a where a.id = p_entity_id)
    when 'beneficiary' then (select b.registered_by_program_id from public.beneficiaries b where b.id = p_entity_id)
    when 'directive' then (select d.program_id from public.directives d where d.id = p_entity_id)
  end
$$;

-- Can the caller see the record (and therefore its comments and program notes)?
create or replace function public.can_view_entity(p_entity_type text, p_entity_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select public.current_user_role()) is not null
     and case p_entity_type
       when 'activity' then exists (
         select 1 from public.activities a
         where a.id = p_entity_id and a.deleted_at is null and public.has_program_access(a.program_id))
       when 'beneficiary' then exists (
         select 1 from public.beneficiaries b where b.id = p_entity_id and b.deleted_at is null)
       when 'directive' then public.can_view_directive(p_entity_id)
       else false
     end
$$;

-- Same question for another user (who may be mentioned or notified).
create or replace function public.user_can_view_entity(p_user_id uuid, p_entity_type text, p_entity_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_entity_type
    when 'activity' then exists (
      select 1 from public.activities a
      where a.id = p_entity_id and a.deleted_at is null
        and public.user_can_access_program(p_user_id, a.program_id))
    when 'beneficiary' then exists (
      select 1 from public.profiles p where p.id = p_user_id and p.is_active and p.deleted_at is null)
    when 'directive' then public.user_can_view_directive(p_user_id, p_entity_id)
    else false
  end
$$;

-- Display label and in-app link for notifications.
create or replace function public.entity_ref(p_entity_type text, p_entity_id uuid, p_tab text default null)
returns table (label text, link text)
language sql
stable
security definer
set search_path = ''
as $$
  select a.code || ' · ' || a.title,
         '/activities/' || a.id || coalesce('?tab=' || p_tab, '')
  from public.activities a where p_entity_type = 'activity' and a.id = p_entity_id
  union all
  select b.name, '/beneficiaries/' || b.id || coalesce('?tab=' || p_tab, '')
  from public.beneficiaries b where p_entity_type = 'beneficiary' and b.id = p_entity_id
  union all
  select d.title, '/directives/' || d.id
  from public.directives d where p_entity_type = 'directive' and d.id = p_entity_id
$$;

-- ---------------------------------------------------------------------------
-- Comments
-- ---------------------------------------------------------------------------
create table public.comments (
  id           uuid primary key default gen_random_uuid(),
  entity_type  text not null check (entity_type in ('activity', 'beneficiary', 'directive')),
  entity_id    uuid not null,
  program_id   uuid references public.programs (id) on delete cascade,
  parent_id    uuid references public.comments (id) on delete cascade,
  body         text not null check (length(trim(body)) between 1 and 5000),
  mentions     uuid[] not null default '{}',
  author_id    uuid references public.profiles (id) on delete set null,
  edited_at    timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  deleted_by   uuid references auth.users (id) on delete set null
);
create index comments_entity_idx on public.comments (entity_type, entity_id, created_at);
create index comments_parent_idx on public.comments (parent_id);
create index comments_author_idx on public.comments (author_id);

create trigger set_updated_at before update on public.comments
  for each row execute function public.set_updated_at();

-- Keeps only mentioned users who can see the record (max 20, no duplicates, not the author).
create or replace function public.filter_mentions(p_mentions uuid[], p_entity_type text, p_entity_id uuid, p_author uuid)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(u order by u), '{}')
  from (
    select distinct u from unnest(coalesce(p_mentions, '{}')) u
    where u is distinct from p_author
      and public.user_can_view_entity(u, p_entity_type, p_entity_id)
    limit 20
  ) m
$$;

create or replace function public.prepare_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_parent  public.comments;
begin
  if tg_op = 'INSERT' then
    if v_uid is not null then
      new.author_id := v_uid;
    end if;
    new.program_id := public.entity_program(new.entity_type, new.entity_id);
    new.edited_at := null;
    new.deleted_at := null;
    new.deleted_by := null;
    if new.parent_id is not null then
      select * into v_parent from public.comments where id = new.parent_id;
      if not found or v_parent.entity_type <> new.entity_type or v_parent.entity_id <> new.entity_id then
        raise exception 'The comment you are replying to is not on this record' using errcode = '22023';
      end if;
      -- One level of threading: a reply to a reply joins the root thread.
      new.parent_id := coalesce(v_parent.parent_id, v_parent.id);
    end if;
    new.mentions := public.filter_mentions(new.mentions, new.entity_type, new.entity_id, new.author_id);
    return new;
  end if;

  -- UPDATE (service role / migrations bypass the author rules)
  if v_uid is not null then
    if (new.body is distinct from old.body or new.mentions is distinct from old.mentions)
       and old.author_id is distinct from v_uid then
      raise exception 'Only the author can edit a comment' using errcode = '42501';
    end if;
    if new.deleted_at is distinct from old.deleted_at then
      if old.author_id is distinct from v_uid
         and not (case when old.program_id is null then public.is_superadmin()
                       else public.can_manage_program(old.program_id) end) then
        raise exception 'Only the author or a program admin can delete a comment' using errcode = '42501';
      end if;
      new.deleted_by := case when new.deleted_at is null then null else v_uid end;
    end if;
  end if;
  if new.body is distinct from old.body then
    new.edited_at := now();
  end if;
  if new.mentions is distinct from old.mentions then
    new.mentions := public.filter_mentions(new.mentions, new.entity_type, new.entity_id, old.author_id);
  end if;
  return new;
end;
$$;

create trigger prepare_comment before insert or update on public.comments
  for each row execute function public.prepare_comment();

-- Notifies new @mentions, the author of the thread, earlier repliers, and the
-- people responsible for the record. Each person gets at most one notification.
create or replace function public.notify_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ref      record;
  v_author   text := public.person_name(new.author_id);
  v_snippet  text := left(regexp_replace(new.body, '\s+', ' ', 'g'), 160);
  v_new_mentions uuid[];
  v_link     text;
  u          uuid;
begin
  if new.deleted_at is not null then
    return null;
  end if;
  select * into v_ref from public.entity_ref(new.entity_type, new.entity_id, 'discussion');
  v_link := coalesce(v_ref.link, '/') || '#comment-' || new.id;

  v_new_mentions := case when tg_op = 'INSERT' then new.mentions
                         else array(select unnest(new.mentions) except select unnest(old.mentions)) end;
  foreach u in array coalesce(v_new_mentions, '{}') loop
    perform public.deliver(u, 'mention', v_author || ' mentioned you on ' || coalesce(v_ref.label, 'a record'),
                           v_snippet, v_link, new.program_id, new.entity_type, new.entity_id);
  end loop;

  if tg_op = 'UPDATE' then
    return null;
  end if;

  for u in
    select distinct x.uid from (
      -- thread root author and earlier repliers
      select c.author_id as uid from public.comments c
      where new.parent_id is not null and (c.id = new.parent_id or c.parent_id = new.parent_id)
        and c.deleted_at is null and c.id <> new.id
      union
      -- record owners
      select a.responsible_user_id from public.activities a
      where new.entity_type = 'activity' and a.id = new.entity_id
      union
      select a.created_by from public.activities a
      where new.entity_type = 'activity' and a.id = new.entity_id and a.responsible_user_id is null
      union
      select d.issued_by from public.directives d
      where new.entity_type = 'directive' and d.id = new.entity_id
      union
      select r.user_id from public.directive_recipients r
      where new.entity_type = 'directive' and r.directive_id = new.entity_id
    ) x
    where x.uid is not null
      and x.uid is distinct from new.author_id
      and not (x.uid = any (new.mentions))
      and public.user_can_view_entity(x.uid, new.entity_type, new.entity_id)
  loop
    perform public.deliver(
      u, 'comment',
      v_author || case when new.parent_id is null then ' commented on ' else ' replied on ' end
        || coalesce(v_ref.label, 'a record'),
      v_snippet, v_link, new.program_id, new.entity_type, new.entity_id);
  end loop;
  return null;
end;
$$;

create trigger notify_comment after insert or update of mentions on public.comments
  for each row execute function public.notify_comment();

alter table public.comments enable row level security;
revoke update, delete on public.comments from authenticated;
grant update (body, mentions, deleted_at) on public.comments to authenticated;

create policy "comments: read" on public.comments
  for select to authenticated
  using (
    public.can_view_entity(entity_type, entity_id)
    and (
      deleted_at is null
      or author_id = (select auth.uid())
      or case when program_id is null then (select public.is_superadmin())
              else public.can_manage_program(program_id) end
    )
  );
create policy "comments: insert" on public.comments
  for insert to authenticated
  with check (author_id = (select auth.uid()) and public.can_view_entity(entity_type, entity_id));
create policy "comments: update" on public.comments
  for update to authenticated
  using (
    public.can_view_entity(entity_type, entity_id)
    and (
      author_id = (select auth.uid())
      or case when program_id is null then (select public.is_superadmin())
              else public.can_manage_program(program_id) end
    )
  )
  with check (public.can_view_entity(entity_type, entity_id));

select public.enable_audit('public.comments');

-- ---------------------------------------------------------------------------
-- Notes
-- ---------------------------------------------------------------------------
create table public.notes (
  id           uuid primary key default gen_random_uuid(),
  entity_type  text not null check (entity_type in ('activity', 'beneficiary')),
  entity_id    uuid not null,
  program_id   uuid references public.programs (id) on delete cascade,
  visibility   text not null default 'private' check (visibility in ('private', 'program')),
  body         text not null check (length(trim(body)) between 1 and 5000),
  is_pinned    boolean not null default false,
  author_id    uuid references public.profiles (id) on delete cascade,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index notes_entity_idx on public.notes (entity_type, entity_id);
create index notes_author_idx on public.notes (author_id);

create trigger set_updated_at before update on public.notes
  for each row execute function public.set_updated_at();

create or replace function public.prepare_note()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if (select auth.uid()) is not null then
      new.author_id := (select auth.uid());
    end if;
    new.program_id := public.entity_program(new.entity_type, new.entity_id);
  end if;
  return new;
end;
$$;

create trigger prepare_note before insert on public.notes
  for each row execute function public.prepare_note();

alter table public.notes enable row level security;
revoke update on public.notes from authenticated;
grant update (body, visibility, is_pinned) on public.notes to authenticated;

create policy "notes: read own or shared" on public.notes
  for select to authenticated
  using (
    public.can_view_entity(entity_type, entity_id)
    and (author_id = (select auth.uid()) or visibility = 'program')
  );
create policy "notes: insert" on public.notes
  for insert to authenticated
  with check (author_id = (select auth.uid()) and public.can_view_entity(entity_type, entity_id));
create policy "notes: update own" on public.notes
  for update to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()) and public.can_view_entity(entity_type, entity_id));
-- Authors delete their notes; program admins may remove shared ones.
create policy "notes: delete" on public.notes
  for delete to authenticated
  using (
    author_id = (select auth.uid())
    or (visibility = 'program'
        and case when program_id is null then (select public.is_superadmin())
                 else public.can_manage_program(program_id) end)
  );

-- ---------------------------------------------------------------------------
-- Directives: RLS (writes only through the RPCs below)
-- ---------------------------------------------------------------------------
alter table public.directives enable row level security;
alter table public.directive_recipients enable row level security;
revoke insert, update, delete on public.directives from authenticated;
revoke insert, update, delete on public.directive_recipients from authenticated;

create policy "directives: read" on public.directives
  for select to authenticated using (public.can_view_directive(id));
create policy "directive_recipients: read" on public.directive_recipients
  for select to authenticated using (public.can_view_directive(directive_id));

select public.enable_audit('public.directives');
select public.enable_audit('public.directive_recipients');

create or replace function public.issue_directive(
  p_program_id    uuid,
  p_title         text,
  p_body          text,
  p_recipients    uuid[],
  p_response_due  date default null,
  p_priority      text default 'normal',
  p_entity_type   text default null,
  p_entity_id     uuid default null,
  p_kind          text default 'directive'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_id       uuid;
  v_bad      text;
  v_ref      record;
  v_issuer   text := public.person_name((select auth.uid()));
  v_title    text;
  u          uuid;
begin
  if not public.can_manage_program(p_program_id) then
    raise exception 'Only program admins and the superadmin can issue directives' using errcode = '42501';
  end if;
  if p_kind not in ('directive', 'overdue_notice') then
    raise exception 'Unknown directive kind %', p_kind using errcode = '22023';
  end if;
  if (p_entity_type is null) <> (p_entity_id is null) then
    raise exception 'Linked record is incomplete' using errcode = '22023';
  end if;
  if p_entity_type is not null then
    if p_entity_type not in ('activity', 'beneficiary') or not public.can_view_entity(p_entity_type, p_entity_id) then
      raise exception 'Linked record not found' using errcode = '22023';
    end if;
    if p_entity_type = 'activity' and public.entity_program(p_entity_type, p_entity_id) <> p_program_id then
      raise exception 'The linked activity belongs to another program' using errcode = '22023';
    end if;
  end if;
  if p_response_due is not null and p_response_due < public.today_ph() then
    raise exception 'The response due date cannot be in the past' using errcode = '22023';
  end if;
  if coalesce(cardinality(p_recipients), 0) = 0 then
    raise exception 'Choose at least one recipient' using errcode = '22023';
  end if;
  if cardinality(p_recipients) > 100 then
    raise exception 'A directive can have at most 100 recipients' using errcode = '22023';
  end if;
  if v_uid = any (p_recipients) then
    raise exception 'You cannot send a directive to yourself' using errcode = '22023';
  end if;
  select string_agg(coalesce(public.person_name(u2), u2::text), ', ') into v_bad
  from unnest(p_recipients) u2
  where not public.user_can_access_program(u2, p_program_id);
  if v_bad is not null then
    raise exception 'Not active members of this program: %', v_bad using errcode = '22023';
  end if;

  insert into public.directives
    (program_id, kind, title, body, priority, entity_type, entity_id, response_due, issued_by)
  values
    (p_program_id, p_kind, trim(p_title), trim(p_body), coalesce(p_priority, 'normal'),
     p_entity_type, p_entity_id, p_response_due, v_uid)
  returning id into v_id;

  insert into public.directive_recipients (directive_id, user_id, program_id)
  select distinct v_id, r, p_program_id from unnest(p_recipients) r;

  select * into v_ref from public.entity_ref('directive', v_id);
  v_title := case when p_kind = 'overdue_notice' then 'Overdue notice from ' else 'Directive from ' end
             || v_issuer || ': ' || trim(p_title);
  for u in select distinct x from unnest(p_recipients) x loop
    perform public.deliver(
      u, 'directive', v_title,
      left(trim(p_body), 200)
        || case when p_response_due is not null
                then ' — response due ' || to_char(p_response_due, 'FMMon FMDD, YYYY') else '' end,
      v_ref.link, p_program_id, 'directive', v_id);
  end loop;
  return v_id;
end;
$$;

-- Prefilled overdue notice for the composer (placeholders resolved).
create or replace function public.overdue_notice_draft(p_activity_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_a     public.activities;
  v_stage public.activity_stage_progress;
  v_today date := public.today_ph();
  v_tmpl  jsonb;
  v_due   date;
  v_n     integer;
  v_what  text;
begin
  select * into v_a from public.activities where id = p_activity_id and deleted_at is null;
  if not found or not public.can_manage_program(v_a.program_id) then
    raise exception 'Only program admins and the superadmin can send overdue notices' using errcode = '42501';
  end if;
  if v_a.status not in ('not_started', 'ongoing') then
    raise exception 'Only open activities can receive an overdue notice' using errcode = '22023';
  end if;
  select * into v_stage from public.activity_stage_progress where id = v_a.current_stage_id;

  -- The activity due date wins; otherwise the current stage's planned end.
  if v_a.due_date is not null and v_a.due_date < v_today then
    v_due := v_a.due_date;
    v_what := v_a.title;
  elsif v_stage.planned_end is not null and v_stage.planned_end < v_today then
    v_due := v_stage.planned_end;
    v_what := v_a.title || ' (stage: ' || v_stage.name || ')';
  else
    raise exception 'This activity is not overdue' using errcode = '22023';
  end if;
  v_n := v_today - v_due;

  v_tmpl := coalesce((select value from public.app_settings where key = 'overdue_notice_template'), '{}'::jsonb);
  return jsonb_build_object(
    'title', left(replace(replace(replace(replace(replace(
      coalesce(v_tmpl ->> 'title', 'Overdue activity: {title}'),
      '{title}', v_a.title), '{code}', coalesce(v_a.code, '')), '{date}', to_char(v_due, 'FMMon FMDD, YYYY')),
      '{n}', v_n::text), '{stage}', coalesce(v_stage.name, '')), 200),
    'body', replace(replace(replace(replace(replace(
      coalesce(v_tmpl ->> 'body', 'Activity {title} was due on {date} ({n} days overdue).'),
      '{title}', v_what), '{code}', coalesce(v_a.code, '')), '{date}', to_char(v_due, 'FMMon FMDD, YYYY')),
      '{n}', v_n::text), '{stage}', coalesce(v_stage.name, '')),
    'response_due', v_today + coalesce((v_tmpl ->> 'response_days')::integer, 5),
    'days_overdue', v_n,
    -- Stage assignee first, then the responsible person (no duplicates).
    'recipients', to_jsonb(case
      when v_stage.assigned_to is null or v_stage.assigned_to = v_a.responsible_user_id
        then array_remove(array[v_a.responsible_user_id], null)
      else array_remove(array[v_stage.assigned_to, v_a.responsible_user_id], null)
    end)
  );
end;
$$;

create or replace function public.send_overdue_notice(
  p_activity_id   uuid,
  p_recipients    uuid[],
  p_title         text default null,
  p_body          text default null,
  p_response_due  date default null,
  p_priority      text default 'high'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_draft    jsonb := public.overdue_notice_draft(p_activity_id); -- checks access + overdue
  v_program  uuid := public.entity_program('activity', p_activity_id);
begin
  return public.issue_directive(
    v_program,
    coalesce(nullif(trim(p_title), ''), v_draft ->> 'title'),
    coalesce(nullif(trim(p_body), ''), v_draft ->> 'body'),
    p_recipients,
    coalesce(p_response_due, (v_draft ->> 'response_due')::date),
    p_priority,
    'activity', p_activity_id,
    'overdue_notice'
  );
end;
$$;

create or replace function public.acknowledge_directive(p_directive_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.directives where id = p_directive_id and status = 'open') then
    raise exception 'This directive is no longer open' using errcode = '22023';
  end if;
  update public.directive_recipients
  set status = 'acknowledged', acknowledged_at = now()
  where directive_id = p_directive_id and user_id = (select auth.uid()) and status = 'pending';
  if not found and not exists (
    select 1 from public.directive_recipients
    where directive_id = p_directive_id and user_id = (select auth.uid())
  ) then
    raise exception 'This directive was not sent to you' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.respond_to_directive(
  p_directive_id   uuid,
  p_response       text,
  p_proposed_date  date default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_d   public.directives;
begin
  select * into v_d from public.directives where id = p_directive_id;
  if not found or v_d.status <> 'open' then
    raise exception 'This directive is no longer open' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_response, ''))) = 0 then
    raise exception 'Write a response' using errcode = '22023';
  end if;
  update public.directive_recipients
  set status = 'responded',
      response = trim(p_response),
      proposed_date = p_proposed_date,
      responded_at = now(),
      acknowledged_at = coalesce(acknowledged_at, now())
  where directive_id = p_directive_id and user_id = (select auth.uid());
  if not found then
    raise exception 'This directive was not sent to you' using errcode = '42501';
  end if;

  perform public.deliver(
    v_d.issued_by, 'directive',
    public.person_name((select auth.uid())) || ' responded: ' || v_d.title,
    left(trim(p_response), 200)
      || case when p_proposed_date is not null
              then ' — proposed date ' || to_char(p_proposed_date, 'FMMon FMDD, YYYY') else '' end,
    '/directives/' || v_d.id, v_d.program_id, 'directive', v_d.id);
end;
$$;

create or replace function public.close_directive(
  p_directive_id  uuid,
  p_note          text default null,
  p_withdraw      boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_d  public.directives;
  u    uuid;
begin
  select * into v_d from public.directives where id = p_directive_id;
  if not found or not (v_d.issued_by = (select auth.uid()) or public.can_manage_program(v_d.program_id)) then
    raise exception 'Only the issuer or a program admin can close this directive' using errcode = '42501';
  end if;
  if v_d.status <> 'open' then
    raise exception 'This directive is already %', v_d.status using errcode = '22023';
  end if;
  update public.directives
  set status = case when p_withdraw then 'withdrawn' else 'closed' end,
      closed_at = now(), closed_by = (select auth.uid()),
      close_note = nullif(trim(coalesce(p_note, '')), '')
  where id = p_directive_id;

  for u in select r.user_id from public.directive_recipients r where r.directive_id = p_directive_id loop
    perform public.deliver(
      u, 'directive',
      case when p_withdraw then 'Directive withdrawn: ' else 'Directive closed: ' end || v_d.title,
      nullif(trim(coalesce(p_note, '')), ''),
      '/directives/' || v_d.id, v_d.program_id, 'directive', v_d.id);
  end loop;
end;
$$;

-- Read model for lists: response counts, the caller's own status, overdue flag.
create view public.v_directives with (security_invoker = true) as
select
  d.*,
  coalesce(r.total, 0)        as recipients_total,
  coalesce(r.acknowledged, 0) as acknowledged_count,
  coalesce(r.responded, 0)    as responded_count,
  me.status                   as my_status,
  (d.status = 'open' and d.response_due is not null and d.response_due < public.today_ph()
   and coalesce(r.responded, 0) < coalesce(r.total, 0)) as is_overdue,
  case when d.entity_type = 'activity' then a.code end  as entity_code,
  case when d.entity_type = 'activity' then a.title
       when d.entity_type = 'beneficiary' then b.name end as entity_label
from public.directives d
left join lateral (
  select count(*) as total,
         count(*) filter (where x.status <> 'pending') as acknowledged,
         count(*) filter (where x.status = 'responded') as responded
  from public.directive_recipients x where x.directive_id = d.id
) r on true
left join public.directive_recipients me on me.directive_id = d.id and me.user_id = (select auth.uid())
left join public.activities a on d.entity_type = 'activity' and a.id = d.entity_id
left join public.beneficiaries b on d.entity_type = 'beneficiary' and b.id = d.entity_id;

grant select on public.v_directives to authenticated;

-- ---------------------------------------------------------------------------
-- Event notifications: assignments and stage moves
-- ---------------------------------------------------------------------------
create or replace function public.notify_activity_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_label  text := coalesce(new.code || ' · ', '') || new.title;
  v_link   text := '/activities/' || new.id;
  v_actor  text := public.person_name((select auth.uid()));
  v_stage  public.activity_stage_progress;
begin
  if new.deleted_at is not null then
    return null;
  end if;

  if new.responsible_user_id is not null
     and (tg_op = 'INSERT' or new.responsible_user_id is distinct from old.responsible_user_id) then
    perform public.deliver(new.responsible_user_id, 'assignment',
      'You are responsible for ' || v_label,
      case when (select auth.uid()) is not null then 'Assigned by ' || v_actor end,
      v_link, new.program_id, 'activity', new.id);
  end if;

  if tg_op = 'UPDATE' then
    -- Moved to another stage (not the initial instantiation).
    if old.current_stage_id is not null and new.current_stage_id is not null
       and new.current_stage_id is distinct from old.current_stage_id then
      select * into v_stage from public.activity_stage_progress where id = new.current_stage_id;
      perform public.deliver(x.uid, 'stage',
        v_label || ' moved to ' || v_stage.name,
        case when v_stage.planned_end is not null
             then 'Planned to finish by ' || to_char(v_stage.planned_end, 'FMMon FMDD, YYYY') end,
        v_link || '?tab=workflow', new.program_id, 'activity', new.id)
      from (select distinct unnest(array[v_stage.assigned_to, new.responsible_user_id]) as uid) x;
    end if;

    if new.status is distinct from old.status and new.status in ('completed', 'cancelled') then
      perform public.deliver(x.uid, 'stage',
        v_label || case when new.status = 'completed' then ' is completed' else ' was cancelled' end,
        case when new.status = 'cancelled' then new.cancelled_reason end,
        v_link, new.program_id, 'activity', new.id)
      from (
        select new.responsible_user_id as uid
        union select new.created_by
        union select m from public.program_managers(new.program_id, false) m
      ) x;
    end if;
  end if;
  return null;
end;
$$;

create trigger notify_activity_events
  after insert or update of responsible_user_id, current_stage_id, status on public.activities
  for each row execute function public.notify_activity_events();

create or replace function public.notify_stage_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_a  public.activities;
begin
  if new.assigned_to is null or new.assigned_to is not distinct from old.assigned_to then
    return null;
  end if;
  select * into v_a from public.activities where id = new.activity_id;
  perform public.deliver(new.assigned_to, 'assignment',
    'Assigned to stage "' || new.name || '" of ' || coalesce(v_a.code || ' · ', '') || v_a.title,
    case when new.planned_end is not null
         then 'Planned to finish by ' || to_char(new.planned_end, 'FMMon FMDD, YYYY') end,
    '/activities/' || v_a.id || '?tab=workflow', new.program_id, 'activity', v_a.id);
  return null;
end;
$$;

create trigger notify_stage_assignment
  after update of assigned_to on public.activity_stage_progress
  for each row execute function public.notify_stage_assignment();

create or replace function public.notify_task_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_a  public.activities;
begin
  if new.assigned_to is null
     or (tg_op = 'UPDATE' and new.assigned_to is not distinct from old.assigned_to) then
    return null;
  end if;
  select * into v_a from public.activities where id = new.activity_id;
  perform public.deliver(new.assigned_to, 'assignment',
    'Checklist item assigned to you: ' || new.title,
    coalesce(v_a.code || ' · ', '') || v_a.title
      || case when new.due_date is not null then ' — due ' || to_char(new.due_date, 'FMMon FMDD, YYYY') else '' end,
    '/activities/' || v_a.id || '?tab=checklist', new.program_id, 'activity', v_a.id);
  return null;
end;
$$;

create trigger notify_task_assignment
  after insert or update of assigned_to on public.activity_tasks
  for each row execute function public.notify_task_assignment();

-- ---------------------------------------------------------------------------
-- Daily sweep: reminders and escalation. Idempotent per day (dedupe keys).
-- Level n of an escalation is reached when days overdue >= threshold n.
-- ---------------------------------------------------------------------------
create or replace function public.escalation_level(p_days integer, p_thresholds integer[])
returns integer
language sql
immutable
set search_path = ''
as $$
  select count(*)::integer from unnest(p_thresholds) t where p_days >= t
$$;

create or replace function public.run_notification_sweep(p_today date default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today       date := coalesce(p_today, public.today_ph());
  v_cfg         jsonb := coalesce((select value from public.app_settings where key = 'reminders'), '{}'::jsonb);
  v_stage_days  integer := coalesce((v_cfg ->> 'stage_due_days')::integer, 2);
  v_dir_days    integer := coalesce((v_cfg ->> 'directive_due_days')::integer, 1);
  v_act_esc     integer[] := case when jsonb_typeof(v_cfg -> 'activity_escalation_days') = 'array'
                    then array(select jsonb_array_elements_text(v_cfg -> 'activity_escalation_days')::integer order by 1)
                    else '{1,7,30}' end;
  v_dir_esc     integer[] := case when jsonb_typeof(v_cfg -> 'directive_escalation_days') = 'array'
                    then array(select jsonb_array_elements_text(v_cfg -> 'directive_escalation_days')::integer order by 1)
                    else '{1,3,7}' end;
  v_result      jsonb := '{}'::jsonb;
  n             integer;
begin
  if (select auth.uid()) is not null and not public.is_superadmin() then
    raise exception 'Only the superadmin can run the reminder sweep' using errcode = '42501';
  end if;

  -- 1. Stages due soon (in progress, planned end in N days)
  select coalesce(sum(public.deliver(
           coalesce(s.assigned_to, a.responsible_user_id), 'stage_due',
           'Stage due ' || case when v_stage_days = 1 then 'tomorrow' else 'in ' || v_stage_days || ' days' end
             || ': ' || s.name,
           a.code || ' · ' || a.title || ' — planned end ' || to_char(s.planned_end, 'FMMon FMDD, YYYY'),
           '/activities/' || a.id || '?tab=workflow', a.program_id, 'activity', a.id,
           'stage_due:' || s.id || ':' || s.planned_end)), 0)
  into n
  from public.activity_stage_progress s
  join public.activities a on a.id = s.activity_id
  where s.status = 'in_progress' and a.status in ('not_started', 'ongoing') and a.deleted_at is null
    and s.planned_end = v_today + v_stage_days;
  v_result := v_result || jsonb_build_object('stage_due', n);

  -- 2. Stages running late: day 1, then weekly
  select coalesce(sum(public.deliver(
           coalesce(s.assigned_to, a.responsible_user_id), 'stage_due',
           'Stage late by ' || (v_today - s.planned_end) || ' day(s): ' || s.name,
           a.code || ' · ' || a.title || ' — planned end was ' || to_char(s.planned_end, 'FMMon FMDD, YYYY'),
           '/activities/' || a.id || '?tab=workflow', a.program_id, 'activity', a.id,
           'stage_late:' || s.id || ':' || v_today)), 0)
  into n
  from public.activity_stage_progress s
  join public.activities a on a.id = s.activity_id
  where s.status = 'in_progress' and a.status in ('not_started', 'ongoing') and a.deleted_at is null
    and s.planned_end < v_today and (v_today - s.planned_end) % 7 = 1;
  v_result := v_result || jsonb_build_object('stage_late', n);

  -- 3. Checklist items due soon
  select coalesce(sum(public.deliver(
           t.assigned_to, 'task_due',
           'Checklist item due ' || to_char(t.due_date, 'FMMon FMDD') || ': ' || t.title,
           a.code || ' · ' || a.title,
           '/activities/' || a.id || '?tab=checklist', a.program_id, 'activity', a.id,
           'task_due:' || t.id || ':' || t.due_date)), 0)
  into n
  from public.activity_tasks t
  join public.activities a on a.id = t.activity_id
  where not t.is_done and t.assigned_to is not null and a.status in ('not_started', 'ongoing')
    and a.deleted_at is null and t.due_date = v_today + v_stage_days;
  v_result := v_result || jsonb_build_object('task_due', n);

  -- 4. Overdue activities: L1 responsible person, L2 + program admins, L3 + superadmins
  with overdue as (
    select a.*, v_today - a.due_date as days,
           public.escalation_level(v_today - a.due_date, v_act_esc) as lvl
    from public.activities a
    where a.status in ('not_started', 'ongoing') and a.deleted_at is null
      and a.due_date < v_today
  ),
  targets as (
    select o.*, coalesce(o.responsible_user_id, o.created_by) as uid, false as is_escalation
    from overdue o where o.lvl >= 1
    union
    select o.*, m, true from overdue o, public.program_managers(o.program_id, false) m where o.lvl >= 2
    union
    select o.*, p.id, true from overdue o
    join public.profiles p on p.role = 'superadmin' and p.is_active and p.deleted_at is null
    where o.lvl >= 3
  )
  select coalesce(sum(public.deliver(
           t.uid, case when t.is_escalation then 'escalation' else 'overdue' end,
           case when t.is_escalation
                then 'Escalation (level ' || t.lvl || '): ' || t.code || ' is ' || t.days || ' days overdue'
                else 'Overdue by ' || t.days || ' day(s): ' || t.code || ' · ' || t.title end,
           t.title || ' — due ' || to_char(t.due_date, 'FMMon FMDD, YYYY')
             || coalesce(' · responsible: ' || public.person_name(t.responsible_user_id), ''),
           '/activities/' || t.id, t.program_id, 'activity', t.id,
           'activity_overdue:' || t.id || ':' || t.due_date || ':L' || t.lvl)), 0)
  into n
  from targets t;
  v_result := v_result || jsonb_build_object('activity_overdue', n);

  -- 5. Directive responses due soon
  select coalesce(sum(public.deliver(
           r.user_id, 'directive_due',
           'Response due ' || case when v_dir_days = 1 then 'tomorrow' else 'in ' || v_dir_days || ' days' end
             || ': ' || d.title,
           null, '/directives/' || d.id, d.program_id, 'directive', d.id,
           'directive_due:' || d.id || ':' || d.response_due)), 0)
  into n
  from public.directives d
  join public.directive_recipients r on r.directive_id = d.id and r.status <> 'responded'
  where d.status = 'open' and d.response_due = v_today + v_dir_days;
  v_result := v_result || jsonb_build_object('directive_due', n);

  -- 6. Unanswered directives: L1 recipient + issuer, L2 + program admins, L3 + superadmins
  with late as (
    select d.id, d.title, d.program_id, d.issued_by, d.response_due, r.user_id as recipient,
           v_today - d.response_due as days,
           public.escalation_level(v_today - d.response_due, v_dir_esc) as lvl
    from public.directives d
    join public.directive_recipients r on r.directive_id = d.id and r.status <> 'responded'
    where d.status = 'open' and d.response_due < v_today
  ),
  targets as (
    select l.*, l.recipient as uid, 'self' as audience from late l where l.lvl >= 1
    union
    select l.*, l.issued_by, 'issuer' from late l where l.lvl >= 1
    union
    select l.*, m, 'manager' from late l, public.program_managers(l.program_id, false) m where l.lvl >= 2
    union
    select l.*, p.id, 'manager' from late l
    join public.profiles p on p.role = 'superadmin' and p.is_active and p.deleted_at is null
    where l.lvl >= 3
  ),
  sent as (
    select t.id, t.lvl, public.deliver(
             t.uid,
             case when t.audience = 'self' then 'directive_due' else 'escalation' end,
             case when t.audience = 'self'
                  then 'Response overdue by ' || t.days || ' day(s): ' || t.title
                  else 'No response from ' || public.person_name(t.recipient) || ' (' || t.days
                       || ' day(s) late): ' || t.title end,
             case when t.lvl > 1 then 'Escalation level ' || t.lvl end,
             '/directives/' || t.id, t.program_id, 'directive', t.id,
             'directive_overdue:' || t.id || ':' || t.recipient || ':L' || t.lvl) as sent
    from targets t
    -- an issuer who is also a program admin gets one notice, not two
    where t.audience <> 'manager' or t.uid is distinct from t.issued_by
  ),
  bump as (
    update public.directives d
    set escalation_level = x.lvl, last_escalated_at = now()
    from (select id, max(lvl) as lvl from sent group by id) x
    where d.id = x.id and d.escalation_level < x.lvl
    returning 1
  )
  select coalesce(sum(sent), 0) + 0 * (select count(*) from bump) into n from sent;
  v_result := v_result || jsonb_build_object('directive_overdue', n);

  return v_result || jsonb_build_object('date', v_today);
end;
$$;

-- Schedule daily at 07:00 Asia/Manila (23:00 UTC) where pg_cron is available.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    begin
      create extension if not exists pg_cron with schema pg_catalog;
      perform cron.schedule('payew-notification-sweep', '0 23 * * *', 'select public.run_notification_sweep()');
    exception when others then
      raise notice 'pg_cron not scheduled (%): enable "Cron" in the Supabase dashboard and schedule select public.run_notification_sweep() daily', sqlerrm;
    end;
  end if;
end;
$$;

-- Realtime for live discussion threads (RLS applies to subscribers).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.comments;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.issue_directive(uuid, text, text, uuid[], date, text, text, uuid, text)',
    'public.overdue_notice_draft(uuid)',
    'public.send_overdue_notice(uuid, uuid[], text, text, date, text)',
    'public.acknowledge_directive(uuid)',
    'public.respond_to_directive(uuid, text, date)',
    'public.close_directive(uuid, text, boolean)',
    'public.run_notification_sweep(date)',
    'public.can_view_entity(text, uuid)',
    'public.can_view_directive(uuid)',
    'public.entity_program(text, uuid)',
    'public.mutable_notification_types()'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  foreach f in array array[
    'public.deliver(uuid, text, text, text, text, uuid, text, uuid, text)',
    'public.person_name(uuid)',
    'public.user_can_access_program(uuid, uuid)',
    'public.program_managers(uuid, boolean)',
    'public.user_can_view_directive(uuid, uuid)',
    'public.user_can_view_entity(uuid, text, uuid)',
    'public.entity_ref(text, uuid, text)',
    'public.filter_mentions(uuid[], text, uuid, uuid)',
    'public.prepare_comment()',
    'public.notify_comment()',
    'public.prepare_note()',
    'public.notify_activity_events()',
    'public.notify_stage_assignment()',
    'public.notify_task_assignment()',
    'public.escalation_level(integer, integer[])'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end;
$$;
