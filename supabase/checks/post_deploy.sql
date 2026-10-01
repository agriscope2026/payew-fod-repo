-- =============================================================================
-- PAYEW · Post-deploy checklist (read-only)
-- Paste into the Supabase SQL editor after `supabase db push` and the reference
-- data. Every row should say ok = true; "detail" explains what to fix.
-- =============================================================================
with
settings(key) as (
  values ('approvals'), ('dashboard_thresholds'), ('maintenance_banner'), ('overdue_notice_template'),
         ('reminders'), ('timezone'), ('uploads'), ('validation_strictness')
),
checks(sort, check_name, ok, detail) as (
  select 1, 'Row-level security on every table',
         not exists (select 1 from pg_tables where schemaname = 'public' and not rowsecurity),
         coalesce((select string_agg(tablename, ', ') from pg_tables where schemaname = 'public' and not rowsecurity),
                  'all tables protected')
  union all
  select 2, 'Extensions pgcrypto and pg_trgm',
         (select count(*) from pg_extension where extname in ('pgcrypto', 'pg_trgm')) = 2,
         (select coalesce(string_agg(extname, ', '), 'none') from pg_extension where extname in ('pgcrypto', 'pg_trgm'))
  union all
  select 3, 'pg_cron enabled (Database → Extensions)',
         exists (select 1 from pg_extension where extname = 'pg_cron'),
         case when exists (select 1 from pg_extension where extname = 'pg_cron') then 'enabled'
              else 'enable pg_cron, then re-run the cron block in docs/DEPLOYMENT.md' end
  union all
  select 4, 'Reference data loaded (supabase/reference.sql)',
         (select count(*) from public.programs where deleted_at is null) > 0
           and (select count(*) from public.expense_classes) >= 3
           and not exists (select 1 from settings s where not exists (select 1 from public.app_settings a where a.key = s.key)),
         format('%s programs, %s expense classes, missing settings: %s',
                (select count(*) from public.programs where deleted_at is null),
                (select count(*) from public.expense_classes),
                coalesce((select string_agg(s.key, ', ') from settings s
                          where not exists (select 1 from public.app_settings a where a.key = s.key)), 'none'))
  union all
  select 5, 'Locations imported (PSGC)',
         (select count(*) from public.barangays where deleted_at is null) > 0,
         format('%s provinces, %s municipalities/cities, %s barangays',
                (select count(*) from public.provinces where deleted_at is null),
                (select count(*) from public.municipalities where deleted_at is null),
                (select count(*) from public.barangays where deleted_at is null))
  union all
  select 6, 'An active superadmin exists',
         exists (select 1 from public.profiles where role = 'superadmin' and is_active and deleted_at is null),
         coalesce((select string_agg(email, ', ') from public.profiles
                   where role = 'superadmin' and is_active and deleted_at is null), 'create the first account')
  union all
  select 7, 'A current, open fiscal year',
         exists (select 1 from public.fiscal_years where is_current and status = 'open'),
         coalesce((select label || ' (' || status || ')' from public.fiscal_years where is_current),
                  'create one in Settings → Fiscal years and mark it current')
  union all
  select 8, 'No demo accounts (@payew.local)',
         not exists (select 1 from public.profiles where email like '%@payew.local'),
         coalesce((select count(*)::text || ' demo account(s) found — seed.sql must not run in production'
                   from public.profiles where email like '%@payew.local' having count(*) > 0), 'none')
)
select check_name, ok, detail from checks order by sort;

-- Scheduled jobs (needs pg_cron; run separately if the extension is missing):
-- select e.name as job, j.jobid is not null as scheduled, j.schedule
-- from (values ('payew-notification-sweep'), ('payew-finance-reminders'),
--              ('payew-monitoring-reminders'), ('payew-announcements')) e(name)
-- left join cron.job j on j.jobname = e.name;
