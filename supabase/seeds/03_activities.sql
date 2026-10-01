-- =============================================================================
-- PAYEW · DEV seed · Phase 5 · Activities (8 per program, varied stages)
-- Includes overdue, completed (FY 2025 and 2026) and cancelled activities, with
-- workflow progress, checklist ticks and linked beneficiaries.
-- Idempotent: skipped entirely if the first seeded activity already exists.
-- =============================================================================
do $$
declare
  r record;
  s record;
  v_today date := public.today_ph();
  v_delay integer;
  v_end date;
  v_next uuid;
begin
  if exists (select 1 from public.activities where id = '50000000-0000-4000-8000-000000000101') then
    raise notice 'Activities already seeded; skipping.';
    return;
  end if;

  create temporary table _seed_activities (
    id uuid, program text, fy integer, title text, category text, province text, municipality text,
    start_date date, due_date date, budget numeric, unit text, qty numeric, done integer,
    cancelled boolean, responsible text
  ) on commit drop;

  insert into _seed_activities values
    -- AMIA
    ('50000000-0000-4000-8000-000000000101', 'AMIA', 2026, 'Climate-Resilient Agri-Fishery Technology Training', 'Training / Capacity Building', 'Benguet', 'Mankayan', '2026-02-10', '2026-05-30', 450000, 'participant', 45, 9, false, 'amia.staff1'),
    ('50000000-0000-4000-8000-000000000102', 'AMIA', 2026, 'Establishment of AMIA Village Seed Bank', 'Infrastructure / Facilities', 'Apayao', 'Flora', '2026-03-01', '2026-07-31', 1200000, 'lot', 1, 4, false, 'amia.admin'),
    ('50000000-0000-4000-8000-000000000103', 'AMIA', 2026, 'Distribution of Drought-Tolerant Rice Seeds', 'Distribution of Inputs', 'Mountain Province', 'Bontoc', '2026-04-15', '2026-08-15', 860000, 'bag', 400, 6, false, 'amia.staff1'),
    ('50000000-0000-4000-8000-000000000104', 'AMIA', 2026, 'Climate Information Services Rollout', 'Technical Assistance', 'Baguio City', 'Baguio City', '2026-01-20', '2026-04-30', 300000, 'participant', 120, 11, false, 'amia.admin'),
    ('50000000-0000-4000-8000-000000000105', 'AMIA', 2026, 'Small Farm Reservoir Construction', 'Infrastructure / Facilities', 'Benguet', 'Atok', '2026-05-05', '2026-09-15', 2500000, 'unit', 3, 3, false, 'amia.admin'),
    ('50000000-0000-4000-8000-000000000106', 'AMIA', 2026, 'Farmer Field School on Organic Vegetable Production', 'Training / Capacity Building', 'Benguet', 'Mankayan', '2026-08-01', '2026-11-30', 380000, 'participant', 30, 2, false, 'amia.staff2'),
    ('50000000-0000-4000-8000-000000000107', 'AMIA', 2026, 'AMIA Village Monitoring and Evaluation', 'Monitoring and Evaluation', 'Apayao', 'Flora', '2026-09-15', '2026-12-15', 150000, 'lot', 1, 0, false, 'amia.staff1'),
    ('50000000-0000-4000-8000-000000000108', 'AMIA', 2025, 'Climate Vulnerability Assessment Workshop', 'Planning and Meetings', 'Baguio City', 'Baguio City', '2025-06-01', '2025-09-30', 220000, 'participant', 60, 11, false, 'amia.admin'),
    -- APA
    ('50000000-0000-4000-8000-000000000201', 'APA', 2026, 'Climate-Smart Farm Planning Workshop', 'Planning and Meetings', 'Abra', 'Tayum', '2026-02-01', '2026-04-30', 280000, 'participant', 50, 11, false, 'apa.admin'),
    ('50000000-0000-4000-8000-000000000202', 'APA', 2026, 'Rainwater Harvesting Facilities', 'Infrastructure / Facilities', 'Abra', 'Tayum', '2026-03-10', '2026-08-31', 1800000, 'unit', 12, 5, false, 'apa.admin'),
    ('50000000-0000-4000-8000-000000000203', 'APA', 2026, 'Distribution of Flood-Tolerant Planting Materials', 'Distribution of Inputs', 'Apayao', 'Kabugao', '2026-04-01', '2026-07-15', 640000, 'seedling', 8000, 7, false, 'apa.staff1'),
    ('50000000-0000-4000-8000-000000000204', 'APA', 2026, 'Training on Climate-Resilient Cropping Systems', 'Training / Capacity Building', 'Apayao', 'Kabugao', '2026-06-01', '2026-09-20', 350000, 'participant', 40, 5, false, 'apa.staff1'),
    ('50000000-0000-4000-8000-000000000205', 'APA', 2026, 'Agrometeorological Station Installation', 'Machinery and Equipment', 'Abra', 'Bangued', '2026-07-01', '2026-11-30', 2100000, 'unit', 2, 3, false, 'apa.admin'),
    ('50000000-0000-4000-8000-000000000206', 'APA', 2026, 'Community Seed Exchange Program', 'Distribution of Inputs', 'Abra', 'Dolores', '2026-08-15', '2026-12-15', 260000, 'bag', 150, 1, false, 'apa.staff2'),
    ('50000000-0000-4000-8000-000000000207', 'APA', 2026, 'Soil Conservation Demo Farm', 'Techno-Demo / Research', 'Abra', 'Tayum', '2026-05-01', '2026-10-31', 500000, 'hectare', 2, 2, true, 'apa.admin'),
    ('50000000-0000-4000-8000-000000000208', 'APA', 2025, 'Climate Field School Graduation and Evaluation', 'Monitoring and Evaluation', 'Apayao', 'Kabugao', '2025-08-01', '2025-11-30', 180000, 'participant', 35, 11, false, 'apa.admin'),
    -- HVC
    ('50000000-0000-4000-8000-000000000301', 'HVC', 2026, 'Distribution of Arabica Coffee Seedlings', 'Distribution of Inputs', 'Benguet', 'Kabayan', '2026-02-15', '2026-06-30', 950000, 'seedling', 25000, 8, false, 'hvc.staff1'),
    ('50000000-0000-4000-8000-000000000302', 'HVC', 2026, 'Coffee Post-Harvest Processing Equipment', 'Machinery and Equipment', 'Mountain Province', 'Sagada', '2026-03-01', '2026-08-31', 3200000, 'set', 4, 4, false, 'hvc.admin'),
    ('50000000-0000-4000-8000-000000000303', 'HVC', 2026, 'Highland Vegetable Greenhouse Establishment', 'Infrastructure / Facilities', 'Benguet', 'Buguias', '2026-04-01', '2026-09-30', 2800000, 'unit', 6, 5, false, 'hvc.admin'),
    ('50000000-0000-4000-8000-000000000304', 'HVC', 2026, 'Cacao Clonal Nursery Establishment', 'Infrastructure / Facilities', 'Abra', 'Dolores', '2026-05-10', '2026-10-31', 1100000, 'lot', 1, 4, false, 'hvc.staff2'),
    ('50000000-0000-4000-8000-000000000305', 'HVC', 2026, 'Strawberry Production Technology Training', 'Training / Capacity Building', 'Benguet', 'La Trinidad', '2026-01-15', '2026-03-31', 320000, 'participant', 40, 11, false, 'hvc.staff1'),
    ('50000000-0000-4000-8000-000000000306', 'HVC', 2026, 'HVC Trade Fair and Market Matching', 'Market Linkage', 'Baguio City', 'Baguio City', '2026-09-01', '2026-11-15', 600000, 'lot', 1, 2, false, 'hvc.admin'),
    ('50000000-0000-4000-8000-000000000307', 'HVC', 2026, 'Lowland Vegetable Seeds Distribution', 'Distribution of Inputs', 'Abra', 'Bangued', '2026-06-01', '2026-08-30', 420000, 'pack', 3000, 6, false, 'hvc.staff1'),
    ('50000000-0000-4000-8000-000000000308', 'HVC', 2025, 'Coffee Quality Cupping Training', 'Training / Capacity Building', 'Kalinga', 'Lubuagan', '2025-05-01', '2025-08-31', 250000, 'participant', 30, 11, false, 'hvc.staff2'),
    -- RICE
    ('50000000-0000-4000-8000-000000000401', 'RICE', 2026, 'Distribution of Certified Inbred Rice Seeds', 'Distribution of Inputs', 'Kalinga', 'Tabuk City', '2026-01-10', '2026-04-15', 1500000, 'bag', 1200, 11, false, 'rice.staff1'),
    ('50000000-0000-4000-8000-000000000402', 'RICE', 2026, 'Heirloom Rice Terraces Rehabilitation', 'Infrastructure / Facilities', 'Ifugao', 'Banaue', '2026-02-20', '2026-08-31', 2200000, 'hectare', 15, 5, false, 'rice.admin'),
    ('50000000-0000-4000-8000-000000000403', 'RICE', 2026, 'PalayCheck Farmer Field School', 'Training / Capacity Building', 'Ifugao', 'Kiangan', '2026-03-15', '2026-07-31', 400000, 'participant', 35, 7, false, 'rice.staff1'),
    ('50000000-0000-4000-8000-000000000404', 'RICE', 2026, 'Hand Tractor and Rice Thresher Distribution', 'Machinery and Equipment', 'Kalinga', 'Tabuk City', '2026-04-01', '2026-09-15', 4500000, 'unit', 20, 4, false, 'rice.admin'),
    ('50000000-0000-4000-8000-000000000405', 'RICE', 2026, 'Heirloom Rice Market Linkage Forum', 'Market Linkage', 'Ifugao', 'Kiangan', '2026-08-20', '2026-10-30', 300000, 'participant', 80, 2, false, 'rice.staff2'),
    ('50000000-0000-4000-8000-000000000406', 'RICE', 2026, 'Fertilizer Discount Voucher Distribution', 'Distribution of Inputs', 'Ifugao', 'Hungduan', '2026-06-10', '2026-11-30', 900000, 'bag', 600, 3, false, 'rice.admin'),
    ('50000000-0000-4000-8000-000000000407', 'RICE', 2026, 'Rice Techno-Demo on Hybrid Varieties', 'Techno-Demo / Research', 'Kalinga', 'Tabuk City', '2026-07-01', '2026-12-15', 450000, 'hectare', 3, 1, false, 'rice.staff1'),
    ('50000000-0000-4000-8000-000000000408', 'RICE', 2025, 'Rice Program Year-End Assessment', 'Monitoring and Evaluation', 'Kalinga', 'Tabuk City', '2025-10-01', '2025-12-15', 200000, 'participant', 70, 11, false, 'rice.admin'),
    -- CORN
    ('50000000-0000-4000-8000-000000000501', 'CORN', 2026, 'Yellow Corn Hybrid Seeds Distribution', 'Distribution of Inputs', 'Kalinga', 'Pinukpuk', '2026-02-01', '2026-05-31', 1300000, 'bag', 900, 11, false, 'corn.staff1'),
    ('50000000-0000-4000-8000-000000000502', 'CORN', 2026, 'Corn Shellers and Dryers Distribution', 'Machinery and Equipment', 'Apayao', 'Luna', '2026-03-15', '2026-08-31', 3600000, 'unit', 10, 4, false, 'corn.admin'),
    ('50000000-0000-4000-8000-000000000503', 'CORN', 2026, 'Integrated Pest Management Training for Corn', 'Training / Capacity Building', 'Ifugao', 'Lagawe', '2026-04-10', '2026-07-31', 330000, 'participant', 40, 6, false, 'corn.staff1'),
    ('50000000-0000-4000-8000-000000000504', 'CORN', 2026, 'Corn Farm-to-Market Linkage', 'Market Linkage', 'Apayao', 'Luna', '2026-06-01', '2026-09-25', 480000, 'lot', 1, 5, false, 'corn.admin'),
    ('50000000-0000-4000-8000-000000000505', 'CORN', 2026, 'White Corn Techno-Demo', 'Techno-Demo / Research', 'Ifugao', 'Lagawe', '2026-07-15', '2026-12-15', 400000, 'hectare', 2, 2, false, 'corn.staff2'),
    ('50000000-0000-4000-8000-000000000506', 'CORN', 2026, 'Soil Analysis and Fertilizer Recommendation', 'Technical Assistance', 'Kalinga', 'Pinukpuk', '2026-08-01', '2026-11-30', 180000, 'lot', 1, 1, false, 'corn.staff1'),
    ('50000000-0000-4000-8000-000000000507', 'CORN', 2026, 'Corn Silage Production Training', 'Training / Capacity Building', 'Apayao', 'Luna', '2026-05-01', '2026-08-31', 260000, 'participant', 30, 1, true, 'corn.admin'),
    ('50000000-0000-4000-8000-000000000508', 'CORN', 2025, 'Corn Program Planning Workshop', 'Planning and Meetings', 'Kalinga', 'Pinukpuk', '2025-02-01', '2025-04-30', 150000, 'participant', 45, 11, false, 'corn.admin');

  -- Insert (triggers assign codes and instantiate the default workflow).
  insert into public.activities (
    id, program_id, fiscal_year_id, title, description, objectives, target_output, target_quantity, unit_id,
    category_id, province_id, municipality_id, start_date, end_date, due_date, budget_amount, fund_source_id,
    responsible_user_id, responsible_unit
  )
  select a.id, pr.id, fy.id, a.title,
         'Implementation of "' || a.title || '" under the ' || pr.name || '.',
         'Improve farm productivity and climate resilience of target beneficiaries.',
         a.qty || ' ' || a.unit || '(s) delivered / served',
         a.qty, u.id, c.id, pv.id, mu.id,
         a.start_date, a.due_date - 7, a.due_date, a.budget,
         (select id from public.fund_sources where code = 'GAA'),
         p.id, 'Field Operations Division'
  from _seed_activities a
  join public.programs pr on pr.code = a.program
  join public.fiscal_years fy on fy.year = a.fy
  join public.provinces pv on pv.name = a.province
  left join public.municipalities mu on mu.name = a.municipality and mu.province_id = pv.id
  left join public.activity_categories c on c.name = a.category and c.program_id is null
  left join public.units u on u.name = a.unit
  left join public.profiles p on p.email = a.responsible || '@payew.local';

  -- Workflow progress: finish the first N main stages (with small, varying delays).
  for r in select * from _seed_activities loop
    v_delay := 0;
    for s in
      select id, sort_order, planned_start, planned_end from public.activity_stage_progress
      where activity_id = r.id and parent_id is null order by sort_order
    loop
      exit when s.sort_order > r.done;
      v_delay := v_delay + (s.sort_order % 3);
      v_end := least(s.planned_end + v_delay, v_today);
      update public.activity_stage_progress
      set status = 'completed', actual_start = least(s.planned_start + v_delay, v_end), actual_end = v_end,
          completed_at = v_end::timestamptz
      where id = s.id or parent_id = s.id;
      update public.activity_tasks set is_done = true, done_at = v_end::timestamptz
      where stage_progress_id = s.id or stage_progress_id in (select id from public.activity_stage_progress where parent_id = s.id);
    end loop;

    select id into v_next from public.activity_stage_progress
    where activity_id = r.id and parent_id is null and status = 'pending' order by sort_order limit 1;
    if v_next is not null and r.done > 0 then
      update public.activity_stage_progress set status = 'in_progress', actual_start = least(planned_start + v_delay, v_today)
      where id = v_next;
    end if;

    update public.activities
    set current_stage_id = v_next,
        status = case when r.cancelled then 'cancelled'
                      when v_next is null then 'completed'
                      when r.done > 0 then 'ongoing' else 'not_started' end,
        completed_at = case when v_next is null then v_today::timestamptz end,
        cancelled_reason = case when r.cancelled then 'Funds realigned to typhoon rehabilitation per FOD memo.' end
    where id = r.id;

    insert into public.activity_stage_transitions (activity_id, program_id, stage_id, stage_name, action, from_status, to_status, effective_date, created_at)
    select r.id, sp.program_id, sp.id, sp.name, 'complete', 'in_progress', 'completed', sp.actual_end, sp.actual_end::timestamptz
    from public.activity_stage_progress sp
    where sp.activity_id = r.id and sp.parent_id is null and sp.status = 'completed';
  end loop;

  -- Link 1–2 beneficiaries registered by the same program.
  insert into public.activity_beneficiaries (activity_id, beneficiary_id, program_id, participants, quantity, amount)
  select a.id, b.id, a.program_id,
         least(b.members_total, 25 + (b.rn * 7) % 20),
         round(a.target_quantity / 2),
         round(a.budget_amount * 0.3, 2)
  from public.activities a
  join lateral (
    select x.id, x.members_total, row_number() over (order by x.name) as rn
    from public.beneficiaries x
    where x.registered_by_program_id = a.program_id and x.deleted_at is null
    order by md5(a.id::text || x.id::text)
    limit 2
  ) b on true
  where a.id in (select id from _seed_activities)
  on conflict do nothing;
end;
$$;
