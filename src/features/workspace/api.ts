import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export function useFiscalYears() {
  return useQuery({
    queryKey: ['fiscal_years'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fiscal_years')
        .select('*')
        .order('year', { ascending: false })
      if (error) throw error
      return data
    },
    staleTime: 10 * 60_000,
  })
}
