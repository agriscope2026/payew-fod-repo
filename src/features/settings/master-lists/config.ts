/**
 * Declarative definitions for the master lists editable in Settings.
 * These tables feed every dropdown in the system (no free-text duplicates).
 */

export type MasterListKey =
  | 'provinces'
  | 'municipalities'
  | 'barangays'
  | 'fund_sources'
  | 'expense_classes'
  | 'uacs_codes'
  | 'commodities'
  | 'units'
  | 'activity_categories'
  | 'beneficiary_types'
  | 'document_types'
  | 'procurement_categories'
  | 'procurement_modes'

export interface FieldDef {
  key: string
  label: string
  type: 'text' | 'textarea' | 'number' | 'select' | 'boolean'
  required?: boolean
  /** For selects: which list supplies the options. */
  optionsFrom?: MasterListKey
  uppercase?: boolean
  placeholder?: string
  hideInTable?: boolean
}

export interface MasterListDef {
  key: MasterListKey
  label: string
  singular: string
  group: 'Locations' | 'Finance' | 'Procurement' | 'Programs & Beneficiaries' | 'Documents'
  description: string
  fields: FieldDef[]
  /** Column used as the option label when this list feeds a select. */
  labelKey: string
  orderBy: { column: string; ascending?: boolean }[]
  /** Optional list-level filter (e.g. municipalities by province). */
  parentFilter?: { field: string; list: MasterListKey; label: string }
}

const name = (label = 'Name'): FieldDef => ({ key: 'name', label, type: 'text', required: true })
const code = (placeholder?: string): FieldDef => ({
  key: 'code',
  label: 'Code',
  type: 'text',
  required: true,
  uppercase: true,
  placeholder,
})
const sortOrder: FieldDef = {
  key: 'sort_order',
  label: 'Sort order',
  type: 'number',
  hideInTable: true,
}

