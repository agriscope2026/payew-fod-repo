import { Badge } from '@/components/ui/badge'
import type { BeneficiaryStatus } from '@/types/database'

const STYLES: Record<BeneficiaryStatus, { label: string; className: string }> = {
  active: { label: 'Active', className: 'border-success/40 text-success' },
  inactive: { label: 'Inactive', className: 'text-muted-foreground' },
  dissolved: { label: 'Dissolved', className: 'border-destructive/40 text-destructive' },
}

export function StatusBadge({ status }: { status: BeneficiaryStatus }) {
  const s = STYLES[status]
  return (
    <Badge variant="outline" className={s.className}>
      {s.label}
    </Badge>
  )
}
