import { AlertTriangleIcon, ArrowDownIcon, ArrowUpIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  applyPaste,
  clearRange,
  copyRange,
  displayCell,
  inRange,
  move,
  normalizeRange,
  parseCell,
  parseTsv,
  type CellPos,
  type CellValue,
  type GridColumnSpec,
  type Range,
} from './grid-logic'

export interface GridColumn<R> extends GridColumnSpec {
  key: Extract<keyof R, string>
  header: string
  width: number
  align?: 'left' | 'right'
  /** Derived value (makes the column read-only). */
  value?: (row: R) => CellValue
  format?: (value: CellValue, row: R) => string
  /** Sum this column in the totals row. */
  total?: boolean
  /** Stays visible while scrolling sideways. */
  frozen?: boolean
  cellClassName?: (row: R) => string | undefined
}

const ROW_H = 32
const ROWNUM_W = 52

const fmtNumber = (v: CellValue) =>
  typeof v === 'number'
    ? v.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : ''

/**
 * Excel-like grid: arrows/Tab/Enter navigation, Shift+arrows or drag to select,
 * type to edit, F2/Enter/double-click to edit, Delete to clear, Ctrl+C/Ctrl+V with
 * Excel (TSV), Ctrl+A to select all. Rows are virtualized.
 */
export function SpreadsheetGrid<R extends Record<string, unknown>>({
  columns,
  rows,
  onChange,
  newRow,
  getRowKey,
  rowWarning,
  height = 560,
  toolbar,
  label,
}: {
  columns: GridColumn<R>[]
  rows: R[]
  /** Omit for a read-only grid. */
  onChange?: (rows: R[]) => void
  newRow: () => R
  getRowKey: (row: R, index: number) => string
  rowWarning?: (row: R) => string | null
  height?: number
  /** Extra buttons next to the row tools. */
  toolbar?: ReactNode
  label: string
}) {
  const readOnly = !onChange
  const cols = useMemo(
    () => columns.map((c) => ({ ...c, readOnly: readOnly || c.readOnly || !!c.value })),
    [columns, readOnly],
  )
  const [active, setActive] = useState<CellPos>({ row: 0, col: 0 })
  const [anchor, setAnchor] = useState<CellPos | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [scrollLeft, setScrollLeft] = useState(0)
  const dragging = useRef(false)
  const box = useRef<HTMLDivElement>(null)
  const range: Range = { start: anchor ?? active, end: active }
  const rowCount = Math.max(rows.length, 1)

  // Column x offsets (frozen columns stick after the row-number column).
  const offsets = useMemo(
    () => cols.map((_, i) => ROWNUM_W + cols.slice(0, i).reduce((sum, c) => sum + c.width, 0)),
    [cols],
  )
  const totalWidth = ROWNUM_W + cols.reduce((s, c) => s + c.width, 0)

  const cellValue = (row: R, c: GridColumn<R>): CellValue =>
    c.value ? c.value(row) : ((row[c.key] as CellValue) ?? null)
  const show = (row: R, c: GridColumn<R>) => {
    const v = cellValue(row, c)
    if (c.format) return c.format(v, row)
    return c.type === 'number' ? fmtNumber(v) : displayCell(v, c)
  }

  const update = (next: R[]) => onChange?.(next)

  const commit = (text: string, pos = active) => {
    const c = cols[pos.col]
    if (c.readOnly) return
    const v = parseCell(text, c)
    if (v === undefined) {
      toast.error(
        `"${text}" is not a valid ${c.type === 'number' ? 'number' : 'choice'} for ${c.header}`,
      )
      return
    }
    const next = rows.slice()
    while (next.length <= pos.row) next.push(newRow())
    next[pos.row] = { ...next[pos.row], [c.key]: v }
    update(next)
  }

  const go = (dRow: number, dCol: number, extend = false) => {
    if (extend) setAnchor(anchor ?? active)
    else setAnchor(null)
    const next = move(active, dRow, dCol, rowCount, cols.length)
    setActive(next)
    // keep the active row visible
    const el = box.current
    if (el) {
      const top = next.row * ROW_H
      if (top < el.scrollTop) el.scrollTop = top
      else if (top + ROW_H > el.scrollTop + el.clientHeight - ROW_H * 2)
        el.scrollTop = top + ROW_H * 3 - el.clientHeight
    }
  }

  const startEdit = (initial?: string) => {
    if (cols[active.col].readOnly) return
    setEditing(
      initial ??
        displayCell(cellValue(rows[active.row] ?? newRow(), cols[active.col]), cols[active.col]),
    )
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (editing !== null) return
    const mod = e.ctrlKey || e.metaKey
    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault()
        return go(mod ? -active.row : -1, 0, e.shiftKey)
      case 'ArrowDown':
        e.preventDefault()
        return go(mod ? rowCount : 1, 0, e.shiftKey)
      case 'ArrowLeft':
        e.preventDefault()
        return go(0, mod ? -active.col : -1, e.shiftKey)
      case 'ArrowRight':
        e.preventDefault()
        return go(0, mod ? cols.length : 1, e.shiftKey)
      case 'Tab':
        e.preventDefault()
        return go(0, e.shiftKey ? -1 : 1)
      case 'Home':
        e.preventDefault()
        return go(0, -active.col, e.shiftKey)
      case 'End':
        e.preventDefault()
        return go(0, cols.length, e.shiftKey)
      case 'Enter':
      case 'F2':
        e.preventDefault()
        return startEdit()
      case 'Delete':
      case 'Backspace':
        if (readOnly) return
        e.preventDefault()
        return update(clearRange(rows, cols, range))
      case 'Escape':
        return setAnchor(null)
    }
    if (mod && e.key.toLowerCase() === 'a') {
      e.preventDefault()
      setAnchor({ row: 0, col: 0 })
      setActive({ row: rowCount - 1, col: cols.length - 1 })
      return
    }
    if (!mod && !e.altKey && e.key.length === 1 && !readOnly) {
      e.preventDefault()
      startEdit(cols[active.col].type === 'select' ? undefined : e.key)
    }
  }

  const onCopy = (e: React.ClipboardEvent) => {
    if (editing !== null) return
    e.preventDefault()
    e.clipboardData.setData('text/plain', copyRange(rows, cols, range))
  }

  const onPaste = (e: React.ClipboardEvent) => {
    if (editing !== null || readOnly) return
    e.preventDefault()
    const matrix = parseTsv(e.clipboardData.getData('text/plain'))
    if (!matrix.length) return
    const res = applyPaste(rows, cols, matrix, range, newRow)
    update(res.rows)
    setAnchor(res.range.start)
    setActive(res.range.end)
    if (res.rejected.length) {
      toast.warning(
        `${res.rejected.length} pasted cell(s) were not valid for their column and were skipped.`,
      )
    }
  }

  // Row tools
  const sel = normalizeRange(range)
  const insertBelow = () => {
    const next = rows.slice()
    next.splice(Math.min(sel.end.row + 1, next.length), 0, newRow())
    update(next)
    go(1, 0)
  }
  const deleteRows = () => {
    const next = rows.filter((_, i) => i < sel.start.row || i > sel.end.row)
    update(next)
    setAnchor(null)
    setActive({ row: Math.min(sel.start.row, Math.max(next.length - 1, 0)), col: active.col })
  }
  const moveRows = (dir: -1 | 1) => {
    const { start, end } = sel
    if ((dir < 0 && start.row === 0) || (dir > 0 && end.row >= rows.length - 1)) return
    const next = rows.slice()
    const block = next.splice(start.row, end.row - start.row + 1)
    next.splice(start.row + dir, 0, ...block)
    update(next)
    setAnchor(anchor ? { ...anchor, row: anchor.row + dir } : null)
    setActive({ ...active, row: active.row + dir })
  }

  useEffect(() => {
    const up = () => (dragging.current = false)
    window.addEventListener('mouseup', up)
    return () => window.removeEventListener('mouseup', up)
  }, [])

  // Virtual window
  const viewRows = Math.ceil(height / ROW_H) + 6
  const first = Math.max(0, Math.floor(scrollTop / ROW_H) - 3)
  const last = Math.min(rows.length, first + viewRows)

  const totals = cols.map((c) =>
    c.total ? rows.reduce((s, r) => s + (Number(cellValue(r, c)) || 0), 0) : null,
  )

  const stick = (c: GridColumn<R>, i: number) =>
    c.frozen ? { position: 'sticky' as const, left: offsets[i], zIndex: 1 } : undefined

  return (
    <div className="space-y-2">
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-1.5">
          <Button size="sm" variant="outline" onClick={insertBelow}>
            <PlusIcon /> Row
          </Button>
          <Button size="sm" variant="outline" onClick={deleteRows} disabled={!rows.length}>
            <Trash2Icon /> Delete{' '}
            {sel.end.row - sel.start.row + 1 > 1
              ? `${sel.end.row - sel.start.row + 1} rows`
              : 'row'}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-8"
            aria-label="Move rows up"
            onClick={() => moveRows(-1)}
          >
            <ArrowUpIcon />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-8"
            aria-label="Move rows down"
            onClick={() => moveRows(1)}
          >
            <ArrowDownIcon />
          </Button>
          <span className="text-muted-foreground hidden text-xs lg:inline">
            Type to edit · Enter/F2 edit · Ctrl+C / Ctrl+V with Excel · Shift+arrows select
          </span>
          {toolbar && <div className="ml-auto flex flex-wrap gap-1.5">{toolbar}</div>}
        </div>
      )}
      <div
        ref={box}
        role="grid"
        aria-label={label}
        aria-rowcount={rows.length + 1}
        aria-colcount={cols.length}
        tabIndex={0}
        className="bg-card focus-visible:ring-ring relative overflow-auto rounded-md border text-sm outline-none focus-visible:ring-2"
        style={{ height }}
        onKeyDown={onKeyDown}
        onCopy={onCopy}
        onPaste={onPaste}
        onScroll={(e) => {
          setScrollTop(e.currentTarget.scrollTop)
          setScrollLeft(e.currentTarget.scrollLeft)
        }}
      >
        <div
          style={{ width: totalWidth, height: (rows.length + 1) * ROW_H + 8, position: 'relative' }}
        >
          {/* header */}
          <div
            className="bg-muted sticky top-0 z-20 flex border-b font-medium"
            style={{ height: ROW_H }}
            role="row"
          >
            <div
              className="bg-muted sticky left-0 z-10 shrink-0 border-r"
              style={{ width: ROWNUM_W }}
            />
            {cols.map((c, i) => (
              <div
                key={c.key}
                role="columnheader"
                className={cn(
                  'bg-muted flex shrink-0 items-center border-r px-2 text-xs',
                  c.align === 'right' && 'justify-end',
                )}
                style={{ width: c.width, ...stick(c, i) }}
                title={c.header}
              >
                <span className="truncate">{c.header}</span>
              </div>
            ))}
          </div>

          {/* body */}
          <div style={{ position: 'absolute', top: ROW_H + first * ROW_H, left: 0 }}>
            {rows.slice(first, last).map((row, k) => {
              const r = first + k
              const warning = rowWarning?.(row)
              return (
                <div
                  key={getRowKey(row, r)}
                  className="flex border-b"
                  style={{ height: ROW_H }}
                  role="row"
                >
                  <div
                    className="bg-muted/60 text-muted-foreground sticky left-0 z-10 flex shrink-0 items-center justify-end gap-1 border-r px-1.5 text-xs tabular-nums"
                    style={{ width: ROWNUM_W }}
                    title={warning ?? undefined}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      box.current?.focus()
                      setAnchor({ row: r, col: 0 })
                      setActive({ row: r, col: cols.length - 1 })
                    }}
                  >
                    {warning && (
                      <AlertTriangleIcon
                        className="size-3 text-[oklch(0.6_0.14_70)]"
                        aria-label={warning}
                      />
                    )}
                    {r + 1}
                  </div>
                  {cols.map((c, i) => {
                    const isActive = active.row === r && active.col === i
                    const selected = inRange(range, r, i)
                    return (
                      <div
                        key={c.key}
                        role="gridcell"
                        aria-selected={selected}
                        aria-readonly={c.readOnly}
                        className={cn(
                          'relative flex shrink-0 items-center border-r px-2',
                          c.align === 'right' && 'justify-end tabular-nums',
                          c.readOnly ? 'bg-muted/30' : 'bg-card',
                          selected && 'bg-primary/10',
                          isActive && 'ring-primary z-[2] ring-2 ring-inset',
                          c.cellClassName?.(row),
                        )}
                        style={{ width: c.width, ...stick(c, i) }}
                        onMouseDown={(e) => {
                          if (editing !== null && isActive) return
                          e.preventDefault()
                          box.current?.focus()
                          setEditing(null)
                          if (e.shiftKey) setAnchor(anchor ?? active)
                          else setAnchor(null)
                          setActive({ row: r, col: i })
                          dragging.current = true
                        }}
                        onMouseEnter={() => {
                          if (!dragging.current) return
                          setAnchor((a) => a ?? active)
                          setActive({ row: r, col: i })
                        }}
                        onDoubleClick={() => startEdit()}
                      >
                        {isActive && editing !== null ? (
                          <CellEditor
                            column={c}
                            initial={editing}
                            onDone={(text, dir) => {
                              setEditing(null)
                              if (text !== null) commit(text, { row: r, col: i })
                              box.current?.focus()
                              if (dir)
                                go(
                                  dir === 'down' ? 1 : 0,
                                  dir === 'right' ? 1 : dir === 'left' ? -1 : 0,
                                )
                            }}
                          />
                        ) : (
                          <span className="truncate">{show(row, c)}</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })}
            {rows.length === 0 && (
              <div
                className="text-muted-foreground px-3 py-2 text-sm"
                style={{ width: totalWidth }}
              >
                {readOnly ? 'No rows.' : 'No rows yet. Click “Row”, or paste from Excel (Ctrl+V).'}
              </div>
            )}
          </div>
        </div>
      </div>
      {totals.some((t) => t !== null) && (
        <div
          className="bg-muted overflow-hidden rounded-md border text-sm font-semibold"
          aria-label="Totals"
        >
          <div
            className="flex"
            style={{ width: totalWidth, transform: `translateX(-${scrollLeft}px)`, height: ROW_H }}
          >
            <div
              className="bg-muted flex shrink-0 items-center border-r px-1.5 text-xs"
              style={{
                width: ROWNUM_W,
                transform: `translateX(${scrollLeft}px)`,
                position: 'relative',
                zIndex: 1,
              }}
            >
              Total
            </div>
            {cols.map((c, i) => (
              <div
                key={c.key}
                className="bg-muted flex shrink-0 items-center justify-end border-r px-2 tabular-nums"
                style={{
                  width: c.width,
                  ...(c.frozen
                    ? {
                        transform: `translateX(${scrollLeft}px)`,
                        position: 'relative' as const,
                        zIndex: 1,
                      }
                    : {}),
                }}
              >
                {totals[i] !== null ? fmtNumber(totals[i]) : ''}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function CellEditor<R>({
  column,
  initial,
  onDone,
}: {
  column: GridColumn<R>
  initial: string
  onDone: (text: string | null, dir?: 'down' | 'right' | 'left') => void
}) {
  const [text, setText] = useState(initial)
  const done = useRef(false)
  const finish = (value: string | null, dir?: 'down' | 'right' | 'left') => {
    if (done.current) return
    done.current = true
    onDone(value, dir)
  }
  const keys = (e: React.KeyboardEvent) => {
    e.stopPropagation()
    if (e.key === 'Enter') {
      e.preventDefault()
      finish(text, 'down')
    } else if (e.key === 'Tab') {
      e.preventDefault()
      finish(text, e.shiftKey ? 'left' : 'right')
    } else if (e.key === 'Escape') {
      e.preventDefault()
      finish(null)
    }
  }
  if (column.type === 'select') {
    const current = column.options?.find((o) => o.label === initial)?.value ?? initial
    return (
      <select
        autoFocus
        className="bg-background absolute inset-0 w-full px-1 text-sm outline-none"
        defaultValue={current}
        aria-label={column.header}
        onKeyDown={keys}
        onChange={(e) => finish(e.target.value, 'down')}
        onBlur={(e) => finish(e.target.value)}
      >
        <option value="">—</option>
        {column.options?.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    )
  }
  return (
    <input
      autoFocus
      className={cn(
        'bg-background absolute inset-0 w-full px-2 text-sm outline-none',
        column.align === 'right' && 'text-right',
      )}
      value={text}
      aria-label={column.header}
      inputMode={column.type === 'number' ? 'decimal' : undefined}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={keys}
      onBlur={() => finish(text)}
      onFocus={(e) => {
        // typed first character: caret at the end; F2/Enter: select all
        if (initial.length > 1) e.currentTarget.select()
      }}
    />
  )
}
