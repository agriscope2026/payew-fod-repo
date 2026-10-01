import { useMemo } from 'react'
import { useMasterList } from '@/features/settings/master-lists/api'
import type { ProcurementCategoryRow, ProcurementModeRow } from '@/types/database'

/** Procurement categories/modes, expense classes and UACS codes with id → label helpers. */
export function useProcurementLookups() {
  const { data: categories = [] } = useMasterList('procurement_categories')
  const { data: modes = [] } = useMasterList('procurement_modes')
  const { data: expenseClasses = [] } = useMasterList('expense_classes')
  const { data: uacs = [] } = useMasterList('uacs_codes')

  return useMemo(() => {
    const cats = categories as unknown as ProcurementCategoryRow[]
    const mds = modes as unknown as ProcurementModeRow[]
    const catById = new Map(cats.map((c) => [c.id, c]))
    const catByCode = new Map(cats.map((c) => [c.code, c]))
    const modeById = new Map(mds.map((m) => [m.id, m]))
    const ecById = new Map(expenseClasses.map((e) => [e.id, e]))
    const uacsById = new Map(uacs.map((u) => [u.id, u]))
    return {
      categories: cats,
      modes: mds,
      expenseClasses,
      uacs,
      category: (id: string | null) => (id ? catById.get(id) : undefined),
      categoryByCode: (code: string) => catByCode.get(code),
      modeName: (id: string | null) => (id ? (modeById.get(id)?.name ?? '') : ''),
      expenseClassName: (id: string | null) =>
        id ? String(ecById.get(id)?.code ?? ecById.get(id)?.name ?? '') : '',
      uacsLabel: (id: string | null) => {
        const u = id ? uacsById.get(id) : undefined
        return u ? `${String(u.code)} · ${String(u.name)}` : ''
      },
    }
  }, [categories, modes, expenseClasses, uacs])
}
