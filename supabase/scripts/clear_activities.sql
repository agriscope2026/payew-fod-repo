-- =============================================================================
-- PAYEW · Clears every activity so the Activities page starts fresh.
--
-- Run in Supabase Dashboard → SQL Editor.
--
-- REMOVES: activities and what hangs from them: workflow progress, checklist
--          tasks, linked beneficiaries, procurement packages, the old finance
--          records (plan rows, ORS, DV, savings), progress updates, issues,
--          approval requests and physical targets.
-- KEEPS:   user accounts, programs, fiscal years, master lists, suppliers,
--          beneficiaries, the finance sheets (WFP, PPMP, APP, Allotments, ORS,
--          DV), dashboard cards, budgets and settings.
--
-- After this, save the WFP again (or use its "Linked sheets" button → "Update
-- linked sheets now") to bring its activities back.
-- =============================================================================

truncate table public.activities restart identity cascade;

-- Check: the first rows should show 0; finance_sheets keeps its count.
select 'activities' as records, count(*) from public.activities
union all select 'activity_physical', count(*) from public.activity_physical
union all select 'procurement_packages', count(*) from public.procurement_packages
union all select 'finance_sheets (kept)', count(*) from public.finance_sheets
union all select 'profiles (kept)', count(*) from public.profiles;
