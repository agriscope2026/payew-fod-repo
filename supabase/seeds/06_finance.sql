-- =============================================================================
-- PAYEW · DEV seed · Phase 7 · Finance
-- * FY 2026 allotments per program (MOOE + CO)
-- * WFP (approved), PPMP (approved) and APP (submitted) per program
-- * ORS / deliveries / DV per package, following where each package's
--   workflow is: closed → fully paid; obligated before delivery; partial
--   delivery with staged payments (two DVs); accepted but unpaid (payables)
-- * activity-level honoraria (non-procurement) and procurement savings
-- Idempotent: skipped if the first allotment exists.
-- =============================================================================
do $$
declare
  v_today   date := public.today_ph();
  v_mooe    uuid := (select id from public.expense_classes where code = 'MOOE');
  v_co      uuid := (select id from public.expense_classes where code = 'CO');
  v_gaa     uuid := (select id from public.fund_sources where code = 'GAA');
  v_fy      uuid := (select id from public.fiscal_years where year = 2026);
  pr        record;
  p         record;
  v_plan    uuid;
  v_ors     uuid;
  v_dv      uuid;
  v_n       integer := 0;
  v_date    date;
  v_amt     numeric;
  v_partial uuid;
begin
  if exists (select 1 from public.allotments where allotment_no = 'SAA-2026-AMIA-001') then
    raise notice 'Finance already seeded; skipping.';
    return;
  end if;
  if not exists (select 1 from public.procurement_packages) then
    raise notice 'Packages seed missing; skipping finance seed.';
    return;
  end if;

  -- ---------------------------------------------------------------------------
  -- Allotments: 110% of FY 2026 activity budgets, split MOOE / CO
  -- ---------------------------------------------------------------------------
  for pr in
    select g.id, g.code,
           coalesce(sum(a.budget_amount) filter (where c.name not in ('Machinery and Equipment', 'Infrastructure / Facilities')), 0) as mooe,
           coalesce(sum(a.budget_amount) filter (where c.name in ('Machinery and Equipment', 'Infrastructure / Facilities')), 0) as co
    from public.programs g
    join public.activities a on a.program_id = g.id and a.fiscal_year_id = v_fy and a.deleted_at is null
    left join public.activity_categories c on c.id = a.category_id
    group by g.id, g.code
  loop
    insert into public.allotments (program_id, fiscal_year_id, kind, allotment_no, allotment_date, fund_source_id, expense_class_id, amount, remarks)
    values
      (pr.id, v_fy, 'sub_allotment', 'SAA-2026-' || pr.code || '-001', '2026-01-20', v_gaa, v_mooe, round(pr.mooe * 1.1, -3),
       'First release, MOOE'),
      (pr.id, v_fy, 'sub_allotment', 'SAA-2026-' || pr.code || '-002', '2026-02-10', v_gaa, v_co, round(pr.co * 1.1, -3) + 100000,
       'First release, CO');
    insert into public.allotments (program_id, fiscal_year_id, kind, allotment_no, allotment_date, fund_source_id, expense_class_id, amount, remarks)
    values (pr.id, v_fy, 'realignment', 'RA-2026-' || pr.code || '-01', '2026-06-15', v_gaa, v_mooe, -50000,
            'Realigned to typhoon rehabilitation (CO)');
    insert into public.allotments (program_id, fiscal_year_id, kind, allotment_no, allotment_date, fund_source_id, expense_class_id, amount, remarks)
    values (pr.id, v_fy, 'realignment', 'RA-2026-' || pr.code || '-01', '2026-06-15', v_gaa, v_co, 50000,
            'Realigned from MOOE');

    -- WFP: one row per activity, spread evenly over its implementation months.
    insert into public.finance_plans (program_id, fiscal_year_id, plan_type, status, submitted_at, approved_at)
    values (pr.id, v_fy, 'WFP', 'approved', '2026-01-10', '2026-01-15') returning id into v_plan;
    insert into public.finance_plan_rows (
      plan_id, program_id, fiscal_year_id, sort_order, activity_id, description, expense_class_id, fund_source_id,
      unit_id, quantity, unit_cost, amount, m01, m02, m03, m04, m05, m06, m07, m08, m09, m10, m11, m12
    )
    select v_plan, pr.id, v_fy, row_number() over (order by a.code), a.id, a.title,
           case when c.name in ('Machinery and Equipment', 'Infrastructure / Facilities') then v_co else v_mooe end,
           v_gaa, a.unit_id, a.target_quantity,
           case when a.target_quantity > 0 then round(a.budget_amount / a.target_quantity, 2) end,
           a.budget_amount,
           m[1], m[2], m[3], m[4], m[5], m[6], m[7], m[8], m[9], m[10], m[11], m[12]
    from public.activities a
    left join public.activity_categories c on c.id = a.category_id
    cross join lateral (
      select array_agg(case when mm between extract(month from a.start_date) and extract(month from coalesce(a.end_date, a.due_date))
                            then round(a.budget_amount / greatest(extract(month from coalesce(a.end_date, a.due_date)) - extract(month from a.start_date) + 1, 1), 2)
                            else 0 end order by mm) as m
      from generate_series(1, 12) mm
    ) months
    where a.program_id = pr.id and a.fiscal_year_id = v_fy and a.deleted_at is null and a.start_date >= '2026-01-01';
    -- Rounding remainder goes to the amount itself (months stay indicative).

    -- PPMP (approved) and APP (submitted): one row per package, tagged to it.
    insert into public.finance_plans (program_id, fiscal_year_id, plan_type, status, submitted_at, approved_at)
    values (pr.id, v_fy, 'PPMP', 'approved', '2026-01-12', '2026-01-18') returning id into v_plan;
    insert into public.finance_plan_rows (
      plan_id, program_id, fiscal_year_id, sort_order, activity_id, package_id, description, expense_class_id,
      uacs_code_id, fund_source_id, procurement_mode_id, unit_id, quantity, unit_cost, amount,
      m01, m02, m03, m04, m05, m06, m07, m08, m09, m10, m11, m12
    )
    select v_plan, pr.id, v_fy, row_number() over (order by k.code), k.activity_id, k.id, k.title, k.expense_class_id,
           k.uacs_code_id, v_gaa, k.procurement_mode_id, (select id from public.units where name = 'lot'), 1, k.abc_amount,
           k.abc_amount,
           (case when mo = 1 then k.abc_amount else 0 end), (case when mo = 2 then k.abc_amount else 0 end),
           (case when mo = 3 then k.abc_amount else 0 end), (case when mo = 4 then k.abc_amount else 0 end),
           (case when mo = 5 then k.abc_amount else 0 end), (case when mo = 6 then k.abc_amount else 0 end),
           (case when mo = 7 then k.abc_amount else 0 end), (case when mo = 8 then k.abc_amount else 0 end),
           (case when mo = 9 then k.abc_amount else 0 end), (case when mo = 10 then k.abc_amount else 0 end),
           (case when mo = 11 then k.abc_amount else 0 end), (case when mo = 12 then k.abc_amount else 0 end)
    from public.procurement_packages k
    cross join lateral (select coalesce(extract(month from (
      select min(s.planned_start) from public.activity_stage_progress s where s.package_id = k.id))::integer, 1) as mo) x
    where k.program_id = pr.id and k.fiscal_year_id = v_fy and k.deleted_at is null and k.status <> 'cancelled';

    insert into public.finance_plans (program_id, fiscal_year_id, plan_type, status, submitted_at)
    values (pr.id, v_fy, 'APP', 'submitted', '2026-01-20') returning id into v_plan;
    insert into public.finance_plan_rows (
      plan_id, program_id, fiscal_year_id, sort_order, activity_id, package_id, description, expense_class_id,
      uacs_code_id, fund_source_id, procurement_mode_id, unit_id, quantity, unit_cost, amount
    )
    select v_plan, r.program_id, r.fiscal_year_id, r.sort_order, r.activity_id, r.package_id, r.description,
           r.expense_class_id, r.uacs_code_id, r.fund_source_id, r.procurement_mode_id, r.unit_id, r.quantity,
           r.unit_cost, r.amount
    from public.finance_plan_rows r
    join public.finance_plans f on f.id = r.plan_id and f.plan_type = 'PPMP' and f.program_id = pr.id and f.fiscal_year_id = v_fy;
  end loop;

  -- Partial-delivery scenario: the first awarded, ongoing package not yet delivered.
  select k.id into v_partial from public.procurement_packages k
  where k.supplier_id is not null and k.status = 'ongoing' and k.deleted_at is null
    and k.obligation_timing = 'after_delivery'
    and not exists (select 1 from public.activity_stage_progress s
                    where s.package_id = k.id and s.phase_key = 'delivery' and s.status = 'completed')
  order by k.code limit 1;
  update public.procurement_packages
  set remarks = 'Partial delivery 1 of 2 received; balance due next week.'
  where id = v_partial;

  -- ---------------------------------------------------------------------------
  -- Package financials, following each package's completed workflow steps
  -- ---------------------------------------------------------------------------
  for p in
    select k.*,
           (select max(s.actual_end) from public.activity_stage_progress s
            where s.package_id = k.id and s.phase_key = 'obligation' and s.status = 'completed') as obligated_on,
           (select max(s.actual_end) from public.activity_stage_progress s
            where s.package_id = k.id and s.phase_key = 'inspection' and s.status = 'completed') as accepted_on,
           (select max(s.actual_end) from public.activity_stage_progress s
            where s.package_id = k.id and s.phase_key = 'delivery' and s.status = 'completed') as delivered_on,
           (select max(s.actual_end) from public.activity_stage_progress s
            where s.package_id = k.id and s.phase_key = 'disbursement' and s.status = 'completed') as paid_on,
           exists (select 1 from public.activity_stage_progress s
                   where s.package_id = k.id and s.phase_key = 'delivery' and s.status = 'in_progress') as delivering
    from public.procurement_packages k
    where k.supplier_id is not null and k.deleted_at is null and k.status <> 'cancelled'
    order by k.code
  loop
    v_n := v_n + 1;
    v_ors := null;

    -- ORS (the obligation step is done, or obligation comes first and the award is in)
    if p.obligated_on is not null then
      insert into public.obligations (program_id, fiscal_year_id, activity_id, package_id, ors_no, ors_date, amount,
        fund_source_id, expense_class_id, uacs_code_id, payee_supplier_id, particulars)
      values (p.program_id, p.fiscal_year_id, p.activity_id, p.id, 'ORS-2026-' || lpad(v_n::text, 4, '0'),
        p.obligated_on, p.contract_amount, v_gaa, p.expense_class_id, p.uacs_code_id, p.supplier_id,
        p.title || ' per ' || coalesce(p.contract_no, 'PO'))
      returning id into v_ors;
    end if;

    -- Deliveries
    if p.id = v_partial then
      -- partial delivery 1 accepted, balance scheduled; staged payment for the first part
      insert into public.package_deliveries (package_id, activity_id, program_id, fiscal_year_id, delivery_no, status,
        scheduled_date, delivery_date, accepted_date, dr_no, iar_no, amount)
      values (p.id, p.activity_id, p.program_id, p.fiscal_year_id, 1, 'accepted', v_today - 12, v_today - 12, v_today - 10,
        'DR-' || lpad(v_n::text, 4, '0') || 'A', 'IAR-' || lpad(v_n::text, 4, '0') || 'A', round(p.contract_amount * 0.6, 2));
      insert into public.package_deliveries (package_id, activity_id, program_id, fiscal_year_id, delivery_no, status, scheduled_date, amount)
      values (p.id, p.activity_id, p.program_id, p.fiscal_year_id, 2, 'scheduled', v_today + 5, round(p.contract_amount * 0.4, 2));
      if v_ors is null then
        insert into public.obligations (program_id, fiscal_year_id, activity_id, package_id, ors_no, ors_date, amount,
          fund_source_id, expense_class_id, uacs_code_id, payee_supplier_id, particulars)
        values (p.program_id, p.fiscal_year_id, p.activity_id, p.id, 'ORS-2026-' || lpad(v_n::text, 4, '0'),
          v_today - 30, p.contract_amount, v_gaa, p.expense_class_id, p.uacs_code_id, p.supplier_id, p.title)
        returning id into v_ors;
      end if;
      -- delivery 1 is paid in two stages (half on processing, the balance after the IAR review)
      v_amt := round(p.contract_amount * 0.3, 2);
      insert into public.disbursements (program_id, fiscal_year_id, activity_id, package_id, dv_no, dv_date, gross_amount,
        tax_withheld, payee_supplier_id, check_ada_no, particulars)
      values (p.program_id, p.fiscal_year_id, p.activity_id, p.id, 'DV-2026-' || lpad(v_n::text, 4, '0') || 'A',
        v_today - 8, v_amt, round(v_amt * 0.06, 2), p.supplier_id, 'ADA-' || (880000 + v_n), 'Staged payment 1 of 2, delivery 1')
      returning id into v_dv;
      insert into public.disbursement_obligations (disbursement_id, obligation_id, program_id, amount)
      values (v_dv, v_ors, p.program_id, v_amt);
      v_amt := round(p.contract_amount * 0.6, 2) - v_amt;
      insert into public.disbursements (program_id, fiscal_year_id, activity_id, package_id, dv_no, dv_date, gross_amount,
        tax_withheld, payee_supplier_id, check_ada_no, particulars)
      values (p.program_id, p.fiscal_year_id, p.activity_id, p.id, 'DV-2026-' || lpad(v_n::text, 4, '0') || 'B',
        v_today - 5, v_amt, round(v_amt * 0.06, 2), p.supplier_id, 'ADA-' || (880500 + v_n), 'Staged payment 2 of 2, delivery 1')
      returning id into v_dv;
      insert into public.disbursement_obligations (disbursement_id, obligation_id, program_id, amount)
      values (v_dv, v_ors, p.program_id, v_amt);
      continue;
    end if;

    if p.accepted_on is not null or p.delivered_on is not null then
      v_date := coalesce(p.delivered_on, p.accepted_on);
      insert into public.package_deliveries (package_id, activity_id, program_id, fiscal_year_id, delivery_no, status,
        scheduled_date, delivery_date, accepted_date, dr_no, iar_no, amount)
      values (p.id, p.activity_id, p.program_id, p.fiscal_year_id, 1,
        case when p.accepted_on is not null then 'accepted' else 'delivered' end,
        v_date, v_date, case when p.accepted_on is not null then greatest(p.accepted_on, v_date) end,
        'DR-' || lpad(v_n::text, 4, '0'), case when p.accepted_on is not null then 'IAR-' || lpad(v_n::text, 4, '0') end,
        p.contract_amount);
    elsif p.delivering then
      insert into public.package_deliveries (package_id, activity_id, program_id, fiscal_year_id, delivery_no, status, scheduled_date, amount)
      values (p.id, p.activity_id, p.program_id, p.fiscal_year_id, 1, 'scheduled', v_today + 3, p.contract_amount);
    end if;

    -- Full payment once the payment step is done
    if p.paid_on is not null and v_ors is not null then
      insert into public.disbursements (program_id, fiscal_year_id, activity_id, package_id, dv_no, dv_date, gross_amount,
        tax_withheld, payee_supplier_id, check_ada_no, particulars)
      values (p.program_id, p.fiscal_year_id, p.activity_id, p.id, 'DV-2026-' || lpad(v_n::text, 4, '0'),
        p.paid_on, p.contract_amount, round(p.contract_amount * 0.06, 2), p.supplier_id, 'ADA-' || (880000 + v_n),
        'Full payment, ' || coalesce(p.contract_no, 'PO'))
      returning id into v_dv;
      insert into public.disbursement_obligations (disbursement_id, obligation_id, program_id, amount)
      values (v_dv, v_ors, p.program_id, p.contract_amount);
    end if;
  end loop;

  -- Activity-level expenses: honoraria for training activities (ORS + DV, no package)
  for p in
    select a.* from public.activities a
    join public.activity_categories c on c.id = a.category_id and c.name = 'Training / Capacity Building'
    where a.fiscal_year_id = v_fy and a.deleted_at is null and a.status <> 'cancelled' and a.start_date < v_today
    order by a.code
  loop
    v_n := v_n + 1;
    insert into public.obligations (program_id, fiscal_year_id, activity_id, ors_no, ors_date, amount, fund_source_id,
      expense_class_id, uacs_code_id, payee_name, particulars)
    values (p.program_id, p.fiscal_year_id, p.id, 'ORS-2026-' || lpad(v_n::text, 4, '0'), p.start_date, 15000, v_gaa, v_mooe,
      (select id from public.uacs_codes where code = '5029999000'), 'Resource persons', 'Honoraria of resource persons')
    returning id into v_ors;
    if p.end_date < v_today then
      insert into public.disbursements (program_id, fiscal_year_id, activity_id, dv_no, dv_date, gross_amount, tax_withheld,
        payee_name, check_ada_no, particulars)
      values (p.program_id, p.fiscal_year_id, p.id, 'DV-2026-' || lpad(v_n::text, 4, '0'), p.end_date, 15000, 1500,
        'Resource persons', 'CHK-' || (550000 + v_n), 'Honoraria of resource persons')
      returning id into v_dv;
      insert into public.disbursement_obligations (disbursement_id, obligation_id, program_id, amount)
      values (v_dv, v_ors, p.program_id, 15000);
    end if;
  end loop;

  -- Procurement savings (packages awarded before this migration existed) and a few decisions.
  update public.procurement_packages set contract_amount = contract_amount where savings_amount > 0;
  update public.savings_entries s set status = 'confirmed', decided_at = now(),
         decided_by = (select m.user_id from public.program_memberships m
                       join public.profiles pf on pf.id = m.user_id and pf.role = 'program_admin'
                       where m.program_id = s.program_id limit 1),
         remarks = 'To be realigned in the next WFP revision.'
  where s.package_id in (select id from public.procurement_packages where status = 'closed');
end;
$$;
