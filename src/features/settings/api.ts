import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { FiscalYearStatus, Json, ProgramRow } from '@/types/database'

// ---------------------------------------------------------------------------
// Programs
// ---------------------------------------------------------------------------
export const programsKey = ['programs'] as const

/** Programs visible to the caller (superadmin: all non-deleted, including archived). */
export function usePrograms() {
  return useQuery({
    queryKey: programsKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('programs')
        .select('*')
        .is('deleted_at', null)
        .order('code')
      if (error) throw error
      return data
    },
  })
}

export type ProgramInput = Pick<ProgramRow, 'code' | 'name' | 'description' | 'color'>

function useInvalidatePrograms() {
  const queryClient = useQueryClient()
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: programsKey }),
      // The auth context caches the user's programs too.
      queryClient.invalidateQueries({ queryKey: ['me'] }),
    ])
  }
}

export function useSaveProgram() {
  const invalidate = useInvalidatePrograms()
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: Partial<ProgramInput> }) => {
      const query = id
        ? supabase.from('programs').update(input).eq('id', id)
        : supabase.from('programs').insert(input as ProgramInput)
      const { data, error } = await query.select().single()
      if (error) throw error
      return data
    },
    onSuccess: invalidate,
  })
}

export function useSetProgramState() {
  const invalidate = useInvalidatePrograms()
  return useMutation({
    mutationFn: async ({
      id,
      action,
    }: {
      id: string
      action: 'archive' | 'unarchive' | 'delete'
    }) => {
      const now = new Date().toISOString()
      const patch =
        action === 'archive'
          ? { archived_at: now }
          : action === 'unarchive'
            ? { archived_at: null }
            : { deleted_at: now }
      const { error } = await supabase.from('programs').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

// ---------------------------------------------------------------------------
// Fiscal years
// ---------------------------------------------------------------------------
function useInvalidateFiscalYears() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: ['fiscal_years'] })
}

export function useCreateFiscalYear() {
  const invalidate = useInvalidateFiscalYears()
  return useMutation({
    mutationFn: async (input: {
      year: number
      label: string
      start_date: string
      end_date: string
    }) => {
      const { error } = await supabase.from('fiscal_years').insert({ ...input, status: 'draft' })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

export function useSetFiscalYearStatus() {
  const invalidate = useInvalidateFiscalYears()
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: FiscalYearStatus }) => {
      const { error } = await supabase.from('fiscal_years').update({ status }).eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

export function useSetCurrentFiscalYear() {
  const invalidate = useInvalidateFiscalYears()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('set_current_fiscal_year', { p_fiscal_year_id: id })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

// ---------------------------------------------------------------------------
// App settings (key → jsonb)
// ---------------------------------------------------------------------------
export interface Thresholds {
  green: number
  amber: number
}

export interface AppSettings {
  validation_strictness: 'warn' | 'block'
  dashboard_thresholds: Record<'utilization' | 'obligation_rate' | 'disbursement_rate', Thresholds>
  overdue_notice_template: { title: string; body: string; response_days: number }
  reminders: {
    stage_due_days: number
    directive_due_days: number
    /** Days overdue at which escalation levels 1, 2, 3 start. */
    activity_escalation_days: number[]
    directive_escalation_days: number[]
  }
  maintenance_banner: { enabled: boolean; message: string }
  uploads: { max_mb: number; allowed_extensions: string[]; presign_ttl_seconds: number }
  timezone: string
}

export const settingsKey = ['app_settings'] as const

export function useAppSettings() {
  return useQuery({
    queryKey: settingsKey,
    queryFn: async () => {
      const { data, error } = await supabase.from('app_settings').select('key, value')
      if (error) throw error
      return Object.fromEntries(
        data.map((r) => [r.key, r.value]),
      ) as unknown as Partial<AppSettings>
    },
  })
}

export type SettingInput = {
  [K in keyof AppSettings]: { key: K; value: AppSettings[K] }
}[keyof AppSettings]

export function useSaveSetting() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ key, value }: SettingInput) => {
      const { error } = await supabase
        .from('app_settings')
        .upsert({ key, value: value as unknown as Json }, { onConflict: 'key' })
      if (error) throw error
    },
    // Prefix match also refreshes the maintenance banner query.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: settingsKey }),
  })
}
