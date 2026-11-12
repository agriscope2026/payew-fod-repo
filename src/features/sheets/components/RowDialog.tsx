import { ChevronLeftIcon, ChevronRightIcon, ListChecksIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { formatValue } from '../display'
import { colName } from '../formula'
import { editText, getCell, listFor, mergeAt, typeInto, type Evaluator, type Sheet } from '../model'
import { headerLabels, headerRowCount } from '../wfp'

/** The whole row as a form: one field per column, labelled by the header. */
export function RowDialog({
  sheet,
  sheetName,
  evaluator,
  row,
  readOnly,
  onChange,
  onMove,
  onClose,
  activity,
}: {
  sheet: Sheet
  sheetName: string
  evaluator: Evaluator
  row: number
  readOnly: boolean
  onChange: (next: Sheet) => void
  onMove: (row: number) => void
  onClose: () => void
  /** For WFP rows that belong to an activity: a summary and a way to open it. */
  activity?: ReactNode
}) {
  const labels = headerLabels(sheet)
  const header = headerRowCount(sheet)
  // A merged cell shows once, under its first column.
  const columns = sheet.cols
    .map((_, c) => c)
    .filter((c) => {
      const m = mergeAt(sheet, row, c)
      return !m || m.c === c
    })
  const initial = () =>
    Object.fromEntries(columns.map((c) => [c, editText(getCell(sheet, row, c))]))
  const [values, setValues] = useState<Record<number, string>>(initial)
  const [shownRow, setShownRow] = useState(row)
  if (shownRow !== row) {
    setShownRow(row)
    setValues(initial())
  }

  const changed = columns.filter((c) => values[c] !== editText(getCell(sheet, row, c)))
  const apply = () => {
    let next = sheet
    for (const c of changed) next = typeInto(next, row, c, values[c])
    if (next !== sheet) onChange(next)
  }
  const title = String(evaluator.value(sheetName, row, columns[0] ?? 0) ?? '').trim()

  const field = (c: number) => {
    const cell = getCell(sheet, row, c)
    const label = labels[c]
      ? labels[c].replace(/(^|› )(\w)/g, (_, a, b) => a + b.toUpperCase())
      : `Column ${colName(c)}`
    const id = `row-field-${c}`
    const value = evaluator.value(sheetName, row, c)
    if (cell?.f !== undefined) {
      return (
        <div key={c} className="space-y-1">
          <Label className="text-muted-foreground text-xs">{label}</Label>
          <p
            className="bg-muted/50 rounded-md border px-3 py-2 text-sm tabular-nums"
            title={`=${cell.f}`}
          >
            {formatValue(value, cell.s?.fmt) || '—'}{' '}
            <span className="text-muted-foreground text-xs">(formula)</span>
          </p>
        </div>
      )
    }
    const list = row >= header ? listFor(sheet, c) : null
    if (list) {
      return (
        <div key={c} className="space-y-1">
          <Label htmlFor={id} className="text-muted-foreground text-xs">
            {label}
          </Label>
          <select
            id={id}
            disabled={readOnly}
            className="bg-background h-9 w-full rounded-md border px-2 text-sm"
            value={values[c] ?? ''}
            onChange={(e) => setValues({ ...values, [c]: e.target.value })}
          >
            <option value="">—</option>
            {[...list, ...(values[c] && !list.includes(values[c]) ? [values[c]] : [])].map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
      )
    }
    if (typeof cell?.v === 'boolean') {
      return (
        <label key={c} className="flex items-center gap-2 self-end pb-2 text-sm">
          <Checkbox
            disabled={readOnly}
            checked={values[c] === 'TRUE'}
            onCheckedChange={(v) => setValues({ ...values, [c]: v === true ? 'TRUE' : 'FALSE' })}
          />
          {label}
        </label>
      )
    }
    const long =
      (values[c] ?? '').length > 60 ||
      /particular|program|activit|remark|description|mfo/i.test(label)
    return (
      <div key={c} className={long ? 'space-y-1 sm:col-span-2 lg:col-span-3' : 'space-y-1'}>
        <Label htmlFor={id} className="text-muted-foreground text-xs">
          {label} <span className="font-mono text-[10px]">{colName(c)}</span>
        </Label>
        {long ? (
          <Textarea
            id={id}
            rows={2}
            readOnly={readOnly}
            value={values[c] ?? ''}
            onChange={(e) => setValues({ ...values, [c]: e.target.value })}
          />
        ) : (
          <Input
            id={id}
            readOnly={readOnly}
            inputMode={typeof value === 'number' ? 'decimal' : undefined}
            className={typeof value === 'number' ? 'text-right tabular-nums' : undefined}
            value={values[c] ?? ''}
            onChange={(e) => setValues({ ...values, [c]: e.target.value })}
          />
        )}
      </div>
    )
  }

  const go = (to: number) => {
    apply()
    onMove(to)
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose()
      }}
    >
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[min(96vw,1280px)]">
        <DialogHeader>
          <DialogTitle className="pr-6 leading-snug">{title || `Row ${row + 1}`}</DialogTitle>
          <DialogDescription>
            {sheetName} · row {row + 1}. Changes go into the sheet; save the sheet to keep them.
          </DialogDescription>
        </DialogHeader>
        {activity && (
          <div className="bg-primary/5 border-primary/30 flex items-start gap-2 rounded-md border p-3 text-sm">
            <ListChecksIcon className="text-primary mt-0.5 size-4 shrink-0" />
            <div className="min-w-0 flex-1">{activity}</div>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{columns.map(field)}</div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={row <= header}
              onClick={() => go(row - 1)}
            >
              <ChevronLeftIcon /> Previous row
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={row >= sheet.rows.length - 1}
              onClick={() => go(row + 1)}
            >
              Next row <ChevronRightIcon />
            </Button>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              {readOnly ? 'Close' : 'Cancel'}
            </Button>
            {!readOnly && (
              <Button
                disabled={!changed.length}
                onClick={() => {
                  apply()
                  onClose()
                }}
              >
                Apply
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
