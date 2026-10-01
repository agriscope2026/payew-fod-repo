-- =============================================================================
-- PAYEW · DEV seed · Phase 6B · Suppliers and procurement packages (Addendum B)
-- * 25 suppliers (expiring/expired papers, one suspended, one blacklisted)
-- * open FY 2026 activities move to the two-level Default FOD Workflow
--   (finished Design/Approval/PPMP stages carry over by name)
-- * 2–5 packages per moved activity, covering: a closed package while others are
--   still in procurement, obligation before delivery, re-award after a failed
--   supplier, a cancelled package, an overdue package, partial delivery, savings
-- Financial records (ORS, deliveries, DV) for these packages arrive with Phase 7.
-- Idempotent: skipped if the first seeded supplier exists.
-- =============================================================================
do $$
declare
  v_today    date := public.today_ph();
  v_default  uuid := '40000000-0000-4000-8000-000000000002';
  r          record;
  st         record;
  v_k        integer := 0;
  v_n        integer;
  v_j        integer;
  v_cat      text;
  v_cats     text[] := array['MEALS', 'LODGING', 'TRANSPORT', 'SUPPLIES', 'VENUE', 'PRINTING', 'EQUIPMENT', 'SERVICES'];
  v_pkg      uuid;
  v_lvl      integer;
  v_done     integer;
  v_sup      uuid;
  v_sup_old  uuid;
  v_abc      numeric;
  v_contract numeric;
  v_next     uuid;
  v_first    uuid;
  v_end      date;
  v_admin    uuid;
  v_dir      uuid;
