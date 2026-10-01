# ADDENDUM B – MULTIPLE SUPPLIERS PER ACTIVITY (PROCUREMENT PACKAGES & PARALLEL WORKFLOW TRACKS)

> Verbatim copy of the requirement as provided by the product owner (received during Phase 6).
> It extends and, where it conflicts, overrides the earlier sections, especially 3.3 Financial Tracker,
> 3.4 Workflow engine, the Dashboard, and the Calendar.

## B1. Core concept
One activity can involve **many suppliers/service providers** (e.g., lodging, meals, transportation, supplies/materials, venue, printing, equipment, training services). Each is a **Procurement Package** (a "lot") with its **own supplier, budget, procurement process, delivery, obligation, and payment**, and these can progress **independently and out of order**. Example: the supplies package may be delivered, obligated, and paid while the lodging package is still in RFQ.

The activity therefore has **two workflow levels**:
1. **Activity-level stages** (the shared lifecycle): Design/Proposal → Review & Approval → Inclusion in PPMP/WFP/APP → **Procurement & Implementation (contains packages)** → Liquidation/Reporting → Savings/Realignment → Closed.
2. **Package-level workflow** (repeats per package/supplier, parallel): the **Default Package Workflow Template**, editable by the superadmin and customizable per program like the activity workflow (add/remove/rename/reorder steps, required documents/fields, expected durations):
   1. Requirement / Specifications (Technical Specs, TOR)
   2. Purchase Request (PR)
   3. Procurement Mode & Solicitation (RFQ / Small Value Procurement / Competitive Bidding / Direct Contracting / Negotiated / Agency-to-Agency, etc., configurable list)
   4. Evaluation & Post-qualification
   5. Award (NOA) and PO / Contract / Notice to Proceed
   6. Delivery / Service Rendering (**partial deliveries allowed**)
   7. Inspection & Acceptance (per delivery)
   8. Obligation (ORS) (**may be multiple, may occur earlier or later in the order; see B4**)
   9. Disbursement / Payment (DV) (**partial or staged payments allowed**)
   10. Package Closed

## B2. Rules for the parallel tracks
- Each package has its own stage, status, planned vs actual dates, responsible person, and delay/overdue computation. Packages never block each other.
- **Activity-level stage and status are derived from its packages** (e.g., "Procurement & Implementation: 3 of 5 packages closed, 1 overdue"), shown as a progress bar and a per-package stepper on the Activity detail page. The activity can move to Liquidation/Reporting only when all non-cancelled packages are closed, or when the admin overrides with a justification (audited, may require approval).
- **Configurable step order:** the position of Obligation relative to Delivery is configurable per package (obligate at award/contract **before** delivery, or after delivery/acceptance), because practice differs by procurement mode and by program. Validation messages must follow the configured order.
- Packages can be added, split, merged, re-awarded to a different supplier (after failure of bidding/non-delivery), or cancelled at any time, with reason and audit log. Keep the history of the previous supplier on re-award.
- Activity detail page gets a **Packages tab** (table + kanban by package stage + timeline/Gantt view) with a "+ Add Package" action and a quick template picker (Lodging, Meals, Transportation, Supplies/Materials, Venue, Printing, Equipment, Honoraria/Services, Other) that pre-fills category, expense class, and default workflow.
- Comments (A1/3.9), notes, attachments, issues/risks, and approval requests can attach to a **package** as well as to the activity.

## B3. Suppliers master list (Settings + own page)
- **Suppliers page** (shared master list, with search and import/export Excel): business name, trade name, owner/representative, type (individual/partnership/corporation/cooperative), TIN, PhilGEPS registration no. and expiry, business permit no. and expiry, address (Province → Municipality → Barangay dropdowns), contact person/number/email, categories supplied (lodging, meals, transport, supplies, etc.), bank details (stored securely, visible to admins only), status (`active`, `suspended`, `blacklisted`), attachments (permits, certificates, eligibility documents via R2), notes.
- Duplicate prevention (fuzzy-match on name/TIN). Warn when a document is expired or the supplier is suspended/blacklisted when awarding a package (block if blacklisted).
- **Supplier profile page:** history of packages across activities/programs/years, total awarded/obligated/paid, on-time delivery rate, number of failed/late deliveries, and ratings/remarks (superadmin and admins can add a performance remark per package). Comments enabled.
- Visibility: suppliers are a shared, system-wide master list readable by all roles; only superadmin and program admins can create/edit (program staff read-only); bank details and performance remarks restricted to admins via RLS.

