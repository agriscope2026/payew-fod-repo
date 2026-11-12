import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type {
  CardRange,
  DashboardCardRow,
  FinanceSheetDataRow,
  FinanceSheetRow,
  Json,
} from '@/types/database'
import {
  createEvaluator,
  listFor,
  normalizeSheet,
  typeInto,
  type Sheet,
  type SheetKind,
} from './model'
import { WFP_STATUSES } from './templates'
import { resolveRoles, wfpActivities, type WfpActivity } from './wfp'

export const sheetsKey = ['finance_sheets'] as const
export const cardsKey = ['dashboard_cards'] as const

export interface LoadedSheet {
  meta: FinanceSheetRow
  data: Sheet
  draft: Sheet | null
  draftSource: string | null
  draftUpdatedAt: string | null
}

/** Every finance sheet of the programs for a fiscal year, with contents. */
export function useFinanceSheets(programIds: string[], fiscalYearId: string | null) {
  return useQuery({
    queryKey: [...sheetsKey, programIds, fiscalYearId],
    enabled: programIds.length > 0 && !!fiscalYearId,
    queryFn: async (): Promise<LoadedSheet[]> => {
      const { data: metas, error } = await supabase
        .from('finance_sheets')
        .select('*')
        .in('program_id', programIds)
        .eq('fiscal_year_id', fiscalYearId!)
      if (error) throw error
      if (!metas.length) return []
      const { data: contents, error: e2 } = await supabase
        .from('finance_sheet_data')
        .select('*')
        .in(
          'sheet_id',
          metas.map((m) => m.id),
        )
      if (e2) throw e2
      const byId = new Map((contents as FinanceSheetDataRow[]).map((c) => [c.sheet_id, c]))
      return metas.flatMap((meta) => {
        const c = byId.get(meta.id)
        if (!c) return []
        return [
          {
            meta,
            data: normalizeSheet(c.data),
            draft: c.draft ? normalizeSheet(c.draft) : null,
            draftSource: c.draft_source,
            draftUpdatedAt: c.draft_updated_at,
          },
        ]
      })
    },
  })
}

export function useSheetVersions(sheetId: string | null) {
  return useQuery({
    queryKey: [...sheetsKey, 'versions', sheetId],
    enabled: !!sheetId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('finance_sheet_versions')
        .select('id, version, saved_at, saved_by')
        .eq('sheet_id', sheetId!)
        .order('version', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export async function loadVersion(id: string) {
  const { data, error } = await supabase
    .from('finance_sheet_versions')
    .select('data')
    .eq('id', id)
    .single()
  if (error) throw error
  return normalizeSheet(data.data)
}

const json = (sheet: Sheet | null) => sheet as unknown as Json

export function useSheetMutations() {
  const queryClient = useQueryClient()
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: sheetsKey }),
      queryClient.invalidateQueries({ queryKey: cardsKey }),
    ])

  const create = useMutation({
    mutationFn: async (v: {
      programId: string
      fiscalYearId: string
      kind: SheetKind
      sheet: Sheet
      templateKey: string | null
    }) => {
      const { data, error } = await supabase.rpc('create_finance_sheet', {
        p_program_id: v.programId,
        p_fiscal_year_id: v.fiscalYearId,
        p_kind: v.kind,
        p_data: json(v.sheet),
        p_template_key: v.templateKey,
      })
      if (error) throw error
      return data
    },
    onSuccess: refresh,
  })
  const save = useMutation({
    mutationFn: async (v: {
      id: string
      version: number
      sheet: Sheet
      isCustom: boolean
      templateKey: string | null
    }) => {
      const { data, error } = await supabase.rpc('save_finance_sheet', {
        p_sheet_id: v.id,
        p_version: v.version,
        p_data: json(v.sheet),
        p_is_custom: v.isCustom,
        p_template_key: v.templateKey,
      })
      if (error) throw error
      return data
    },
    onSuccess: refresh,
  })
  const saveDraft = useMutation({
    mutationFn: async (v: { id: string; draft: Sheet | null; source?: string }) => {
      const { error } = await supabase.rpc('save_finance_sheet_draft', {
        p_sheet_id: v.id,
        p_draft: json(v.draft),
        p_source: v.source ?? null,
      })
      if (error) throw error
    },
    onSuccess: refresh,
  })
  const finalize = useMutation({
    mutationFn: async (v: { id: string; version: number; sheet: Sheet }) => {
      const { data, error } = await supabase.rpc('finalize_finance_sheet', {
        p_sheet_id: v.id,
        p_version: v.version,
        p_data: json(v.sheet),
      })
      if (error) throw error
      return data
    },
    onSuccess: refresh,
  })
  return { create, save, saveDraft, finalize }
}

