# PAYEW: Entity Relationship Design

Status legend: ✅ built (Phase 1) · 🔜 planned (phase number in brackets).

All program-scoped tables carry `program_id` (and `fiscal_year_id` where yearly), UUID PKs,
`created_at / updated_at / created_by`, soft delete via `deleted_at`, and RLS policies built on
`is_superadmin()`, `user_program_ids()`, `is_program_admin(program_id)`,
`has_program_access(program_id)` and `can_manage_program(program_id)`.

## 1. Identity, programs, master lists (✅ Phases 1–2)

```mermaid
erDiagram
  AUTH_USERS ||--|| PROFILES : "1:1 (trigger)"
  PROGRAMS ||--o{ PROGRAM_MEMBERSHIPS : has
  PROFILES ||--o{ PROGRAM_MEMBERSHIPS : "belongs to"
  PROGRAMS ||--o{ PROFILES : "primary program"
  PROVINCES ||--o{ MUNICIPALITIES : contains
  MUNICIPALITIES ||--o{ BARANGAYS : contains
  EXPENSE_CLASSES ||--o{ UACS_CODES : groups
  PROGRAMS ||--o{ ACTIVITY_CATEGORIES : "program-specific (nullable)"
  PROFILES ||--o{ NOTIFICATIONS : receives
  PROFILES ||--o{ AUDIT_LOGS : "actor"

  PROFILES {
    uuid id PK "= auth.users.id"
    text email
    text full_name
    app_role role "superadmin | program_admin | program_staff"
    uuid program_id FK "primary program"
    bool is_active
    bool can_edit_activities
    bool must_change_password
    timestamptz last_login_at
    timestamptz sessions_revoked_at "force logout"
  }
  PROGRAMS {
    uuid id PK
    text code UK "AMIA, APA, HVC, RICE, CORN"
    text name
    text color
    timestamptz archived_at
  }
  PROGRAM_MEMBERSHIPS {
    uuid program_id PK
    uuid user_id PK
  }
  FISCAL_YEARS {
    uuid id PK
    int year UK
    fiscal_year_status status "draft | open | closed | locked"
    bool is_current "max one"
  }
  NOTIFICATIONS {
    uuid id PK
    uuid user_id FK
    text type
    text link "deep link"
    bool is_read
  }
  AUDIT_LOGS {
    bigint id PK
    uuid actor_id
    text action "INSERT | UPDATE | DELETE | SOFT_DELETE | RESTORE | LOGIN"
    text table_name
    jsonb old_data
    jsonb new_data
    text_arr changed_fields
  }
```

Other Phase 1 tables: `fund_sources`, `commodities`, `units`, `beneficiary_types`, `app_settings` (key → jsonb).

## 2. Activities, workflow, beneficiaries (✅ Phases 4–5 · 🔜 progress/issues/procurement in 7–8)

```mermaid
erDiagram
  PROGRAMS ||--o{ WORKFLOW_TEMPLATES : "custom (program_id null = default)"
  WORKFLOW_TEMPLATES ||--o{ WORKFLOW_STAGES : ordered
  WORKFLOW_STAGES ||--o{ WORKFLOW_STAGES : "sub-steps (parent_id)"
  PROGRAMS ||--o{ ACTIVITIES : runs
  FISCAL_YEARS ||--o{ ACTIVITIES : "in"
  WORKFLOW_TEMPLATES ||--o{ ACTIVITIES : "selected workflow"
  ACTIVITIES ||--o{ ACTIVITY_STAGE_PROGRESS : "stage snapshot + planned/actual dates"
  ACTIVITY_STAGE_PROGRESS ||--o{ ACTIVITY_TASKS : checklist
  ACTIVITY_STAGE_PROGRESS ||--o{ ACTIVITY_STAGE_TRANSITIONS : "logged moves"
  ACTIVITIES ||--o{ ACTIVITY_BENEFICIARIES : serves
  BENEFICIARIES ||--o{ ACTIVITY_BENEFICIARIES : "receives (qty, amount, participants)"
  BENEFICIARIES ||--o| BENEFICIARY_MEMBERS_BREAKDOWN : "M/F/IP/Youth/PWD"
  ACTIVITIES ||--o{ PROGRESS_UPDATES : "physical %, narrative"
  ACTIVITIES ||--o{ ISSUES_RISKS : "logs"
  ACTIVITIES ||--o{ PROCUREMENTS : "PR → RFQ → Award → PO"

  ACTIVITIES {
    uuid id PK
    uuid program_id FK
    uuid fiscal_year_id FK
    uuid category_id FK
    uuid workflow_template_id FK
    uuid current_stage_id FK
    text status "not_started | ongoing | delayed | completed | cancelled"
    date start_date
    date end_date
    date due_date
    date delivery_date
    uuid responsible_user_id FK
    uuid province_id FK
    uuid municipality_id FK
    uuid barangay_id FK
    uuid fund_source_id FK
    numeric target_qty
    uuid unit_id FK
  }
  WORKFLOW_STAGES {
    uuid id PK
    uuid template_id FK
    int sort_order
    text name
    app_role responsible_role
    int expected_days
    jsonb required_documents
    jsonb required_fields
    bool skippable
  }
  BENEFICIARIES {
    uuid id PK
    text name
    uuid type_id FK
    text registration_no
    uuid barangay_id FK
    int members_total
    uuid_arr commodity_ids
    numeric area_ha
    point coordinates
  }
```

