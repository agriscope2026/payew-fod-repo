-- =============================================================================
-- 1. Workflow stages can be completed without filling in the stage's required
--    fields or ticking its required checklist items. Those are warnings now.
--    Sub-steps, stage order and open packages are still checked.
-- 2. linked_files: links to presentations, spreadsheets, documents, images and
--    other files kept elsewhere (Google Drive), shown on the Files page.
-- =============================================================================

create or replace function public.activity_stage_action(
  p_stage_id uuid,
  p_action text,
  p_note text default null,
  p_date date default null
)
returns public.activity_stage_progress
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stage     public.activity_stage_progress;
  v_act       public.activities;
  v_pkg       public.procurement_packages;
  v_current   public.activity_stage_progress;
  v_next      uuid;
  v_date      date := coalesce(p_date, public.today_ph());
  v_missing   text[];
  v_open      integer;
  v_from      text;
  v_note      text := nullif(trim(coalesce(p_note, '')), '');
  v_override  boolean := false;
begin
  select * into v_stage from public.activity_stage_progress where id = p_stage_id for update;
  if v_stage.id is null then
    raise exception 'Stage not found' using errcode = 'P0002';
  end if;
  select * into v_act from public.activities where id = v_stage.activity_id for update;
  if v_stage.package_id is not null then
    select * into v_pkg from public.procurement_packages where id = v_stage.package_id for update;
  end if;

  if not public.can_write_program(v_act.program_id) or v_act.deleted_at is not null then
    raise exception 'You are not allowed to update this activity' using errcode = '42501';
  end if;
  perform public.assert_fiscal_year_writable(v_act.fiscal_year_id, v_act.program_id);
  if v_act.status = 'cancelled' then
    raise exception 'This activity is cancelled' using errcode = '42501';
  end if;
  if v_pkg.id is not null then
    if v_pkg.deleted_at is not null then
      raise exception 'This package was deleted' using errcode = '42501';
    end if;
    if v_pkg.status = 'cancelled' then
      raise exception 'This package is cancelled' using errcode = '42501';
    end if;
  end if;
  if v_date > public.today_ph() then
    raise exception 'The date cannot be in the future' using errcode = '22023';
  end if;

  -- Current = first main stage of this track not yet completed/skipped.
  select * into v_current from public.activity_stage_progress
  where activity_id = v_act.id and package_id is not distinct from v_stage.package_id
    and parent_id is null and status in ('pending', 'in_progress')
  order by sort_order limit 1;

  v_from := v_stage.status;

  if p_action in ('start', 'complete', 'skip') then
    if v_stage.status in ('completed', 'skipped') then
      raise exception 'This stage is already %', v_stage.status using errcode = '22023';
    end if;
    if coalesce(v_stage.parent_id, v_stage.id) is distinct from v_current.id then
      raise exception 'Finish "%" first', v_current.name using errcode = '22023';
    end if;
  end if;

  if p_action = 'start' then
    update public.activity_stage_progress
    set status = 'in_progress', actual_start = coalesce(actual_start, v_date)
    where id = v_stage.id returning * into v_stage;
    if v_stage.parent_id is not null then
      update public.activity_stage_progress
      set status = 'in_progress', actual_start = coalesce(actual_start, v_date)
      where id = v_stage.parent_id and status = 'pending';
    end if;

  elsif p_action = 'complete' then
    -- Empty fields and open checklist items no longer block a stage: the app shows
    -- them as warnings, and the stage can still be completed.
    select count(*) into v_open from public.activity_stage_progress
    where parent_id = v_stage.id and status not in ('completed', 'skipped');
    if v_open > 0 then
      raise exception 'Complete or skip the % remaining sub-step(s) first', v_open using errcode = '23514';
    end if;
    if v_stage.actual_start is not null and v_date < v_stage.actual_start then
      raise exception 'The completion date is before the stage started' using errcode = '22023';
    end if;
    if v_stage.tracks_packages then
      select count(*) into v_open from public.procurement_packages
      where activity_id = v_act.id and deleted_at is null and status in ('not_started', 'ongoing');
      if v_open > 0 then
        if not public.can_manage_program(v_act.program_id) then
          raise exception '% package(s) are still open. Close them first, or ask a program admin to override', v_open
            using errcode = '23514';
        end if;
        if v_note is null then
          raise exception '% package(s) are still open. Give a justification to override', v_open
            using errcode = '23514';
        end if;
        v_override := true;
      end if;
    end if;

    update public.activity_stage_progress
    set status = 'completed', actual_start = coalesce(actual_start, v_date), actual_end = v_date,
        completed_by = (select auth.uid()), completed_at = now()
    where id = v_stage.id returning * into v_stage;

  elsif p_action = 'skip' then
    if not v_stage.skippable then
      raise exception 'This stage cannot be skipped' using errcode = '22023';
    end if;
    if v_note is null then
      raise exception 'Give a reason for skipping' using errcode = '22023';
    end if;
    update public.activity_stage_progress
    set status = 'skipped', actual_end = v_date, completed_by = (select auth.uid()), completed_at = now()
    where id = v_stage.id or (parent_id = v_stage.id and status in ('pending', 'in_progress'));
    select * into v_stage from public.activity_stage_progress where id = p_stage_id;

  elsif p_action = 'reopen' then
    if not public.can_manage_program(v_act.program_id) then
      raise exception 'Only program admins can move a workflow back' using errcode = '42501';
    end if;
    if v_stage.parent_id is not null or v_stage.status not in ('completed', 'skipped') then
      raise exception 'Only a finished main stage can be reopened' using errcode = '22023';
    end if;
    if v_note is null then
      raise exception 'Give a reason for moving back' using errcode = '22023';
    end if;
    update public.activity_stage_progress sp
    set status = 'pending', actual_start = null, actual_end = null, completed_by = null, completed_at = null
    where sp.activity_id = v_act.id and sp.package_id is not distinct from v_stage.package_id
      and coalesce((select p.sort_order from public.activity_stage_progress p where p.id = sp.parent_id), sp.sort_order)
          > v_stage.sort_order;
    update public.activity_stage_progress
    set status = 'in_progress', actual_end = null, completed_by = null, completed_at = null
    where id = v_stage.id returning * into v_stage;
    if v_pkg.id is not null then
      update public.procurement_packages set status = 'ongoing', closed_at = null, current_stage_id = v_stage.id
      where id = v_pkg.id;
    else
      update public.activities set status = 'ongoing', completed_at = null, current_stage_id = v_stage.id
      where id = v_act.id;
    end if;

  else
    raise exception 'Unknown action %', p_action using errcode = '22023';
  end if;

  -- Advance the track pointer after a main stage finishes.
  if p_action in ('complete', 'skip') and v_stage.parent_id is null then
    select id into v_next from public.activity_stage_progress
    where activity_id = v_act.id and package_id is not distinct from v_stage.package_id
      and parent_id is null and status in ('pending', 'in_progress')
    order by sort_order limit 1;
    if v_next is not null then
      update public.activity_stage_progress
      set status = 'in_progress', actual_start = coalesce(actual_start, v_date)
      where id = v_next and status = 'pending';
    end if;
    if v_pkg.id is not null then
      update public.procurement_packages
      set current_stage_id = v_next,
          status = case when v_next is null then 'closed' else 'ongoing' end,
          closed_at = case when v_next is null then now() end
      where id = v_pkg.id;
    else
      update public.activities
      set current_stage_id = v_next,
          status = case when v_next is null then 'completed' else 'ongoing' end,
          completed_at = case when v_next is null then now() else null end
      where id = v_act.id;
    end if;
  elsif p_action <> 'reopen' then
    if v_pkg.id is not null and v_pkg.status = 'not_started' then
      update public.procurement_packages set status = 'ongoing' where id = v_pkg.id;
    end if;
  end if;
  -- Any movement on a track means the activity is under way.
  if p_action <> 'reopen' then
    update public.activities set status = 'ongoing' where id = v_act.id and status = 'not_started';
  end if;

  insert into public.activity_stage_transitions
    (activity_id, program_id, package_id, stage_id, stage_name, action, from_status, to_status, note, effective_date)
  values
    (v_act.id, v_act.program_id, v_stage.package_id, v_stage.id, v_stage.name, p_action, v_from, v_stage.status,
     case when v_override then 'Override (packages still open): ' || v_note else v_note end, v_date);

  return v_stage;
