# PAYEW: Program & Allotment Yearly Execution Watch

**DA-CAR Field Operations Division: Program, Budget & Activity Tracking System**

*Payew* is the Ifugao word for the Cordillera rice terraces. The system tracks each FOD
program (AMIA, APA, HVC, RICE, CORN) step by step, the way the terraces are built, and follows
the money level by level: **allotment → obligation → disbursement → balance → savings**.

> Tagline: *Every peso, every step, tracked.*

## Stack

| Layer    | Tech                                                                                                                                         |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend | Vite, React 19, TypeScript (strict), React Router 7, TanStack Query, Tailwind CSS 4 + shadcn-style components (Radix), React Hook Form + Zod |
| Backend  | Supabase (Postgres, Auth, RLS, Realtime, Edge Functions, pg_cron)                                                                            |
| Files    | Cloudflare R2 via presigned URLs from an Edge Function (Phase 3)                                                                             |
| Hosting  | Cloudflare Pages                                                                                                                             |

## Build status

| Phase | Scope                                                                                                                                                                                | Status  |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| 1     | Scaffold, schema foundation, RLS, auth, role routing, app shell, notification bell, global search shell                                                                              | ✅      |
| 2     | Settings (programs, fiscal years, master lists, system config, data export) and Users Management (create, edit, reset password, deactivate, force logout)                            | ✅      |
| 3     | R2 file storage (presigned URLs), reusable attachments panel, Document Repository (versions, Trash, preview)                                                                         | ✅      |
| 4     | Beneficiaries registry (shared, fuzzy duplicate check, Excel import/export, map) + reusable cascading location dropdowns                                                             | ✅      |
| 5     | Activities (table/board, create/edit, detail with workflow, checklist, beneficiaries, attachments, history) + workflow engine (default + per-program templates)                      | ✅      |
| 6     | Comments (threads, @mentions, visibility), notes, directives & "Send Overdue Notice", notification system (assignments, preferences, daily pg_cron reminders and 3-level escalation) | ✅      |
| 6B | **Addendum B:** Suppliers master list & profile (PhilGEPS/permit expiry, bank details admin-only, ratings, Excel import/export), procurement packages per activity with their own parallel package workflow, award/re-award/split/merge/cancel, obligation-before-delivery ordering, derived activity progress, Packages tab (table/board/timeline) | ✅ |
| 7     | Finance: Excel-like WFP/PPMP/APP sheets (paste from Excel, import/export, submit/approve), allotments, package-based Financial Tracker (many ORS, partial deliveries, staged DVs linked to ORS), warn/block validations with flags, payables with aging, procurement savings, registers, daily delivery/payment reminders | ✅ |
| 8     | Approvals (cancellation, extension, stage skip, workflow change, supplier re-award, contract variation, obligation-order exception, realignment) with auto-apply and admin→superadmin routing; progress updates (physical %, financial snapshot); issues & risks; monitoring reminders | ✅ |
| 9–12 | Dashboard, calendar/tasks/reports, admin pages, seed/tests/deploy (incl. Addendum B effects) | planned |

Spec addenda live in [docs/spec/](docs/spec/).

## Folder structure

