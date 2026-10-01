# Deploying PAYEW to production

This guide takes a fresh setup to a working production system: Supabase (database, auth, edge functions, scheduled jobs), Cloudflare R2 (file storage) and Vercel (the web app). Allow about an hour. Steps are in order. Each ends with a way to check it worked.

```
Browser ──▶ Vercel (static React app)
   │
   ├──▶ Supabase: Postgres + RLS · Auth · Realtime · Edge Functions (admin-users, files) · pg_cron
   │                                                       │
   └──────── presigned PUT/GET (≤ 10 min) ◀────────────────┴──▶ Cloudflare R2 bucket (private)
```

## 0. What you need

- Node 20 or later, and the Supabase CLI (`npx supabase …` works without installing it)
- Accounts: Supabase, Cloudflare (R2), Vercel, and access to the GitHub repository
- The PSA PSGC publication (Excel) from <https://psa.gov.ph/classification/psgc>. It holds the official list of provinces, municipalities and barangays.
- The email address of the first administrator (the superadmin)

Never put the Supabase **service role key** or the R2 keys in Vercel or in any `VITE_*` variable. They go only into Edge Function secrets (step 4).

## 1. Supabase project and database

1. Create a project. Choose the **Southeast Asia (Singapore)** region and a strong database password.
2. In **Database → Extensions**, enable **pg_cron**. (`pgcrypto` and `pg_trgm` are enabled by the migrations.)
3. Apply the migrations and the reference data from your machine:

   ```bash
   npx supabase login
   npx supabase link --project-ref <project-ref>          # the ref is in the project URL
   npx supabase db push                                   # migrations only. Never use --include-seed here.
   npx supabase db query --linked -f supabase/reference.sql
   ```

   `reference.sql` loads the programs, the finance and program master lists (fund sources, expense classes, UACS codes, commodities, units, categories, beneficiary types) and the default settings. Running it again changes nothing. **Do not run `seed.sql` or `seeds/*.sql` in production.** They create demo accounts and data.

4. If pg_cron was enabled **after** `db push`, schedule the jobs now. Times are UTC: 23:00 UTC is 07:00 in Manila.

   ```sql
   select cron.schedule('payew-notification-sweep',   '0 23 * * *',  'select public.run_notification_sweep()');
   select cron.schedule('payew-finance-reminders',    '5 23 * * *',  'select public.run_finance_reminders()');
   select cron.schedule('payew-monitoring-reminders', '10 23 * * *', 'select public.run_monitoring_reminders()');
   select cron.schedule('payew-announcements',        '5 * * * *',   'select public.publish_due_announcements()');
   ```

**Check:** in the SQL editor, `select jobname, schedule from cron.job;` lists the four `payew-*` jobs.

## 2. Authentication settings

In **Authentication**:

- **Sign In / Providers → Email:** keep email sign-in on. **Turn off "Allow new users to sign up".** Accounts are created only by administrators in PAYEW → Users.
- **URL Configuration:** set Site URL to the production address (for example `https://payew.vercel.app` or your own domain). Add `https://<that address>/reset-password` under Redirect URLs.
- **SMTP Settings:** set up a custom SMTP sender (for example the agency mail server or a provider such as Resend). The built-in sender is rate-limited and meant for testing, and password-reset emails depend on it.
- **Email Templates → Reset password:** optionally adjust the wording. The link must stay `{{ .ConfirmationURL }}`.

## 3. Cloudflare R2 (file storage)

1. Create a **private** bucket, for example `payew-files`. Do not enable public access.
2. In the bucket's **Settings → CORS policy**, allow the app to upload and download directly:

   ```json
   [
     {
       "AllowedOrigins": ["https://payew.vercel.app"],
       "AllowedMethods": ["GET", "PUT", "HEAD"],
       "AllowedHeaders": ["Content-Type"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

   Use your real production address, and add your custom domain if you have one.
3. Under **R2 → Manage API tokens**, create a token with **Object Read & Write** limited to this bucket. Note the access key ID, the secret, and your Cloudflare account ID.

## 4. Edge Functions and secrets

```bash
npx supabase secrets set \
  R2_ACCOUNT_ID=<cloudflare account id> \
  R2_ACCESS_KEY_ID=<r2 access key id> \
  R2_SECRET_ACCESS_KEY=<r2 secret> \
  R2_BUCKET=payew-files \
  ALLOWED_ORIGINS=https://payew.vercel.app
npx supabase functions deploy admin-users files
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are provided to functions automatically. `ALLOWED_ORIGINS` is a comma-separated list; add your custom domain when you have one.

**Check:** **Edge Functions** lists `admin-users` and `files` as active.

## 5. Web app on Vercel

