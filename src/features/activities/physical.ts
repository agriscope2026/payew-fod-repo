import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { ActivityPhysicalRow } from '@/types/database'

export const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]
export const QUARTER_LABELS = ['1st Qtr', '2nd Qtr', '3rd Qtr', '4th Qtr']

export const twelve = (values?: (number | string | null)[] | null) =>
  Array.from({ length: 12 }, (_, i) => Number(values?.[i] ?? 0) || 0)
export const quarters = (m: number[]) =>
  [0, 1, 2, 3].map((q) => m[q * 3] + m[q * 3 + 1] + m[q * 3 + 2])
export const sum = (m: number[]) => m.reduce((a, b) => a + b, 0)

/** BED 2 order: three months, then their quarter, four times, then the year. */
export function bedColumns(m: number[]) {
  const q = quarters(m)
  const out: { label: string; value: number; quarter: boolean; month?: number }[] = []
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 3; j++)
      out.push({
        label: MONTH_LABELS[i * 3 + j],
        value: m[i * 3 + j],
        quarter: false,
        month: i * 3 + j,
      })
    out.push({ label: QUARTER_LABELS[i], value: q[i], quarter: true })
  }
  out.push({ label: 'Total', value: sum(m), quarter: true })
  return out
}

export const physicalKey = ['activity_physical'] as const

/** Physical targets and WFP links of the activities, by activity id. */
export function useActivityPhysical(programIds: string[], fiscalYearId: string | null) {
  return useQuery({
    queryKey: [...physicalKey, programIds, fiscalYearId],
    enabled: programIds.length > 0 && !!fiscalYearId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activity_physical')
        .select('*')
        .in('program_id', programIds)
        .eq('fiscal_year_id', fiscalYearId!)
      if (error) throw error
      return new Map((data as ActivityPhysicalRow[]).map((p) => [p.activity_id, p]))
    },
  })
}

export function useSavePhysical() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (v: {
      activityId: string
      targets: number[]
      done: number[]
      statusNote: string | null
      exists: boolean
    }) => {
      const row = { monthly_targets: v.targets, monthly_done: v.done, status_note: v.statusNote }
      const { error } = v.exists
        ? await supabase.from('activity_physical').update(row).eq('activity_id', v.activityId)
        : await supabase
            .from('activity_physical')
            .insert({ activity_id: v.activityId, ...row } as never)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: physicalKey }),
  })
}

/** One activity's physical targets and WFP link. */
export function useActivityPhysicalOne(activityId: string | undefined) {
  return useQuery({
    queryKey: [...physicalKey, 'one', activityId],
    enabled: !!activityId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activity_physical')
        .select('*')
        .eq('activity_id', activityId!)
        .maybeSingle()
      if (error) throw error
      return (data as ActivityPhysicalRow | null) ?? undefined
    },
  })
}
