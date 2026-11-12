import { SaveIcon, SearchIcon } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatPeso } from '@/lib/format'
import { formatValue } from '../display'
import { isError, type Scalar } from '../formula'
import { getCell, type Evaluator, type Sheet, type SheetKind } from '../model'
import { headerLabels, headerRowCount, resolveRoles, wfpActivities, type WfpActivity } from '../wfp'
import { RowDialog } from './RowDialog'

const text = (v: Scalar) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '')
const TOTAL = /^\s*(grand\s+|sub-?\s*)?total\b/i
const title = (s: string) =>
  s.replace(/(^|› |\s)([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase())
const share = (part: number, whole: number) =>
  whole > 0 ? Math.max(0, Math.min(100, (part / whole) * 100)) : 0

const CARD =
  'bg-card hover:border-primary/60 focus-visible:ring-ring flex w-full flex-col gap-2 rounded-lg border p-3 text-left shadow-xs transition-colors outline-none hover:shadow-sm focus-visible:ring-2'
const GRID = 'grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4'

/**
 * The sheet as cards: one per activity in the WFP, one per row in the other sheets.
 * Opening a card shows the whole row as a form, the same one the sheet view uses.
 */
export function CardView({
  sheet,
  sheetName,
  kind,
  evaluator,
  readOnly,
  dirty,
  saving,
  onChange,
  onSave,
  rowExtras,
}: {
  sheet: Sheet
  sheetName: string
  kind: SheetKind
  evaluator: Evaluator
  readOnly: boolean
  dirty: boolean
  saving: boolean
  onChange: (next: Sheet) => void
  onSave: () => void
  rowExtras?: (row: number, evaluator: Evaluator) => ReactNode
}) {
  const [search, setSearch] = useState('')
  const [openRow, setOpenRow] = useState<number | null>(null)
  const structured = kind === 'WFP' && resolveRoles(sheet).phase !== undefined
  const q = search.trim().toLowerCase()

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-muted-foreground min-w-0 flex-1 text-sm">
          {structured ? 'One card per activity.' : 'One card per row.'}{' '}
          {readOnly ? 'Open a card to see the whole row.' : 'Open a card to edit the whole row.'}
        </p>
        <div className="relative w-full sm:w-64">
          <SearchIcon className="text-muted-foreground absolute top-2.5 left-2.5 size-4" />
          <Input
            aria-label="Search cards"
            placeholder="Search…"
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {!readOnly && (
          <Button size="sm" disabled={!dirty || saving} onClick={onSave}>
            <SaveIcon /> Save
          </Button>
        )}
      </div>
      {structured ? (
        <WfpCards sheet={sheet} name={sheetName} ev={evaluator} q={q} onOpen={setOpenRow} />
      ) : (
        <RowCards sheet={sheet} name={sheetName} ev={evaluator} q={q} onOpen={setOpenRow} />
      )}
      {openRow !== null && openRow < sheet.rows.length && (
        <RowDialog
          sheet={sheet}
          sheetName={sheetName}
          evaluator={evaluator}
          row={openRow}
          readOnly={readOnly}
          onChange={onChange}
          onMove={setOpenRow}
          onClose={() => setOpenRow(null)}
          activity={rowExtras?.(openRow, evaluator)}
        />
      )}
    </div>
  )
}

function Meter({ label, value, of }: { label: string; value: number; of: number }) {
  const pct = share(value, of)
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums">
          {formatPeso(value)}{' '}
          <span className="text-muted-foreground">{of > 0 ? `${pct.toFixed(0)}%` : ''}</span>
        </span>
      </div>
      <div
        className="bg-muted mt-1 h-1.5 overflow-hidden rounded-full"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
      >
        <div className="bg-viz-mid h-full rounded-full" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function Empty({ q }: { q: string }) {
  return (
    <p className="text-muted-foreground rounded-md border border-dashed px-3 py-8 text-center text-sm">
      {q ? 'No cards match your search.' : 'Nothing in this sheet yet.'}
    </p>
  )
}

function WfpCards({
  sheet,
  name,
  ev,
  q,
  onOpen,
}: {
  sheet: Sheet
  name: string
  ev: Evaluator
  q: string
  onOpen: (row: number) => void
}) {
  const groups = useMemo(() => {
    const out: { phase: string; items: WfpActivity[] }[] = []
    for (const a of wfpActivities(sheet, name, ev)) {
      if (q && !`${a.title} ${a.status ?? ''} ${a.phase ?? ''}`.toLowerCase().includes(q)) continue
      const phase = a.phase ?? 'No phase'
      const last = out[out.length - 1]
      if (last?.phase === phase) last.items.push(a)
      else out.push({ phase, items: [a] })
    }
    return out
  }, [sheet, name, ev, q])

  if (!groups.length) return <Empty q={q} />
  return (
    <div className="space-y-5">
      {groups.map((g, i) => {
        const budget = g.items.reduce((s, a) => s + (a.budget ?? 0), 0)
        return (
          <section key={`${g.phase}-${i}`} className="space-y-2">
            <h3 className="flex flex-wrap items-baseline gap-x-2 border-b pb-1 text-sm font-semibold">
              {g.phase}
              <span className="text-muted-foreground text-xs font-normal">
                {g.items.length} {g.items.length === 1 ? 'activity' : 'activities'} ·{' '}
                {formatPeso(budget)}
              </span>
            </h3>
            <div className={GRID}>
              {g.items.map((a) => (
                <button key={a.rowId} type="button" className={CARD} onClick={() => onOpen(a.row)}>
                  <div className="flex items-start gap-2">
                    <p className="line-clamp-3 min-w-0 flex-1 text-sm font-medium">{a.title}</p>
                    {a.status && (
                      <Badge variant="outline" className="shrink-0">
                        {a.status}
                      </Badge>
                    )}
                  </div>
                  <p className="text-muted-foreground text-xs">
                    Target <b className="text-foreground tabular-nums">{a.target ?? '—'}</b>{' '}
                    {a.unit ?? ''}
                  </p>
                  <div className="mt-auto space-y-2 pt-1">
                    <div>
                      <p className="text-muted-foreground text-xs">Budget</p>
                      <p className="text-lg font-semibold tabular-nums">{formatPeso(a.budget)}</p>
                    </div>
                    <Meter label="Obligated" value={a.obligated ?? 0} of={a.budget ?? 0} />
                    <Meter label="Disbursed" value={a.disbursed ?? 0} of={a.budget ?? 0} />
                    <p className="text-muted-foreground flex justify-between border-t pt-2 text-xs">
                      Balance
                      <span className="text-foreground tabular-nums">
                        {formatPeso((a.budget ?? 0) - (a.obligated ?? 0))}
                      </span>
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

/** Any sheet: each row with content becomes a card of its filled columns. */
function RowCards({
  sheet,
  name,
  ev,
  q,
  onOpen,
}: {
  sheet: Sheet
  name: string
  ev: Evaluator
  q: string
  onOpen: (row: number) => void
}) {
  const cards = useMemo(() => {
    const labels = headerLabels(sheet)
    const show = (r: number, c: number, v: Scalar) => {
      if (v === true) return '✓'
      const fmt = getCell(sheet, r, c)?.s?.fmt
      return formatValue(
        v,
        fmt ?? (typeof v === 'number' && !Number.isInteger(v) ? 'number' : undefined),
      )
    }
    const out: {
      row: number
      title: string
      fields: { label: string; value: string; num: boolean }[]
    }[] = []
    for (let r = headerRowCount(sheet); r < sheet.rows.length; r++) {
      const filled: { c: number; v: Scalar }[] = []
      sheet.cols.forEach((_, c) => {
        const v = ev.value(name, r, c)
        if (v !== null && v !== '' && v !== false && !isError(v)) filled.push({ c, v })
      })
      // Rows holding only formula results (zeros in an empty template row) are not cards.
      const typed = filled.some(({ c }) => getCell(sheet, r, c)?.f === undefined)
      if (!filled.length || !typed) continue
      const head = filled.find(({ v }) => text(v) !== '')
      if (head && TOTAL.test(text(head.v))) continue
      const fields = filled
        .filter((f) => f !== head)
        .map(({ c, v }) => ({
          label: title(labels[c]?.split(' › ').pop() ?? ''),
          value: show(r, c, v),
          num: typeof v === 'number',
        }))
      const card = { row: r, title: head ? text(head.v) : `Row ${r + 1}`, fields }
      if (q && !`${card.title} ${fields.map((f) => f.value).join(' ')}`.toLowerCase().includes(q))
        continue
      out.push(card)
    }
    return out
  }, [sheet, name, ev, q])

  if (!cards.length) return <Empty q={q} />
  return (
    <div className={GRID}>
      {cards.map((card) => (
        <button key={card.row} type="button" className={CARD} onClick={() => onOpen(card.row)}>
          <p className="line-clamp-3 text-sm font-medium">{card.title}</p>
          <dl className="space-y-1 text-xs">
            {card.fields.slice(0, 8).map((f, i) => (
              <div key={i} className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground shrink-0">{f.label || '—'}</dt>
                <dd className={f.num ? 'tabular-nums' : 'line-clamp-2 min-w-0 text-right'}>
                  {f.value}
                </dd>
              </div>
            ))}
          </dl>
          {card.fields.length > 8 && (
            <p className="text-muted-foreground text-xs">+{card.fields.length - 8} more</p>
          )}
        </button>
      ))}
    </div>
  )
}
