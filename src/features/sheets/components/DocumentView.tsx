import { PrinterIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatPeso } from '@/lib/format'
import { cn } from '@/lib/utils'
import { formatValue } from '../display'
import { isError, type Scalar } from '../formula'
import { getCell, type ColumnRole, type Evaluator, type Sheet, type SheetKind } from '../model'
import { headerLabels, headerRowCount, resolveRoles, wfpActivities, wfpTotals } from '../wfp'
import { DA_OFFICE } from '../xlsx-io'

const text = (v: Scalar) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '')
const TOTAL = /^\s*(grand\s+|sub-?\s*)?total\b/i
const pct = (part: number, whole: number) =>
  whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : '—'
const title = (s: string) =>
  s.replace(/(^|› |\s)([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase())

/**
 * The sheet as a document: letterhead, then the same data laid out for reading and
 * printing. Read-only; edits are made in the sheet view.
 */
export function DocumentView({
  sheet,
  sheetName,
  kind,
  evaluator,
  heading,
  subheading,
}: {
  sheet: Sheet
  sheetName: string
  kind: SheetKind
  evaluator: Evaluator
  heading: string
  subheading: string
}) {
  const structured = kind === 'WFP' && resolveRoles(sheet).phase !== undefined
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 print:hidden">
        <p className="text-muted-foreground text-sm">
          A reading and printing view of the {sheetName}. Switch to Sheet to make changes.
        </p>
        <Button size="sm" variant="outline" onClick={() => window.print()}>
          <PrinterIcon /> Print or save as PDF
        </Button>
      </div>
      <article className="print-doc bg-card mx-auto max-w-[1200px] rounded-md border px-6 py-8 shadow-sm sm:px-10 print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <header className="border-primary mb-6 flex items-center gap-4 border-b-4 pb-4">
          <img
            src="/brand/da-car-logo.png"
            alt="DA Regional Field Office CAR logo"
            className="size-20 shrink-0"
          />
          <div className="min-w-0 flex-1 text-center">
            <p className="text-muted-foreground text-xs">Republic of the Philippines</p>
            <p className="text-primary text-xl font-bold tracking-wide">
              DEPARTMENT OF AGRICULTURE
            </p>
            <p className="text-sm">{DA_OFFICE}</p>
            <h2 className="text-primary mt-2 text-lg font-bold uppercase">{heading}</h2>
            <p className="text-muted-foreground text-xs">{subheading}</p>
          </div>
          <div className="size-20 shrink-0" aria-hidden />
        </header>
        {structured ? (
          <WfpDocument sheet={sheet} name={sheetName} ev={evaluator} />
        ) : (
          <TableDocument sheet={sheet} name={sheetName} ev={evaluator} />
        )}
      </article>
    </div>
  )
}

function Figure({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-md border px-3 py-2">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="text-base font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-muted-foreground text-[11px]">{hint}</p>}
    </div>
  )
}

/** WFP by phase and activity, each activity with its line items and payments. */
function WfpDocument({ sheet, name, ev }: { sheet: Sheet; name: string; ev: Evaluator }) {
  const roles = resolveRoles(sheet)
  const labels = headerLabels(sheet)
  const col = (test: RegExp, not?: RegExp) =>
    labels.findIndex((l) => test.test(l) && !(not && not.test(l)))
  const poCol = col(/\bpo\b|po no|po #/)
  const supplierCol = col(/supplier|payee/)
  const particularsCol = col(/particular/, /program|activit/)
  const at = (r: number, role: ColumnRole) =>
    roles[role] === undefined ? null : ev.value(name, r, roles[role]!)
  const raw = (r: number, c: number) => (c < 0 ? '' : text(ev.value(name, r, c)))
  const money = (v: Scalar) => (typeof v === 'number' && !isError(v) ? formatPeso(v) : '')

  const totals = wfpTotals(sheet, name, ev)
  const activities = wfpActivities(sheet, name, ev)
  const byRow = new Map(activities.map((a) => [a.row, a]))
  const start = headerRowCount(sheet)
  const end = activities.length ? Math.max(...activities.map((a) => a.lastRow)) : start - 1

  const blocks: React.ReactNode[] = []
  for (let r = start; r <= end; r++) {
    const phase = text(at(r, 'phase'))
    const pap = text(at(r, 'pap'))
    const a = byRow.get(r)
    if (phase) {
      blocks.push(
        <h3
          key={r}
          className="bg-primary text-primary-foreground mt-6 break-after-avoid rounded px-3 py-1.5 text-base font-semibold"
        >
          {phase}
        </h3>,
      )
    } else if (a) {
      const details: number[] = []
      for (let i = a.row; i <= a.lastRow; i++) {
        const has =
          (i > a.row && text(at(i, 'sub'))) ||
          text(at(i, 'object')) ||
          raw(i, supplierCol) ||
          typeof at(i, 'obligated') === 'number' ||
          typeof at(i, 'for_disbursement') === 'number'
        if (has) details.push(i)
      }
      blocks.push(
        <section key={r} className="mt-4 break-inside-avoid-page rounded-md border">
          <div className="bg-muted/50 flex flex-wrap items-start gap-x-4 gap-y-1 border-b px-3 py-2">
            <h4 className="min-w-0 flex-1 text-sm font-semibold">{a.title}</h4>
            {a.status && <Badge variant="outline">{a.status}</Badge>}
            <p className="text-muted-foreground w-full text-xs tabular-nums">
              Target: <b className="text-foreground">{a.target ?? '—'}</b> {a.unit ?? ''} · Budget{' '}
              <b className="text-foreground">{formatPeso(a.budget)}</b> · Obligated{' '}
              <b className="text-foreground">{formatPeso(a.obligated)}</b> (
              {pct(a.obligated ?? 0, a.budget ?? 0)}) · Disbursed{' '}
              <b className="text-foreground">{formatPeso(a.disbursed)}</b> · Balance{' '}
              <b className="text-foreground">{formatPeso((a.budget ?? 0) - (a.obligated ?? 0))}</b>
            </p>
          </div>
          {details.length > 0 && (
            <table className="w-full text-xs">
              <thead className="text-muted-foreground">
                <tr className="[&_th]:border-b [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-medium">
                  <th className="w-[30%]">Sub-activity / object of expenditure</th>
                  <th className="!text-right">Budget</th>
                  <th className="!text-right">Obligated</th>
                  <th className="w-[26%]">Supplier · PO · particulars</th>
                  <th className="!text-right">For disbursement</th>
                  <th className="!text-center">Paid</th>
                  <th>Remarks</th>
                </tr>
              </thead>
              <tbody>
                {details.map((i) => {
                  const sub = i > a.row ? text(at(i, 'sub')) : ''
                  const object = text(at(i, 'object'))
                  const supplier = [
                    raw(i, supplierCol),
                    raw(i, poCol) && `PO ${raw(i, poCol)}`,
                    raw(i, particularsCol),
                  ]
                    .filter(Boolean)
                    .join(' · ')
                  return (
                    <tr
                      key={i}
                      className="align-top [&_td]:border-b [&_td]:px-2 [&_td]:py-1.5 last:[&_td]:border-b-0"
                    >
                      <td>
                        {sub && <span className="block font-medium">{sub}</span>}
                        {object}
                      </td>
                      <td className="text-right tabular-nums">
                        {object ? money(at(i, 'budget')) : ''}
                      </td>
                      <td className="text-right tabular-nums">{money(at(i, 'obligated'))}</td>
                      <td>{supplier}</td>
                      <td className="text-right tabular-nums">
                        {money(at(i, 'for_disbursement'))}
                      </td>
                      <td className="text-center">{at(i, 'paid') === true ? '✓' : ''}</td>
                      <td>{text(at(i, 'remarks'))}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </section>,
      )
      r = a.lastRow
    } else if (pap) {
      blocks.push(
        <h4 key={r} className="mt-5 break-after-avoid border-b pb-1 text-sm font-semibold">
          {pap}
        </h4>,
      )
    }
  }

  return (
    <>
      {totals && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Figure
            label="Budget"
            value={formatPeso(totals.budget)}
            hint={`${activities.length} activities`}
          />
          <Figure
            label="Obligated"
            value={formatPeso(totals.obligated)}
            hint={`${pct(totals.obligated, totals.budget)} of budget`}
          />
          <Figure
            label="Disbursed"
            value={formatPeso(totals.disbursed)}
            hint={`${pct(totals.disbursed, totals.obligated)} of obligations`}
          />
          <Figure
            label="Unobligated balance"
            value={formatPeso(totals.budget - totals.obligated)}
          />
        </div>
      )}
      {blocks.length ? (
        blocks
      ) : (
        <p className="text-muted-foreground mt-6 text-sm">Nothing in this WFP yet.</p>
      )}
    </>
  )
}

/** Any sheet as one clean table: the header labels, then every row that has content. */
function TableDocument({ sheet, name, ev }: { sheet: Sheet; name: string; ev: Evaluator }) {
  const start = headerRowCount(sheet)
  const labels = headerLabels(sheet)
  const rows: number[] = []
  const used = new Set<number>()
  for (let r = start; r < sheet.rows.length; r++) {
    let any = false
    sheet.cols.forEach((_, c) => {
      const v = ev.value(name, r, c)
      if (v !== null && v !== '' && v !== false) {
        any = true
        // A column counts as used when a data row (not a total) has something in it.
        used.add(c)
      }
    })
    if (any) rows.push(r)
  }
  const cols = sheet.cols.map((_, c) => c).filter((c) => used.has(c))
  if (!rows.length)
    return <p className="text-muted-foreground text-sm">Nothing in this sheet yet.</p>
  return (
    <div className="overflow-x-auto print:overflow-visible">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            {cols.map((c) => (
              <th
                key={c}
                className="bg-primary text-primary-foreground border px-2 py-1.5 text-left font-semibold"
              >
                {title(labels[c].split(' › ').pop() ?? '')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const first = cols.map((c) => ev.value(name, r, c)).find((v) => text(v) !== '')
            const total = typeof first === 'string' && TOTAL.test(first)
            return (
              <tr key={r} className={cn('align-top', total && 'bg-muted font-semibold')}>
                {cols.map((c) => {
                  const v = ev.value(name, r, c)
                  const cell = getCell(sheet, r, c)
                  return (
                    <td
                      key={c}
                      className={cn(
                        'border px-2 py-1',
                        typeof v === 'number' && 'text-right tabular-nums',
                        cell?.s?.b && 'font-semibold',
                      )}
                    >
                      {v === true
                        ? '✓'
                        : v === false
                          ? ''
                          : formatValue(
                              v,
                              cell?.s?.fmt ??
                                (typeof v === 'number' && !Number.isInteger(v)
                                  ? 'number'
                                  : undefined),
                            )}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