## 3. Finance (🔜 Phase 7)

```mermaid
erDiagram
  PROGRAMS ||--o{ FINANCE_DOCUMENTS : "PPMP | WFP | APP | OTHER"
  FINANCE_DOCUMENTS ||--o{ FINANCE_DOCUMENT_VERSIONS : versioned
  FINANCE_DOCUMENT_VERSIONS ||--o{ FINANCE_SHEETS : contains
  FINANCE_SHEETS ||--o{ FINANCE_ROWS : "ordered rows (cells jsonb)"
  FINANCE_ROWS }o--o| ACTIVITIES : "budget link"
  FINANCE_ROWS }o--o| UACS_CODES : tagged
  PROGRAMS ||--o{ BUDGET_ALLOCATIONS : "allotment per fund source / expense class"
  ACTIVITIES ||--o{ OBLIGATIONS : "ORS no., date, amount"
  OBLIGATIONS ||--o{ DISBURSEMENTS : "DV no., date, amount, payee"
  ACTIVITIES ||--o{ SAVINGS_REALIGNMENTS : "amount, reason, approval ref"

  FINANCE_ROWS {
    uuid id PK
    uuid sheet_id FK
    numeric sort_key "fractional index for drag reorder"
    jsonb cells "column_id → value/formula/format"
    uuid activity_id FK
    uuid uacs_code_id FK
    numeric amount "computed, feeds dashboard views"
  }
  OBLIGATIONS {
    uuid id PK
    uuid activity_id FK
    text ors_no
    date ors_date
    numeric amount "≥ 0, ≤ allotment (warn/block)"
  }
  DISBURSEMENTS {
    uuid id PK
    uuid obligation_id FK
    text dv_no
    date dv_date
    numeric amount "≤ obligation"
    text payee
  }
```

Grid design: sheet columns live in `finance_sheets.columns jsonb` (id, title, type, width, order);
each row stores its cells as jsonb keyed by column id. This keeps row/column drag-reorder cheap,
supports per-version snapshots, and lets SQL views sum the `amount` column for dashboards.

## 4. Collaboration & notifications (✅ Phase 6 · 🔜 approvals/announcements in 8, 11)

```mermaid
erDiagram
  PROFILES ||--o{ COMMENTS : authors
  COMMENTS ||--o{ COMMENTS : "replies (parent_id, 1 level)"
  PROFILES ||--o{ NOTES : "private | program"
  PROGRAMS ||--o{ DIRECTIVES : "directive | overdue_notice"
  DIRECTIVES ||--o{ DIRECTIVE_RECIPIENTS : "acknowledge / respond"
  PROFILES ||--o{ DIRECTIVE_RECIPIENTS : receives
  PROFILES ||--o{ NOTIFICATIONS : "deliver() + dedupe_key"
  PROGRAMS ||--o{ ATTACHMENTS : "R2 metadata (entity_type, entity_id)"

  COMMENTS {
    uuid id PK
    text entity_type "activity | beneficiary | directive (package in 6B)"
    uuid entity_id
    uuid program_id FK
    uuid parent_id FK
    text body
    uuid_array mentions
    text visibility "program | admins | superadmin"
    timestamptz edited_at
    timestamptz deleted_at
  }
  NOTES {
    uuid id PK
    text entity_type
    uuid entity_id
    text visibility "private | program"
    boolean is_pinned
  }
  DIRECTIVES {
    uuid id PK
    uuid program_id FK
    text kind "directive | overdue_notice"
    text priority "normal | high | urgent"
    text entity_type "activity | beneficiary"
    uuid entity_id
    date response_due
    text status "open | closed | withdrawn"
    int escalation_level
  }
  DIRECTIVE_RECIPIENTS {
    uuid directive_id PK
    uuid user_id PK
    text status "pending | acknowledged | responded"
    text response
    date proposed_date
  }
```

Also planned: `feedback`, `fiscal_year_rollovers`, plus views and RPCs for dashboard aggregates
(`v_program_budget_summary`, `v_activity_status_counts`, obligation aging, compliance scorecard)
and the `global_search` RPC.
