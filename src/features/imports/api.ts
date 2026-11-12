import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useFinanceLabels, useDisbursements, useObligations } from '@/features/finance/api'
import { useProcurementLookups } from '@/features/packages/use-procurement-lookups'
import { useMasterList } from '@/features/settings/master-lists/api'
import { invokeFunction, supabase } from '@/lib/supabase'
import type { Json } from '@/types/database'
import { matchActivity } from '@/features/sheets/match'
import { normalize, type ImportTarget, type ImportTemplate, type OptionLists } from './import-core'

const templatesKey = ['import_templates'] as const

export function useImportTemplates(target: ImportTarget) {
  return useQuery({
    queryKey: [...templatesKey, target],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('import_templates')
        .select('*')
        .eq('target', target)
        .order('name')
      if (error) throw error
      return data as unknown as ImportTemplate[]
    },
  })
}

export function useTemplateMutations(target: ImportTarget) {
  const queryClient = useQueryClient()
  const invalidate = () => queryClient.invalidateQueries({ queryKey: [...templatesKey, target] })
  const save = useMutation({
    mutationFn: async (t: ImportTemplate) => {
      const row = {
        target,
        name: t.name.trim(),
        header_row: t.header_row,
        data_row: t.data_row,
        columns: t.columns as unknown as Json,
        source_url: t.source_url || null,
      }
      const query = t.id
        ? supabase.from('import_templates').update(row).eq('id', t.id)
        : supabase.from('import_templates').insert(row)
      const { data, error } = await query.select('*').single()
      if (error) throw error
      return data as unknown as ImportTemplate
    },
    onSuccess: invalidate,
  })
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('import_templates').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })
  return { save, remove }
}

/** Downloads a shared Google Sheet through the sheets-fetch Edge Function. */
export async function fetchGoogleSheet(url: string) {
  const { data } = await invokeFunction<{ data: string }>('sheets-fetch', { url })
  return Uint8Array.from(atob(data), (c) => c.charCodeAt(0))
}

/** Choices for list columns, and the values that must not be duplicated. */
export function useImportContext(target: ImportTarget, programId: string, fiscalYearId: string) {
  const scope = { programIds: programId ? [programId] : [], fiscalYearId }
  const lookups = useProcurementLookups()
  const { data: funds = [] } = useMasterList('fund_sources')
  const { data: units = [] } = useMasterList('units')
  const { data: categories = [] } = useMasterList('activity_categories')
  const { data: labels } = useFinanceLabels(scope)
  const { data: obligations = [] } = useObligations(scope)
  const { data: disbursements = [] } = useDisbursements(scope)

  const options = useMemo<OptionLists>(() => {
    const coded = (list: Record<string, unknown>[]) =>
      list.map((x) => ({
        value: String(x.id),
        label: String(x.code ?? x.name),
        keys: [x.code, x.name, x.abbreviation].filter(Boolean).map(String),
      }))
    return {
      expense_classes: coded(lookups.expenseClasses),
      uacs: lookups.uacs.map((u) => ({
        value: String(u.id),
        label: `${String(u.code)} ${String(u.name)}`,
        keys: [String(u.code), String(u.name)],
      })),
      funds: coded(funds),
      units: units.map((u) => ({
        value: String(u.id),
        label: String(u.abbreviation ?? u.name),
        keys: [u.abbreviation, u.name].filter(Boolean).map(String),
      })),
      modes: lookups.modes.map((m) => ({ value: m.id, label: m.name, keys: [m.name] })),
      categories: categories.map((c) => ({
        value: String(c.id),
        label: String(c.name),
        keys: [String(c.name)],
      })),
      activities: (labels?.activities ?? []).map((a) => ({
        value: a.id,
        label: `${a.code} ${a.title}`,
        keys: [String(a.code), a.title],
      })),
      packages: (labels?.packages ?? []).map((p) => ({
        value: p.id,
        label: `${p.code} ${p.title}`,
        keys: [String(p.code), p.title],
      })),
      obligations: obligations
        .filter((o) => o.status === 'active')
        .map((o) => ({ value: o.id, label: o.ors_no, keys: [o.ors_no] })),
      allotment_kinds: [
        { value: 'saro', label: 'SARO', keys: ['saro'] },
        {
          value: 'sub_allotment',
          label: 'Sub-allotment',
          keys: ['sub_allotment', 'sub-allotment', 'saa'],
        },
        { value: 'realignment', label: 'Realignment', keys: ['realignment'] },
        { value: 'reversion', label: 'Reversion', keys: ['reversion'] },
      ],
    }
  }, [lookups, funds, units, categories, labels, obligations])

  const existing = useMemo((): Record<string, Set<string>> => {
    const set = (values: string[]) => new Set(values.map(normalize))
    if (target === 'activities')
      return { title: set((labels?.activities ?? []).map((a) => a.title)) }
    if (target === 'obligations') {
      return { ors_no: set(obligations.filter((o) => o.status === 'active').map((o) => o.ors_no)) }
    }
    if (target === 'disbursements') {
      return { dv_no: set(disbursements.filter((d) => d.status === 'active').map((d) => d.dv_no)) }
    }
    return {}
  }, [target, labels, obligations, disbursements])

  return { options, existing, obligations }
}