begin
  if exists (select 1 from public.suppliers where id = '70000000-0000-4000-8000-000000000001') then
    raise notice 'Suppliers/packages already seeded; skipping.';
    return;
  end if;
  if not exists (select 1 from public.activities where id = '50000000-0000-4000-8000-000000000101') then
    raise notice 'Activities seed missing; skipping packages seed.';
    return;
  end if;

  -- Category defaults (expense classes are seed data, so they are linked here).
  update public.procurement_categories c
  set default_expense_class_id = (select id from public.expense_classes where code = x.cls),
      default_uacs_code_id = (select id from public.uacs_codes where code = x.uacs)
  from (values
    ('LODGING', 'MOOE', '5020201000'), ('MEALS', 'MOOE', '5020201000'), ('VENUE', 'MOOE', '5020201000'),
    ('TRANSPORT', 'MOOE', '5020101000'), ('SUPPLIES', 'MOOE', '5020399000'), ('PRINTING', 'MOOE', '5029999000'),
    ('SERVICES', 'MOOE', '5029999000'), ('OTHER', 'MOOE', '5029999000'), ('EQUIPMENT', 'CO', '1060504000')
  ) as x(code, cls, uacs)
  where c.code = x.code;

  -- ---------------------------------------------------------------------------
  -- Suppliers
  -- ---------------------------------------------------------------------------
  insert into public.suppliers (
    id, business_name, trade_name, owner_name, supplier_type, tin, philgeps_no, philgeps_expiry, permit_no,
    permit_expiry, province_id, municipality_id, address_line, contact_person, contact_no, email, categories,
    status, status_reason
  )
  select ('70000000-0000-4000-8000-0000000000' || lpad(s.n::text, 2, '0'))::uuid,
         s.name, s.trade, s.owner, s.kind, '400-100-' || lpad((100 + s.n)::text, 3, '0') || '-000',
         'PG-' || (20240000 + s.n * 37), v_today + s.pg_days, 'BP-2026-' || lpad(s.n::text, 4, '0'), v_today + s.bp_days,
         pv.id, mu.id, s.street, s.contact, '0917 555 ' || lpad((s.n * 113)::text, 4, '0'),
         lower(regexp_replace(s.name, '[^A-Za-z]+', '', 'g')) || '@example.ph',
         s.cats, s.status, s.reason
  from (values
    (1,  'Pine City Hotel and Function Rooms Inc.', 'Pine City Hotel', 'Ramon Dulay', 'corporation', '{LODGING,VENUE,MEALS}'::text[], 'Baguio City', 'Baguio City', 'Upper Session Rd.', 'Mia Dulay', 300, 200, 'active', null),
    (2,  'Highland Lodge Baguio', null, 'Teresa Ap-ap', 'partnership', '{LODGING,VENUE}', 'Baguio City', 'Baguio City', 'Outlook Drive', 'Teresa Ap-ap', 280, 150, 'active', null),
    (3,  'Mountain Breeze Inn', null, 'Joseph Bangsoy', 'individual', '{LODGING}', 'Benguet', 'La Trinidad', 'Km. 5, Halsema Hwy', 'Joseph Bangsoy', 12, 120, 'active', null),
    (4,  'Ganza Catering Services', 'Ganza Catering', 'Lorna Ganza', 'individual', '{MEALS}', 'Baguio City', 'Baguio City', 'Burnham Park Area', 'Lorna Ganza', 240, 180, 'active', null),
    (5,  'Mama Ayong''s Kitchen', null, 'Ayong Kiwang', 'individual', '{MEALS}', 'Benguet', 'Kabayan', 'Poblacion', 'Ayong Kiwang', 210, 160, 'active', null),
    (6,  'Bontoc Native Delicacies and Catering', null, 'Felisa Chagsan', 'individual', '{MEALS}', 'Mountain Province', 'Bontoc', 'Poblacion', 'Felisa Chagsan', 190, 140, 'active', null),
    (7,  'Cordillera Transport Cooperative', 'CORTRANSCO', 'Board of Directors', 'cooperative', '{TRANSPORT}', 'Benguet', 'La Trinidad', 'Km. 6, Betag', 'Arnel Pacio', 330, 210, 'active', null),
    (8,  'Abra Valley Van Rentals', null, 'Carlito Bersamin', 'individual', '{TRANSPORT}', 'Abra', 'Bangued', 'Zone 4', 'Carlito Bersamin', 150, -20, 'active', null),
    (9,  'Kalinga Riders Transport Services', null, 'Peter Dalupang', 'individual', '{TRANSPORT}', 'Kalinga', 'Tabuk City', 'Bulanao', 'Peter Dalupang', 260, 170, 'active', null),
    (10, 'Benguet Agri Supply Center Corp.', 'BASC', 'Henry Tumapang', 'corporation', '{SUPPLIES,EQUIPMENT}', 'Benguet', 'La Trinidad', 'Km. 4, Pico', 'Grace Tumapang', 300, 220, 'active', null),
    (11, 'Tabuk Farm Inputs Trading', null, 'Rosa Bawer', 'individual', '{SUPPLIES}', 'Kalinga', 'Tabuk City', 'Dagupan Centro', 'Rosa Bawer', 200, 130, 'active', null),
    (12, 'Apayao Agri-Vet Supply', null, 'Danilo Agustin', 'individual', '{SUPPLIES}', 'Apayao', 'Luna', 'San Isidro Sur', 'Danilo Agustin', 170, 150, 'active', null),
    (13, 'Ifugao Seed and Fertilizer Store', null, 'Myrna Dulnuan', 'individual', '{SUPPLIES}', 'Ifugao', 'Lagawe', 'Poblacion East', 'Myrna Dulnuan', 230, 25, 'active', null),
    (14, 'Summit Office Supplies Inc.', 'Summit Office', 'Albert Chua', 'corporation', '{SUPPLIES,PRINTING}', 'Baguio City', 'Baguio City', 'Magsaysay Ave.', 'Albert Chua', 310, 240, 'active', null),
    (15, 'Session Road Printing Press', null, 'Nestor Cosalan', 'individual', '{PRINTING}', 'Baguio City', 'Baguio City', 'Session Rd.', 'Nestor Cosalan', 220, 190, 'active', null),
    (16, 'Lagawe Print and Signage', null, 'Jun Bimmuyag', 'individual', '{PRINTING}', 'Ifugao', 'Lagawe', 'Poblacion', 'Jun Bimmuyag', -40, 100, 'active', null),
    (17, 'Cordi Machinery and Equipment Corp.', 'CordiMach', 'Edwin Laruan', 'corporation', '{EQUIPMENT}', 'Benguet', 'La Trinidad', 'Km. 3, Balili', 'Edwin Laruan', 290, 250, 'active', null),
    (18, 'Northern Luzon Agri-Machinery Inc.', null, 'Victor Saboy', 'corporation', '{EQUIPMENT}', 'Kalinga', 'Tabuk City', 'Bulanao Norte', 'Victor Saboy', 270, 230, 'active', null),
    (19, 'Greenhouse Builders of the North', null, 'Joel Pacya', 'partnership', '{EQUIPMENT,SUPPLIES}', 'Benguet', 'Buguias', 'Abatan', 'Joel Pacya', 260, 200, 'active', null),
    (20, 'Sagada Eco-Venue and Hall', null, 'Lydia Gomgom', 'individual', '{VENUE,LODGING}', 'Mountain Province', 'Sagada', 'Patay', 'Lydia Gomgom', 180, 160, 'active', null),
    (21, 'Banaue Terraces Function Hall', null, 'Mario Puguon', 'individual', '{VENUE,MEALS}', 'Ifugao', 'Banaue', 'Poblacion', 'Mario Puguon', 200, 170, 'active', null),
    (22, 'Agri-Experts Consultancy Services', null, 'Dr. Ana Tayaban', 'partnership', '{SERVICES}', 'Baguio City', 'Baguio City', 'Legarda Rd.', 'Ana Tayaban', 320, 260, 'active', null),
    (23, 'Luna Sound and Events Services', null, 'Rico Bayudang', 'individual', '{SERVICES,VENUE}', 'Apayao', 'Luna', 'Centro', 'Rico Bayudang', 160, 120, 'active', null),
    (24, 'Quick Deliver Trading', null, 'Ben Sotero', 'individual', '{SUPPLIES}', 'Benguet', 'Atok', 'Paoay', 'Ben Sotero', 140, 110, 'suspended', 'Two late deliveries in FY 2025; under review by the BAC.'),
    (25, 'Fly-By-Night Merchandising', null, 'Unknown', 'individual', '{SUPPLIES,EQUIPMENT}', 'Abra', 'Tayum', 'Bagalay', 'n/a', 100, 100, 'blacklisted', 'Blacklisted per BAC Resolution No. 2025-14 (non-delivery).')
  ) as s(n, name, trade, owner, kind, cats, province, municipality, street, contact, pg_days, bp_days, status, reason)
  join public.provinces pv on pv.name = s.province
  left join public.municipalities mu on mu.name = s.municipality and mu.province_id = pv.id;

  insert into public.supplier_documents (supplier_id, doc_type, doc_no, issued_on, expires_on) values
    ('70000000-0000-4000-8000-000000000019', 'tax_clearance', 'TC-2025-8812', v_today - 358, v_today + 7),
    ('70000000-0000-4000-8000-000000000001', 'bir_2303', '2303-001-AA', '2019-02-11', null),
    ('70000000-0000-4000-8000-000000000010', 'omnibus_sworn', 'OSS-2026-10', v_today - 90, v_today + 275);

  insert into public.supplier_bank_accounts (supplier_id, bank_name, branch, account_name, account_no)
  select s.id, b.bank, b.branch, s.business_name, b.acct
  from (values
    ('70000000-0000-4000-8000-000000000001'::uuid, 'Land Bank of the Philippines', 'Baguio Session', '0011-2233-44'),
    ('70000000-0000-4000-8000-000000000004'::uuid, 'Development Bank of the Philippines', 'Baguio', '7788-0011-22'),
    ('70000000-0000-4000-8000-000000000007'::uuid, 'Land Bank of the Philippines', 'La Trinidad', '5566-7788-99'),
    ('70000000-0000-4000-8000-000000000010'::uuid, 'Philippine National Bank', 'La Trinidad', '3344-5566-77')
  ) as b(id, bank, branch, acct)
  join public.suppliers s on s.id = b.id;

  -- ---------------------------------------------------------------------------
  -- Move open FY 2026 activities (not past disbursement) to the two-level workflow
  -- ---------------------------------------------------------------------------
  create temporary table _moved (id uuid, program_id uuid, code text, done integer, budget numeric,
                                 due date, responsible uuid, k integer) on commit drop;

  for r in
    select a.*,
           (select count(*) from public.activity_stage_progress s
            where s.activity_id = a.id and s.package_id is null and s.parent_id is null and s.status = 'completed')::integer as done
    from public.activities a
    join public.fiscal_years fy on fy.id = a.fiscal_year_id and fy.year = 2026
    where a.id::text like '50000000-%' and a.status in ('not_started', 'ongoing') and a.deleted_at is null
      and a.workflow_template_id = '40000000-0000-4000-8000-000000000001'
    order by a.code
  loop
    if r.done > 8 then
      continue;
    end if;
    v_k := v_k + 1;
    perform public.rebuild_track(r.id, null, v_default, false);
    if r.done >= 3 then
      update public.activity_stage_progress
      set status = 'in_progress', actual_start = least(planned_start, v_today)
      where activity_id = r.id and package_id is null and tracks_packages;
    end if;
    select id into v_first from public.activity_stage_progress
    where activity_id = r.id and package_id is null and parent_id is null and status in ('pending', 'in_progress')
    order by sort_order limit 1;
    update public.activities set workflow_template_id = v_default, current_stage_id = v_first where id = r.id;
    perform public.plan_activity_stages(r.id);
    insert into public.activity_stage_transitions (activity_id, program_id, stage_name, action, note, effective_date)
    values (r.id, r.program_id, 'Workflow', 'migrate', 'Switched to workflow: Default FOD Workflow (packages)', v_today);
    insert into _moved values (r.id, r.program_id, r.code, r.done, r.budget_amount, r.due_date, r.responsible_user_id, v_k);
  end loop;

  -- ---------------------------------------------------------------------------
  -- Packages
  -- ---------------------------------------------------------------------------
  for r in select * from _moved order by k loop
    v_n := 2 + (r.k % 4);
    select m.user_id into v_admin from public.program_memberships m
    join public.profiles p on p.id = m.user_id and p.role = 'program_admin'
    where m.program_id = r.program_id limit 1;

    for v_j in 1 .. v_n loop
      v_cat := v_cats[1 + ((r.k + v_j - 2) % array_length(v_cats, 1))];
      v_abc := round(r.budget * 0.8 / v_n * (1 + (v_j % 2) * 0.25), -2);
      v_lvl := case when r.done < 3 then case when v_j = 1 then 1 else 0 end
                    else (array[10, 5, 2, 7, 0])[v_j] end;

      insert into public.procurement_packages (
        activity_id, title, description, category_id, procurement_mode_id, expense_class_id, uacs_code_id,
        abc_amount, obligation_timing, responsible_user_id, due_date, remarks
      )
      select r.id,
             case v_cat
               when 'MEALS' then 'Meals and snacks for participants'
               when 'LODGING' then 'Lodging for participants and resource persons'
               when 'TRANSPORT' then 'Vehicle rental for field transport'
               when 'SUPPLIES' then 'Supplies and materials'
               when 'VENUE' then 'Function hall / venue rental'
               when 'PRINTING' then 'Printing of IEC materials and certificates'
               when 'EQUIPMENT' then 'Equipment and tools'
               else 'Resource person and technical services' end,
             'Package ' || v_j || ' of ' || r.code || ' (' || lower(c.name) || ').',
             c.id,
             (select id from public.procurement_modes where code = case when v_abc > 1000000 then 'BIDDING' else 'SVP' end),
             c.default_expense_class_id, c.default_uacs_code_id, v_abc,
             case when r.k = 1 and v_j = 2 then 'before_delivery' else 'after_delivery' end,
             r.responsible,
             case when r.k = 6 and v_j = 3 then v_today - 12
                  when v_j = 1 then r.due end,
             case when r.k = 1 and v_j = 2 then 'Obligated at award (advance ORS); delivery scheduled.'
                  when r.k = 7 and v_j = 4 then 'Partial delivery 1 of 2 received; balance due next week.' end
      from public.procurement_categories c where c.code = v_cat
      returning id into v_pkg;

      -- Award packages that are past the award stage (5).
      if v_lvl >= 5 then
        select id into v_sup from public.suppliers
        where v_cat = any (categories) and status = 'active'
        order by md5(r.id::text || v_j::text) limit 1;
        v_contract := round(v_abc * (0.86 + v_j * 0.03), -2);
        if r.k = 2 and v_j = 2 then
          -- First supplier failed; re-awarded.
          select id into v_sup_old from public.suppliers
          where v_cat = any (categories) and id <> v_sup and status <> 'blacklisted'
          order by md5(r.id::text) limit 1;
          if v_sup_old is null then
            v_sup_old := '70000000-0000-4000-8000-000000000024';
          end if;
          insert into public.package_supplier_history
            (package_id, activity_id, program_id, supplier_id, action, contract_amount, award_date, created_by, created_at)
          values (v_pkg, r.id, r.program_id, v_sup_old, 'award', v_contract - 2000, v_today - 40, v_admin, now() - interval '40 days');
          insert into public.package_supplier_history
            (package_id, activity_id, program_id, supplier_id, action, contract_amount, award_date, reason, created_by, created_at)
          values (v_pkg, r.id, r.program_id, v_sup, 're_award', v_contract, v_today - 20,
                  'First supplier failed to deliver within the contract period; next lowest calculated responsive quotation.',
                  v_admin, now() - interval '20 days');
        else
          insert into public.package_supplier_history
            (package_id, activity_id, program_id, supplier_id, action, contract_amount, award_date, created_by)
          values (v_pkg, r.id, r.program_id, v_sup, 'award', v_contract, v_today - 30, v_admin);
        end if;
        update public.procurement_packages
        set supplier_id = v_sup, contract_amount = v_contract,
            award_date = case when r.k = 2 and v_j = 2 then v_today - 20 else v_today - 30 end,
            contract_no = 'PO-2026-' || lpad((r.k * 10 + v_j)::text, 4, '0')
        where id = v_pkg;
        if r.k = 2 and v_j = 2 then
          insert into public.supplier_ratings (supplier_id, package_id, program_id, rating, remark, created_by)
          values (v_sup_old, v_pkg, r.program_id, 1, 'Did not deliver within 15 days of the PO; contract terminated.', v_admin);
        end if;
      end if;

      -- Walk the package track: complete the first v_lvl stages.
      v_done := 0;
      for st in
        select id, sort_order, planned_start, planned_end from public.activity_stage_progress
        where package_id = v_pkg and parent_id is null order by sort_order
      loop
        exit when v_done >= v_lvl;
        v_done := v_done + 1;
        v_end := least(st.planned_end, v_today);
        update public.activity_stage_progress
        set status = 'completed', actual_start = least(st.planned_start, v_end), actual_end = v_end,
            completed_at = v_end::timestamptz, completed_by = v_admin
        where id = st.id or parent_id = st.id;
        update public.activity_tasks set is_done = true, done_at = v_end::timestamptz where stage_progress_id = st.id;
        insert into public.activity_stage_transitions
          (activity_id, program_id, package_id, stage_id, stage_name, action, from_status, to_status, effective_date, created_at, created_by)
        select r.id, r.program_id, v_pkg, st.id, s.name, 'complete', 'in_progress', 'completed', v_end, v_end::timestamptz, v_admin
        from public.activity_stage_progress s where s.id = st.id;
      end loop;

      select id into v_next from public.activity_stage_progress
      where package_id = v_pkg and parent_id is null and status = 'pending' order by sort_order limit 1;
      if v_next is not null and v_lvl > 0 then
        update public.activity_stage_progress set status = 'in_progress', actual_start = least(planned_start, v_today)
        where id = v_next;
      end if;
      update public.procurement_packages
      set current_stage_id = v_next,
          status = case when v_next is null then 'closed' when v_lvl > 0 then 'ongoing' else 'not_started' end,
          closed_at = case when v_next is null then v_today::timestamptz end
      where id = v_pkg;

      if v_next is null then
        insert into public.supplier_ratings (supplier_id, package_id, program_id, rating, remark, created_by)
        values (v_sup, v_pkg, r.program_id, 4 + (r.k % 2), 'Delivered complete and on time; good quality.', v_admin);
      end if;

      -- Cancelled package scenario.
      if r.k = 3 and v_j = 3 then
        update public.procurement_packages
        set status = 'cancelled', cancelled_reason = 'Venue and meals provided by the host LGU (counterpart).'
        where id = v_pkg;
        insert into public.activity_stage_transitions
          (activity_id, program_id, package_id, stage_name, action, note, effective_date, created_by)
        select r.id, r.program_id, v_pkg, p.code || ' · ' || p.title, 'cancel', p.cancelled_reason, v_today - 5, v_admin
        from public.procurement_packages p where p.id = v_pkg;
      end if;

      -- A conversation and an overdue notice on packages.
      if r.k = 1 and v_j = 2 then
        insert into public.comments (entity_type, entity_id, body, author_id, created_at)
        values ('package', v_pkg, 'ORS was processed at award so the supplier can deliver before month-end.', v_admin, now() - interval '3 days');
      end if;
      if r.k = 6 and v_j = 3 and r.responsible is not null and r.responsible <> v_admin then
        insert into public.directives
          (program_id, kind, title, body, priority, entity_type, entity_id, response_due, issued_by, issued_at)
        select r.program_id, 'overdue_notice', 'Overdue package: ' || p.code || ' ' || p.title,
               'Package ' || p.code || ' was due on ' || to_char(p.due_date, 'FMMon FMDD, YYYY')
                 || ' (12 days overdue). Please provide a status update and revised target date.',
               'high', 'package', p.id, v_today + 3, v_admin, now() - interval '1 day'
        from public.procurement_packages p where p.id = v_pkg
        returning id into v_dir;
        insert into public.directive_recipients (directive_id, user_id, program_id) values (v_dir, r.responsible, r.program_id);
      end if;
    end loop;
  end loop;
end;
$$;