export const MASTER_LISTS: MasterListDef[] = [
  {
    key: 'provinces',
    label: 'Provinces',
    singular: 'province',
    group: 'Locations',
    description: 'Cordillera provinces and Baguio City (listed at province level).',
    fields: [
      name(),
      { key: 'psgc_code', label: 'PSGC code', type: 'text' },
      { key: 'is_city', label: 'Highly urbanized city', type: 'boolean' },
      sortOrder,
    ],
    labelKey: 'name',
    orderBy: [{ column: 'sort_order' }, { column: 'name' }],
  },
  {
    key: 'municipalities',
    label: 'Municipalities / Cities',
    singular: 'municipality',
    group: 'Locations',
    description: 'Municipalities and component cities per province.',
    fields: [
      {
        key: 'province_id',
        label: 'Province',
        type: 'select',
        optionsFrom: 'provinces',
        required: true,
      },
      name(),
      { key: 'psgc_code', label: 'PSGC code', type: 'text' },
      { key: 'is_city', label: 'City', type: 'boolean' },
    ],
    labelKey: 'name',
    orderBy: [{ column: 'name' }],
    parentFilter: { field: 'province_id', list: 'provinces', label: 'Province' },
  },
  {
    key: 'barangays',
    label: 'Barangays',
    singular: 'barangay',
    group: 'Locations',
    description: 'Barangays per municipality or city.',
    fields: [
      {
        key: 'municipality_id',
        label: 'Municipality / City',
        type: 'select',
        optionsFrom: 'municipalities',
        required: true,
      },
      name(),
      { key: 'psgc_code', label: 'PSGC code', type: 'text' },
    ],
    labelKey: 'name',
    orderBy: [{ column: 'name' }],
    parentFilter: { field: 'municipality_id', list: 'municipalities', label: 'Municipality' },
  },
  {
    key: 'fund_sources',
    label: 'Fund Sources',
    singular: 'fund source',
    group: 'Finance',
    description: 'GAA, regular, special purpose and continuing appropriations.',
    fields: [
      code('e.g. GAA'),
      name(),
      { key: 'description', label: 'Description', type: 'textarea' },
      sortOrder,
    ],
    labelKey: 'name',
    orderBy: [{ column: 'sort_order' }, { column: 'code' }],
  },
  {
    key: 'expense_classes',
    label: 'Expense Classes',
    singular: 'expense class',
    group: 'Finance',
    description: 'PS, MOOE and CO allotment classes.',
    fields: [code('e.g. MOOE'), name(), sortOrder],
    labelKey: 'code',
    orderBy: [{ column: 'sort_order' }, { column: 'code' }],
  },
  {
    key: 'uacs_codes',
    label: 'UACS Object Codes',
    singular: 'UACS code',
    group: 'Finance',
    description: 'Unified Accounts Code Structure object codes, grouped by expense class.',
    fields: [
      {
        key: 'expense_class_id',
        label: 'Expense class',
        type: 'select',
        optionsFrom: 'expense_classes',
        required: true,
      },
      {
        key: 'code',
        label: 'UACS code',
        type: 'text',
        required: true,
        placeholder: 'e.g. 5020201000',
      },
      name('Account title'),
    ],
    labelKey: 'code',
    orderBy: [{ column: 'code' }],
    parentFilter: { field: 'expense_class_id', list: 'expense_classes', label: 'Expense class' },
  },
  {
    key: 'commodities',
    label: 'Commodities',
    singular: 'commodity',
    group: 'Programs & Beneficiaries',
    description: 'Crops and commodities served by programs and beneficiaries.',
    fields: [
      name(),
      { key: 'category', label: 'Category', type: 'text', placeholder: 'e.g. Vegetables' },
    ],
    labelKey: 'name',
    orderBy: [{ column: 'category' }, { column: 'name' }],
  },
  {
    key: 'units',
    label: 'Units of Measure',
    singular: 'unit',
    group: 'Programs & Beneficiaries',
    description: 'Units for targets, outputs and inputs (kg, bag, ha, pax…).',
    fields: [name(), { key: 'abbreviation', label: 'Abbreviation', type: 'text' }],
    labelKey: 'name',
    orderBy: [{ column: 'name' }],
  },
  {
    key: 'activity_categories',
    label: 'Activity Categories',
    singular: 'category',
    group: 'Programs & Beneficiaries',
    description: 'Global categories available to every program. Programs can add their own.',
    fields: [name(), { key: 'description', label: 'Description', type: 'textarea' }],
    labelKey: 'name',
    orderBy: [{ column: 'name' }],
  },
  {
    key: 'beneficiary_types',
    label: 'Beneficiary Types',
    singular: 'beneficiary type',
    group: 'Programs & Beneficiaries',
    description: "Farmers' associations, cooperatives, SLP associations, LGUs, individuals…",
    fields: [code('e.g. FA'), name()],
    labelKey: 'name',
    orderBy: [{ column: 'code' }],
  },
  {
    key: 'document_types',
    label: 'Document Types',
    singular: 'document type',
    group: 'Documents',
    description:
      'Types used to classify files in the Document Repository (PPMP, ORS, DV, photos…).',
    fields: [code('e.g. IAR'), name(), sortOrder],
    labelKey: 'name',
    orderBy: [{ column: 'sort_order' }, { column: 'code' }],
  },
  {
    key: 'procurement_categories',
    label: 'Procurement Categories',
    singular: 'procurement category',
    group: 'Procurement',
    description:
      'Package categories (lodging, meals, transport…). The defaults pre-fill new packages.',
    fields: [
      code('e.g. MEALS'),
      name(),
      { key: 'description', label: 'Description', type: 'textarea', hideInTable: true },
      {
        key: 'default_expense_class_id',
        label: 'Default expense class',
        type: 'select',
        optionsFrom: 'expense_classes',
      },
      {
        key: 'default_uacs_code_id',
        label: 'Default UACS code',
        type: 'select',
        optionsFrom: 'uacs_codes',
        hideInTable: true,
      },
      sortOrder,
    ],
    labelKey: 'name',
    orderBy: [{ column: 'sort_order' }, { column: 'name' }],
  },
  {
    key: 'procurement_modes',
    label: 'Procurement Modes',
    singular: 'procurement mode',
    group: 'Procurement',
    description:
      'Modes of procurement under RA 12009 / RA 9184 (SVP, bidding, direct contracting…).',
    fields: [
      code('e.g. SVP'),
      name(),
      { key: 'description', label: 'Description', type: 'textarea', hideInTable: true },
      sortOrder,
    ],
    labelKey: 'name',
    orderBy: [{ column: 'sort_order' }, { column: 'name' }],
  },
]

export const MASTER_LIST_BY_KEY = Object.fromEntries(MASTER_LISTS.map((l) => [l.key, l])) as Record<
  MasterListKey,
  MasterListDef
>