const LIMITS: Record<string, number> = {
  description: 500,
  title: 250,
  responsible_unit: 120,
  venue: 250,
  target_output: 1000,
  payee_name: 200,
  ors_no: 60,
  dv_no: 60,
  allotment_no: 60,
  check_ada_no: 60,
}

/** Shortens text to what the database accepts. */
function clip(target: ImportTarget, row: Record<string, unknown>) {
  const out = { ...row }
  for (const [key, max] of Object.entries(LIMITS)) {
    // An activity's description allows far more than a plan row's particulars.
    if (key === 'description' && target === 'activities') continue
    if (typeof out[key] === 'string') out[key] = (out[key] as string).trim().slice(0, max)
  }
  return out
}

export interface CommitInput {
  target: ImportTarget
  programId: string
  fiscalYearId: string
  rows: Record<string, unknown>[]
  obligations: { id: string; activity_id: string; package_id: string | null }[]
  plan?: { id: string; keep: Record<string, unknown>[] }
}

export interface CommitResult {
  saved: number
  flagged: number
  /** Activities only: new ones, and existing ones that were updated. */
  created?: number
  updated?: number
}

/** Saves reviewed rows. Every path is all-or-nothing: one bad row saves nothing. */
export function useImportCommit() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (v: CommitInput): Promise<CommitResult> => {
      const rows = v.rows.map((r) => clip(v.target, r))
      const scoped = rows.map((r) => ({
        ...r,
        program_id: v.programId,
        fiscal_year_id: v.fiscalYearId,
      }))

      if (v.target === 'WFP' || v.target === 'PPMP' || v.target === 'APP') {
        const { error } = await supabase.rpc('save_plan_rows', {
          p_plan_id: v.plan!.id,
          p_rows: [...v.plan!.keep, ...rows] as unknown as Json,
        })
        if (error) throw error
        return { saved: rows.length, flagged: 0 }
      }
      if (v.target === 'activities') return commitActivities(v, rows)
      if (v.target === 'allotments') {
        const { error } = await supabase.from(v.target).insert(scoped as never)
        if (error) throw error
        return { saved: rows.length, flagged: 0 }
      }

      const payload =
        v.target === 'obligations'
          ? rows
          : rows.map(({ obligation_id, ...r }) => {
              const ors = v.obligations.find((o) => o.id === obligation_id)
              return {
                ...r,
                activity_id: ors?.activity_id,
                package_id: ors?.package_id,
                links: [{ obligation_id, amount: r.gross_amount }],
              }
            })
      const { data, error } = await supabase.rpc('import_finance_records', {
        p_kind: v.target,
        p_rows: payload as unknown as Json,
      })
      if (error) throw error
      return { saved: data.saved, flagged: data.flagged.length }
    },
    onSuccess: () =>
      Promise.all(
        [['finance'], ['activities'], ['activity_physical'], ['packages'], ['dashboard']].map(
          (queryKey) => queryClient.invalidateQueries({ queryKey }),
        ),
      ),
  })
}

