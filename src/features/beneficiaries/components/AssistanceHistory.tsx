import { ClipboardListIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ProgramChip } from '@/components/common/Badges'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useBeneficiaryAssistance } from '@/features/activities/api'
import { ActivityStatusBadge } from '@/features/activities/components/ActivityStatusBadge'
import { useAuth } from '@/features/auth/auth-context'
import { useWorkspace } from '@/features/workspace/workspace-context'
import { formatPeso } from '@/lib/format'

/** Activities this beneficiary took part in, newest first (limited to programs the viewer can see). */
export function AssistanceHistory({ beneficiaryId }: { beneficiaryId: string }) {
  const { data = [], isPending } = useBeneficiaryAssistance(beneficiaryId)
  const { programs, isSuperadmin } = useAuth()
  const { fiscalYears } = useWorkspace()
  const program = new Map(programs.map((p) => [p.id, p]))
  const year = new Map(fiscalYears.map((f) => [f.id, f.year]))
  const total = data.reduce((a, r) => a + Number(r.link.amount ?? 0), 0)
  const years = new Set(data.map((r) => year.get(r.activity.fiscal_year_id))).size

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClipboardListIcon className="text-primary size-5" /> Assistance history
        </CardTitle>
        <CardDescription>
          {data.length
            ? `${data.length} activit${data.length === 1 ? 'y' : 'ies'} · ${formatPeso(total)} · ${years} year${years === 1 ? '' : 's'} served`
            : 'Activities, inputs and amounts received'}
          {!isSuperadmin && ' · only programs you can access are shown'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <Skeleton className="h-24" />
        ) : data.length === 0 ? (
          <p className="text-muted-foreground text-sm">Not linked to any activity yet.</p>
        ) : (
          <div className="overflow-hidden rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Activity</TableHead>
                  <TableHead>FY</TableHead>
                  <TableHead className="text-right">Participants</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map(({ link, activity: a }) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <Link to={`/activities/${a.id}`} className="font-medium hover:underline">
                        {a.title}
                      </Link>
                      <span className="text-muted-foreground mt-0.5 flex items-center gap-1.5 text-xs">
                        {program.get(a.program_id) && (
                          <ProgramChip program={program.get(a.program_id)!} />
                        )}
                        <span className="font-mono">{a.code}</span>
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">{year.get(a.fiscal_year_id)}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {link.participants ?? '—'}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {link.quantity ?? '—'}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {formatPeso(link.amount)}
                    </TableCell>
                    <TableCell>
                      <ActivityStatusBadge status={a.display_status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