```
.
├── docs/ERD.md                     # Full-system ERD (built + planned)
├── supabase/
│   ├── config.toml                 # Sign-ups disabled, password policy, redirect URLs
│   ├── migrations/                 # One migration set per phase
│   │   ├── …0100_foundation_tables.sql
│   │   ├── …0200_auth_helpers.sql  # is_superadmin(), user_program_ids(), is_program_admin(), RPCs
│   │   ├── …0300_audit_notifications.sql
│   │   └── …0400_rls.sql
│   ├── functions/
│   │   ├── _shared/                # CORS, caller resolution, service/anon clients
│   │   ├── admin-users/            # create account, reset password (Auth admin API)
│   │   └── files/                  # R2 presigned upload/download, confirm, cancel
│   ├── seed.sql                    # DEV ONLY: programs, master lists, users
│   ├── seeds/                      # DEV ONLY per-module seeds (idempotent; also pasteable in SQL Editor)
│   └── scripts/wipe_dev.sql        # DEV ONLY: remove all PAYEW objects from a project
├── tests/db/                       # PGlite harness: migrations, seed + RLS tests (no Docker needed)
└── src/
    ├── app/                        # App providers + router
    ├── components/
    │   ├── ui/                     # shadcn-style primitives
    │   ├── layout/                 # AppShell, Sidebar, top bar, filters, nav-config
    │   └── common/                 # EmptyState, ErrorState, Logo, FormField…
    ├── features/
    │   ├── auth/                   # AuthProvider, guards, login/forgot/reset/change password
    │   ├── workspace/              # Global fiscal-year + program filter
    │   ├── notifications/          # Bell, realtime, notifications page
    │   ├── search/                 # Ctrl/Cmd+K palette
    │   ├── dashboard/
    │   └── {settings,users,activities,finance,beneficiaries,calendar,comments,notes,
    │        approvals,reports,repository,docs}/   ← added phase by phase
    ├── lib/                        # supabase client, env, format (₱, MMM dd, yyyy, Asia/Manila)
    ├── pages/                      # 403 / 404
    └── types/database.ts           # Supabase types (regenerate: npm run db:types)
```

## Getting started (local)

Requirements: Node 20+, and Docker Desktop for the local Supabase stack.

```bash
npm install
cp .env.example .env.local            # then fill in the values printed by `supabase start`
npx supabase start                    # starts Postgres/Auth/Realtime locally
npx supabase db reset                 # applies migrations + seed.sql
npm run db:types                      # optional: regenerate src/types/database.ts
npm run dev                           # http://localhost:5173
```

### Seeded accounts (dev only), password `Payew@2026`

| Role                        | Email                                                                                        |
| --------------------------- | -------------------------------------------------------------------------------------------- |
| Superadmin                  | `superadmin@payew.local`                                                                   |
| Program admins              | `amia.admin@`, `apa.admin@`, `hvc.admin@`, `rice.admin@`, `corn.admin@payew.local` |
| Program staff               | `<code>.staff1@payew.local`, `<code>.staff2@payew.local`                                 |
| Forced password change demo | `amia.staff2@payew.local`                                                                  |

## Scripts

| Script                                        | Purpose                                                                                                         |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `npm run dev` / `build` / `preview`     | Vite                                                                                                            |
| `npm run lint` / `typecheck` / `format` | Quality                                                                                                         |
| `npm test`                                  | Unit tests + database tests                                                                                     |
| `npm run db:check`                          | Runs every migration + seed in**PGlite** (in-process Postgres) and the RLS test suite, no Docker required |
| `npm run db:types`                          | Regenerate Supabase TypeScript types from the local DB                                                          |

## Security model (Phase 1)

- **Roles** live on `profiles.role`; **program scope** lives in `program_memberships` (an admin may hold several programs).
- Role/program for new accounts come from `auth.users.raw_app_meta_data`, which only the service role can write. Users cannot self-assign roles, and public sign-up is disabled.
- **RLS on every table.** Anonymous users have no table access. Deactivated users fail every helper check, so they see nothing even with a live token.
- Privileged profile columns (`role`, `is_active`, `program_id`, `can_edit_activities`, `must_change_password`, `last_login_at`) are not updatable by clients (column grants). They change only through SECURITY DEFINER RPCs and Edge Functions.
- Program admins can edit their program profile, but a trigger blocks code, archive and delete changes unless the caller is a superadmin.
- **Audit log** triggers on profiles, memberships, programs, fiscal years and settings. Sign-ins are recorded as `LOGIN`.
- **Notifications** are written only by triggers and `notify()`, which clients cannot call. Users can only read, mark read or delete their own.

## User administration (Phase 2)

