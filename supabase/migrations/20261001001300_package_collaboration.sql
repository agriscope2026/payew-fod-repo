-- =============================================================================
-- PAYEW · Phase 6B (Addendum B) · Packages & suppliers in comments, notes,
-- directives, attachments and notifications
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Record helpers: + package, supplier
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
    when 'package' then (select p.program_id from public.procurement_packages p where p.id = p_entity_id)
    when 'beneficiary' then (select b.registered_by_program_id from public.beneficiaries b where b.id = p_entity_id)
    when 'directive' then (select d.program_id from public.directives d where d.id = p_entity_id)
  end
$$;

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
       when 'package' then exists (
         select 1 from public.procurement_packages p
         where p.id = p_entity_id and p.deleted_at is null and public.has_program_access(p.program_id))
       when 'beneficiary' then exists (
         select 1 from public.beneficiaries b where b.id = p_entity_id and b.deleted_at is null)
       when 'supplier' then exists (
         select 1 from public.suppliers s where s.id = p_entity_id and s.deleted_at is null)
       when 'directive' then public.can_view_directive(p_entity_id)
       else false
     end
$$;

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
    when 'package' then exists (
      select 1 from public.procurement_packages p
      where p.id = p_entity_id and p.deleted_at is null
        and public.user_can_access_program(p_user_id, p.program_id))
    when 'beneficiary' then exists (
      select 1 from public.profiles p where p.id = p_user_id and p.is_active and p.deleted_at is null)
    when 'supplier' then exists (
      select 1 from public.profiles p where p.id = p_user_id and p.is_active and p.deleted_at is null)
    when 'directive' then public.user_can_view_directive(p_user_id, p_entity_id)
    else false
  end
$$;

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
  select p.code || ' · ' || p.title,
         '/activities/' || p.activity_id || '/packages/' || p.id || coalesce('?tab=' || p_tab, '')
  from public.procurement_packages p where p_entity_type = 'package' and p.id = p_entity_id
  union all
  select b.name, '/beneficiaries/' || b.id || coalesce('?tab=' || p_tab, '')
  from public.beneficiaries b where p_entity_type = 'beneficiary' and b.id = p_entity_id
  union all
  select s.business_name, '/suppliers/' || s.id
  from public.suppliers s where p_entity_type = 'supplier' and s.id = p_entity_id
  union all
  select d.title, '/directives/' || d.id
  from public.directives d where p_entity_type = 'directive' and d.id = p_entity_id
$$;

alter table public.comments drop constraint comments_entity_type_check;
alter table public.comments add constraint comments_entity_type_check
  check (entity_type in ('activity', 'package', 'beneficiary', 'supplier', 'directive'));
alter table public.notes drop constraint notes_entity_type_check;
alter table public.notes add constraint notes_entity_type_check
  check (entity_type in ('activity', 'package', 'beneficiary', 'supplier'));
alter table public.directives drop constraint directives_entity_type_check;
alter table public.directives add constraint directives_entity_type_check
  check (entity_type in ('activity', 'package', 'beneficiary'));

-- ---------------------------------------------------------------------------
-- Comments: package owners are notified too
-- ---------------------------------------------------------------------------
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
  v_where    text;
  u          uuid;
