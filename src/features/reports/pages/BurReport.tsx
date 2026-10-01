import { ChevronDownIcon, ChevronRightIcon, FileSpreadsheetIcon } from 'lucide-react'
import { Fragment, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { pct } from '@/features/finance/finance-utils'
import { timestampSlug } from '@/lib/export'
import { formatPeso, formatPercent } from '@/lib/format'
import { errorMessage } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { exportSheet } from '@/lib/xlsx-export'
import { useBurReport, type ReportScope } from '../api'
import { ReportTable } from '../components/ReportTable'
import { ReportError } from './shared'

/** Budget Utilization Report: by expense class, then activity → package → supplier. */
export function BurReport({
  scope,
  programCode,
}: {
  scope: ReportScope
  programCode: (id: string) => string
}) {
  const { data, isPending, isError, refetch } = useBurReport(scope)
  const [open, setOpen] = useState<Set<string>>(new Set())

  if (isError) return <ReportError onRetry={() => void refetch()} />
  if (isPending || !data) return <Skeleton className="h-96" />

  const multi = scope.programIds.length > 1
  const packagesOf = (activityId: string) =>
    data.packages.filter((p) => p.activity_id === activityId)
  const t = data.activities.reduce(
    (s, a) => ({
      budget: s.budget + Number(a.budget_amount ?? 0),
      obligated: s.obligated + Number(a.obligated),
      disbursed: s.disbursed + Number(a.disbursed),
    }),
    { budget: 0, obligated: 0, disbursed: 0 },
  )

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const exportDrill = async () => {
    const rows: unknown[][] = []
    for (const a of data.activities) {
      rows.push([
        'Activity',
        programCode(a.program_id),
        a.code,
        a.title,
        '',
        Number(a.budget_amount ?? 0),
        Number(a.obligated),
        Number(a.disbursed),
        Number(a.budget_amount ?? 0) - Number(a.obligated),
        a.utilization_pct ?? '',
      ])
      for (const p of packagesOf(a.activity_id)) {
        rows.push([
          'Package',
          programCode(a.program_id),
          p.code,
          p.title,
          p.supplier_name ?? '',
          Number(p.contract_amount ?? p.abc_amount ?? 0),
          Number(p.obligated ?? 0),
          Number(p.disbursed ?? 0),
          Number(p.contract_amount ?? p.abc_amount ?? 0) - Number(p.obligated ?? 0),
          '',
        ])
      }
    }
    try {
      await exportSheet(
        `budget-utilization-${timestampSlug()}.xlsx`,
        'Activities & packages',
        [
          'Level',
          'Program',
          'Code',
          'Title',
          'Supplier',
          'Budget / contract',
          'Obligated',
          'Disbursed',
          'Unobligated',
          'Utilization %',
        ],
        rows,
      )
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-base font-semibold">A. By expense class</h2>
        <ReportTable
          rows={data.classes}
          rowKey={(r) => `${r.program_id}-${r.expense_class_id}`}
          exportAs={{ filename: 'budget-utilization-by-class', sheet: 'By expense class' }}
          columns={[
            ...(multi
              ? [
                  {
                    key: 'program',
                    label: 'Program',
                    value: (r: (typeof data.classes)[number]) => programCode(r.program_id),
                  },
                ]
              : []),
            { key: 'class', label: 'Expense class', value: (r) => r.expense_class_code },
            {
              key: 'allotted',
              label: 'Allotment',
              kind: 'money',
              total: true,
              value: (r) => Number(r.allotted),
            },
            {
              key: 'planned',
              label: 'WFP plan',
              kind: 'money',
              total: true,
              value: (r) => Number(r.planned),
            },
            {
              key: 'obligated',
              label: 'Obligated',
              kind: 'money',
              total: true,
              value: (r) => Number(r.obligated),
            },
            {
              key: 'disbursed',
              label: 'Disbursed',
              kind: 'money',
              total: true,
              value: (r) => Number(r.disbursed),
            },
            {
              key: 'unobligated',
              label: 'Unobligated',
              kind: 'money',
              total: true,
              value: (r) => Number(r.allotted) - Number(r.obligated),
            },
            {
              key: 'ob_rate',
              label: 'Obligation %',
              kind: 'pct',
              value: (r) => pct(Number(r.obligated), Number(r.allotted)),
            },
            {
              key: 'dv_rate',
              label: 'Disbursement %',
              kind: 'pct',
              value: (r) => pct(Number(r.disbursed), Number(r.obligated)),
            },
          ]}
        />
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold">B. By activity → package → supplier</h2>
          <div className="ml-auto flex gap-2 print:hidden">
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setOpen(open.size ? new Set() : new Set(data.activities.map((a) => a.activity_id)))
              }
            >
              {open.size ? 'Collapse all' : 'Expand all'}
            </Button>
            <Button variant="outline" size="sm" onClick={() => void exportDrill()}>
              <FileSpreadsheetIcon /> Export .xlsx
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Activity / package</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead className="text-right">Budget / contract</TableHead>
                <TableHead className="text-right">Obligated</TableHead>
                <TableHead className="text-right">Disbursed</TableHead>
                <TableHead className="text-right">Unobligated</TableHead>
                <TableHead className="text-right">Utilization</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.activities.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-muted-foreground py-10 text-center">
                    No activities for this fiscal year and program selection.
                  </TableCell>
                </TableRow>
              ) : (
                data.activities.map((a) => {
                  const pk = packagesOf(a.activity_id)
                  const isOpen = open.has(a.activity_id)
                  return (
                    <Fragment key={a.activity_id}>
                      <TableRow>
                        <TableCell>
                          <div className="flex items-start gap-1.5">
                            {pk.length > 0 ? (
                              <button
                                type="button"
                                onClick={() => toggle(a.activity_id)}
                                aria-expanded={isOpen}
                                aria-label={`${isOpen ? 'Hide' : 'Show'} packages of ${a.code}`}
                                className="hover:bg-muted mt-0.5 rounded print:hidden"
                              >
                                {isOpen ? (
                                  <ChevronDownIcon className="size-4" />
                                ) : (
                                  <ChevronRightIcon className="size-4" />
                                )}
                              </button>
                            ) : (
                              <span className="w-4 shrink-0" />
                            )}
                            <Link
                              to={`/activities/${a.activity_id}?tab=finance`}
                              className="hover:underline"
                            >
                              <span className="font-medium">{a.title}</span>
                              <span className="text-muted-foreground block font-mono text-xs">
                                {a.code}
                                {multi && ` · ${programCode(a.program_id)}`}
                                {pk.length > 0 &&
                                  ` · ${pk.length} package${pk.length === 1 ? '' : 's'}`}
                              </span>
                            </Link>
                          </div>
                        </TableCell>
                        <TableCell />
                        <Money v={a.budget_amount} />
                        <Money v={a.obligated} />
                        <Money v={a.disbursed} />
                        <Money
                          v={Number(a.budget_amount ?? 0) - Number(a.obligated)}
                          danger={Number(a.obligated) > Number(a.budget_amount ?? 0)}
                        />
                        <TableCell className="text-right tabular-nums">
                          {formatPercent(
                            a.utilization_pct === null ? null : Number(a.utilization_pct),
                          )}
                        </TableCell>
                      </TableRow>
                      {isOpen &&
                        pk.map((p) => {
                          const ceiling = Number(p.contract_amount ?? p.abc_amount ?? 0)
                          return (
                            <TableRow key={p.id} className="bg-muted/30">
                              <TableCell className="pl-11">
                                <Link
                                  to={`/activities/${a.activity_id}/packages/${p.id}?tab=finance`}
                                  className="hover:underline"
                                >
                                  <span>{p.title}</span>
                                  <span className="text-muted-foreground block font-mono text-xs">
                                    {p.code}
                                    {p.category_name && ` · ${p.category_name}`}
                                  </span>
                                </Link>
                              </TableCell>
                              <TableCell className="text-sm">
                                {p.supplier_name ?? (
                                  <span className="text-muted-foreground">Not yet awarded</span>
                                )}
                              </TableCell>
                              <Money v={ceiling} />
                              <Money v={p.obligated} />
                              <Money v={p.disbursed} />
                              <Money v={ceiling - Number(p.obligated ?? 0)} />
                              <TableCell className="text-right tabular-nums">
                                {formatPercent(pct(Number(p.obligated ?? 0), ceiling))}
                              </TableCell>
                            </TableRow>
                          )
                        })}
                    </Fragment>
                  )
                })
              )}
            </TableBody>
            {data.activities.length > 0 && (
              <TableFooter>
                <TableRow>
                  <TableCell>Total ({data.activities.length} activities)</TableCell>
                  <TableCell />
                  <Money v={t.budget} />
                  <Money v={t.obligated} />
                  <Money v={t.disbursed} />
                  <Money v={t.budget - t.obligated} />
                  <TableCell className="text-right tabular-nums">
                    {formatPercent(pct(t.obligated, t.budget))}
                  </TableCell>
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </div>
      </section>
    </div>
  )
}

function Money({ v, danger }: { v: number | string | null | undefined; danger?: boolean }) {
  return (
    <TableCell className={cn('text-right tabular-nums', danger && 'text-destructive')}>
      {formatPeso(Number(v ?? 0))}
    </TableCell>
  )
}
