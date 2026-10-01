// Hand-maintained until the local stack runs; then regenerate with `npm run db:types`
// (supabase gen types typescript --local). Keep the shape identical to the generated file.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

type Timestamps = {
  created_at: string
  updated_at: string
  created_by: string | null
}

type MasterRow = Timestamps & {
  id: string
  name: string
  is_active: boolean
  deleted_at: string | null
}

type Table<Row, Required extends keyof Row = never> = {
  Row: Row
  Insert: Partial<Row> & Pick<Row, Required>
  Update: Partial<Row>
  Relationships: []
}

export type AppRole = 'superadmin' | 'program_admin' | 'program_staff'
export type FiscalYearStatus = 'draft' | 'open' | 'closed' | 'locked'

export type ProfileRow = Timestamps & {
  id: string
  email: string
  full_name: string
  role: AppRole
  program_id: string | null
  position: string | null
  office: string | null
  province_id: string | null
  contact_no: string | null
  avatar_key: string | null
  is_active: boolean
  can_edit_activities: boolean
  must_change_password: boolean
  last_login_at: string | null
  sessions_revoked_at: string | null
  notification_prefs: Json
  deleted_at: string | null
}

export type ProgramRow = Timestamps & {
  id: string
  code: string
  name: string
  description: string | null
  color: string
  archived_at: string | null
  deleted_at: string | null
}

export type FiscalYearRow = Timestamps & {
  id: string
  year: number
  label: string
  start_date: string
  end_date: string
  status: FiscalYearStatus
  is_current: boolean
}

export type ProgramMembershipRow = {
  program_id: string
  user_id: string
  created_at: string
  created_by: string | null
}

export type NotificationRow = {
  id: string
  user_id: string
  program_id: string | null
  type: string
  title: string
  body: string | null
  link: string | null
  entity_type: string | null
  entity_id: string | null
  is_read: boolean
  read_at: string | null
  created_at: string
  created_by: string | null
  dedupe_key: string | null
}

export type AppSettingRow = {
  key: string
  value: Json
  description: string | null
  updated_at: string
  updated_by: string | null
}

export type AuditLogRow = {
  id: number
  occurred_at: string
  actor_id: string | null
  action: string
  table_name: string
  record_id: string | null
  program_id: string | null
  old_data: Json | null
  new_data: Json | null
  changed_fields: string[] | null
}

export type ProvinceRow = MasterRow & {
  psgc_code: string | null
  is_city: boolean
  sort_order: number
}

export type MunicipalityRow = MasterRow & {
  province_id: string
  psgc_code: string | null
  is_city: boolean
}

export type BarangayRow = MasterRow & {
  municipality_id: string
  psgc_code: string | null
}

export type FundSourceRow = MasterRow & {
  code: string
  description: string | null
  sort_order: number
}

export type ExpenseClassRow = MasterRow & {
  code: string
  sort_order: number
}

export type UacsCodeRow = MasterRow & {
  expense_class_id: string
  code: string
}

export type CommodityRow = MasterRow & {
  category: string | null
}

export type UnitRow = MasterRow & {
  abbreviation: string | null
}

export type ActivityCategoryRow = MasterRow & {
  program_id: string | null
  description: string | null
}

export type BeneficiaryTypeRow = MasterRow & {
  code: string
}

export type DocumentTypeRow = MasterRow & {
  code: string
  sort_order: number
}

export type AttachmentRow = {
  id: string
  program_id: string | null
  fiscal_year_id: string | null
  entity_type: string
  entity_id: string | null
  document_type_id: string | null
  folder: string | null
  tags: string[]
  description: string | null
  file_name: string
  r2_key: string
  mime_type: string
  size_bytes: number
  status: 'pending' | 'ready'
  version_group_id: string
  version: number
  is_latest: boolean
  uploaded_by: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
  deleted_by: string | null
}

export type BeneficiaryStatus = 'active' | 'inactive' | 'dissolved'

export type BeneficiaryRow = {
  id: string
  registered_by_program_id: string | null
  type_id: string
  name: string
  name_key: string
  registration_no: string | null
  registration_agency: string | null
  province_id: string
  municipality_id: string | null
  barangay_id: string | null
  address_line: string | null
  contact_person: string | null
  contact_no: string | null
  email: string | null
  members_male: number
  members_female: number
  members_total: number
  members_ip: number
  members_youth: number
  members_pwd: number
  members_senior: number
  area_ha: number | null
  status: BeneficiaryStatus
  latitude: number | null
  longitude: number | null
  remarks: string | null
  created_at: string
  updated_at: string
  created_by: string | null
  deleted_at: string | null
  deleted_by: string | null
}

export type BeneficiaryCommodityRow = { beneficiary_id: string; commodity_id: string }

export type SimilarBeneficiary = {
  id: string
  name: string
  province_id: string
  municipality_id: string | null
  registration_no: string | null
  similarity: number
  same_municipality: boolean
}

