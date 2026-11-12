import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { RateBadge } from '@/features/finance/components/FinanceBits'
import { pct, rateState } from '@/features/finance/finance-utils'
import type { Thresholds } from '@/features/settings/api'
import type { DashboardSummary } from '@/types/database'
import { Panel } from './Panel'

/** Monitoring discipline has no setting of its own; it uses the default 80/50 bands. */
const DEFAULT_BANDS: Thresholds = { green: 80, amber: 50 }

/**
 * Per-program compliance: delivery on schedule, progress reporting, directive
 * responses and critical issues. Finance figures come from sheet cards instead.
 */
export function ComplianceScorecard({
  rows,
  progressDays,
}: {
  rows: DashboardSummary['compliance']
  progressDays: number
}) {
  return (
    <Panel
      title="Compliance scorecard"
      description={`Per program for the fiscal year. Progress updates count when filed within ${progressDays} days.`}
    >
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">No programs in scope.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Program</TableHead>
                <TableHead>On schedule</TableHead>
                <TableHead>Progress updated</TableHead>
                <TableHead>Directives on time</TableHead>
                <TableHead className="text-right">Critical issues</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const onSchedule = pct(r.on_schedule, r.activities)
                const progress = pct(r.progress_current, r.ongoing)
                const directives = pct(r.directives_on_time, r.directives_due)
                return (
                  <TableRow key={r.program_id}>
                    <TableCell>
                      <span className="flex items-center gap-2 font-medium">
                        <span
                          className="size-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: r.color }}
                        />
                        {r.code}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Rate v={onSchedule} t={DEFAULT_BANDS} />
                      <Sub>
                        {r.on_schedule}/{r.activities} activities
                      </Sub>
                    </TableCell>
                    <TableCell>
                      <Rate v={progress} t={DEFAULT_BANDS} />
                      <Sub>
                        {r.progress_current}/{r.ongoing} ongoing
                      </Sub>
                    </TableCell>
                    <TableCell>
                      <Rate v={directives} t={DEFAULT_BANDS} />
                      <Sub>
                        {r.directives_on_time}/{r.directives_due} due
                      </Sub>
                    </TableCell>
                    <TableCell
                      className={
                        r.critical_issues > 0
                          ? 'text-destructive text-right font-medium tabular-nums'
                          : 'text-right tabular-nums'
                      }
                    >
                      {r.critical_issues}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </Panel>
  )
}

function Rate({ v, t }: { v: number | null; t: Thresholds | undefined }) {
  return <RateBadge pct={v} state={rateState(v, t)} />
}

function Sub({ children }: { children: React.ReactNode }) {
  return <span className="text-muted-foreground block text-[11px] tabular-nums">{children}</span>
}
