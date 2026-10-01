import { useQuery } from '@tanstack/react-query'
import { WrenchIcon } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface BannerSetting {
  enabled: boolean
  message: string
}

/** Superadmin-controlled banner (Settings → System → maintenance_banner). */
export function MaintenanceBanner() {
  const { data } = useQuery({
    queryKey: ['app_settings', 'maintenance_banner'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'maintenance_banner')
        .maybeSingle()
      if (error) throw error
      return (data?.value ?? null) as BannerSetting | null
    },
    staleTime: 5 * 60_000,
  })

  if (!data?.enabled || !data.message) return null
  return (
    <div
      role="status"
      className="bg-warning flex items-center justify-center gap-2 px-4 py-1.5 text-center text-sm font-medium text-[oklch(0.25_0.05_75)]"
    >
      <WrenchIcon className="size-4 shrink-0" />
      {data.message}
    </div>
  )
}
