import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { DisplayStatus } from '@/types/database'
import { STATUS_META } from '../status'

export function ActivityStatusBadge({
  status,
  className,
}: {
  status: DisplayStatus
  className?: string
}) {
  const meta = STATUS_META[status]
  return (
    <Badge variant="outline" className={cn('gap-1', meta.className, className)}>
      <meta.icon /> {meta.label}
    </Badge>
  )
}
