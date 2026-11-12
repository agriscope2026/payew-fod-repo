import { InfoIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Meter } from '@/features/finance/components/FinanceBits'
import { formatValue } from '@/features/sheets/display'
import { isError, type Scalar } from '@/features/sheets/formula'
import { formatPeso, formatPesoCompact } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { DashboardCardRow } from '@/types/database'

type Format = DashboardCardRow['number_format']

/** Big figures read better short (₱15.6M); the full value is in the tooltip. */
function show(v: Scalar | undefined, format: Format) {
  if (v === undefined) return { text: '—', full: undefined }
  if (typeof v === 'number' && format === 'peso')
    return { text: formatPesoCompact(v), full: formatPeso(v) }
  const text = formatValue(v ?? null, typeof v === 'number' ? format : undefined) || '—'
  return { text, full: text }
}

export interface BudgetLine {
  label: string
  value: Scalar
  format: Format
}

/** Total budget for the year, from Budget settings, with lines picked from sheets. */
export function BudgetCard({ total, lines }: { total: number | null; lines: BudgetLine[] }) {
  return (
    <Card className="gap-1 py-4">
      <CardContent className="space-y-1.5 px-4">
        <p className="text-muted-foreground text-xs">Total budget for the year</p>
        <p
          className="text-2xl font-semibold tracking-tight tabular-nums"
          title={total === null ? undefined : formatPeso(total)}
        >
          {total === null ? 'Not set' : formatPesoCompact(total)}
        </p>
        {lines.map((l) => {
          const v = show(l.value, l.format)
          return (
            <p key={l.label} className="text-muted-foreground text-xs tabular-nums" title={v.full}>
              {l.label} <span className="text-foreground font-medium">{v.text}</span>
            </p>
          )
        })}
        {total === null && (
          <p className="text-muted-foreground text-xs">Set it in Finance, Budget settings.</p>
        )}
      </CardContent>
    </Card>
  )
}

/** A card showing the value of cells in a finance sheet. */
export function SheetCard({
  title,
  details,
  value,
  format,
  sub,
  source,
  missing,
  meter,
}: {
  title: string
  details: string | null
  value: Scalar | undefined
  format: Format
  sub: { label: string; value: Scalar | undefined; format: Format } | null
  source: string
  missing: boolean
  /** A progress bar under the value, e.g. the obligation rate. */
  meter?: { pct: number; label: string }
}) {
  const v = show(value, format)
  const error = isError(value)
  return (
    <Card className="gap-1 py-4">
      <CardContent className="space-y-1.5 px-4">
        <div className="flex items-start gap-1">
          <p className="text-muted-foreground min-w-0 flex-1 truncate text-xs">{title}</p>
          {details && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={`About ${title}`}
                  className="text-muted-foreground"
                >
                  <InfoIcon className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-64">{details}</TooltipContent>
            </Tooltip>
          )}
        </div>
        <p
          className={cn(
            'text-2xl font-semibold tracking-tight tabular-nums',
            error && 'text-destructive',
          )}
          title={v.full}
        >
          {missing ? '—' : v.text}
        </p>
        {meter && !missing && <Meter pct={meter.pct} label={meter.label} />}
        {sub && !missing && (
          <p
            className="text-muted-foreground text-xs tabular-nums"
            title={show(sub.value, sub.format).full}
          >
            {sub.label}{' '}
            <span className="text-foreground font-medium">{show(sub.value, sub.format).text}</span>
          </p>
        )}
        <p className="text-muted-foreground truncate text-[11px]">
          {missing ? 'The cells for this card were deleted from the sheet.' : source}
        </p>
      </CardContent>
    </Card>
  )
}