const MONTH_FIELDS = (prefix: 'target' | 'done') =>
  Array.from({ length: 12 }, (_, i) => `${prefix}_m${i + 1}`)

/**
 * Activities: rows matching an existing activity update it (unit, target, monthly
 * figures); the rest become new activities. Monthly figures go to activity_physical.
 */
async function commitActivities(
  v: CommitInput,
  rows: Record<string, unknown>[],
): Promise<CommitResult> {
  const { data: existing, error } = await supabase
    .from('activities')
    .select('id, title')
    .eq('program_id', v.programId)
    .eq('fiscal_year_id', v.fiscalYearId)
    .is('deleted_at', null)
  if (error) throw error
  const physicalFields = new Set([
    ...MONTH_FIELDS('target'),
    ...MONTH_FIELDS('done'),
    'status_note',
  ])
  const plans = rows.map((r) => {
    const activity = Object.fromEntries(Object.entries(r).filter(([k]) => !physicalFields.has(k)))
    const has = (prefix: 'target' | 'done') => MONTH_FIELDS(prefix).some((k) => r[k] !== undefined)
    const months = (prefix: 'target' | 'done') =>
      MONTH_FIELDS(prefix).map((k) => Number(r[k] ?? 0) || 0)
    return {
      activity,
      match: matchActivity(String(r.title ?? ''), existing),
      targets: has('target') ? months('target') : null,
      done: has('done') ? months('done') : null,
      status: typeof r.status_note === 'string' ? r.status_note : null,
    }
  })

  const fresh = plans.filter((p) => !p.match)
  let ids: string[] = []
  if (fresh.length) {
    const { data, error: e } = await supabase
      .from('activities')
      .insert(
        fresh.map((p) => ({
          ...p.activity,
          program_id: v.programId,
          fiscal_year_id: v.fiscalYearId,
        })) as never,
      )
      .select('id')
    if (e) throw e
    ids = (data as { id: string }[]).map((d) => d.id)
  }
  let updated = 0
  for (const p of plans.filter((x) => x.match)) {
    // Titles of matched activities stay as they are (they may come from the WFP).
    const changes = Object.fromEntries(
      Object.entries(p.activity).filter(
        ([k, val]) => k !== 'title' && val !== undefined && val !== null,
      ),
    )
    if (Object.keys(changes).length) {
      const { error: e } = await supabase
        .from('activities')
        .update(changes as never)
        .eq('id', p.match!.id)
      if (e) throw e
    }
    updated++
  }

  const withPhysical = plans
    .map((p) => ({ ...p, id: p.match?.id ?? ids[fresh.indexOf(p)] }))
    .filter((p) => p.id && (p.targets || p.done || p.status))
  if (withPhysical.length) {
    const { data: current, error: e } = await supabase
      .from('activity_physical')
      .select('activity_id')
      .in(
        'activity_id',
        withPhysical.map((p) => p.id),
      )
    if (e) throw e
    const known = new Set((current as { activity_id: string }[]).map((c) => c.activity_id))
    for (const p of withPhysical) {
      const change = {
        ...(p.targets ? { monthly_targets: p.targets } : {}),
        ...(p.done ? { monthly_done: p.done } : {}),
        ...(p.status ? { status_note: p.status.slice(0, 1000) } : {}),
      }
      const { error: e2 } = known.has(p.id)
        ? await supabase.from('activity_physical').update(change).eq('activity_id', p.id)
        : await supabase.from('activity_physical').insert({ activity_id: p.id, ...change } as never)
      if (e2) throw e2
    }
  }
  return { saved: rows.length, flagged: 0, created: fresh.length, updated }
}
