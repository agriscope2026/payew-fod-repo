import { CheckCircle2Icon, SendIcon } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/features/auth/auth-context'
import { canManageProgram } from '@/features/auth/permissions'
import { OverdueNoticeDialog } from '@/features/directives/components/OverdueNoticeDialog'
import { formatPeso } from '@/lib/format'
import type { DashboardSummary } from '@/types/database'
import { Panel } from './Panel'

type Target = {
  kind: 'activity' | 'package'
  item: { id: string; code: string; title: string; program_id: string }
}

/** Overdue activities and packages (most days late first) with "Send Overdue Notice". */
export function OverduePanel({
  activities,
  packages,
  activityTotal,
  packageTotal,
}: {
  activities: DashboardSummary['overdue_activities']
  packages: DashboardSummary['overdue_packages']
  activityTotal: number
  packageTotal: number
}) {
  const { profile, programs } = useAuth()
  const programIds = programs.map((p) => p.id)
  const canNotify = (programId: string) => canManageProgram(profile, programIds, programId)
  const [target, setTarget] = useState<Target | null>(null)

  return (
    <Panel
      title="Overdue"
      description="Past their due date or current stage target, most days late first."
      className="lg:col-span-2"
    >
      <Tabs defaultValue={activities.length || !packages.length ? 'activities' : 'packages'}>
        <TabsList>
          <TabsTrigger value="activities">Activities · {activityTotal}</TabsTrigger>
          <TabsTrigger value="packages">Packages · {packageTotal}</TabsTrigger>
        </TabsList>

        <TabsContent value="activities" className="mt-3">
          {activities.length === 0 ? (
            <Clear what="activities" />
          ) : (
            <div className="max-h-96 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Activity</TableHead>
                    <TableHead>Current stage</TableHead>
                    <TableHead className="text-right">Days late</TableHead>
                    <TableHead>Responsible</TableHead>
                    <TableHead className="w-0" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activities.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="max-w-64">
                        <Link to={`/activities/${a.id}`} className="hover:underline">
                          <span className="block truncate font-medium">{a.title}</span>
                          <span className="text-muted-foreground font-mono text-xs">{a.code}</span>
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm">{a.current_stage_name ?? '—'}</TableCell>
                      <TableCell className="text-destructive text-right font-medium tabular-nums">
                        {a.days_late}
                      </TableCell>
                      <TableCell className="text-sm">{a.responsible ?? '—'}</TableCell>
                      <TableCell>
                        {canNotify(a.program_id) && (
                          <NoticeButton
                            onClick={() => setTarget({ kind: 'activity', item: a })}
                            label={a.code}
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="packages" className="mt-3">
          {packages.length === 0 ? (
            <Clear what="packages" />
          ) : (
            <div className="max-h-96 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Package</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Current step</TableHead>
                    <TableHead className="text-right">Days late</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="w-0" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {packages.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="max-w-56">
                        <Link
                          to={`/activities/${p.activity_id}/packages/${p.id}`}
                          className="hover:underline"
                        >
                          <span className="block truncate font-medium">{p.title}</span>
                          <span className="text-muted-foreground font-mono text-xs">{p.code}</span>
                        </Link>
                      </TableCell>
                      <TableCell className="max-w-40 truncate text-sm">
                        {p.supplier_name ?? (
                          <span className="text-muted-foreground">Not yet awarded</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">{p.current_stage_name ?? '—'}</TableCell>
                      <TableCell className="text-destructive text-right font-medium tabular-nums">
                        {p.days_late}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatPeso(p.amount)}
                      </TableCell>
                      <TableCell>
                        {canNotify(p.program_id) && (
                          <NoticeButton
                            onClick={() => setTarget({ kind: 'package', item: p })}
                            label={p.code}
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {target && (
        <OverdueNoticeDialog
          activity={target.item}
          kind={target.kind}
          onClose={() => setTarget(null)}
        />
      )}
    </Panel>
  )
}

function NoticeButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      aria-label={`Send overdue notice for ${label}`}
    >
      <SendIcon /> Notice
    </Button>
  )
}

function Clear({ what }: { what: string }) {
  return (
    <p className="text-success flex items-center gap-2 py-4 text-sm">
      <CheckCircle2Icon className="size-4" /> No overdue {what}.
    </p>
  )
}