// ---------------------------------------------------------------------------
// Dashboard cards
// ---------------------------------------------------------------------------
export function useDashboardCards(programIds: string[], fiscalYearId: string | null) {
  return useQuery({
    queryKey: [...cardsKey, programIds, fiscalYearId],
    enabled: programIds.length > 0 && !!fiscalYearId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dashboard_cards')
        .select('*')
        .in('program_id', programIds)
        .eq('fiscal_year_id', fiscalYearId!)
        .order('created_at')
      if (error) throw error
      return data as DashboardCardRow[]
    },
  })
}

export type NewCard = Pick<
  DashboardCardRow,
  'sheet_id' | 'title' | 'details' | 'agg' | 'number_format' | 'sub_label' | 'sub_agg' | 'placement'
> & { range: CardRange; sub_range: CardRange | null; program_id: string; fiscal_year_id: string }

export function useCardMutations() {
  const queryClient = useQueryClient()
  const refresh = () => queryClient.invalidateQueries({ queryKey: cardsKey })
  const add = useMutation({
    mutationFn: async (card: NewCard) => {
      const { error } = await supabase.from('dashboard_cards').insert({
        ...card,
        range: card.range as unknown as Json,
        sub_range: card.sub_range as unknown as Json,
      } as never)
      if (error) throw error
    },
    onSuccess: refresh,
  })
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('dashboard_cards').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: refresh,
  })
  return { add, remove }
}

// ---------------------------------------------------------------------------
// WFP → activities
// ---------------------------------------------------------------------------
const toSyncItem = (a: WfpActivity) => ({
  row_id: a.rowId,
  title: a.title,
  unit: a.unit,
  target: a.target,
  budget: a.budget,
  obligated: a.obligated,
  disbursed: a.disbursed,
  phase: a.phase,
  status: a.status,
  targets: a.targets,
})

/** Creates or updates the program's activities from the WFP rows. */
export function useSyncWfpActivities() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (v: { sheetId: string; items: WfpActivity[] }) => {
      const { data, error } = await supabase.rpc('sync_wfp_activities', {
        p_sheet_id: v.sheetId,
        p_items: v.items.map(toSyncItem) as unknown as Json,
      })
      if (error) throw error
      return data
    },
    onSuccess: () =>
      Promise.all(
        [['activities'], ['activity_physical'], ['dashboard']].map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      ),
  })
}

// ---------------------------------------------------------------------------
// Activity status ↔ the WFP Status column
// ---------------------------------------------------------------------------
async function loadWfp(sheetId: string) {
  const [meta, content] = await Promise.all([
    supabase.from('finance_sheets').select('*').eq('id', sheetId).single(),
    supabase.from('finance_sheet_data').select('data').eq('sheet_id', sheetId).single(),
  ])
  if (meta.error) throw meta.error
  if (content.error) throw content.error
  return { meta: meta.data, sheet: normalizeSheet(content.data.data) }
}

/** The choices of the WFP's Status column (its dropdown list). */
export function useWfpStatusChoices(sheetId: string | null | undefined) {
  return useQuery({
    queryKey: [...sheetsKey, 'status-choices', sheetId],
    enabled: !!sheetId,
    queryFn: async () => {
      const { sheet } = await loadWfp(sheetId!)
      const col = resolveRoles(sheet).status
      return (col === undefined ? null : listFor(sheet, col)) ?? WFP_STATUSES
    },
  })
}

/** Sets an activity's status by writing it into its row of the WFP, then updating the activities. */
export function useSetWfpStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (v: { sheetId: string; rowId: string; status: string }) => {
      const { meta, sheet } = await loadWfp(v.sheetId)
      const row = sheet.rows.findIndex((r) => r.id === v.rowId)
      const col = resolveRoles(sheet).status
      if (row < 0) throw new Error('This activity is no longer in the WFP.')
      if (col === undefined)
        throw new Error('The WFP has no Status column. Add one named “Status” first.')
      const next = typeInto(sheet, row, col, v.status)
      const saved = await supabase.rpc('save_finance_sheet', {
        p_sheet_id: v.sheetId,
        p_version: meta.version,
        p_data: json(next),
        p_is_custom: meta.is_custom,
        p_template_key: meta.template_key,
      })
      if (saved.error) throw saved.error
      const items = wfpActivities(
        next,
        'WFP',
        createEvaluator({ sheets: new Map([['WFP', next]]) }),
      )
      const synced = await supabase.rpc('sync_wfp_activities', {
        p_sheet_id: v.sheetId,
        p_items: items.map(toSyncItem) as unknown as Json,
      })
      if (synced.error) throw synced.error
    },
    onSuccess: () =>
      Promise.all(
        [sheetsKey, ['activities'], ['activity_physical'], ['dashboard']].map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      ),
  })
}