| Action                                                             | Who                                                         | Where it runs                                                                       |
| ------------------------------------------------------------------ | ----------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Create account                                                     | Superadmin (any role), Program admin (staff of own program) | `admin-users` Edge Function → `auth.admin.createUser`                          |
| Reset password (temporary or emailed link)                         | Same scope                                                  | `admin-users` Edge Function                                                       |
| Edit profile, toggle*can edit activities*, deactivate/reactivate | Same scope; role/program changes superadmin only            | `admin_update_user()` RPC                                                         |
| Force logout                                                       | Same scope                                                  | `admin_force_logout()` RPC: deletes sessions and rejects older tokens immediately |

Authorization lives in SQL (`can_admin_user()`), so the Edge Function and the RPCs enforce the same rules.
Both are covered by `tests/db/user-admin.test.ts`. New accounts always start with
`must_change_password = true`. Temporary passwords are shown once and never stored.

Run the function locally with `npx supabase functions serve admin-users`.
Deploy it with `npx supabase functions deploy admin-users`, then
`npx supabase secrets set ALLOWED_ORIGINS=https://<your-domain>`.

## Files & Document Repository (Phase 3)

Upload flow: the browser asks the `files` function for a ticket. The function checks `can_upload_attachment()`, validates type and size, and creates a *pending* row. The browser then PUTs the file **directly to R2** with a presigned URL (≤ 10 min). Finally the function HEADs the object and marks the row *ready*. Downloads use presigned GET URLs issued only after an RLS-checked read.

- Allowed types and max size come from Settings → System → File uploads. The hard cap is 25 MB.
- Object keys: `{PROGRAM|shared}/{year}/{attachment-id}/{safe-name}`. The bucket stays private.
- `<AttachmentsPanel entityType entityId programId canUpload />` attaches files to any record. Those files also appear in Documents under "Attached to records".
- Versions share a `version_group_id`. "Move to Trash" hides every version from staff, and admins can restore them.

