import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export const dashboardKey = ['dashboard'] as const

/** Every dashboard figure for the workspace FY and program selector, in one call. */
export function useDashboardSummary(fiscalYearId: string | null, programIds: string[]) {
  return useQuery({
    queryKey: [...dashboardKey, fiscalYearId, programIds],
    enabled: !!fiscalYearId && programIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('dashboard_summary', {
        p_fiscal_year_id: fiscalYearId!,
        p_program_ids: programIds,
      })
      if (error) throw error
      return data
    },
  })
}
