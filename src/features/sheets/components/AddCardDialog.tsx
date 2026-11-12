import { Loader2Icon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
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
import { errorMessage } from '@/lib/supabase'
import type { CardAggregate, DashboardCardRow } from '@/types/database'
import { useCardMutations } from '../api'
import { AGGREGATES, CARD_FORMATS, rangeToIds } from '../cards'
import { formatValue } from '../display'
import {
  aggregate,
  columnHeader,
  parseRangeName,
  rangeName,
  type Evaluator,
  type Range,
  type Sheet,
} from '../model'

const suggestAgg = (r: Range): CardAggregate => (r.r1 === r.r2 && r.c1 === r.c2 ? 'value' : 'sum')

/** "Show on dashboard": turns selected cells into a dashboard card. */
export function AddCardDialog({
  open,
  onOpenChange,
  sheet,
  sheetName,
  sheetId,
  programId,
  fiscalYearId,
  evaluator,
  range: initial,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  sheet: Sheet
  sheetName: string
  sheetId: string
  programId: string
  fiscalYearId: string
  evaluator: Evaluator
  range: Range
}) {
  const { add } = useCardMutations()
  const header = columnHeader(sheet, initial.c1)
  const [title, setTitle] = useState(initial.c1 === initial.c2 ? header : '')
  const [details, setDetails] = useState('')
  const [rangeText, setRangeText] = useState(rangeName(initial))
  const [agg, setAgg] = useState<CardAggregate>(suggestAgg(initial))
  const [format, setFormat] = useState<DashboardCardRow['number_format']>('peso')
  const [withSub, setWithSub] = useState(false)
  const [subLabel, setSubLabel] = useState('')
  const [subText, setSubText] = useState('')
  const [subAgg, setSubAgg] = useState<CardAggregate>('sum')
  const [budgetLine, setBudgetLine] = useState(false)

  const range = parseRangeName(rangeText)
  const subRange = withSub ? parseRangeName(subText) : null
  const inSheet = (r: Range | null) => !!r && r.r2 < sheet.rows.length && r.c2 < sheet.cols.length
  const preview = inSheet(range) ? aggregate(evaluator, sheetName, range!, agg) : null
  const subPreview = inSheet(subRange) ? aggregate(evaluator, sheetName, subRange!, subAgg) : null
  const valid =
    title.trim() !== '' &&
    inSheet(range) &&
    (!withSub || (inSheet(subRange) && subLabel.trim() !== ''))

  const submit = async () => {
    if (!valid) return
    try {
      await add.mutateAsync({
        sheet_id: sheetId,
        program_id: programId,
        fiscal_year_id: fiscalYearId,
        title: title.trim(),
        details: details.trim() || null,
        range: rangeToIds(sheet, range!)!,
        agg,
        number_format: format,
        sub_label: withSub ? subLabel.trim() : null,
        sub_range: withSub ? rangeToIds(sheet, subRange!) : null,
        sub_agg: withSub ? subAgg : null,
        placement: budgetLine ? 'budget_line' : 'card',
      })
      toast.success(
        budgetLine
          ? 'Added under Total budget for the year'
          : `“${title.trim()}” added to the dashboard`,
      )
      onOpenChange(false)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  const select = (
    value: string,
    onChange: (v: string) => void,
    options: { value: string; label: string }[],
    label: string,
  ) => (
    <select
      aria-label={label}
      className="bg-background h-9 w-full rounded-md border px-2 text-sm"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
  const show = (v: ReturnType<typeof aggregate> | null) =>
    v === null ? '—' : formatValue(v, typeof v === 'number' ? format : undefined)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Show on dashboard</DialogTitle>
          <DialogDescription>
            The card always shows the current value of these cells in the {sheetName}, for everyone
            in the program.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              checked={budgetLine}
              onCheckedChange={(v) => setBudgetLine(v === true)}
              className="mt-0.5"
            />
            <span>
              Show as a line under <b>Total budget for the year</b> instead of its own card
              <span className="text-muted-foreground block text-xs">
                For example, the WFP total.
              </span>
            </span>
          </label>
          <div className="space-y-1.5">
            <Label htmlFor="card-title">{budgetLine ? 'Label' : 'Card name'}</Label>
            <Input
              id="card-title"
              maxLength={80}
              placeholder={budgetLine ? 'WFP' : 'e.g. Obligated to date'}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          {!budgetLine && (
            <div className="space-y-1.5">
              <Label htmlFor="card-details">Details (optional)</Label>
              <Textarea
                id="card-details"
                maxLength={300}
                rows={2}
                placeholder="What this figure is, or where it comes from"
                value={details}
                onChange={(e) => setDetails(e.target.value)}
              />
            </div>
          )}
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="card-range">Cells</Label>
              <Input
                id="card-range"
                className="font-mono"
                value={rangeText}
                onChange={(e) => setRangeText(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Calculation</Label>
              {select(agg, (v) => setAgg(v as CardAggregate), AGGREGATES, 'Calculation')}
            </div>
            <div className="space-y-1.5">
              <Label>Show as</Label>
              {select(
                format,
                (v) => setFormat(v as DashboardCardRow['number_format']),
                CARD_FORMATS,
                'Show as',
              )}
            </div>
          </div>
          {!budgetLine && (
            <>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={withSub} onCheckedChange={(v) => setWithSub(v === true)} />
                Add a second line, such as a target to compare with
              </label>
              {withSub && (
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="card-sub-label">Label</Label>
                    <Input
                      id="card-sub-label"
                      maxLength={60}
                      placeholder="e.g. WFP"
                      value={subLabel}
                      onChange={(e) => setSubLabel(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="card-sub-range">Cells</Label>
                    <Input
                      id="card-sub-range"
                      className="font-mono"
                      placeholder="S32"
                      value={subText}
                      onChange={(e) => setSubText(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Calculation</Label>
                    {select(
                      subAgg,
                      (v) => setSubAgg(v as CardAggregate),
                      AGGREGATES,
                      'Second line calculation',
                    )}
                  </div>
                </div>
              )}
            </>
          )}
          <div className="bg-muted/50 rounded-md border p-3">
            <p className="text-muted-foreground text-xs">
              {budgetLine ? 'Line' : title.trim() || 'Card'} preview
            </p>
            <p className="text-2xl font-semibold tabular-nums">
              {range ? show(preview) : 'Check the cells'}
            </p>
            {withSub && subLabel && (
              <p className="text-muted-foreground text-xs">
                {subLabel} {show(subPreview)}
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button disabled={!valid || add.isPending} onClick={() => void submit()}>
              {add.isPending && <Loader2Icon className="animate-spin" />} Add
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
