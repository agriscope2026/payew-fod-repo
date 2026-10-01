-- =============================================================================
-- PAYEW · DEV seed · Phase 8 · Progress updates, issues & risks, approvals
-- Idempotent: skipped if any progress update exists.
-- =============================================================================
do $$
declare
  v_today date := public.today_ph();
  a       record;
  k       record;
  v_i     integer := 0;
  v_staff uuid;
  v_admin uuid;
  v_pct   numeric;
begin
  if exists (select 1 from public.progress_updates) then
    raise notice 'Monitoring data already seeded; skipping.';
    return;
  end if;
  if not exists (select 1 from public.activities where id = '50000000-0000-4000-8000-000000000101') then
    raise notice 'Activities seed missing; skipping monitoring seed.';
    return;
  end if;

  -- ---------------------------------------------------------------------------
  -- Progress updates: monthly for ongoing FY 2026 activities (the latest few
  -- deliberately stale so the "progress update due" reminder has examples)
  -- ---------------------------------------------------------------------------
  for a in
    select x.*, row_number() over (order by x.code) as rn,
           (select count(*) from public.activity_stage_progress s
            where s.activity_id = x.id and s.package_id is null and s.parent_id is null and s.status = 'completed') as done,
           (select count(*) from public.activity_stage_progress s
            where s.activity_id = x.id and s.package_id is null and s.parent_id is null) as total
    from public.activities x
    join public.fiscal_years fy on fy.id = x.fiscal_year_id and fy.year = 2026
    where x.status = 'ongoing' and x.deleted_at is null and x.start_date < v_today
  loop
    v_pct := round(least(95, greatest(5, a.done::numeric / greatest(a.total, 1) * 100 + (a.rn % 3) * 5)), 0);
    insert into public.progress_updates (activity_id, program_id, fiscal_year_id, as_of_date, physical_pct,
      quantity_accomplished, participants_male, participants_female, status_flag, narrative, next_steps, created_by, created_at)
    select a.id, a.program_id, a.fiscal_year_id, d.as_of, round(v_pct * d.f, 0),
           round(coalesce(a.target_quantity, 0) * v_pct * d.f / 100, 0),
           case when a.target_quantity is not null then (10 + a.rn % 7) end,
           case when a.target_quantity is not null then (12 + a.rn % 5) end,
           case when a.due_date < v_today then 'delayed' when a.rn % 4 = 0 then 'at_risk' else 'on_track' end,
           d.narrative, d.next_steps, a.responsible_user_id, d.as_of::timestamptz
    from (values
      (least(a.start_date + 30, v_today - 70), 0.4, 'Coordination meeting with the LGU and beneficiaries done; specifications finalized.', 'Submit PR and start canvass.'),
      (least(a.start_date + 60, v_today - 40), 0.7, 'Procurement under way; first deliveries scheduled. Beneficiary list validated.', 'Inspection of first delivery; schedule distribution.'),
      (case when a.rn % 5 = 0 then v_today - 45 else v_today - (a.rn % 20)::integer end, 1.0,
       'Field implementation ongoing per schedule. See packages for supplier status.', 'Complete remaining deliveries and liquidation.')
    ) as d(as_of, f, narrative, next_steps)
    where d.as_of >= a.start_date;
  end loop;

  -- ---------------------------------------------------------------------------
  -- Issues & risks
  -- ---------------------------------------------------------------------------
  for a in
    select x.*, row_number() over (partition by x.program_id order by x.code) as rn
    from public.activities x
    join public.fiscal_years fy on fy.id = x.fiscal_year_id and fy.year = 2026
    where x.status = 'ongoing' and x.deleted_at is null
  loop
    exit when a.rn > 3;
    v_i := v_i + 1;
    select m.user_id into v_admin from public.program_memberships m
    join public.profiles p on p.id = m.user_id and p.role = 'program_admin' where m.program_id = a.program_id limit 1;
    insert into public.issues (activity_id, program_id, fiscal_year_id, kind, title, description, category, severity,
      likelihood, status, owner_id, due_date, mitigation, resolution, resolved_at, raised_by, created_at)
    select a.id, a.program_id, a.fiscal_year_id, i.kind, i.title, i.descr, i.cat, i.sev, i.lik, i.status,
           coalesce(a.responsible_user_id, v_admin), i.due, i.mit, i.res,
           case when i.status in ('resolved', 'closed') then now() - interval '3 days' end,
           coalesce(a.responsible_user_id, v_admin), now() - (i.age || ' days')::interval
    from (values
      ('issue', 'Supplier delivery delayed by road closure', 'Landslide along the national road delayed the truck by a week.',
       'logistics', case when a.rn = 1 and v_i % 2 = 1 then 'critical' else 'high' end, null::text,
       case when a.rn = 1 then 'open' else 'mitigating' end, v_today - 5, 'Coordinate alternate route via Atok; inform beneficiaries.',
       null::text, 20),
      ('risk', 'Typhoon season may affect field activities', 'PAGASA outlook shows 2–3 typhoons in the coming months.',
       'weather', 'medium', 'high', 'open', v_today + 30, 'Front-load distribution; prepare contingency schedule.', null, 15),
      ('issue', 'Incomplete beneficiary documents', 'Some FAs lack updated registration certificates.',
       'beneficiaries', 'low', null, 'resolved', v_today - 10, 'Assist FAs in securing certificates from DOLE.',
       'Certificates submitted by all FAs.', 40)
    ) as i(kind, title, descr, cat, sev, lik, status, due, mit, res, age)
    where i.title <> 'Typhoon season may affect field activities' or a.rn = 2;
  end loop;

  -- ---------------------------------------------------------------------------
  -- Approval requests (records only; pending ones are left for reviewers)
  -- ---------------------------------------------------------------------------
  for a in
    select x.*, row_number() over (partition by x.program_id order by x.code) as rn
    from public.activities x
    join public.fiscal_years fy on fy.id = x.fiscal_year_id and fy.year = 2026
    where x.status = 'ongoing' and x.deleted_at is null and x.due_date is not null
  loop
    continue when a.rn > 2;
    select p.id into v_staff from public.profiles p
    join public.program_memberships m on m.user_id = p.id and m.program_id = a.program_id
    where p.role = 'program_staff' order by p.email limit 1;
    select m.user_id into v_admin from public.program_memberships m
    join public.profiles p on p.id = m.user_id and p.role = 'program_admin' where m.program_id = a.program_id limit 1;

    if a.rn = 1 then
      insert into public.approval_requests (program_id, fiscal_year_id, request_type, entity_type, entity_id, activity_id,
        title, justification, payload, requested_by, requested_at)
      values (a.program_id, a.fiscal_year_id, 'extension', 'activity', a.id, a.id,
        'Extend ' || a.code || ' to ' || to_char(a.due_date + 45, 'FMMon FMDD, YYYY'),
        'Deliveries were delayed by the road closure; beneficiaries asked to move the distribution after harvest.',
        jsonb_build_object('new_due_date', a.due_date + 45), v_staff, now() - interval '4 days');
    else
      insert into public.approval_requests (program_id, fiscal_year_id, request_type, entity_type, entity_id, activity_id,
        title, justification, payload, status, requested_by, requested_at, decided_by, decided_at, decision_note)
      values (a.program_id, a.fiscal_year_id, 'extension', 'activity', a.id, a.id,
        'Extend ' || a.code || ' to ' || to_char(a.due_date + 90, 'FMMon FMDD, YYYY'),
        'More time needed for the training batches.', jsonb_build_object('new_due_date', a.due_date + 90),
        'rejected', v_staff, now() - interval '20 days', v_admin, now() - interval '18 days',
        'Please split the batches instead; 90 days pushes the activity into next year.');
    end if;
  end loop;

  -- Package requests: a pending re-award and a pending contract variation (one each per program)
  for k in
    select p.*, row_number() over (partition by p.program_id order by p.code) as rn,
           (select s.id from public.suppliers s
            where s.status = 'active' and s.id <> p.supplier_id and s.categories && array[(select code from public.procurement_categories where id = p.category_id)]
            order by s.business_name limit 1) as alt_supplier
    from public.procurement_packages p
    where p.status = 'ongoing' and p.supplier_id is not null and p.deleted_at is null
  loop
    continue when k.rn > 2;
    select pr.id into v_staff from public.profiles pr
    join public.program_memberships m on m.user_id = pr.id and m.program_id = k.program_id
    where pr.role = 'program_staff' order by pr.email limit 1;
    if k.rn = 1 and k.alt_supplier is not null then
      insert into public.approval_requests (program_id, fiscal_year_id, request_type, entity_type, entity_id, activity_id,
        package_id, title, justification, payload, requested_by, requested_at)
      values (k.program_id, k.fiscal_year_id, 'supplier_reaward', 'package', k.id, k.activity_id, k.id,
        'Re-award ' || k.code || ' to ' || (select business_name from public.suppliers where id = k.alt_supplier),
        'Current supplier failed to deliver within 15 days of the PO despite two follow-ups.',
        jsonb_build_object('supplier_id', k.alt_supplier, 'contract_amount', round(k.contract_amount * 1.03, -2)),
        v_staff, now() - interval '2 days');
    elsif k.rn = 2 then
      insert into public.approval_requests (program_id, fiscal_year_id, request_type, entity_type, entity_id, activity_id,
        package_id, title, justification, payload, requested_by, requested_at)
      values (k.program_id, k.fiscal_year_id, 'contract_variation', 'package', k.id, k.activity_id, k.id,
        'Change ' || k.code || ' contract from ' || public.peso(k.contract_amount) || ' to ' || public.peso(round(k.contract_amount * 1.08, -2)),
        'Additional 10 participants approved per memo; same unit prices.',
        jsonb_build_object('contract_amount', round(k.contract_amount * 1.08, -2)),
        v_staff, now() - interval '1 day');
    end if;
  end loop;

  -- The cancelled package from the packages seed came from an approved request.
  insert into public.approval_requests (program_id, fiscal_year_id, request_type, entity_type, entity_id, activity_id,
    package_id, title, justification, status, requested_by, requested_at, decided_by, decided_at, decision_note)
  select p.program_id, p.fiscal_year_id, 'cancellation', 'package', p.id, p.activity_id, p.id,
         'Cancel package ' || p.code, p.cancelled_reason, 'approved',
         (select pr.id from public.profiles pr join public.program_memberships m on m.user_id = pr.id and m.program_id = p.program_id
          where pr.role = 'program_staff' order by pr.email limit 1),
         now() - interval '7 days',
         (select m.user_id from public.program_memberships m join public.profiles pr on pr.id = m.user_id and pr.role = 'program_admin'
          where m.program_id = p.program_id limit 1),
         now() - interval '5 days', 'Approved; LGU counterpart confirmed in writing.'
  from public.procurement_packages p
  where p.status = 'cancelled' and p.cancelled_reason like 'Venue and meals provided%';
end;
$$;