## B4. Package-level financials (replaces the single-line tracker in 3.3)
Each package has its own financial tracker, rolled up to the activity:
- **Budget / ABC** (Approved Budget for the Contract), linked to the WFP/PPMP rows and the expense class/UACS code. The sum of package ABCs must be ≤ the activity budget (warn/block per setting) and the remaining unallocated amount is shown on the activity.
- **Contract/PO amount** (awarded price). **Procurement savings = ABC − contract amount** is calculated automatically and suggested as a Savings/Realignment entry (the admin confirms).
- **Multiple Obligations** per package (ORS no., date, amount, fund source, UACS), each optionally linked to a delivery or a contract milestone.
- **Multiple Deliveries** per package (delivery date, items/qty/unit/amount delivered, delivery receipt no., inspection & acceptance report no., status `scheduled | delivered | partial | accepted | rejected`), with attachments.
- **Multiple Disbursements** per package (DV no., date, amount, payee, withholding tax/VAT fields if needed, check/ADA no.), each linked to the obligation(s) it pays.
- Computed per package: obligated %, delivered %, paid %, unobligated balance, **obligated-but-undelivered**, **delivered-but-unpaid** (payables), and unliquidated amount.
- Validations: total obligations ≤ contract amount (or ABC if not yet awarded); disbursements ≤ obligations; deliveries accepted ≤ contract quantity (warn/block per setting). Handle the "obligated before delivery" and "delivered before obligation" scenarios without errors, but flag the second as an exception requiring a remark.
- Activity-level Financial Tracker = the sum of its packages plus any activity-level (non-procurement) expenses (e.g., honoraria, direct payments), with a drill-down by package/supplier.

## B5. Dashboard, Calendar, Reports, and other effects
- **Dashboard (all still respect the FY and Program selector):** add widgets for *Packages by stage* (funnel), *Packages overdue* (supplier, activity, days late, amount, with the "Send Overdue Notice" action), *Spending by supplier* (top suppliers by contract/paid amount), *Spending by procurement category* (lodging, meals, transport, supplies…), *Procurement savings* (ABC vs contract), *Obligated-but-undelivered* and *Delivered-but-unpaid* amounts, and *Pending deliveries (next 30 days)*. Update the procurement status summary to count packages, not activities. Aging of obligations works per package.
- **Calendar:** show per-package events (solicitation date, award date, delivery dates, payment due dates) color-coded by package category, with a toggle to show/hide package events; a click opens the package.
- **Reports:** add *Procurement Status Report (per package)*, *Supplier Performance Report*, *Supplier Awards & Payments Report*, *Procurement Savings Report*, and *Payables (delivered-but-unpaid) Report*; update the Budget Utilization Report to drill down activity → package → supplier.
- **Approvals (3.11):** add request types *Supplier change/re-award*, *Package cancellation*, *Contract amount variation*, and *Obligation-order exception*.
- **Notifications:** package stage nearing due/overdue, delivery scheduled or late, supplier document expiring (30 days), payment pending for accepted deliveries.
- **Global search:** include suppliers and packages. **Document Repository:** package documents (PR, RFQ, abstract of quotations, PO/contract, delivery receipts, inspection reports, ORS, DV) are auto-filed under program → activity → package.
- **Excel import/export (Finance page):** a WFP/PPMP row can be tagged to a package, and a package list can be exported to Excel.

## B6. Database additions
`suppliers`, `supplier_documents`, `supplier_ratings`, `procurement_packages` (id, activity_id, program_id, fiscal_year_id, package_no, title, category, supplier_id, abc_amount, contract_amount, procurement_mode, status, current_stage_id, workflow_template_id, responsible_user_id, planned/actual dates, previous_supplier_ids/history, cancelled_reason, deleted_at), `package_workflow_templates`, `package_workflow_stages`, `package_stage_progress`, `package_deliveries` (+ `package_delivery_items`), `package_status_history`. Update `obligations` and `disbursements` to carry `package_id` (nullable for activity-level expenses) and add a link table `disbursement_obligations`. Update `procurements` to be per package (or merge it into `procurement_packages`).
- Add RLS on all new tables (program-scoped via `program_id`; suppliers shared-read with admin-only write; bank details/ratings restricted), indexes on `activity_id`, `package_id`, `supplier_id`, `program_id`, `status`, and delivery/due dates, plus check constraints (amounts ≥ 0).
- Views/RPCs: `v_package_financial_summary`, `v_activity_package_rollup`, `v_supplier_summary`, `v_payables`, and `v_package_overdue`.
- Triggers: derive activity status from its packages; compute procurement savings; notify on package overdue/delivery/payment events; write audit logs; update the derived dashboard figures.

## B7. Seed data additions
For each program, give most activities **2–5 packages** with different suppliers and categories (lodging, meals, transport, supplies, venue, printing), covering these scenarios: one package fully delivered, obligated, and paid while others are still in procurement; one **obligated before delivery** (with a later delivery); one with **partial deliveries and staged payments**; one **re-awarded** after a failed first supplier; one **cancelled**; one **overdue**; one with **procurement savings** (contract < ABC). Seed 20–30 suppliers (some with expiring documents, one suspended, one blacklisted) and a few comments/notices attached to packages.

## B8. Build order changes
- Phase 4: also build the **Suppliers master list and page**.
- Phase 5: build the activity workflow engine as **two levels** (activity-level and package-level templates, customization, derived activity status) together with the **Packages tab**.
- Phase 7: the Finance Financial Tracker is **package-based** (multiple obligations, deliveries, and disbursements, with validations).
- Phases 8–11: apply the approval types, dashboard widgets, calendar events, reports, notifications, and user guide updates listed in B5. Update the User Guide with a "Working with multiple suppliers/packages" tutorial and glossary terms (ABC, PR, RFQ, NOA, PO, SVP, ORS, DV).
- Phase 12: include seed scenarios from B7 and tests for the package-level parallel flows and the roll-up logic.
