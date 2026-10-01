import { ConstructionIcon } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { ALL_NAV_ITEMS } from '@/components/layout/nav-config'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'

const EXTRA: Record<string, { label: string; phase: number; description: string }> = {
  '/profile': {
    label: 'Profile',
    phase: 11,
    description: 'Name, position, contact, avatar, notification preferences and recent activity.',
  },
}

/** Shell page for modules delivered in later build phases. */
export default function ComingSoonPage() {
  const { pathname } = useLocation()
  const base = '/' + (pathname.split('/')[1] ?? '')
  const item = ALL_NAV_ITEMS.find((i) => i.to === base) ?? EXTRA[base]

  return (
    <div className="space-y-6">
      <PageHeader title={item?.label ?? 'Coming soon'} description={item?.description} />
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <span className="bg-gold/25 flex size-14 items-center justify-center rounded-full text-[oklch(0.45_0.1_80)]">
            <ConstructionIcon className="size-7" />
          </span>
          {item && <Badge variant="secondary">Build phase {item.phase}</Badge>}
          <p className="text-muted-foreground max-w-md text-sm">
            This module is part of the planned build. The page, navigation and access rules are in
            place; its features arrive in the phase shown above.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
