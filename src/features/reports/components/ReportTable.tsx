import { ArrowDownIcon, ArrowUpIcon, FileSpreadsheetIcon, SearchIcon } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { timestampSlug } from '@/lib/export'
import { formatDate, formatPeso, formatPercent } from '@/lib/format'
import { errorMessage } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { exportSheet } from '@/lib/xlsx-export'

export type ColKind = 'text' | 'money' | 'pct' | 'int' | 'date'

export interface ReportColumn<T> {
  key: string
  label: string
  kind?: ColKind
  value: (r: T) => string | number | null
  /** Sum this column in the totals row (money/int). */
  total?: boolean
  /** Custom cell; export still uses value(). */
  render?: (r: T) => ReactNode
  className?: string
}

const NUMERIC: ColKind[] = ['money', 'pct', 'int']

function formatCell(kind: ColKind | undefined, v: string | number | null) {
  if (v === null || v === undefined || v === '') return '—'
  switch (kind) {
    case 'money':
      return formatPeso(Number(v))
    case 'pct':
      return formatPercent(Number(v))
    case 'int':
      return Number(v).toLocaleString('en-PH')
    case 'date':
      return formatDate(String(v))
    default:
      return String(v)
  }
}

/** Value written to Excel: numbers stay numbers, percentages rounded to 0.1. */
function exportCell(kind: ColKind | undefined, v: string | number | null) {
  if (v === null || v === undefined) return ''
  if (kind === 'pct') return Math.round(Number(v) * 10) / 10
  if (kind === 'money' || kind === 'int') return Number(v)
  return v
}

function columnTotals<T>(columns: ReportColumn<T>[], rows: T[]) {
  return columns.map((c) =>
    c.total ? rows.reduce((s, r) => s + Number(c.value(r) ?? 0), 0) : null,
  )
}

/** Sortable, searchable report table with an optional totals row. */
export function ReportTable<T>({
  columns,
  rows,
  rowKey,
  searchPlaceholder = 'Filter rows…',
  emptyText = 'No records for this fiscal year and program selection.',
  exportAs,
}: {
  columns: ReportColumn<T>[]
  rows: T[]
  rowKey: (r: T) => string
  searchPlaceholder?: string
  emptyText?: string
  /** Adds an "Export .xlsx" button that writes the visible rows (and totals). */
  exportAs?: { filename: string; sheet: string }
}) {
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null)

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase()
    let out = needle
      ? rows.filter((r) =>
          columns.some((c) =>
            String(c.value(r) ?? '')
              .toLowerCase()
              .includes(needle),
          ),
        )
      : rows
    if (sort) {
      const col = columns.find((c) => c.key === sort.key)!
      const num = NUMERIC.includes(col.kind ?? 'text')
      out = [...out].sort((a, b) => {
        const x = col.value(a)
        const y = col.value(b)
        if (x === null || x === '') return 1
        if (y === null || y === '') return -1
        return (num ? Number(x) - Number(y) : String(x).localeCompare(String(y))) * sort.dir
      })
    }
    return out
  }, [rows, columns, q, sort])

  const totals = columnTotals(columns, visible)
  const hasTotals = totals.some((t) => t !== null)

  const download = async () => {
    if (!exportAs) return
    const body = visible.map((r) => columns.map((c) => exportCell(c.kind, c.value(r))))
    if (hasTotals)
      body.push(columns.map((_, i) => (i === 0 ? 'TOTAL' : totals[i] !== null ? totals[i]! : '')))
    try {
      await exportSheet(
        `${exportAs.filename}-${timestampSlug()}.xlsx`,
        exportAs.sheet,
        columns.map((c) => c.label),
        body,
      )
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <div className="relative w-full max-w-xs">
          <SearchIcon className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={searchPlaceholder}
            className="pl-8"
            aria-label="Filter rows"
          />
        </div>
        {exportAs && (
          <Button variant="outline" size="sm" className="ml-auto" onClick={() => void download()}>
            <FileSpreadsheetIcon /> Export .xlsx
          </Button>
        )}
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((c) => {
                const active = sort?.key === c.key
                return (
                  <TableHead
                    key={c.key}
                    className={cn(NUMERIC.includes(c.kind ?? 'text') && 'text-right', c.className)}
                    aria-sort={active ? (sort!.dir === 1 ? 'ascending' : 'descending') : 'none'}
                  >
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 hover:underline"
                      onClick={() =>
                        setSort(
                          active && sort!.dir === -1 ? null : { key: c.key, dir: active ? -1 : 1 },
                        )
                      }
                    >
                      {c.label}
                      {active &&
                        (sort!.dir === 1 ? (
                          <ArrowUpIcon className="size-3" />
                        ) : (
                          <ArrowDownIcon className="size-3" />
                        ))}
                    </button>
                  </TableHead>
                )
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="text-muted-foreground py-10 text-center"
                >
                  {emptyText}
                </TableCell>
              </TableRow>
            ) : (
              visible.map((r) => (
                <TableRow key={rowKey(r)}>
                  {columns.map((c) => (
                    <TableCell
                      key={c.key}
                      className={cn(
                        NUMERIC.includes(c.kind ?? 'text') && 'text-right tabular-nums',
                        c.className,
                      )}
                    >
                      {c.render ? c.render(r) : formatCell(c.kind, c.value(r))}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
          {hasTotals && visible.length > 0 && (
            <TableFooter>
              <TableRow>
                {columns.map((c, i) => (
                  <TableCell
                    key={c.key}
                    className={cn(
                      NUMERIC.includes(c.kind ?? 'text') && 'text-right tabular-nums',
                      c.className,
                    )}
                  >
                    {i === 0
                      ? `Total (${visible.length})`
                      : totals[i] !== null
                        ? formatCell(c.kind, totals[i])
                        : ''}
                  </TableCell>
                ))}
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </div>
    </div>
  )
}
