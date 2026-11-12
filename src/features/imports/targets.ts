// What can be imported, and the built-in template for the DA-CAR AWFP form.
import { MONTH_KEYS } from '@/types/database'
import {
  standardTemplate,
  type ImportField,
  type ImportTarget,
  type ImportTemplate,
  type TemplateColumn,
} from './import-core'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const money = (key: string, label: string, extra: Partial<ImportField> = {}): ImportField => ({
  key,
  label,
  type: 'number',
  width: 120,
  ...extra,
})
const pick = (
  key: string,
  label: string,
  options: string,
  extra: Partial<ImportField> = {},
): ImportField => ({
  key,
  label,
  type: 'select',
  options,
  width: 150,
  ...extra,
})

const months = MONTH_KEYS.map((k, i) => money(k, MONTHS[i], { width: 100 }))
const remarks: ImportField = {
  key: 'remarks',
  label: 'Remarks',
  type: 'text',
  width: 220,
  aliases: ['remark', 'notes'],
}
const description: ImportField = {
  key: 'description',
  label: 'Particulars *',
  type: 'text',
  required: true,
  width: 280,
  aliases: ['description', 'item', 'paps', 'program activity project', 'general description'],
}
const expenseClass = pick('expense_class_id', 'Expense class', 'expense_classes', {
  aliases: ['class', 'allotment class'],
})
const uacs = pick('uacs_code_id', 'UACS', 'uacs', {
  aliases: ['uacs code', 'account code', 'object of expenditure'],
})
const fund = pick('fund_source_id', 'Fund source', 'funds', {
  aliases: ['fund', 'source', 'source of fund'],
})
const unit = pick('unit_id', 'Unit', 'units', { aliases: ['unit of measure', 'uom'], width: 90 })
const quantity = money('quantity', 'Qty', { aliases: ['quantity', 'physical target'], width: 90 })
const unitCost = money('unit_cost', 'Unit cost', { aliases: ['price', 'unit price'] })
const amount = money('amount', 'Amount', {
  aliases: ['total', 'total amount', 'budget', 'estimated budget'],
})
const obligated = money('obligated', 'Obligated', {
  aliases: ['total obligation', 'obligation', 'obligated amount'],
})
const disbursed = money('disbursed', 'Disbursed', {
  aliases: ['total disbursement', 'disbursement', 'disbursed amount', 'paid'],
})
const activity = pick('activity_id', 'Activity', 'activities', {
  aliases: ['activity code', 'activity title'],
  width: 220,
})
const packageField = pick('package_id', 'Package', 'packages', {
  aliases: ['package code'],
  width: 200,
})
const mode = pick('procurement_mode_id', 'Mode', 'modes', {
  aliases: ['procurement mode', 'mode of procurement'],
})

const planFields = (type: 'WFP' | 'PPMP' | 'APP'): ImportField[] => [
  description,
  activity,
  ...(type === 'WFP' ? [] : [packageField]),
  expenseClass,
  uacs,
  ...(type === 'WFP' ? [fund] : [mode]),
  unit,
  quantity,
  unitCost,
  amount,
  ...(type === 'WFP' ? [obligated, disbursed] : []),
  ...(type === 'APP' ? [] : months),
  remarks,
]