export type PhaseKey =
  | 'design'
  | 'approval'
  | 'budget'
  | 'procurement'
  | 'delivery'
  | 'inspection'
  | 'obligation'
  | 'disbursement'
  | 'liquidation'
  | 'savings'
  | 'closed'
  | 'other'

export type WorkflowScope = 'activity' | 'package'

export type WorkflowTemplateRow = {
  id: string
  program_id: string | null
  scope: WorkflowScope
  name: string
  description: string | null
  is_default: boolean
  is_active: boolean
  copied_from_id: string | null
  created_at: string
  updated_at: string
  created_by: string | null
}

export type WorkflowStageRow = {
  id: string
  template_id: string
  parent_id: string | null
  sort_order: number
  name: string
  description: string | null
  phase_key: PhaseKey
  responsible_role: AppRole | null
  expected_days: number
  required_documents: string[]
  required_fields: string[]
  skippable: boolean
  tracks_packages: boolean
  created_at: string
  updated_at: string
}

export type ActivityStatus = 'not_started' | 'ongoing' | 'completed' | 'cancelled'
export type DisplayStatus = ActivityStatus | 'delayed'

export type ActivityRow = {
  id: string
  program_id: string
  fiscal_year_id: string
  code: string
  title: string
  description: string | null
  category_id: string | null
  objectives: string | null
  target_output: string | null
  target_outcome: string | null
  target_quantity: number | null
  unit_id: string | null
  province_id: string | null
  municipality_id: string | null
  barangay_id: string | null
  venue: string | null
  start_date: string | null
  end_date: string | null
  due_date: string | null
  delivery_date: string | null
  responsible_user_id: string | null
  responsible_unit: string | null
  budget_amount: number | null
  fund_source_id: string | null
  workflow_template_id: string | null
  current_stage_id: string | null
  status: ActivityStatus
  cancelled_reason: string | null
  completed_at: string | null
  remarks: string | null
  created_at: string
  updated_at: string
  created_by: string | null
  deleted_at: string | null
  deleted_by: string | null
}

export type ActivityView = ActivityRow & {
  current_stage_name: string | null
  current_phase: PhaseKey | null
  current_stage_status: StageStatus | null
  current_stage_due: string | null
  is_overdue: boolean
  days_overdue: number
  stage_overdue: boolean
  stage_days_late: number
  display_status: DisplayStatus
  stages_done: number
  stages_total: number
  beneficiaries_count: number
  participants_total: number
  packages_total: number
  packages_closed: number
  packages_cancelled: number
  packages_overdue: number
  packages_abc_total: number
  packages_contract_total: number
  current_stage_tracks_packages: boolean | null
}

export type StageStatus = 'pending' | 'in_progress' | 'completed' | 'skipped'

