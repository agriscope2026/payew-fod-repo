import { Badge } from '@/components/ui/badge'
import { ROLE_LABELS } from '@/features/auth/permissions'
import { cn } from '@/lib/utils'
import type { AppRole, ProgramRow } from '@/types/database'

const ROLE_STYLES: Record<AppRole, string> = {
  superadmin: 'bg-gold/30 text-[oklch(0.4_0.09_80)] dark:text-gold',
  program_admin: 'bg-primary/12 text-primary',
  program_staff: 'bg-secondary text-secondary-foreground',
}

export function RoleBadge({ role }: { role: AppRole }) {
  return (
    <Badge variant="outline" className={cn('border-transparent', ROLE_STYLES[role])}>
      {ROLE_LABELS[role]}
    </Badge>
  )
}

export function ProgramChip({ program }: { program: Pick<ProgramRow, 'code' | 'name' | 'color'> }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-xs font-medium"
      title={program.name}
    >
      <span className="size-2 rounded-full" style={{ backgroundColor: program.color }} />
      {program.code}
    </span>
  )
}

export function ActiveBadge({ active }: { active: boolean }) {
  return active ? (
    <Badge variant="outline" className="border-success/40 text-success">
      Active
    </Badge>
  ) : (
    <Badge variant="outline" className="border-destructive/40 text-destructive">
      Inactive
    </Badge>
  )
}
