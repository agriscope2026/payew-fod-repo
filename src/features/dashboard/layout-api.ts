import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/auth-context'
import { settingsKey } from '@/features/settings/api'
import { supabase } from '@/lib/supabase'
import type { Json } from '@/types/database'
import type { LayoutItem } from './layout'

const layoutKey = ['dashboard_layout'] as const

/** The signed-in user's saved layout; null until they save one. */
export function useUserLayout() {
  const { profile } = useAuth()
  return useQuery({
    queryKey: [...layoutKey, profile?.id],
    enabled: !!profile,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dashboard_layouts')
        .select('layout')
        .eq('user_id', profile!.id)
        .maybeSingle()
      if (error) throw error
      return data?.layout ?? null
    },
  })
}

export function useLayoutMutations() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const refresh = () => queryClient.invalidateQueries({ queryKey: layoutKey })

  const save = useMutation({
    mutationFn: async (layout: LayoutItem[]) => {
      const { error } = await supabase
        .from('dashboard_layouts')
        .upsert({ user_id: profile!.id, layout: layout as unknown as Json })
      if (error) throw error
    },
    onSuccess: refresh,
  })
  const reset = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('dashboard_layouts').delete().eq('user_id', profile!.id)
      if (error) throw error
    },
    onSuccess: refresh,
  })
  const setDefault = useMutation({
    mutationFn: async (layout: LayoutItem[]) => {
      const { error } = await supabase
        .from('app_settings')
        .update({ value: layout as unknown as Json })
        .eq('key', 'dashboard_default_layout')
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: settingsKey }),
  })
  return { save, reset, setDefault }
}
