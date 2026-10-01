import type { PhaseKey } from '@/types/database'

/** Standard phases. Custom stages map to one so dashboards can compare programs. */
export const PHASES: { key: PhaseKey; label: string }[] = [
  { key: 'design', label: 'Design / Proposal' },
  { key: 'approval', label: 'Review & Approval' },
  { key: 'budget', label: 'Budget (PPMP/WFP/APP)' },
  { key: 'procurement', label: 'Procurement' },
  { key: 'delivery', label: 'Implementation / Delivery' },
  { key: 'inspection', label: 'Inspection & Acceptance' },
  { key: 'obligation', label: 'Obligation (ORS)' },
  { key: 'disbursement', label: 'Disbursement (DV)' },
  { key: 'liquidation', label: 'Liquidation / Reporting' },
  { key: 'savings', label: 'Savings / Realignment' },
  { key: 'closed', label: 'Closed' },
  { key: 'other', label: 'Other' },
]

export const PHASE_LABEL = Object.fromEntries(PHASES.map((p) => [p.key, p.label])) as Record<
  PhaseKey,
  string
>

/** Activity fields a stage can require before it is completed. */
export const REQUIRED_FIELD_OPTIONS: { key: string; label: string }[] = [
  { key: 'description', label: 'Description' },
  { key: 'objectives', label: 'Objectives' },
  { key: 'category_id', label: 'Category' },
  { key: 'target_output', label: 'Target output' },
  { key: 'target_outcome', label: 'Target outcome' },
  { key: 'target_quantity', label: 'Target quantity' },
  { key: 'unit_id', label: 'Unit' },
  { key: 'province_id', label: 'Province' },
  { key: 'municipality_id', label: 'Municipality' },
  { key: 'venue', label: 'Venue' },
  { key: 'start_date', label: 'Start date' },
  { key: 'end_date', label: 'End date' },
  { key: 'due_date', label: 'Due date' },
  { key: 'delivery_date', label: 'Delivery date' },
  { key: 'responsible_user_id', label: 'Responsible person' },
  { key: 'budget_amount', label: 'Budget' },
  { key: 'fund_source_id', label: 'Fund source' },
  { key: 'beneficiaries', label: 'At least one beneficiary' },
]

export const FIELD_LABEL = Object.fromEntries(
  REQUIRED_FIELD_OPTIONS.map((f) => [f.key, f.label]),
) as Record<string, string>
