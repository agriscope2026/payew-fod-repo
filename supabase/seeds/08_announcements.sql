-- =============================================================================
-- PAYEW · DEV seed · Phase 11 · Announcements
-- * a pinned FOD-wide memo, an urgent program memo, a scheduled and an expired one
-- * a few read receipts so "Read by" and the unread badge have data
-- Idempotent: skipped if any announcement exists.
-- =============================================================================
do $$
declare
  v_super  uuid := '00000000-0000-4000-8000-000000000001';
  v_amia   uuid := '00000000-0000-4000-8000-000000000101';
  v_memo   uuid;
begin
  if exists (select 1 from public.announcements) then
    raise notice 'Announcements already seeded; skipping.';
    return;
  end if;
  if not exists (select 1 from public.profiles where id = v_super) then
    raise notice 'Seed users missing; skipping announcements seed.';
    return;
  end if;

  insert into public.announcements (program_id, title, body, priority, pinned, publish_at, created_by)
  values (null, 'Submission of Q3 physical and financial accomplishment reports',
          'All programs: submit your Q3 accomplishment reports to the FOD by October 10.' || chr(10) ||
          'Use Reports → Physical & Financial Accomplishment and export it to Excel. Make sure every ongoing '
          || 'activity has a progress update dated September.',
          'important', true, now() - interval '2 days', v_super)
  returning id into v_memo;
  insert into public.announcement_reads (announcement_id, user_id)
  select v_memo, p.id from public.profiles p
  where p.id in (v_amia, '00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000301');

  insert into public.announcements (program_id, title, body, priority, publish_at, created_by)
  select g.id, 'AMIA field validation visits next week',
         'Field staff: coordinate with the provincial focal persons before the validation visits. '
         || 'Bring the signed attendance sheets and IARs of delivered packages.',
         'urgent', now() - interval '1 day', v_amia
  from public.programs g where g.code = 'AMIA';

  insert into public.announcements (program_id, title, body, publish_at, created_by)
  values (null, 'FY 2026 year-end closing schedule',
          'The schedule for obligating remaining allotments and closing FY 2026 will be posted here.',
          now() + interval '7 days', v_super);

  insert into public.announcements (program_id, title, body, publish_at, expires_at, created_by)
  values (null, 'System maintenance on Saturday',
          'PAYEW was unavailable on Saturday from 8:00 to 10:00 AM for maintenance.',
          now() - interval '40 days', now() - interval '30 days', v_super);
end;
$$;
