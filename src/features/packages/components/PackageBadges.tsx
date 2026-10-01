import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { PackageDisplayStatus } from '@/types/database'
import { CategoryIcon } from '../category-meta'
import { PACKAGE_STATUS } from '../status'

/** Status always carries an icon + label. */
export function PackageStatusBadge({
  status,
  className,
}: {
  status: PackageDisplayStatus
  className?: string
}) {
  const m = PACKAGE_STATUS[status]
  return (
    <Badge variant="outline" className={cn('gap-1', m.className, className)}>
      <m.icon /> {m.label}
    </Badge>
  )
}

export function CategoryTag({ code, name }: { code: string | null; name: string | null }) {
  return (
    <span className="bg-muted inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px]">
      <CategoryIcon code={code} className="size-3" /> {name ?? 'Uncategorized'}
    </span>
  )
}
