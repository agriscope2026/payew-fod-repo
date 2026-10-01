-- =============================================================================
-- Phase 12: keep package roll-ups consistent
--   Once an activity's Procurement & Implementation stage is finished, no package
--   may come back to life under it (new, un-cancelled or restored from Trash).
--   Otherwise an open package would sit under a finished stage and the activity
--   would never account for it. Reopen the stage first.
-- =============================================================================

create or replace function public.guard_package_after_procurement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_revives boolean;
begin
  v_revives := case
    when tg_op = 'INSERT' then true
    -- un-cancelling
    when old.status = 'cancelled' and new.status <> 'cancelled' then true
    -- restoring a live package from Trash
    when old.deleted_at is not null and new.deleted_at is null and new.status in ('not_started', 'ongoing') then true
    else false
  end;
  if not v_revives then
    return new;
  end if;

  if exists (
    select 1 from public.activity_stage_progress s
    where s.activity_id = new.activity_id and s.package_id is null and s.parent_id is null
      and s.tracks_packages and s.status in ('completed', 'skipped')
  ) or exists (
    select 1 from public.activities a where a.id = new.activity_id and a.status = 'completed'
  ) then
    raise exception 'Procurement & Implementation is already finished for this activity. Reopen that stage before adding or reopening packages.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.guard_package_after_procurement() from public, anon, authenticated;

create trigger guard_package_after_procurement
  before insert or update of status, deleted_at on public.procurement_packages
  for each row execute function public.guard_package_after_procurement();
