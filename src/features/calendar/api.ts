import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export const calendarKey = ['calendar'] as const

/** Dated events between two days (inclusive) for the selected programs. */
export function useCalendarEvents(from: string, to: string, programIds: string[]) {
  return useQuery({
    queryKey: [...calendarKey, from, to, programIds],
    enabled: programIds.length > 0,
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('calendar_events', {
        p_from: from,
        p_to: to,
        p_program_ids: programIds,
      })
      if (error) throw error
      return data
    },
  })
}
