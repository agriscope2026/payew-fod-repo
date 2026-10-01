-- =============================================================================
-- PAYEW · DEV seed · Phase 6 · Comments, notes and directives
-- A short thread with an @mention, notes, an overdue notice, an open directive
-- and an unanswered (escalating) one. Idempotent: skipped if already present.
-- =============================================================================
do $$
declare
  v_today       date := public.today_ph();
  -- people
  superadmin    uuid := '00000000-0000-4000-8000-000000000001';
  amia_admin    uuid := '00000000-0000-4000-8000-000000000101';
  amia_staff1   uuid := '00000000-0000-4000-8000-000000000102';
  amia_staff2   uuid := '00000000-0000-4000-8000-000000000103';
  hvc_admin     uuid := '00000000-0000-4000-8000-000000000301';
  -- records
  amia          uuid := '10000000-0000-4000-8000-000000000001';
  hvc           uuid := '10000000-0000-4000-8000-000000000003';
  seeds_act     uuid := '50000000-0000-4000-8000-000000000103'; -- Drought-tolerant rice seeds (overdue)
  hvc_act       uuid := '50000000-0000-4000-8000-000000000301';
  d1            uuid := '61000000-0000-4000-8000-000000000001';
  d2            uuid := '61000000-0000-4000-8000-000000000002';
  d3            uuid := '61000000-0000-4000-8000-000000000003';
begin
  if exists (select 1 from public.comments where id = '60000000-0000-4000-8000-000000000001') then
    raise notice 'Collaboration data already seeded; skipping.';
    return;
  end if;
  if not exists (select 1 from public.activities where id = seeds_act) then
    raise notice 'Activities seed missing; skipping collaboration seed.';
    return;
  end if;

  -- Comments (author set explicitly: seeds run without a signed-in user)
  insert into public.comments (id, entity_type, entity_id, body, mentions, author_id, created_at) values
    ('60000000-0000-4000-8000-000000000001', 'activity', seeds_act,
     'The seeds are at the Bontoc warehouse. @Liza Ayangwa please coordinate the hauling schedule with the MAO.',
     array[amia_staff1], amia_admin, now() - interval '3 days'),
    ('60000000-0000-4000-8000-000000000003', 'activity', seeds_act,
     'IAR is still unsigned — the inspection committee chair is on leave until next week.',
     '{}', amia_staff2, now() - interval '1 day');
  insert into public.comments (id, entity_type, entity_id, parent_id, body, author_id, created_at) values
    ('60000000-0000-4000-8000-000000000002', 'activity', seeds_act, '60000000-0000-4000-8000-000000000001',
     'Noted, Sir. Truck is booked for Thursday; I will upload the delivery receipts after.',
     amia_staff1, now() - interval '2 days');

  -- Notes
  insert into public.notes (entity_type, entity_id, visibility, body, is_pinned, author_id) values
    ('activity', seeds_act, 'program',
     'MAO Bontoc contact: Engr. Fagsao, 0917 000 0000. Warehouse opens 8 AM–4 PM weekdays.', true, amia_admin),
    ('activity', seeds_act, 'private',
     'Ask supply office if the extra 40 bags can be charged to savings.', false, amia_staff1);

  -- Overdue notice (open, response due in 3 days)
  insert into public.directives
    (id, program_id, kind, title, body, priority, entity_type, entity_id, response_due, issued_by, issued_at)
  values
    (d1, amia, 'overdue_notice', 'Overdue activity: Distribution of Drought-Tolerant Rice Seeds',
     'Activity Distribution of Drought-Tolerant Rice Seeds is past its due date. Please provide a status update and revised target date.',
     'high', 'activity', seeds_act, v_today + 3, amia_admin, now() - interval '1 day'),
    (d2, amia, 'directive', 'Submit Q3 physical and financial accomplishment report',
     'Please submit your Q3 accomplishment report using the FOD template, with photos and signed attendance sheets.',
     'normal', null, null, v_today + 5, amia_admin, now() - interval '2 days'),
    (d3, hvc, 'directive', 'Validate coffee beneficiary masterlist',
     'Cross-check the coffee beneficiary masterlist against the RSBSA before the distribution schedule is finalized.',
     'urgent', 'activity', hvc_act, v_today - 2, superadmin, now() - interval '6 days');

  insert into public.directive_recipients (directive_id, user_id, program_id, status, acknowledged_at, responded_at, response, proposed_date) values
    (d1, amia_staff1, amia, 'acknowledged', now() - interval '20 hours', null, null, null),
    (d2, amia_staff1, amia, 'responded', now() - interval '1 day', now() - interval '1 day',
     'Submitted to the FOD planning unit this morning; hard copy follows.', null),
    (d2, amia_staff2, amia, 'pending', null, null, null, null),
    (d3, hvc_admin, hvc, 'pending', null, null, null, null);

  insert into public.comments (entity_type, entity_id, body, author_id, created_at) values
    ('directive', d1, 'Hauling is set for Thursday; distribution can finish by the 25th.', amia_staff1, now() - interval '18 hours');

  -- Inbox entries the RPCs would have sent
  perform public.deliver(amia_staff1, 'directive', 'Overdue notice from Jerome Palangdan: Overdue activity: Distribution of Drought-Tolerant Rice Seeds',
                         'Please provide a status update and revised target date.', '/directives/' || d1, amia, 'directive', d1);
  perform public.deliver(amia_staff2, 'directive', 'Directive from Jerome Palangdan: Submit Q3 physical and financial accomplishment report',
                         null, '/directives/' || d2, amia, 'directive', d2);
  perform public.deliver(hvc_admin, 'directive', 'Directive from Elena Bagangan: Validate coffee beneficiary masterlist',
                         null, '/directives/' || d3, hvc, 'directive', d3);
end;
$$;