end;
$$;

create table public.linked_files (
  id              uuid primary key default gen_random_uuid(),
  program_id      uuid not null references public.programs (id) on delete cascade,
  fiscal_year_id  uuid references public.fiscal_years (id) on delete set null,
  title           text not null check (length(trim(title)) between 1 and 200),
  url             text not null check (url ~* '^https://' and length(url) <= 2000),
  kind            text not null
                  check (kind in ('presentation', 'spreadsheet', 'document', 'pdf', 'image', 'video', 'folder', 'link')),
  description     text check (description is null or length(description) <= 1000),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid default auth.uid() references auth.users (id) on delete set null
);
create index linked_files_program_idx on public.linked_files (program_id, created_at desc);
create trigger set_updated_at before update on public.linked_files
  for each row execute function public.set_updated_at();
select public.enable_audit('public.linked_files');

alter table public.linked_files enable row level security;
grant select, insert, update, delete on public.linked_files to authenticated;

-- Anyone in the program can share a link; the person who added it or a program
-- admin can change or remove it.
create policy "linked_files: read" on public.linked_files
  for select to authenticated using (public.has_program_access(program_id));
create policy "linked_files: members add" on public.linked_files
  for insert to authenticated
  with check (public.has_program_access(program_id) and created_by = auth.uid());
create policy "linked_files: owner or admin changes" on public.linked_files
  for update to authenticated
  using (created_by = auth.uid() or public.can_manage_program(program_id))
  with check (public.has_program_access(program_id));
create policy "linked_files: owner or admin removes" on public.linked_files
  for delete to authenticated
  using (created_by = auth.uid() or public.can_manage_program(program_id));
