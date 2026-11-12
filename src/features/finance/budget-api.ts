import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { financeKey, type FinanceScope } from './api'

/** Each program's total budget for the fiscal year, by program id. */
export function useYearBudgets(scope: FinanceScope) {
  return useQuery({
    queryKey: [...financeKey, 'year_budgets', scope],
    enabled: scope.programIds.length > 0 && !!scope.fiscalYearId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('program_year_budgets')
        .select('*')
        .in('program_id', scope.programIds)
        .eq('fiscal_year_id', scope.fiscalYearId!)
      if (error) throw error
      return new Map(data.map((b) => [b.program_id, Number(b.total_budget)]))
    },
  })
}

export function useSaveYearBudget() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (v: { programId: string; fiscalYearId: string; total: number }) => {
      const { error } = await supabase
        .from('program_year_budgets')
        .upsert(
          { program_id: v.programId, fiscal_year_id: v.fiscalYearId, total_budget: v.total },
          { onConflict: 'program_id,fiscal_year_id' },
        )
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: financeKey }),
  })
}