begin
  if new.deleted_at is not null then
    return null;
  end if;
  select * into v_ref from public.entity_ref(new.entity_type, new.entity_id, 'discussion');
  v_link := coalesce(v_ref.link, '/') || '#comment-' || new.id;
  v_where := coalesce(v_ref.label, 'a record')
             || case new.visibility when 'admins' then ' (admins only)'
                                    when 'superadmin' then ' (superadmin only)' else '' end;

  v_new_mentions := case when tg_op = 'INSERT' then new.mentions
                         else array(select unnest(new.mentions) except select unnest(old.mentions)) end;
  foreach u in array coalesce(v_new_mentions, '{}') loop
    perform public.deliver(u, 'mention', v_author || ' mentioned you on ' || v_where,
                           v_snippet, v_link, new.program_id, new.entity_type, new.entity_id);
  end loop;

  if tg_op = 'UPDATE' then
    return null;
  end if;

  for u in
    select distinct x.uid from (
      select c.author_id as uid from public.comments c
      where new.parent_id is not null and (c.id = new.parent_id or c.parent_id = new.parent_id)
        and c.deleted_at is null and c.id <> new.id
      union
      select a.responsible_user_id from public.activities a
      where new.entity_type = 'activity' and a.id = new.entity_id
      union
      select a.created_by from public.activities a
      where new.entity_type = 'activity' and a.id = new.entity_id and a.responsible_user_id is null
      union
      select coalesce(p.responsible_user_id, a.responsible_user_id) from public.procurement_packages p
      join public.activities a on a.id = p.activity_id
      where new.entity_type = 'package' and p.id = new.entity_id
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
      and public.user_can_see_comment_visibility(x.uid, new.visibility, new.program_id)
  loop
    perform public.deliver(
      u, 'comment',
      v_author || case when new.parent_id is null then ' commented on ' else ' replied on ' end || v_where,
      v_snippet, v_link, new.program_id, new.entity_type, new.entity_id);
  end loop;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Directives can be about a package
-- ---------------------------------------------------------------------------
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
    if p_entity_type not in ('activity', 'package', 'beneficiary') or not public.can_view_entity(p_entity_type, p_entity_id) then
      raise exception 'Linked record not found' using errcode = '22023';
    end if;
    if p_entity_type in ('activity', 'package') and public.entity_program(p_entity_type, p_entity_id) <> p_program_id then
      raise exception 'The linked record belongs to another program' using errcode = '22023';
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

create or replace view public.v_directives with (security_invoker = true) as
select
  d.*,
  coalesce(r.total, 0)        as recipients_total,
  coalesce(r.acknowledged, 0) as acknowledged_count,
  coalesce(r.responded, 0)    as responded_count,
  me.status                   as my_status,
  (d.status = 'open' and d.response_due is not null and d.response_due < public.today_ph()
   and coalesce(r.responded, 0) < coalesce(r.total, 0)) as is_overdue,
  case when d.entity_type = 'activity' then a.code
       when d.entity_type = 'package' then pk.code end   as entity_code,
  case when d.entity_type = 'activity' then a.title
       when d.entity_type = 'package' then pk.title
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
left join public.procurement_packages pk on d.entity_type = 'package' and pk.id = d.entity_id
left join public.beneficiaries b on d.entity_type = 'beneficiary' and b.id = d.entity_id;

-- Overdue notice for a package (supplier late, stage past plan, …).
create or replace function public.package_overdue_notice_draft(p_package_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_p     public.procurement_packages;
  v_stage public.activity_stage_progress;
  v_today date := public.today_ph();
  v_due   date;
  v_what  text;
  v_sup   text;
  v_tmpl  jsonb;
begin
  select * into v_p from public.procurement_packages where id = p_package_id and deleted_at is null;
  if not found or not public.can_manage_program(v_p.program_id) then
    raise exception 'Only program admins and the superadmin can send overdue notices' using errcode = '42501';
  end if;
  if v_p.status not in ('not_started', 'ongoing') then
    raise exception 'Only open packages can receive an overdue notice' using errcode = '22023';
  end if;
  select * into v_stage from public.activity_stage_progress where id = v_p.current_stage_id;
  select business_name into v_sup from public.suppliers where id = v_p.supplier_id;
  if v_p.due_date is not null and v_p.due_date < v_today then
    v_due := v_p.due_date;
    v_what := v_p.code || ' ' || v_p.title;
  elsif v_stage.planned_end is not null and v_stage.planned_end < v_today then
    v_due := v_stage.planned_end;
    v_what := v_p.code || ' ' || v_p.title || ' (stage: ' || v_stage.name || ')';
  else
    raise exception 'This package is not overdue' using errcode = '22023';
  end if;
  v_what := v_what || coalesce(', supplier ' || v_sup, '');

  v_tmpl := coalesce((select value from public.app_settings where key = 'overdue_notice_template'), '{}'::jsonb);
  return jsonb_build_object(
    'title', left('Overdue package: ' || v_p.code || ' ' || v_p.title, 200),
    'body', replace(replace(replace(replace(replace(
      coalesce(v_tmpl ->> 'body', 'Activity {title} was due on {date} ({n} days overdue).'),
      '{title}', v_what), '{code}', v_p.code), '{date}', to_char(v_due, 'FMMon FMDD, YYYY')),
      '{n}', (v_today - v_due)::text), '{stage}', coalesce(v_stage.name, '')),
    'response_due', v_today + coalesce((v_tmpl ->> 'response_days')::integer, 5),
    'days_overdue', v_today - v_due,
    'recipients', to_jsonb(array(
      select distinct x from unnest(array[v_stage.assigned_to, v_p.responsible_user_id,
        (select responsible_user_id from public.activities where id = v_p.activity_id)]) x
      where x is not null))
  );
end;
$$;

create or replace function public.send_package_overdue_notice(
  p_package_id    uuid,
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
  v_draft    jsonb := public.package_overdue_notice_draft(p_package_id);
  v_program  uuid := public.entity_program('package', p_package_id);
begin
  return public.issue_directive(
    v_program,
    coalesce(nullif(trim(p_title), ''), v_draft ->> 'title'),
    coalesce(nullif(trim(p_body), ''), v_draft ->> 'body'),
    p_recipients,
    coalesce(p_response_due, (v_draft ->> 'response_due')::date),
    p_priority, 'package', p_package_id, 'overdue_notice');
end;
$$;

-- ---------------------------------------------------------------------------
-- Attachments: package and supplier files; document ticks per track
-- ---------------------------------------------------------------------------
create or replace function public.can_upload_attachment(
  p_program_id uuid,
  p_entity_type text,
  p_entity_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when public.current_user_role() is null then false
    when p_entity_type = 'profile' then p_program_id is null and p_entity_id = (select auth.uid())
    when p_entity_type = 'activity' then exists (
      select 1 from public.activities a
      where a.id = p_entity_id and a.program_id = p_program_id and a.deleted_at is null
    ) and public.can_write_program(p_program_id)
    when p_entity_type = 'package' then exists (
      select 1 from public.procurement_packages p
      where p.id = p_entity_id and p.program_id = p_program_id and p.deleted_at is null
    ) and public.can_write_program(p_program_id)
    when p_entity_type = 'supplier' then p_program_id is null and public.can_manage_suppliers()
      and exists (select 1 from public.suppliers s where s.id = p_entity_id and s.deleted_at is null)
    when p_program_id is null then public.is_superadmin()
    else public.can_write_program(p_program_id)
  end
$$;

create or replace function public.tick_document_tasks()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'ready' and new.document_type_id is not null and new.entity_type in ('activity', 'package') then
    update public.activity_tasks t
    set is_done = true, done_by = new.uploaded_by, done_at = now()
    from public.document_types d
    where d.id = new.document_type_id
      and t.doc_type_code = d.code
      and not t.is_done
      and case when new.entity_type = 'activity' then t.activity_id = new.entity_id and t.package_id is null
               else t.package_id = new.entity_id end;
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Package event notifications
-- ---------------------------------------------------------------------------
create or replace function public.notify_package_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_label  text := new.code || ' · ' || new.title;
  v_link   text := '/activities/' || new.activity_id || '/packages/' || new.id;
  v_owner  uuid := (select responsible_user_id from public.activities where id = new.activity_id);
  v_stage  public.activity_stage_progress;
begin
  if new.deleted_at is not null then
    return null;
  end if;
  if new.responsible_user_id is not null
     and (tg_op = 'INSERT' or new.responsible_user_id is distinct from old.responsible_user_id) then
    perform public.deliver(new.responsible_user_id, 'assignment', 'You are responsible for package ' || v_label,
      null, v_link, new.program_id, 'package', new.id);
  end if;
  if tg_op = 'UPDATE' then
    if old.current_stage_id is not null and new.current_stage_id is not null
       and new.current_stage_id is distinct from old.current_stage_id then
      select * into v_stage from public.activity_stage_progress where id = new.current_stage_id;
      perform public.deliver(x.uid, 'stage', v_label || ' moved to ' || v_stage.name,
        case when v_stage.planned_end is not null
             then 'Planned to finish by ' || to_char(v_stage.planned_end, 'FMMon FMDD, YYYY') end,
        v_link, new.program_id, 'package', new.id)
      from (select distinct unnest(array[v_stage.assigned_to, new.responsible_user_id]) as uid) x;
    end if;
    if new.status is distinct from old.status and new.status in ('closed', 'cancelled') then
      perform public.deliver(x.uid, 'stage',
        'Package ' || v_label || case when new.status = 'closed' then ' is closed' else ' was cancelled' end,
        new.cancelled_reason, v_link, new.program_id, 'package', new.id)
      from (select distinct unnest(array[new.responsible_user_id, v_owner]) as uid) x;
    end if;
  end if;
  return null;
end;
$$;
create trigger notify_package_events
  after insert or update of responsible_user_id, current_stage_id, status on public.procurement_packages
  for each row execute function public.notify_package_events();

-- ---------------------------------------------------------------------------
-- Daily sweep: package links, overdue packages, supplier document expiry
-- ---------------------------------------------------------------------------
create or replace function public.track_link(p_activity_id uuid, p_package_id uuid, p_tab text)
returns text
language sql
immutable
set search_path = ''
as $$
  select '/activities/' || p_activity_id
         || case when p_package_id is null then '' else '/packages/' || p_package_id end
         || '?tab=' || p_tab
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

  -- 1. Stages due soon (activity and package tracks)
  select coalesce(sum(public.deliver(
           coalesce(s.assigned_to, p.responsible_user_id, a.responsible_user_id), 'stage_due',
           'Stage due ' || case when v_stage_days = 1 then 'tomorrow' else 'in ' || v_stage_days || ' days' end
             || ': ' || s.name,
           coalesce(p.code, a.code) || ' · ' || coalesce(p.title, a.title)
             || ' — planned end ' || to_char(s.planned_end, 'FMMon FMDD, YYYY'),
           public.track_link(a.id, s.package_id, 'workflow'), a.program_id,
           case when s.package_id is null then 'activity' else 'package' end, coalesce(s.package_id, a.id),
           'stage_due:' || s.id || ':' || s.planned_end)), 0)
  into n
  from public.activity_stage_progress s
  join public.activities a on a.id = s.activity_id
  left join public.procurement_packages p on p.id = s.package_id
  where s.status = 'in_progress' and a.status in ('not_started', 'ongoing') and a.deleted_at is null
    and (p.id is null or (p.status in ('not_started', 'ongoing') and p.deleted_at is null))
    and s.planned_end = v_today + v_stage_days;
  v_result := v_result || jsonb_build_object('stage_due', n);

  -- 2. Stages running late: day 1, then weekly
  select coalesce(sum(public.deliver(
           coalesce(s.assigned_to, p.responsible_user_id, a.responsible_user_id), 'stage_due',
           'Stage late by ' || (v_today - s.planned_end) || ' day(s): ' || s.name,
           coalesce(p.code, a.code) || ' · ' || coalesce(p.title, a.title)
             || ' — planned end was ' || to_char(s.planned_end, 'FMMon FMDD, YYYY'),
           public.track_link(a.id, s.package_id, 'workflow'), a.program_id,
           case when s.package_id is null then 'activity' else 'package' end, coalesce(s.package_id, a.id),
           'stage_late:' || s.id || ':' || v_today)), 0)
  into n
  from public.activity_stage_progress s
  join public.activities a on a.id = s.activity_id
  left join public.procurement_packages p on p.id = s.package_id
  where s.status = 'in_progress' and a.status in ('not_started', 'ongoing') and a.deleted_at is null
    and (p.id is null or (p.status in ('not_started', 'ongoing') and p.deleted_at is null))
    and s.planned_end < v_today and (v_today - s.planned_end) % 7 = 1;
  v_result := v_result || jsonb_build_object('stage_late', n);

  -- 3. Checklist items due soon
  select coalesce(sum(public.deliver(
           t.assigned_to, 'task_due',
           'Checklist item due ' || to_char(t.due_date, 'FMMon FMDD') || ': ' || t.title,
           a.code || ' · ' || a.title,
           public.track_link(a.id, t.package_id, 'checklist'), a.program_id, 'activity', a.id,
           'task_due:' || t.id || ':' || t.due_date)), 0)
  into n
  from public.activity_tasks t
  join public.activities a on a.id = t.activity_id
  where not t.is_done and t.assigned_to is not null and a.status in ('not_started', 'ongoing')
    and a.deleted_at is null and t.due_date = v_today + v_stage_days;
  v_result := v_result || jsonb_build_object('task_due', n);

  -- 4. Overdue activities: L1 responsible, L2 + program admins, L3 + superadmins
  with overdue as (
    select a.*, v_today - a.due_date as days,
           public.escalation_level(v_today - a.due_date, v_act_esc) as lvl
    from public.activities a
    where a.status in ('not_started', 'ongoing') and a.deleted_at is null and a.due_date < v_today
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

  -- 5. Overdue packages: same levels (package/activity responsible → admins → superadmins)
  with overdue as (
    select p.id, p.code, p.title, p.program_id, p.activity_id, p.due_date,
           coalesce(p.responsible_user_id, a.responsible_user_id, p.created_by) as owner,
           s.business_name as supplier,
           v_today - p.due_date as days,
           public.escalation_level(v_today - p.due_date, v_act_esc) as lvl
    from public.procurement_packages p
    join public.activities a on a.id = p.activity_id and a.status in ('not_started', 'ongoing') and a.deleted_at is null
    left join public.suppliers s on s.id = p.supplier_id
    where p.status in ('not_started', 'ongoing') and p.deleted_at is null and p.due_date < v_today
  ),
  targets as (
    select o.*, o.owner as uid, false as is_escalation from overdue o where o.lvl >= 1
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
                then 'Escalation (level ' || t.lvl || '): package ' || t.code || ' is ' || t.days || ' days overdue'
                else 'Package overdue by ' || t.days || ' day(s): ' || t.code || ' · ' || t.title end,
           t.title || coalesce(' — supplier ' || t.supplier, '') || ' — due ' || to_char(t.due_date, 'FMMon FMDD, YYYY'),
           '/activities/' || t.activity_id || '/packages/' || t.id, t.program_id, 'package', t.id,
           'package_overdue:' || t.id || ':' || t.due_date || ':L' || t.lvl)), 0)
  into n
  from targets t;
  v_result := v_result || jsonb_build_object('package_overdue', n);

  -- 6. Directive responses due soon
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

  -- 7. Unanswered directives: L1 recipient + issuer, L2 + program admins, L3 + superadmins
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

  -- 8. Supplier documents expiring within 30 days (or expired) while the supplier has open
  --    packages: admins of those programs; otherwise superadmins. Once per document & date.
  with docs as (
    select s.id as supplier_id, s.business_name, 'PhilGEPS registration' as doc, 'philgeps' as kind, s.philgeps_expiry as expires_on
    from public.suppliers s where s.deleted_at is null and s.status <> 'blacklisted' and s.philgeps_expiry <= v_today + 30
    union all
    select s.id, s.business_name, 'Business permit', 'permit', s.permit_expiry
    from public.suppliers s where s.deleted_at is null and s.status <> 'blacklisted' and s.permit_expiry <= v_today + 30
    union all
    select s.id, s.business_name, initcap(replace(d.doc_type, '_', ' ')), d.id::text, d.expires_on
    from public.supplier_documents d join public.suppliers s on s.id = d.supplier_id
    where s.deleted_at is null and s.status <> 'blacklisted' and d.expires_on <= v_today + 30
  ),
  relevant as (
    select d.* from docs d
    where d.expires_on >= v_today - 30
  ),
  targets as (
    select distinct r.*, m as uid
    from relevant r
    join public.procurement_packages p on p.supplier_id = r.supplier_id and p.status in ('not_started', 'ongoing')
      and p.deleted_at is null
    cross join lateral public.program_managers(p.program_id, false) m
    union
    select r.*, pr.id
    from relevant r
    join public.profiles pr on pr.role = 'superadmin' and pr.is_active and pr.deleted_at is null
  )
  select coalesce(sum(public.deliver(
           t.uid, 'supplier_doc',
           t.doc || case when t.expires_on < v_today then ' expired: ' else ' expiring: ' end || t.business_name,
           case when t.expires_on < v_today then 'Expired on ' else 'Expires on ' end
             || to_char(t.expires_on, 'FMMon FMDD, YYYY'),
           '/suppliers/' || t.supplier_id, null, 'supplier', t.supplier_id,
           'supplier_doc:' || t.supplier_id || ':' || t.kind || ':' || t.expires_on)), 0)
  into n
  from targets t;
  v_result := v_result || jsonb_build_object('supplier_doc', n);

  return v_result || jsonb_build_object('date', v_today);
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
    'public.package_overdue_notice_draft(uuid)',
    'public.send_package_overdue_notice(uuid, uuid[], text, text, date, text)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  foreach f in array array[
    'public.notify_package_events()',
    'public.track_link(uuid, uuid, text)',
    'public.notify_comment()',
    'public.tick_document_tasks()'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end;
$$;
