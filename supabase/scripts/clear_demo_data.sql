-- =============================================================================
-- PAYEW · DEV ONLY · Clears the sample records so real data can be imported.
--
-- Run in Supabase Dashboard → SQL Editor, on the DEV project only.
--
-- REMOVES: activities, packages, finance records and plans, suppliers,
--          beneficiaries, directives, issues, announcements, comments,
--          approvals, notifications and file records.
-- KEEPS:   user accounts (including the @payew.local test logins), programs,
--          fiscal years, master lists, locations, settings, workflow templates,
--          import templates and dashboard layouts.
--
-- It stops without changing anything if it finds a user outside @payew.local,
-- because that suggests real people are using this database.
-- The error lists those users. If you recognize them and this is the dev
-- project, add their emails to v_allowed below and run the script again.
-- =============================================================================

do $$
declare
  -- Lowercase emails, e.g. array['someone@example.com', 'another@example.com']
  v_allowed text[] := array[]::text[];
  v_others  text;
begin
  select string_agg(email, ', ' order by email) into v_others
  from public.profiles
  where email not like '%@payew.local' and not (lower(email) = any (v_allowed));
  if v_others is not null then
    raise exception 'Found accounts outside @payew.local: %. If this is really the dev project, add the ones you recognize to v_allowed. Nothing was deleted.', v_others;
  end if;
end;
$$;

truncate table
  public.activities,
  public.suppliers,
  public.beneficiaries,
  public.directives,
  public.issues,
  public.announcements,
  public.approval_requests,
  public.finance_plans,
  public.allotments,
  public.notes,
  public.comments,
  public.notifications,
  public.attachments
restart identity cascade;

-- Check: every row should show 0.
select 'activities' as records, count(*) from public.activities
union all select 'procurement_packages', count(*) from public.procurement_packages
union all select 'obligations', count(*) from public.obligations
union all select 'disbursements', count(*) from public.disbursements
union all select 'allotments', count(*) from public.allotments
union all select 'finance_plan_rows', count(*) from public.finance_plan_rows
union all select 'suppliers', count(*) from public.suppliers
union all select 'beneficiaries', count(*) from public.beneficiaries;