1. **Add New → Project** and import the GitHub repository. Vercel detects Vite: the build command is `npm run build` and the output folder is `dist`.
2. Set these **Environment Variables** for Production. Both values come from Supabase **Project Settings → API**:

   | Name | Value |
   | --- | --- |
   | `VITE_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | the **anon / publishable** key (never the service role key) |
   | `VITE_APP_NAME` | `PAYEW` |
   | `VITE_APP_FULL_NAME` | `Program & Allotment Yearly Execution Watch` |

3. Deploy. `vercel.json` already sends every route to the app (single-page app) and adds security headers: HSTS, nosniff, frame denial, referrer and permissions policy. It also caches the hashed `/assets` files for a year.
4. If you use a custom domain, add it in Vercel, then update the Supabase Site URL and redirect URL (step 2), the R2 CORS rule (step 3) and `ALLOWED_ORIGINS` (step 4).

**Check:** opening the site shows the PAYEW sign-in page.

## 6. First administrator and master data

1. **Create the superadmin.** In Supabase **Authentication → Users → Add user**, enter the administrator's email and a temporary password, and tick **Auto confirm**. The first account on a system with no superadmin automatically becomes the **superadmin**. After that, any account created there without a program is refused. Create all other users inside PAYEW.
2. Sign in to PAYEW with that account. Change the password in the menu at the top right.
3. **Settings → Master Lists → Locations → Import from PSGC.** Upload the PSA PSGC Excel file and choose **Cordillera Administrative Region (CAR)**, then import. Baguio City is placed at province level, as PAYEW expects. Importing again later updates names and codes without creating duplicates.
4. **Settings → Fiscal years:** create the current year, open it and mark it current. Add the next year as a draft when planning starts.
5. **Settings → Programs:** review the five programs (AMIA, APA, HVC, RICE, CORN) and archive any you don't use.
6. **Settings → Master Lists → Finance:** check the UACS codes against the current DBM/COA UACS manual. The supplied list is a starting set.
7. **Users:** create the program admins and staff. Each account gets a temporary password that must be changed at first sign-in.

## 7. Post-deploy check

Paste [`supabase/checks/post_deploy.sql`](../supabase/checks/post_deploy.sql) into the Supabase SQL editor. Every row should show `ok = true`. The `detail` column says what to fix: missing pg_cron, missing locations, no current fiscal year, demo accounts, and so on.

Then run a 10-minute smoke test with a program admin and a staff account:

- [ ] Sign in, sign out, then use "Forgot password" and receive the email
- [ ] The Dashboard loads for the current fiscal year
- [ ] Create an activity, add a procurement package and award it to a supplier
- [ ] Upload a file on the package, then download it. This checks R2, CORS and the Edge Function.
- [ ] Record an ORS, a delivery and a DV on the package's Finance tab
- [ ] Post an announcement. The other account sees it and gets a notification.
- [ ] Export a report to Excel
- [ ] The next morning, check that the scheduled jobs ran: `select jobname, status, start_time from cron.job_run_details d join cron.job j using (jobid) order by start_time desc limit 10;`

## 8. Updating

- Every push and pull request runs CI (`.github/workflows/ci.yml`): typecheck, lint, all tests (including the database tests on in-memory Postgres) and a production build.
- Vercel deploys `main` automatically.
- **New migrations:** run `npx supabase db push` after merging. Never edit a migration that has already been applied; add a new one.
- **Changed Edge Functions:** run `npx supabase functions deploy admin-users files`.
- **Maintenance:** Settings → System → Maintenance banner shows a notice to all users.

## 9. Backups and operations

- **Database:** Supabase takes daily backups (Pro plan and above). Turn on Point-in-Time Recovery if the agency needs restores to a specific minute. Before large changes, run `npx supabase db dump -f backup.sql`.
- **Files:** R2 keeps objects until they are deleted. Files moved to Trash in PAYEW are still in R2 and can be restored. If you need off-site copies, use Cloudflare's bucket replication or a periodic `rclone sync`.
- **Audit:** the superadmin's Audit Log records every change to tracked records, with before and after values.
- **Secrets rotation:** create a new R2 token, run `supabase secrets set` again, then revoke the old token. If the Supabase anon key is rotated, update `VITE_SUPABASE_ANON_KEY` in Vercel and redeploy.

## 10. Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| "Failed to fetch" or CORS errors on upload | The R2 CORS rule or `ALLOWED_ORIGINS` doesn't list the exact site address (scheme and domain, no trailing slash) |
| Upload works but download fails | The R2 token lacks read permission, or `R2_BUCKET` is misspelled |
| Password-reset link opens the wrong site | The Supabase Site URL or redirect URL still points to localhost |
| "New accounts need a program" when adding a user in Supabase | A superadmin already exists. Create users in PAYEW → Users instead. |
| No reminders or escalations | pg_cron isn't enabled or the jobs aren't scheduled (step 1.4). Check `cron.job_run_details`. |
| Location dropdowns are empty | The PSGC import (step 6.3) hasn't been run |

## Later hardening (optional)

- Add a `Content-Security-Policy` header in `vercel.json`. It must allow the Supabase URL (including `wss:` for realtime), the R2 endpoint (`https://*.r2.cloudflarestorage.com`) and the OpenStreetMap tiles (`https://*.tile.openstreetmap.org`). Roll it out as `Content-Security-Policy-Report-Only` first.
- Turn on multi-factor authentication for superadmins under Supabase Auth.