export const IMPORT_FIELDS: Record<ImportTarget, ImportField[]> = {
  WFP: planFields('WFP'),
  PPMP: planFields('PPMP'),
  APP: planFields('APP'),
  allotments: [
    pick('kind', 'Kind *', 'allotment_kinds', { required: true, aliases: ['type'] }),
    {
      key: 'allotment_no',
      label: 'SARO / SAA No.',
      type: 'text',
      width: 150,
      aliases: ['saro no', 'saa no', 'allotment no', 'number'],
    },
    {
      key: 'allotment_date',
      label: 'Date *',
      type: 'date',
      required: true,
      width: 110,
      aliases: ['allotment date'],
    },
    { ...expenseClass, label: 'Expense class *', required: true },
    uacs,
    fund,
    money('amount', 'Amount *', { required: true, aliases: ['total', 'total amount'] }),
    remarks,
  ],
  obligations: [
    {
      key: 'ors_no',
      label: 'ORS No. *',
      type: 'text',
      required: true,
      unique: 'error',
      width: 140,
      aliases: ['ors', 'ors number', 'obligation no', 'burs no'],
    },
    {
      key: 'ors_date',
      label: 'Date *',
      type: 'date',
      required: true,
      width: 110,
      aliases: ['ors date'],
    },
    { ...activity, label: 'Activity *', required: true },
    packageField,
    money('amount', 'Amount *', { required: true, aliases: ['obligated', 'total'] }),
    expenseClass,
    uacs,
    fund,
    {
      key: 'payee_name',
      label: 'Payee',
      type: 'text',
      width: 200,
      aliases: ['supplier', 'creditor'],
    },
    {
      key: 'particulars',
      label: 'Particulars',
      type: 'text',
      width: 240,
      aliases: ['description', 'remarks'],
    },
  ],
  disbursements: [
    {
      key: 'dv_no',
      label: 'DV No. *',
      type: 'text',
      required: true,
      unique: 'error',
      width: 140,
      aliases: ['dv', 'dv number', 'voucher no'],
    },
    {
      key: 'dv_date',
      label: 'Date *',
      type: 'date',
      required: true,
      width: 110,
      aliases: ['dv date'],
    },
    pick('obligation_id', 'Charged to ORS *', 'obligations', {
      required: true,
      aliases: ['ors', 'ors no', 'ors number'],
      width: 160,
    }),
    money('gross_amount', 'Gross *', { required: true, aliases: ['gross amount', 'amount'] }),
    money('tax_withheld', 'Tax withheld', { aliases: ['tax'] }),
    money('other_deductions', 'Other deductions', { aliases: ['deductions'] }),
    {
      key: 'payee_name',
      label: 'Payee',
      type: 'text',
      width: 200,
      aliases: ['supplier', 'creditor'],
    },
    {
      key: 'check_ada_no',
      label: 'Check / ADA No.',
      type: 'text',
      width: 140,
      aliases: ['check no', 'ada no'],
    },
    {
      key: 'particulars',
      label: 'Particulars',
      type: 'text',
      width: 240,
      aliases: ['description', 'remarks'],
    },
  ],
  activities: [
    {
      key: 'title',
      label: 'Title *',
      type: 'text',
      required: true,
      width: 300,
      aliases: ['activity', 'activity title', 'paps', 'program activity project'],
    },
    { key: 'description', label: 'Description', type: 'text', width: 220 },
    pick('category_id', 'Category', 'categories', { width: 170 }),
    {
      key: 'target_output',
      label: 'Performance indicator',
      type: 'text',
      width: 220,
      aliases: ['target output', 'indicator', 'output'],
    },
    money('target_quantity', 'Target', {
      aliases: ['target quantity', 'physical target', 'annual total'],
      width: 90,
    }),
    unit,
    { key: 'venue', label: 'Location', type: 'text', width: 200, aliases: ['venue', 'site'] },
    { key: 'start_date', label: 'Start date', type: 'date', width: 110, aliases: ['start'] },
    { key: 'end_date', label: 'End date', type: 'date', width: 110, aliases: ['end'] },
    { key: 'due_date', label: 'Due date', type: 'date', width: 110, aliases: ['due', 'deadline'] },
    {
      key: 'responsible_unit',
      label: 'Responsibility center',
      type: 'text',
      width: 180,
      aliases: ['responsible unit', 'responsible'],
    },
    money('budget_amount', 'Budget', { aliases: ['budget amount', 'amount', 'total'] }),
    fund,
    remarks,
    ...MONTH_KEYS.map((_, i) => money(`target_m${i + 1}`, `Target ${MONTHS[i]}`, { width: 80 })),
    ...MONTH_KEYS.map((_, i) =>
      money(`done_m${i + 1}`, `Accomplished ${MONTHS[i]}`, { width: 80 }),
    ),
    {
      key: 'status_note',
      label: 'Status',
      type: 'text',
      width: 220,
      aliases: ['accomplishment status'],
    },
  ],
}

export const TARGET_LABEL: Record<ImportTarget, string> = {
  WFP: 'WFP',
  PPMP: 'PPMP',
  APP: 'APP',
  allotments: 'allotments',
  obligations: 'ORS records',
  disbursements: 'DV records',
  activities: 'activities',
}

/** The field that receives extra columns, and its size limit. */
export const NOTES_FIELD: Record<ImportTarget, { field: string; limit: number }> = {
  WFP: { field: 'remarks', limit: 1000 },
  PPMP: { field: 'remarks', limit: 1000 },
  APP: { field: 'remarks', limit: 1000 },
  allotments: { field: 'remarks', limit: 1000 },
  obligations: { field: 'particulars', limit: 1000 },
  disbursements: { field: 'particulars', limit: 1000 },
  activities: { field: 'remarks', limit: 2000 },
}

// The form has a header in rows 8–9, data from row 10, and money in thousands.
const THOUSANDS = 1000
const awfpExtras: TemplateColumn[] = [
  { field: 'custom:Object of Expenditure', label: 'Object of Expenditure', source: 'V' },
  { field: 'custom:Source', label: 'Source', source: 'AB' },
]