export type StageProgressRow = {
  id: string
  activity_id: string
  program_id: string
  package_id: string | null
  tracks_packages: boolean
  template_stage_id: string | null
  parent_id: string | null
  sort_order: number
  name: string
  description: string | null
  phase_key: PhaseKey
  responsible_role: AppRole | null
  expected_days: number
  required_documents: string[]
  required_fields: string[]
  skippable: boolean
  status: StageStatus
  planned_start: string | null
  planned_end: string | null
  actual_start: string | null
  actual_end: string | null
  assigned_to: string | null
  notes: string | null
  completed_by: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

export type StageTransitionRow = {
  id: string
  activity_id: string
  program_id: string
  package_id: string | null
  stage_id: string | null
  stage_name: string
  action:
    | 'start'
    | 'complete'
    | 'skip'
    | 'reopen'
    | 'migrate'
    | 'cancel'
    | 'uncancel'
    | 'award'
    | 're_award'
    | 'contract_change'
    | 'split'
    | 'merge'
    | 'reorder'
  from_status: string | null
  to_status: string | null
  note: string | null
  effective_date: string | null
  created_by: string | null
  created_at: string
}

export type ActivityTaskRow = {
  id: string
  activity_id: string
  program_id: string
  package_id: string | null
  stage_progress_id: string | null
  title: string
  is_required: boolean
  is_auto: boolean
  doc_type_code: string | null
  is_done: boolean
  done_by: string | null
  done_at: string | null
  due_date: string | null
  assigned_to: string | null
  sort_order: number
  created_by: string | null
  created_at: string
  updated_at: string
}

export type ActivityBeneficiaryRow = {
  activity_id: string
  beneficiary_id: string
  program_id: string
  participants: number | null
  quantity: number | null
  unit_id: string | null
  amount: number | null
  remarks: string | null
  created_at: string
  created_by: string | null
}

export type HistoryEntry = {
  occurred_at: string
  actor_id: string | null
  action: string
  table_name: string
  changed_fields: string[] | null
  old_data: Json | null
  new_data: Json | null
}

export type CommentEntity = 'activity' | 'package' | 'beneficiary' | 'supplier' | 'directive'
export type CommentVisibility = 'program' | 'admins' | 'superadmin'

export type CommentRow = {
  id: string
  entity_type: CommentEntity
  entity_id: string
  program_id: string | null
  parent_id: string | null
  body: string
  mentions: string[]
  visibility: CommentVisibility
  author_id: string | null
  edited_at: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
  deleted_by: string | null
}

export type NoteVisibility = 'private' | 'program'

export type NoteRow = {
  id: string
  entity_type: 'activity' | 'package' | 'beneficiary' | 'supplier'
  entity_id: string
  program_id: string | null
  visibility: NoteVisibility
  body: string
  is_pinned: boolean
  author_id: string | null
  created_at: string
  updated_at: string
}

export type DirectiveKind = 'directive' | 'overdue_notice'
export type DirectivePriority = 'normal' | 'high' | 'urgent'
export type DirectiveStatus = 'open' | 'closed' | 'withdrawn'
export type RecipientStatus = 'pending' | 'acknowledged' | 'responded'

export type DirectiveRow = {
  id: string
  program_id: string
  kind: DirectiveKind
  title: string
  body: string
  priority: DirectivePriority
  entity_type: 'activity' | 'package' | 'beneficiary' | null
  entity_id: string | null
  response_due: string | null
  status: DirectiveStatus
  issued_by: string | null
  issued_at: string
  closed_at: string | null
  closed_by: string | null
  close_note: string | null
  escalation_level: number
  last_escalated_at: string | null
  created_at: string
  updated_at: string
}

export type DirectiveView = DirectiveRow & {
  recipients_total: number
  acknowledged_count: number
  responded_count: number
  my_status: RecipientStatus | null
  is_overdue: boolean
  entity_code: string | null
  entity_label: string | null
}

export type DirectiveRecipientRow = {
  directive_id: string
  user_id: string
  program_id: string
  status: RecipientStatus
  acknowledged_at: string | null
  responded_at: string | null
  response: string | null
  proposed_date: string | null
  created_at: string
  updated_at: string
}

export type OverdueNoticeDraft = {
  title: string
  body: string
  response_due: string
  days_overdue: number
  recipients: string[]
}

// ---------------------------------------------------------------------------
// Suppliers & procurement packages (Addendum B)
// ---------------------------------------------------------------------------
export type ProcurementCategoryRow = MasterRow & {
  code: string
  description: string | null
  default_expense_class_id: string | null
  default_uacs_code_id: string | null
  sort_order: number
}

export type ProcurementModeRow = MasterRow & {
  code: string
  description: string | null
  sort_order: number
}

export type SupplierType =
  | 'individual'
  | 'partnership'
  | 'corporation'
  | 'cooperative'
  | 'government'
  | 'other'
export type SupplierStatus = 'active' | 'suspended' | 'blacklisted'

export type SupplierRow = {
  id: string
  business_name: string
  trade_name: string | null
  name_key: string
  owner_name: string | null
  supplier_type: SupplierType
  tin: string | null
  tin_key: string | null
  philgeps_no: string | null
  philgeps_expiry: string | null
  permit_no: string | null
  permit_expiry: string | null
  province_id: string | null
  municipality_id: string | null
  barangay_id: string | null
  address_line: string | null
  contact_person: string | null
  contact_no: string | null
  email: string | null
  categories: string[]
  status: SupplierStatus
  status_reason: string | null
  notes: string | null
  created_at: string
  updated_at: string
  created_by: string | null
  deleted_at: string | null
  deleted_by: string | null
}

export type SupplierView = SupplierRow & {
  packages_count: number
  open_packages: number
  awarded_total: number
  last_award_date: string | null
  expired_docs: number
  expiring_docs: number
  next_expiry: string | null
}

export type SupplierDocType =
  | 'philgeps'
  | 'business_permit'
  | 'bir_2303'
  | 'dti_sec_cda'
  | 'tax_clearance'
  | 'omnibus_sworn'
  | 'audited_fs'
  | 'other'

export type SupplierDocumentRow = {
  id: string
  supplier_id: string
  doc_type: SupplierDocType
  doc_no: string | null
  issued_on: string | null
  expires_on: string | null
  remarks: string | null
  attachment_id: string | null
  created_at: string
  updated_at: string
  created_by: string | null
}

export type SupplierBankAccountRow = {
  supplier_id: string
  bank_name: string
  branch: string | null
  account_name: string
  account_no: string
  updated_at: string
  updated_by: string | null
}

export type SupplierRatingRow = {
  id: string
  supplier_id: string
  package_id: string
  program_id: string
  rating: number | null
  remark: string
  created_by: string | null
  created_at: string
}

export type SimilarSupplier = {
  id: string
  business_name: string
  tin: string | null
  status: SupplierStatus
  similarity: number
  same_tin: boolean
}

export type AwardCheck = { level: 'block' | 'warn'; message: string }

export type PackageStatus = 'not_started' | 'ongoing' | 'closed' | 'cancelled'
export type PackageDisplayStatus = PackageStatus | 'delayed'
export type ObligationTiming = 'after_delivery' | 'before_delivery'

export type PackageRow = {
  id: string
  activity_id: string
  program_id: string
  fiscal_year_id: string
  package_no: number
  code: string
  title: string
  description: string | null
  category_id: string | null
  procurement_mode_id: string | null
  expense_class_id: string | null
  uacs_code_id: string | null
  supplier_id: string | null
  abc_amount: number
  contract_amount: number | null
  savings_amount: number | null
  award_date: string | null
  contract_no: string | null
  obligation_timing: ObligationTiming
  status: PackageStatus
  current_stage_id: string | null
  workflow_template_id: string | null
  responsible_user_id: string | null
  start_date: string | null
  due_date: string | null
  closed_at: string | null
  cancelled_reason: string | null
  remarks: string | null
  created_at: string
  updated_at: string
  created_by: string | null
  deleted_at: string | null
  deleted_by: string | null
}

export type PackageView = PackageRow & {
  activity_code: string
  activity_title: string
  supplier_name: string | null
  supplier_status: SupplierStatus | null
  category_code: string | null
  category_name: string | null
  procurement_mode_name: string | null
  current_stage_name: string | null
  current_phase: PhaseKey | null
  current_stage_status: StageStatus | null
  current_stage_due: string | null
  stages_done: number
  stages_total: number
  planned_start: string | null
  planned_end: string | null
  is_overdue: boolean
  days_overdue: number
  stage_overdue: boolean
  stage_days_late: number
  display_status: PackageDisplayStatus
}

export type PackageSupplierHistoryRow = {
  id: string
  package_id: string
  activity_id: string
  program_id: string
  supplier_id: string | null
  action: 'award' | 're_award' | 'contract_change'
  contract_amount: number | null
  previous_amount: number | null
  award_date: string | null
  reason: string | null
  created_by: string | null
  created_at: string
}

// ---------------------------------------------------------------------------
// Finance (Phase 7)
// ---------------------------------------------------------------------------
export type PlanType = 'WFP' | 'PPMP' | 'APP'
export type PlanStatus = 'draft' | 'submitted' | 'approved'

export type FinancePlanRow = {
  id: string
  program_id: string
  fiscal_year_id: string
  plan_type: PlanType
  status: PlanStatus
  submitted_at: string | null
  submitted_by: string | null
  approved_at: string | null
  approved_by: string | null
  remarks: string | null
  created_at: string
  updated_at: string
  created_by: string | null
}

export const MONTH_KEYS = [
  'm01',
  'm02',
  'm03',
  'm04',
  'm05',
  'm06',
  'm07',
  'm08',
  'm09',
  'm10',
  'm11',
  'm12',
] as const
export type MonthKey = (typeof MONTH_KEYS)[number]

export type FinancePlanLine = {
  id: string
  plan_id: string
  program_id: string
  fiscal_year_id: string
  sort_order: number
  activity_id: string | null
  package_id: string | null
  description: string
  expense_class_id: string | null
  uacs_code_id: string | null
  fund_source_id: string | null
  procurement_mode_id: string | null
  unit_id: string | null
  quantity: number | null
  unit_cost: number | null
  amount: number
  remarks: string | null
  created_at: string
  updated_at: string
} & Record<MonthKey, number>

export type AllotmentKind = 'saro' | 'sub_allotment' | 'realignment' | 'reversion'

export type AllotmentRow = {
  id: string
  program_id: string
  fiscal_year_id: string
  kind: AllotmentKind
  allotment_no: string | null
  allotment_date: string
  fund_source_id: string | null
  expense_class_id: string
  uacs_code_id: string | null
  amount: number
  remarks: string | null
  created_at: string
  updated_at: string
  created_by: string | null
  deleted_at: string | null
}

export type DeliveryStatus = 'scheduled' | 'delivered' | 'partial' | 'accepted' | 'rejected'

export type DeliveryRow = {
  id: string
  package_id: string
  activity_id: string
  program_id: string
  fiscal_year_id: string
  delivery_no: number
  status: DeliveryStatus
  scheduled_date: string | null
  delivery_date: string | null
  accepted_date: string | null
  dr_no: string | null
  iar_no: string | null
  amount: number
  remarks: string | null
  exception_remark: string | null
  flags: string[]
  created_at: string
  updated_at: string
  created_by: string | null
}

export type DeliveryItemRow = {
  id: string
  delivery_id: string
  sort_order: number
  description: string
  quantity: number
  unit_id: string | null
  unit_cost: number
  amount: number
}

export type FinanceRecordStatus = 'active' | 'cancelled'

export type ObligationRow = {
  id: string
  program_id: string
  fiscal_year_id: string
  activity_id: string
  package_id: string | null
  delivery_id: string | null
  ors_no: string
  ors_date: string
  amount: number
  fund_source_id: string | null
  expense_class_id: string | null
  uacs_code_id: string | null
  payee_supplier_id: string | null
  payee_name: string | null
  particulars: string | null
  status: FinanceRecordStatus
  cancelled_reason: string | null
  flags: string[]
  created_at: string
  updated_at: string
  created_by: string | null
}

export type DisbursementRow = {
  id: string
  program_id: string
  fiscal_year_id: string
  activity_id: string
  package_id: string | null
  dv_no: string
  dv_date: string
  gross_amount: number
  tax_withheld: number
  other_deductions: number
  net_amount: number
  payee_supplier_id: string | null
  payee_name: string | null
  check_ada_no: string | null
  particulars: string | null
  status: FinanceRecordStatus
  cancelled_reason: string | null
  flags: string[]
  created_at: string
  updated_at: string
  created_by: string | null
}

export type DisbursementLinkRow = {
  disbursement_id: string
  obligation_id: string
  program_id: string
  amount: number
}

export type SavingsStatus = 'suggested' | 'confirmed' | 'dismissed'

export type SavingsEntryRow = {
  id: string
  program_id: string
  fiscal_year_id: string
  activity_id: string
  package_id: string | null
  source: 'procurement' | 'unutilized' | 'realignment'
  amount: number
  status: SavingsStatus
  decided_by: string | null
  decided_at: string | null
  remarks: string | null
  created_at: string
  updated_at: string
}

export type PackageFinance = {
  package_id: string
  activity_id: string
  program_id: string
  fiscal_year_id: string
  code: string
  title: string
  status: PackageStatus
  supplier_id: string | null
  category_id: string | null
  obligation_timing: ObligationTiming
  abc_amount: number
  contract_amount: number | null
  ceiling: number
  obligated: number
  delivered: number
  accepted: number
  disbursed: number
  disbursed_net: number
  unobligated_balance: number
  obligated_undelivered: number
  delivered_unpaid: number
  unpaid_obligations: number
  obligated_pct: number | null
  delivered_pct: number | null
  paid_pct: number | null
  flagged_records: number
  oldest_unpaid_acceptance: string | null
}

export type PayableRow = PackageFinance & {
  activity_code: string
  activity_title: string
  supplier_name: string | null
  days_outstanding: number
}

export type ActivityFinance = {
  activity_id: string
  program_id: string
  fiscal_year_id: string
  code: string
  title: string
  budget_amount: number | null
  packages_abc: number
  packages_contract: number
  obligated_packages: number
  obligated_direct: number
  obligated: number
  disbursed: number
  disbursed_direct: number
  accepted: number
  unobligated: number
  payables: number
  utilization_pct: number | null
  savings_confirmed: number
  savings_suggested: number
}

export type ProgramFinance = {
  program_id: string
  fiscal_year_id: string
  expense_class_id: string
  expense_class_code: string
  allotted: number
  planned: number
  obligated: number
  disbursed: number
}

export type SaveResult = { id: string; warnings: string[] }

// ---------------------------------------------------------------------------
// Approvals, progress, issues (Phase 8)
// ---------------------------------------------------------------------------
export type ApprovalType =
  | 'cancellation'
  | 'extension'
  | 'stage_skip'
  | 'workflow_change'
  | 'supplier_reaward'
  | 'contract_variation'
  | 'obligation_exception'
  | 'realignment'
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn'
export type ApprovalEntity = 'activity' | 'package' | 'delivery' | 'program'

export type ApprovalRequestRow = {
  id: string
  program_id: string
  fiscal_year_id: string
  request_type: ApprovalType
  entity_type: ApprovalEntity
  entity_id: string
  activity_id: string | null
  package_id: string | null
  title: string
  justification: string
  payload: Json
  status: ApprovalStatus
  requested_by: string | null
  requested_at: string
  decided_by: string | null
  decided_at: string | null
  decision_note: string | null
  created_at: string
  updated_at: string
}

export type ApprovalView = ApprovalRequestRow & {
  activity_code: string | null
  activity_title: string | null
  package_code: string | null
  package_title: string | null
  can_decide: boolean
  can_withdraw: boolean
}

export type ProgressFlag = 'on_track' | 'at_risk' | 'delayed'

export type ProgressUpdateRow = {
  id: string
  activity_id: string
  program_id: string
  fiscal_year_id: string
  as_of_date: string
  physical_pct: number
  quantity_accomplished: number | null
  participants_male: number | null
  participants_female: number | null
  status_flag: ProgressFlag
  narrative: string
  next_steps: string | null
  obligated_snapshot: number | null
  disbursed_snapshot: number | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type IssueKind = 'issue' | 'risk'
export type IssueSeverity = 'low' | 'medium' | 'high' | 'critical'
export type IssueStatus = 'open' | 'mitigating' | 'resolved' | 'accepted' | 'closed'
export type IssueCategory =
  | 'procurement'
  | 'supplier'
  | 'budget'
  | 'weather'
  | 'beneficiaries'
  | 'logistics'
  | 'peace_and_order'
  | 'personnel'
  | 'other'

export type IssueRow = {
  id: string
  activity_id: string
  package_id: string | null
  program_id: string
  fiscal_year_id: string
  kind: IssueKind
  title: string
  description: string | null
  category: IssueCategory
  severity: IssueSeverity
  likelihood: 'low' | 'medium' | 'high' | null
  status: IssueStatus
  owner_id: string | null
  due_date: string | null
  mitigation: string | null
  resolution: string | null
  resolved_at: string | null
  raised_by: string | null
  created_at: string
  updated_at: string
}

export type IssueView = IssueRow & {
  activity_code: string
  activity_title: string
  package_code: string | null
  is_overdue: boolean
  risk_score: number
}

export type Database = {
  public: {
    Tables: {
      profiles: Table<ProfileRow, 'id' | 'email'>
      programs: Table<ProgramRow, 'code' | 'name'>
      fiscal_years: Table<FiscalYearRow, 'year' | 'label' | 'start_date' | 'end_date'>
      program_memberships: Table<ProgramMembershipRow, 'program_id' | 'user_id'>
      notifications: Table<NotificationRow, 'user_id' | 'type' | 'title'>
      app_settings: Table<AppSettingRow, 'key' | 'value'>
      audit_logs: Table<AuditLogRow, 'action' | 'table_name'>
      provinces: Table<ProvinceRow, 'name'>
      municipalities: Table<MunicipalityRow, 'name' | 'province_id'>
      barangays: Table<BarangayRow, 'name' | 'municipality_id'>
      fund_sources: Table<FundSourceRow, 'code' | 'name'>
      expense_classes: Table<ExpenseClassRow, 'code' | 'name'>
      uacs_codes: Table<UacsCodeRow, 'code' | 'name' | 'expense_class_id'>
      commodities: Table<CommodityRow, 'name'>
      units: Table<UnitRow, 'name'>
      activity_categories: Table<ActivityCategoryRow, 'name'>
      beneficiary_types: Table<BeneficiaryTypeRow, 'code' | 'name'>
      document_types: Table<DocumentTypeRow, 'code' | 'name'>
      beneficiaries: Table<
        BeneficiaryRow,
        'type_id' | 'name' | 'province_id'
      > & { Insert: { name_key?: never; members_total?: never } }
      beneficiary_commodities: Table<BeneficiaryCommodityRow, 'beneficiary_id' | 'commodity_id'>
      workflow_templates: Table<WorkflowTemplateRow, 'name'>
      workflow_stages: Table<WorkflowStageRow, 'template_id' | 'sort_order' | 'name'>
      activities: Table<ActivityRow, 'program_id' | 'fiscal_year_id' | 'title'>
      activity_stage_progress: Table<StageProgressRow, 'activity_id' | 'sort_order' | 'name'>
      activity_stage_transitions: Table<StageTransitionRow, 'activity_id' | 'stage_name' | 'action'>
      activity_tasks: Table<ActivityTaskRow, 'activity_id' | 'title'>
      activity_beneficiaries: Table<ActivityBeneficiaryRow, 'activity_id' | 'beneficiary_id'>
      attachments: Table<
        AttachmentRow,
        'file_name' | 'r2_key' | 'mime_type' | 'size_bytes' | 'version_group_id'
      >
      procurement_categories: Table<ProcurementCategoryRow, 'code' | 'name'>
      procurement_modes: Table<ProcurementModeRow, 'code' | 'name'>
      suppliers: Table<SupplierRow, 'business_name'> & {
        Insert: { name_key?: never; tin_key?: never }
      }
      supplier_documents: Table<SupplierDocumentRow, 'supplier_id' | 'doc_type'>
      supplier_bank_accounts: Table<
        SupplierBankAccountRow,
        'supplier_id' | 'bank_name' | 'account_name' | 'account_no'
      >
      supplier_ratings: Table<SupplierRatingRow, 'package_id' | 'remark'>
      procurement_packages: Table<PackageRow, 'activity_id' | 'title'> & {
        Insert: { savings_amount?: never }
      }
      package_supplier_history: Table<PackageSupplierHistoryRow, 'package_id' | 'action'>
      finance_plans: Table<FinancePlanRow, 'program_id' | 'fiscal_year_id' | 'plan_type'>
      finance_plan_rows: Table<FinancePlanLine, 'plan_id' | 'description'>
      allotments: Table<
        AllotmentRow,
        'program_id' | 'fiscal_year_id' | 'allotment_date' | 'expense_class_id' | 'amount'
      >
      package_deliveries: Table<DeliveryRow, 'package_id'>
      package_delivery_items: Table<DeliveryItemRow, 'delivery_id' | 'description' | 'quantity'>
      obligations: Table<ObligationRow, 'activity_id' | 'ors_no' | 'ors_date' | 'amount'>
      disbursements: Table<DisbursementRow, 'activity_id' | 'dv_no' | 'dv_date' | 'gross_amount'>
      disbursement_obligations: Table<DisbursementLinkRow, 'disbursement_id' | 'obligation_id'>
      savings_entries: Table<SavingsEntryRow, 'activity_id' | 'source' | 'amount'>
      approval_requests: Table<
        ApprovalRequestRow,
        'program_id' | 'fiscal_year_id' | 'request_type' | 'entity_type' | 'entity_id' | 'title' | 'justification'
      >
      progress_updates: Table<ProgressUpdateRow, 'activity_id' | 'as_of_date' | 'physical_pct' | 'narrative'>
      issues: Table<IssueRow, 'activity_id' | 'title'>
      comments: Table<CommentRow, 'entity_type' | 'entity_id' | 'body'>
      notes: Table<NoteRow, 'entity_type' | 'entity_id' | 'body'>
      directives: Table<DirectiveRow, 'program_id' | 'title' | 'body'>
      directive_recipients: Table<DirectiveRecipientRow, 'directive_id' | 'user_id' | 'program_id'>
    }
    Views: {
      v_activities: { Row: ActivityView; Relationships: [] }
      v_directives: { Row: DirectiveView; Relationships: [] }
      v_packages: { Row: PackageView; Relationships: [] }
      v_suppliers: { Row: SupplierView; Relationships: [] }
      v_package_financial_summary: { Row: PackageFinance; Relationships: [] }
      v_activity_financials: { Row: ActivityFinance; Relationships: [] }
      v_program_finance: { Row: ProgramFinance; Relationships: [] }
      v_payables: { Row: PayableRow; Relationships: [] }
      v_approval_requests: { Row: ApprovalView; Relationships: [] }
      v_activity_progress: { Row: ProgressUpdateRow; Relationships: [] }
      v_issues: { Row: IssueView; Relationships: [] }
    }
    Functions: {
      record_login: { Args: Record<string, never>; Returns: ProfileRow }
      complete_password_change: { Args: Record<string, never>; Returns: undefined }
      mark_all_notifications_read: { Args: Record<string, never>; Returns: number }
      is_superadmin: { Args: Record<string, never>; Returns: boolean }
      current_user_role: { Args: Record<string, never>; Returns: AppRole | null }
      is_program_admin: { Args: { p_program_id: string }; Returns: boolean }
      can_admin_user: { Args: { p_user_id: string }; Returns: boolean }
      admin_update_user: { Args: { p_user_id: string; p_changes: Json }; Returns: ProfileRow }
      admin_force_logout: { Args: { p_user_id: string }; Returns: undefined }
      set_current_fiscal_year: { Args: { p_fiscal_year_id: string }; Returns: undefined }
      can_write_program: { Args: { p_program_id: string }; Returns: boolean }
      activity_stage_action: {
        Args: { p_stage_id: string; p_action: string; p_note?: string | null; p_date?: string | null }
        Returns: StageProgressRow
      }
      set_activity_cancelled: {
        Args: { p_activity_id: string; p_cancelled: boolean; p_reason?: string | null }
        Returns: undefined
      }
      apply_workflow_to_activity: { Args: { p_activity_id: string; p_template_id: string }; Returns: undefined }
      create_workflow_template: {
        Args: {
          p_program_id: string | null
          p_name: string
          p_copy_from?: string | null
          p_scope?: WorkflowScope
        }
        Returns: string
      }
      save_workflow_template: {
        Args: { p_template_id: string; p_name: string; p_description: string | null; p_stages: Json }
        Returns: undefined
      }
      set_default_workflow_template: { Args: { p_template_id: string }; Returns: undefined }
      activity_history: { Args: { p_activity_id: string }; Returns: HistoryEntry[] }
      can_edit_beneficiary: { Args: { p_beneficiary_id: string }; Returns: boolean }
      find_similar_beneficiaries: {
        Args: {
          p_name: string
          p_municipality_id?: string | null
          p_exclude_id?: string | null
          p_limit?: number
        }
        Returns: SimilarBeneficiary[]
      }
      match_beneficiaries: {
        Args: { p_rows: Json }
        Returns: { idx: number; id: string; name: string; similarity: number; same_municipality: boolean }[]
      }
      import_beneficiaries: { Args: { p_program_id: string | null; p_rows: Json }; Returns: number }
      can_upload_attachment: {
        Args: { p_program_id: string | null; p_entity_type: string; p_entity_id: string | null }
        Returns: boolean
      }
      issue_directive: {
        Args: {
          p_program_id: string
          p_title: string
          p_body: string
          p_recipients: string[]
          p_response_due?: string | null
          p_priority?: DirectivePriority
          p_entity_type?: string | null
          p_entity_id?: string | null
          p_kind?: DirectiveKind
        }
        Returns: string
      }
      overdue_notice_draft: { Args: { p_activity_id: string }; Returns: OverdueNoticeDraft }
      send_overdue_notice: {
        Args: {
          p_activity_id: string
          p_recipients: string[]
          p_title?: string | null
          p_body?: string | null
          p_response_due?: string | null
          p_priority?: DirectivePriority
        }
        Returns: string
      }
      acknowledge_directive: { Args: { p_directive_id: string }; Returns: undefined }
      respond_to_directive: {
        Args: { p_directive_id: string; p_response: string; p_proposed_date?: string | null }
        Returns: undefined
      }
      close_directive: {
        Args: { p_directive_id: string; p_note?: string | null; p_withdraw?: boolean }
        Returns: undefined
      }
      run_notification_sweep: { Args: { p_today?: string | null }; Returns: Json }
      mutable_notification_types: { Args: Record<string, never>; Returns: string[] }
      can_manage_suppliers: { Args: Record<string, never>; Returns: boolean }
      save_obligation: { Args: { p: Json }; Returns: SaveResult }
      cancel_obligation: { Args: { p_id: string; p_reason: string }; Returns: undefined }
      save_delivery: { Args: { p: Json; p_items?: Json }; Returns: SaveResult }
      delete_delivery: { Args: { p_id: string }; Returns: undefined }
      save_disbursement: { Args: { p: Json; p_links: Json }; Returns: SaveResult }
      cancel_disbursement: { Args: { p_id: string; p_reason: string }; Returns: undefined }
      ensure_finance_plan: {
        Args: { p_program_id: string; p_fiscal_year_id: string; p_plan_type: PlanType }
        Returns: string | null
      }
      save_plan_rows: { Args: { p_plan_id: string; p_rows: Json }; Returns: number }
      set_plan_status: {
        Args: { p_plan_id: string; p_status: PlanStatus; p_remarks?: string | null }
        Returns: undefined
      }
      decide_savings: {
        Args: { p_id: string; p_status: SavingsStatus; p_remarks?: string | null }
        Returns: undefined
      }
      run_finance_reminders: { Args: { p_today?: string | null }; Returns: Json }
      run_monitoring_reminders: { Args: { p_today?: string | null }; Returns: Json }
      submit_approval: {
        Args: {
          p_type: ApprovalType
          p_entity_type: ApprovalEntity
          p_entity_id: string
          p_justification: string
          p_payload?: Json
          p_fiscal_year_id?: string | null
        }
        Returns: string
      }
      withdraw_approval: { Args: { p_id: string }; Returns: undefined }
      decide_approval: {
        Args: { p_id: string; p_decision: 'approved' | 'rejected'; p_note?: string | null }
        Returns: undefined
      }
      can_decide_approval: { Args: { p_id: string }; Returns: boolean }
      find_similar_suppliers: {
        Args: {
          p_name: string
          p_tin?: string | null
          p_exclude_id?: string | null
          p_limit?: number
        }
        Returns: SimilarSupplier[]
      }
      supplier_award_check: {
        Args: { p_supplier_id: string; p_on?: string | null }
        Returns: AwardCheck[]
      }
      import_suppliers: { Args: { p_rows: Json }; Returns: number }
      award_package: {
        Args: {
          p_package_id: string
          p_supplier_id: string
          p_contract_amount: number
          p_award_date?: string | null
          p_contract_no?: string | null
          p_procurement_mode_id?: string | null
          p_reason?: string | null
        }
        Returns: AwardCheck[]
      }
      reaward_package: {
        Args: {
          p_package_id: string
          p_supplier_id: string
          p_contract_amount: number
          p_reason: string
          p_award_date?: string | null
          p_contract_no?: string | null
        }
        Returns: AwardCheck[]
      }
      set_package_cancelled: {
        Args: { p_package_id: string; p_cancelled: boolean; p_reason?: string | null }
        Returns: undefined
      }
      set_package_obligation_timing: {
        Args: { p_package_id: string; p_timing: ObligationTiming }
        Returns: undefined
      }
      apply_workflow_to_package: {
        Args: { p_package_id: string; p_template_id: string }
        Returns: undefined
      }
      split_package: {
        Args: { p_package_id: string; p_parts: Json; p_reason: string }
        Returns: string[]
      }
      merge_packages: {
        Args: { p_package_ids: string[]; p_title: string; p_reason: string }
        Returns: string
      }
      package_overdue_notice_draft: {
        Args: { p_package_id: string }
        Returns: OverdueNoticeDraft
      }
      send_package_overdue_notice: {
        Args: {
          p_package_id: string
          p_recipients: string[]
          p_title?: string | null
          p_body?: string | null
          p_response_due?: string | null
          p_priority?: DirectivePriority
        }
        Returns: string
      }
    }
    Enums: {
      app_role: AppRole
      fiscal_year_status: FiscalYearStatus
    }
    CompositeTypes: { [_ in never]: never }
  }
}
