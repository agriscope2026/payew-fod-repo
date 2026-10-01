-- =============================================================================
-- PAYEW · Phase 6 · Comment visibility
-- program     everyone who can see the record (default)
-- admins      program admins + superadmins only (internal discussion)
-- superadmin  FOD superadmins only
-- Replies inherit the visibility of their thread; it cannot be changed later.
-- =============================================================================

alter table public.comments add column visibility text not null default 'program'
  check (visibility in ('program', 'admins', 'superadmin'));

-- Can the caller read/post comments with this visibility in this program?
create or replace function public.can_see_comment_visibility(p_visibility text, p_program_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_visibility
    when 'program' then true
    when 'admins' then case when p_program_id is null then public.is_superadmin()
                            else public.can_manage_program(p_program_id) end
    when 'superadmin' then public.is_superadmin()
    else false
  end
$$;

-- Same question for another user (mention / notification targets).
create or replace function public.user_can_see_comment_visibility(p_user_id uuid, p_visibility text, p_program_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_visibility
    when 'program' then true
    when 'admins' then p_user_id in (select public.program_managers(p_program_id))
    when 'superadmin' then exists (
      select 1 from public.profiles p
      where p.id = p_user_id and p.role = 'superadmin' and p.is_active and p.deleted_at is null)
    else false
  end
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
      -- One level of threading: a reply to a reply joins the root thread,
      -- and replies keep the thread's visibility.
      new.parent_id := coalesce(v_parent.parent_id, v_parent.id);
      new.visibility := v_parent.visibility;
    end if;
    if v_uid is not null and not public.can_see_comment_visibility(new.visibility, new.program_id) then
      raise exception 'You cannot post comments with % visibility here', new.visibility using errcode = '42501';
    end if;
    new.mentions := public.filter_mentions(new.mentions, new.entity_type, new.entity_id, new.author_id);
    new.mentions := array(
      select u from unnest(new.mentions) u
      where public.user_can_see_comment_visibility(u, new.visibility, new.program_id));
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
  new.visibility := old.visibility;
  if new.body is distinct from old.body then
    new.edited_at := now();
  end if;
  if new.mentions is distinct from old.mentions then
    new.mentions := public.filter_mentions(new.mentions, new.entity_type, new.entity_id, old.author_id);
    new.mentions := array(
      select u from unnest(new.mentions) u
      where public.user_can_see_comment_visibility(u, new.visibility, new.program_id));
  end if;
  return new;
end;
$$;

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

drop policy "comments: read" on public.comments;
create policy "comments: read" on public.comments
  for select to authenticated
  using (
    public.can_view_entity(entity_type, entity_id)
    and public.can_see_comment_visibility(visibility, program_id)
    and (
      deleted_at is null
      or author_id = (select auth.uid())
      or case when program_id is null then (select public.is_superadmin())
              else public.can_manage_program(program_id) end
    )
  );

drop policy "comments: update" on public.comments;
create policy "comments: update" on public.comments
  for update to authenticated
  using (
    public.can_view_entity(entity_type, entity_id)
    and public.can_see_comment_visibility(visibility, program_id)
    and (
      author_id = (select auth.uid())
      or case when program_id is null then (select public.is_superadmin())
              else public.can_manage_program(program_id) end
    )
  )
  with check (public.can_view_entity(entity_type, entity_id));

revoke execute on function public.can_see_comment_visibility(text, uuid) from public, anon;
grant execute on function public.can_see_comment_visibility(text, uuid) to authenticated;
revoke execute on function public.user_can_see_comment_visibility(uuid, text, uuid) from public, anon, authenticated;
revoke execute on function public.prepare_comment() from public, anon, authenticated;
revoke execute on function public.notify_comment() from public, anon, authenticated;
