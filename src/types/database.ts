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

export type WorkflowTemplateRow = {
  id: string
  program_id: string | null
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
}

export type StageStatus = 'pending' | 'in_progress' | 'completed' | 'skipped'

export type StageProgressRow = {
  id: string
  activity_id: string
  program_id: string
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
  stage_id: string | null
  stage_name: string
  action: 'start' | 'complete' | 'skip' | 'reopen' | 'migrate' | 'cancel' | 'uncancel'
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

export type CommentEntity = 'activity' | 'beneficiary' | 'directive'
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
  entity_type: 'activity' | 'beneficiary'
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
  entity_type: 'activity' | 'beneficiary' | null
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
      comments: Table<CommentRow, 'entity_type' | 'entity_id' | 'body'>
      notes: Table<NoteRow, 'entity_type' | 'entity_id' | 'body'>
      directives: Table<DirectiveRow, 'program_id' | 'title' | 'body'>
      directive_recipients: Table<DirectiveRecipientRow, 'directive_id' | 'user_id' | 'program_id'>
    }
    Views: {
      v_activities: { Row: ActivityView; Relationships: [] }
      v_directives: { Row: DirectiveView; Relationships: [] }
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
        Args: { p_program_id: string | null; p_name: string; p_copy_from?: string | null }
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
    }
    Enums: {
      app_role: AppRole
      fiscal_year_status: FiscalYearStatus
    }
    CompositeTypes: { [_ in never]: never }
  }
}