R2 setup: a private bucket, a CORS rule allowing `GET, PUT, HEAD` from your app origins (header `content-type`, expose `ETag`), and an R2 API token with *Object Read & Write* on that bucket. The secrets go in `supabase/functions/.env` locally, or `supabase secrets set` in production:
`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `ALLOWED_ORIGINS`.

## Beneficiaries (Phase 4)

- **One shared registry.** An FA is often served by several programs, so every active user can read all records and duplicates are caught across programs. Each record belongs to its *registering program*: only that program's writers (admins, plus staff allowed to edit) or the superadmin can edit it, and only admins can move it to Trash.
- **Duplicate detection.** Names are normalized (`beneficiary_name_key`: drops "Farmers", "Association", "Inc." and similar) and compared with `pg_trgm`. The form warns while you type, and Excel imports flag matches with existing records and within the file.
- **Locations.** `<LocationSelect>` (Province → Municipality/City → Barangay) is used everywhere. A database trigger keeps barangay ⊂ municipality ⊂ province consistent.
- **Excel.** Download a template (with an Instructions sheet and the valid list values), then import: columns are mapped automatically, every row is validated, nothing saves until you confirm, and each batch of up to 500 rows saves all-or-nothing. Export gives the filtered list as `.xlsx`.
- **Map.** Records with coordinates appear on an OpenStreetMap layer. For heavy production traffic, switch to a tile provider with a usage agreement.

## Activities & workflow engine (Phase 5)

- **Templates.** The DA-wide *Default FOD Workflow* has the 11 standard stages, with Procurement sub-steps (PR → RFQ/Bidding → Evaluation → Award → PO). Program admins copy it and keep several named workflows per program (Settings → Workflow). Each stage has a phase, responsible role, expected days, required documents, required fields and a "can be skipped" flag.
- **Snapshots.** Creating an activity copies its workflow into `activity_stage_progress` and computes planned dates from the start date. Later template edits never change existing activities. An admin can apply a newer or different workflow per activity, and stages with matching names keep their status.
- **Stage moves** go through `activity_stage_action()` (start / complete / skip / reopen). It enforces order, permissions, fiscal-year locks, required fields, required checklist items and sub-steps, and logs every move. Required documents become checklist items, which tick automatically when a file of that document type is attached.
- **Delayed / overdue** is computed in the `v_activities` view (Asia/Manila calendar): an activity is overdue when its due date has passed, and delayed when it is overdue or its current stage is past its planned end.
- **Codes** are assigned per program and year (`HVC-2026-0001`).

## Comments, directives & notifications (Phase 6)

- **Comments** attach to activities, beneficiaries and directives (one level of replies, @mentions, edit/delete, live updates). Visibility is *program* (default), *admins only*, or *superadmin only*; replies inherit it, and mentions/notifications never leak a restricted thread.
- **Notes** are private, or shared with everyone who can see the record; they can be pinned.
- **Directives** are sent by program admins/superadmins to program members, who acknowledge and respond (optionally with a proposed date); the issuer closes or withdraws them. **Send Overdue Notice** (activity header / Discussion tab) is a directive pre-filled from Settings → System → Overdue notice template.
- **Notifications** go through `deliver()` (skips the actor, inactive users and muted types; de-duplicates). Users mute comment/mention/assignment/stage/deadline types under Notifications → Preferences; directives, overdue notices and escalations always arrive.
- **Daily sweep** `run_notification_sweep()` runs at 07:00 Asia/Manila via pg_cron (`payew-notification-sweep`): stage/checklist/directive reminders, and escalation of overdue activities and unanswered directives — level 1 the person responsible, level 2 + program admins, level 3 + superadmins (thresholds in Settings → System → Reminders & escalation). The superadmin can run it on demand from the Notifications page.

## Suppliers & procurement packages (Phase 6B · Addendum B)

- **Two workflow levels.** An activity runs its own lifecycle (Default FOD Workflow: design → approval → PPMP → *Procurement & Implementation* → liquidation → savings → closed). Each supplier/lot is a **package** with its own track (Default Package Workflow: specs → PR → solicitation → evaluation → award → delivery → inspection → ORS → DV → closed). Both run through the same engine (`activity_stage_progress.package_id`).
- **Derived progress.** The *Procurement & Implementation* stage completes automatically when every non-cancelled package is closed; a program admin may complete it earlier with a recorded justification.
- **Obligation order** is per package (after delivery & inspection, or at award before delivery) and can be switched until delivery starts.
- **Awards** go through `award_package` / `reaward_package`: blacklisted suppliers are blocked, suspended suppliers and expired PhilGEPS/permits warn, re-awards keep the previous supplier in `package_supplier_history`, contract changes need an admin and a reason. Savings = ABC − contract.
- **Suppliers** are shared by all programs (everyone reads; superadmins/program admins edit; only superadmins blacklist). Bank details and performance remarks are admin-only. The daily sweep warns admins 30 days before supplier papers expire.
- The classic 11-stage workflow stays available for single-supplier activities; existing activities keep it until switched.

## Finance (Phase 7)

- **Plans.** Finance → *WFP / PPMP / APP* opens one sheet per program and year in an Excel-like grid (arrow keys, type to edit, Ctrl+C/Ctrl+V with Excel, Shift-select, import/export .xlsx). Amount = qty × unit cost; rows whose monthly schedule doesn't add up to the amount are flagged. PPMP/APP rows can be tagged to a package. Draft → Submit → Approve (program admin); approved plans are read-only until reopened.
- **Allotments** (SARO/SAA, realignments ±, reversions −) are entered by program admins; obligations are checked against the allotment of their expense class.
- **Package Financial Tracker** (package → *Finance* tab): many ORS (optionally per delivery), many deliveries (partial, with items, DR/IAR, accepted/rejected), many DVs each charged to one or more ORS (staged payments, tax withheld, net). It shows obligated %, accepted %, paid %, unobligated balance, *obligated-but-undelivered* and *delivered-but-unpaid* (payables). The activity *Finance* tab rolls packages up (drill-down by package/supplier) and records activity-level expenses (honoraria, direct payments).
- **Validations** (`save_obligation`, `save_delivery`, `save_disbursement`): ORS ≤ contract (or ABC), ORS ≤ activity budget, ORS ≤ allotment, deliveries ≤ contract, DV ≤ unpaid ORS. Settings → *validation strictness* decides: **block** rejects, **warn** saves and records the warning on the record (shown as flags). Delivering before any ORS on an *obligate-first* package needs an exception remark. Paying beyond accepted deliveries is flagged as an advance payment.
- **Savings** = ABC − contract is suggested automatically on award (and re-suggested when the contract changes); program admins confirm or dismiss under Finance → *Savings*.
- **Reminders** (`run_finance_reminders`, pg_cron `payew-finance-reminders`): deliveries due tomorrow, late deliveries, and accepted deliveries unpaid for 7+ days.

## Approvals, progress & issues (Phase 8)

- **Requests** (`submit_approval`): staff submit them from the activity/package *Request* menu, *Request skip* on required stages, and *Request realignment* in Finance → Allotments. A delivery recorded before its ORS on an obligate-first package raises an *obligation-order exception* automatically.
- **Who decides** (`decide_approval`): program admins (or the superadmin) decide staff requests; the superadmin decides program admins' requests; nobody decides their own. Approving applies the change at once through the same RPCs as direct actions; rejecting needs a note. Requesters can withdraw pending requests.
- **Gates**: extending the due date of an *ongoing* activity or package needs an admin. With Settings → System → *Approvals & monitoring* → "Program admins need superadmin approval…", program admins' cancellations, re-awards, contract changes, extensions, workflow changes and realignments also go through requests.
- **Progress updates** record physical %, quantity and participants reached, a self-assessment (on track / at risk / delayed) and narrative; the obligated/disbursed amounts at that date are captured from the Financial Tracker.
- **Issues & risks**: any program member can raise one; owners, raisers and writers update it; high/critical ones notify program admins (critical: also the superadmin); resolving requires a resolution.
- **Reminders** (`run_monitoring_reminders`, pg_cron `payew-monitoring-reminders`): approvals waiting N days, overdue issues, and ongoing activities without a progress update in 30 days.

## Working against a hosted Supabase project

```bash
npx supabase login
npx supabase link --project-ref <project-ref>        # from the project URL
npx supabase db push --include-seed                  # migrations + DEV seed (omit --include-seed in production)
npx supabase secrets set --env-file supabase/functions/.env
npx supabase functions deploy admin-users files

# Load a module seed into an existing project (seeds/*.sql are safe to re-run):
npx supabase db query --linked -f supabase/seeds/02_beneficiaries.sql
npx supabase db query --linked -f supabase/seeds/03_activities.sql
npx supabase db query --linked -f supabase/seeds/04_collaboration.sql
npx supabase db query --linked -f supabase/seeds/05_suppliers_packages.sql
npx supabase db query --linked -f supabase/seeds/06_finance.sql
npx supabase db query --linked -f supabase/seeds/07_monitoring.sql
```

In Dashboard → Authentication → URL Configuration, set Site URL `http://localhost:5173` and add the redirect `http://localhost:5173/reset-password`.

## Deployment (summary; full guide in Phase 12)

1. Create a Supabase project, then run `npx supabase link` and `npx supabase db push`. Do **not** run `seed.sql` in production.
2. Auth → URL configuration: set the Site URL and add `https://<your-domain>/reset-password` as a redirect URL.
3. Cloudflare Pages: build command `npm run build`, output `dist`, env vars `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_APP_NAME`. Add a SPA fallback (`public/_redirects` → `/* /index.html 200`).
4. R2 keys and email API keys are **Edge Function secrets** (`supabase secrets set …`), never `VITE_*`.