const AWFP_WFP: ImportTemplate = {
  target: 'WFP',
  name: 'DA-CAR AWFP form',
  header_row: 8,
  data_row: 10,
  builtIn: true,
  tabHint: /awfp.*reprogram/i,
  columns: [
    { field: 'description', label: 'Particulars *', source: 'A', fillDown: true, mustHave: true },
    {
      field: 'expense_class_id',
      label: 'Expense class',
      source: 'V',
      fallback: 'MOOE',
      mustHave: true,
    },
    { field: 'unit_id', label: 'Unit', source: 'C' },
    { field: 'quantity', label: 'Qty', source: 'U' },
    { field: 'amount', label: 'Amount', source: 'AA', multiplier: THOUSANDS, mustHave: true },
    ...['AC', 'AD', 'AE', 'AG', 'AH', 'AI', 'AK', 'AL', 'AM', 'AO', 'AP', 'AQ'].map(
      (source, i) => ({
        field: MONTH_KEYS[i],
        label: MONTHS[i],
        source,
        multiplier: THOUSANDS,
      }),
    ),
    { field: 'remarks', label: 'Remarks', source: 'AW' },
    ...awfpExtras,
    { field: 'custom:Location', label: 'Location', source: 'D' },
  ],
}

// The monitoring tab: line items in pesos, with supplier rows beneath each one.
// Row 10 is the grand total, so data starts at row 11. Totals are checked against it:
// column K is the amount obligated, and column P where PAID is ticked is the amount disbursed.
const WFP_MONITORING: ImportTemplate = {
  target: 'WFP',
  name: 'DA-CAR WFP with obligations',
  header_row: 8,
  data_row: 11,
  builtIn: true,
  tabHeader: /amount for obligation/i,
  columns: [
    { field: 'description', label: 'Particulars *', source: 'A', fillDown: true, mustHave: true },
    {
      field: 'expense_class_id',
      label: 'Expense class',
      source: 'D',
      fallback: 'MOOE',
      mustHave: true,
      notNumber: true,
    },
    { field: 'unit_id', label: 'Unit', source: 'B' },
    { field: 'quantity', label: 'Qty', source: 'C' },
    { field: 'amount', label: 'Amount', source: 'I', mustHave: true },
    { field: 'obligated', label: 'Obligated', source: 'K', rollUp: true },
    { field: 'disbursed', label: 'Disbursed', source: 'P', rollUp: true, whenTrue: 'Q' },
    { field: 'remarks', label: 'Remarks', source: 'S' },
    { field: 'custom:Object of Expenditure', label: 'Object of Expenditure', source: 'D' },
  ],
}

const AWFP_ACTIVITIES: ImportTemplate = {
  target: 'activities',
  name: 'DA-CAR AWFP form',
  header_row: 8,
  data_row: 10,
  builtIn: true,
  tabHint: /awfp.*reprogram/i,
  columns: [
    { field: 'title', label: 'Title *', source: 'A', mustHave: true },
    { field: 'target_output', label: 'Performance indicator', source: 'B', mustHave: true },
    { field: 'unit_id', label: 'Unit', source: 'C', mustHave: true },
    { field: 'target_quantity', label: 'Target', source: 'U' },
    { field: 'venue', label: 'Location', source: 'D' },
    { field: 'budget_amount', label: 'Budget', source: 'AA', multiplier: THOUSANDS },
    { field: 'responsible_unit', label: 'Responsibility center', source: 'AT' },
    { field: 'remarks', label: 'Remarks', source: 'AW' },
    { field: 'custom:Special Sector', label: 'Special Sector', source: 'AU' },
    { field: 'custom:Critical Assumptions', label: 'Critical Assumptions', source: 'AV' },
  ],
}

// BED 2 (monthly physical targets): data from row 14; months in F–H, J–L, N–P, R–T,
// with the quarters in between; the year total in V.
const BED_MONTHS = ['F', 'G', 'H', 'J', 'K', 'L', 'N', 'O', 'P', 'R', 'S', 'T']
const bed2 = (kind: 'target' | 'done'): ImportTemplate => ({
  target: 'activities',
  name: kind === 'target' ? 'DA-CAR BED 2 (monthly targets)' : 'DA-CAR BED 2 accomplishments',
  header_row: 7,
  data_row: 14,
  builtIn: true,
  tabHint: kind === 'target' ? /^beds*2$/i : /accomplishment/i,
  columns: [
    { field: 'title', label: 'Title *', source: 'A', mustHave: true },
    { field: 'unit_id', label: 'Unit', source: 'B', mustHave: true },
    ...(kind === 'target'
      ? [{ field: 'target_quantity', label: 'Target', source: 'V' }]
      : [{ field: 'status_note', label: 'Status', source: 'W' }]),
    ...BED_MONTHS.map((source, i) => ({
      field: `${kind}_m${i + 1}`,
      label: `${kind === 'target' ? 'Target' : 'Accomplished'} ${MONTHS[i]}`,
      source,
    })),
  ],
})

export function builtInTemplates(target: ImportTarget): ImportTemplate[] {
  const standard = standardTemplate(target, IMPORT_FIELDS[target])
  if (target === 'WFP') return [WFP_MONITORING, AWFP_WFP, standard]
  if (target === 'activities') return [bed2('target'), bed2('done'), AWFP_ACTIVITIES, standard]
  return [standard]
}
