import {
  AlignCenterIcon,
  AlignLeftIcon,
  AlignRightIcon,
  BoldIcon,
  BrushCleaningIcon,
  ChevronDownIcon,
  ItalicIcon,
  MergeIcon,
  PaintBucketIcon,
  Redo2Icon,
  Rows3Icon,
  SnowflakeIcon,
  SquareDashedIcon,
  StrikethroughIcon,
  TypeIcon,
  UnderlineIcon,
  ListTreeIcon,
  Undo2Icon,
  TextWrapIcon,
} from 'lucide-react'
import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import {
  borderRange,
  clearRange,
  createEvaluator,
  deleteCols,
  deleteRows,
  formulasToValues,
  getCell,
  insertCols,
  insertRows,
  mergeRange,
  removeEmptyCols,
  removeEmptyRows,
  styleRange,
  textToNumbers,
  trimText,
  type BorderPreset,
  type CellStyle,
  type Evaluator,
  type NumberFormat,
  type Sheet,
} from '../model'
import { selectionRange, type Selection } from '../selection'
import { DropdownChoices } from './DropdownChoices'
import { RowDialog } from './RowDialog'
import { SheetGrid } from './SheetGrid'

const COLORS = [
  '#0f172a',
  '#475569',
  '#94a3b8',
  '#ffffff',
  '#b91c1c',
  '#c2410c',
  '#a16207',
  '#15803d',
  '#0e7490',
  '#1d4ed8',
  '#6d28d9',
  '#be185d',
]
const FILLS = [
  '#f1f5f9',
  '#e2e8f0',
  '#cbd5e1',
  '#fef3c7',
  '#fee2e2',
  '#ffedd5',
  '#fef9c3',
  '#dcfce7',
  '#cffafe',
  '#dbeafe',
  '#ede9fe',
  '#fce7f3',
]
const FORMATS: { value: NumberFormat; label: string }[] = [
  { value: 'general', label: 'General' },
  { value: 'number', label: 'Number 1,234.50' },
  { value: 'integer', label: 'Whole number 1,235' },
  { value: 'peso', label: 'Peso ₱1,234.50' },
  { value: 'percent', label: 'Percent 12.50%' },
  { value: 'date', label: 'Date Nov 12, 2026' },
  { value: 'text', label: 'Plain text' },
]
const SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24]
const HISTORY = 100

export interface SheetEditorProps {
  sheet: Sheet
  sheetName: string
  /** Other sheets of the same program and year, for formulas such as =SUM(ORS!H:H). */
  otherSheets: Map<string, Sheet>
  readOnly: boolean
  onChange: (next: Sheet) => void
  onSave?: () => void
  onAddCard?: (range: ReturnType<typeof selectionRange>, evaluator: Evaluator) => void
  /** Shown at the right of the toolbar. */
  actions?: ReactNode
  /** Extra content in the row dialog, e.g. the activity a WFP row belongs to. */
  rowExtras?: (row: number, evaluator: Evaluator) => ReactNode
  /** Outline levels for expand and collapse (0 phase, 1 activity, 2 detail). */
  outlineOf?: (sheet: Sheet, evaluator: Evaluator) => (number | null)[]
  /** Clicking a column total in the bottom row. */
  onTotalCard?: (c: number, evaluator: Evaluator) => void
}

/** Toolbar, grid and undo history for one sheet. */
export function SheetEditor({
  sheet,
  sheetName,
  otherSheets,
  readOnly,
  onChange,
  onSave,
  onAddCard,
  actions,
  rowExtras,
  outlineOf,
  onTotalCard,
}: SheetEditorProps) {
  const [openRow, setOpenRow] = useState<number | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const [selection, setSelection] = useState<Selection>({
    anchor: { r: 0, c: 0 },
    focus: { r: 0, c: 0 },
  })
  const [history, setHistory] = useState<{ past: Sheet[]; future: Sheet[] }>({
    past: [],
    future: [],
  })

  const evaluator = useMemo(
    () => createEvaluator({ sheets: new Map([...otherSheets, [sheetName, sheet]]) }),
    [sheet, sheetName, otherSheets],
  )
  const range = selectionRange(sheet, selection)
  const outline = useMemo(() => outlineOf?.(sheet, evaluator) ?? [], [outlineOf, sheet, evaluator])
  const toggleRow = (id: string) =>
    setCollapsed((old) => {
      const next = new Set(old)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  /** Collapses every row at or above a level: 0 shows phases only, 1 shows activities too. */
  const collapseTo = (level: number) =>
    setCollapsed(
      new Set(
        sheet.rows
          .filter(
            (_, i) =>
              outline[i] !== null &&
              outline[i] !== undefined &&
              outline[i]! >= level &&
              outline[i]! < 2,
          )
          .map((r) => r.id),
      ),
    )
  const style: CellStyle = getCell(sheet, selection.anchor.r, selection.anchor.c)?.s ?? {}

  const change = useCallback(
    (next: Sheet) => {
      if (next === sheet) return
      setHistory((h) => ({ past: [...h.past.slice(-HISTORY + 1), sheet], future: [] }))
      onChange(next)
    },
    [onChange, sheet],
  )
  const undo = () => {
    const prev = history.past[history.past.length - 1]
    if (!prev) return
    setHistory({ past: history.past.slice(0, -1), future: [...history.future, sheet] })
    onChange(prev)
  }
  const redo = () => {
    const next = history.future[history.future.length - 1]
    if (!next) return
    setHistory({ past: [...history.past, sheet], future: history.future.slice(0, -1) })
    onChange(next)
  }

  const apply = (patch: Partial<CellStyle>) => change(styleRange(sheet, range, patch))
  const toggle = (key: 'b' | 'i' | 'u' | 'strike' | 'wrap') => apply({ [key]: !style[key] })
  const freeze = (rows: number, cols: number) => change({ ...sheet, freeze: { rows, cols } })
  const merged = sheet.merges.some(
    (m) =>
      m.r <= range.r2 &&
      m.r + m.rs - 1 >= range.r1 &&
      m.c <= range.c2 &&
      m.c + m.cs - 1 >= range.c1,
  )
  const allCells = { r1: 0, c1: 0, r2: sheet.rows.length - 1, c2: sheet.cols.length - 1 }
  const single = range.r1 === range.r2 && range.c1 === range.c2
  const target = single ? allCells : range
  const value = (r: number, c: number) => evaluator.value(sheetName, r, c)

  const tool = (
    label: string,
    icon: ReactNode,
    onClick: () => void,
    pressed?: boolean,
    disabled = readOnly,
  ) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn('size-8', pressed && 'bg-accent text-accent-foreground')}
          aria-label={label}
          aria-pressed={pressed}
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={onClick}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
  const sep = <div className="bg-border mx-1 h-5 w-px" />

  return (
    <div className="space-y-2">
      <div className="bg-card flex flex-wrap items-center gap-0.5 rounded-md border px-1.5 py-1">
        {tool('Undo (Ctrl+Z)', <Undo2Icon />, undo, false, readOnly || !history.past.length)}
        {tool('Redo (Ctrl+Y)', <Redo2Icon />, redo, false, readOnly || !history.future.length)}
        {sep}
        <select
          aria-label="Number format"
          disabled={readOnly}
          className="bg-background h-8 rounded border px-1.5 text-xs"
          value={style.fmt ?? 'general'}
          onChange={(e) =>
            apply({
              fmt: e.target.value === 'general' ? undefined : (e.target.value as NumberFormat),
            })
          }
        >
          {FORMATS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Font size"
          disabled={readOnly}
          className="bg-background h-8 w-16 rounded border px-1.5 text-xs"
          value={style.size ?? 10}
          onChange={(e) =>
            apply({ size: Number(e.target.value) === 10 ? undefined : Number(e.target.value) })
          }
        >
          {SIZES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {sep}
        {tool('Bold (Ctrl+B)', <BoldIcon />, () => toggle('b'), style.b)}
        {tool('Italic (Ctrl+I)', <ItalicIcon />, () => toggle('i'), style.i)}
        {tool('Underline (Ctrl+U)', <UnderlineIcon />, () => toggle('u'), style.u)}
        {tool('Strikethrough', <StrikethroughIcon />, () => toggle('strike'), style.strike)}
        <ColorPicker
          label="Text color"
          icon={<TypeIcon />}
          colors={COLORS}
          value={style.color}
          disabled={readOnly}
          onPick={(color) => apply({ color })}
        />
        <ColorPicker
          label="Fill color"
          icon={<PaintBucketIcon />}
          colors={FILLS}
          value={style.bg}
          disabled={readOnly}
          onPick={(bg) => apply({ bg })}
        />
        {sep}
        {tool(
          'Align left',
          <AlignLeftIcon />,
          () => apply({ align: style.align === 'left' ? undefined : 'left' }),
          style.align === 'left',
        )}
        {tool(
          'Align center',
          <AlignCenterIcon />,
          () => apply({ align: style.align === 'center' ? undefined : 'center' }),
          style.align === 'center',
        )}
        {tool(
          'Align right',
          <AlignRightIcon />,
          () => apply({ align: style.align === 'right' ? undefined : 'right' }),
          style.align === 'right',
        )}
        {tool('Wrap text', <TextWrapIcon />, () => toggle('wrap'), style.wrap)}
        {tool(
          merged ? 'Unmerge cells' : 'Merge cells',
          <MergeIcon />,
          () => change(mergeRange(sheet, range)),
          merged,
          readOnly || (single && !merged),
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1 px-2"
              disabled={readOnly}
              aria-label="Borders"
            >
              <SquareDashedIcon /> <ChevronDownIcon className="size-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {(
              [
                ['all', 'All borders'],
                ['outer', 'Outside border'],
                ['top', 'Top border'],
                ['bottom', 'Bottom border'],
                ['none', 'No borders'],
              ] as [BorderPreset, string][]
            ).map(([preset, label]) => (
              <DropdownMenuItem
                key={preset}
                onSelect={() => change(borderRange(sheet, range, preset))}
              >
                {label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        {sep}
        <DropdownChoices sheet={sheet} range={range} disabled={readOnly} onChange={change} />
        {outline.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 gap-1 px-2">
                <ListTreeIcon /> Outline <ChevronDownIcon className="size-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onSelect={() => setCollapsed(new Set())}>
                Expand all
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => collapseTo(1)}>
                Show phases and activities
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => collapseTo(0)}>Show phases only</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 gap-1 px-2" disabled={readOnly}>
              <Rows3Icon /> Rows & columns <ChevronDownIcon className="size-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem
              onSelect={() =>
                change(insertRows(sheet, range.r1, range.r2 - range.r1 + 1, sheetName))
              }
            >
              Insert row above
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => change(insertRows(sheet, range.r2 + 1, 1, sheetName))}
            >
              Insert row below
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => change(insertRows(sheet, sheet.rows.length, 20, sheetName))}
            >
              Add 20 rows at the end
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() =>
                change(insertCols(sheet, range.c1, range.c2 - range.c1 + 1, sheetName))
              }
            >
              Insert column left
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => change(insertCols(sheet, range.c2 + 1, 1, sheetName))}
            >
              Insert column right
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={() =>
                change(deleteRows(sheet, range.r1, range.r2 - range.r1 + 1, sheetName))
              }
            >
              Delete selected rows
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onSelect={() =>
                change(deleteCols(sheet, range.c1, range.c2 - range.c1 + 1, sheetName))
              }
            >
              Delete selected columns
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 gap-1 px-2" disabled={readOnly}>
              <SnowflakeIcon /> Freeze <ChevronDownIcon className="size-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onSelect={() => freeze(0, 0)}>No frozen panes</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => freeze(1, sheet.freeze.cols)}>
              Top row
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => freeze(range.r2 + 1, sheet.freeze.cols)}>
              Rows 1 to {range.r2 + 1}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => freeze(sheet.freeze.rows, 1)}>
              First column
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => freeze(sheet.freeze.rows, range.c2 + 1)}>
              Columns up to the selection
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 gap-1 px-2" disabled={readOnly}>
              <BrushCleaningIcon /> Clean up <ChevronDownIcon className="size-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-72">
            <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
              {single ? 'Applies to the whole sheet' : 'Applies to the selected cells'}
            </DropdownMenuLabel>
            <DropdownMenuItem
              onSelect={() => {
                const out = removeEmptyRows(sheet, sheetName)
                change(out.sheet)
                toast.success(`${out.removed} empty rows removed`)
              }}
            >
              Remove empty rows
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                const out = removeEmptyCols(sheet, sheetName)
                change(out.sheet)
                toast.success(`${out.removed} empty columns removed`)
              }}
            >
              Remove empty columns
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => change(trimText(sheet, target))}>
              Trim extra spaces
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => change(textToNumbers(sheet, target))}>
              Convert numbers stored as text
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => change(formulasToValues(sheet, target, value))}>
              Replace formulas with their values
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => change(clearRange(sheet, target, 'formats'))}>
              Clear formatting
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() =>
                change({
                  ...sheet,
                  merges: sheet.merges.filter(
                    (m) =>
                      !single &&
                      !(
                        m.r <= range.r2 &&
                        m.r + m.rs - 1 >= range.r1 &&
                        m.c <= range.c2 &&
                        m.c + m.cs - 1 >= range.c1
                      ),
                  ),
                })
              }
            >
              Unmerge all cells
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">{actions}</div>
      </div>

      <SheetGrid
        sheet={sheet}
        sheetName={sheetName}
        evaluator={evaluator}
        readOnly={readOnly}
        selection={selection}
        onSelectionChange={setSelection}
        onChange={change}
        onUndo={undo}
        onRedo={redo}
        onSave={onSave}
        onFormatKey={(key) => toggle(key)}
        onAddCard={onAddCard ? () => onAddCard(range, evaluator) : undefined}
        onOpenRow={setOpenRow}
        outline={outline}
        collapsed={collapsed}
        onToggleRow={outline.length ? toggleRow : undefined}
        onTotalCard={onTotalCard ? (c) => onTotalCard(c, evaluator) : undefined}
      />
      {openRow !== null && openRow < sheet.rows.length && (
        <RowDialog
          sheet={sheet}
          sheetName={sheetName}
          evaluator={evaluator}
          row={openRow}
          readOnly={readOnly}
          onChange={change}
          onMove={setOpenRow}
          onClose={() => setOpenRow(null)}
          activity={rowExtras?.(openRow, evaluator)}
        />
      )}
    </div>
  )
}

function ColorPicker({
  label,
  icon,
  colors,
  value,
  disabled,
  onPick,
}: {
  label: string
  icon: ReactNode
  colors: string[]
  value: string | undefined
  disabled: boolean
  onPick: (color: string | undefined) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative size-8"
          aria-label={label}
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
        >
          {icon}
          <span
            className="absolute inset-x-1.5 bottom-1 h-0.5 rounded"
            style={{ background: value ?? 'transparent' }}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2" onOpenAutoFocus={(e) => e.preventDefault()}>
        <p className="text-muted-foreground mb-1.5 text-xs">{label}</p>
        <div className="grid grid-cols-4 gap-1">
          {colors.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={c}
              className={cn('size-6 rounded border', value === c && 'ring-primary ring-2')}
              style={{ background: c }}
              onClick={() => {
                onPick(c)
                setOpen(false)
              }}
            />
          ))}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <input
            type="color"
            aria-label={`Custom ${label.toLowerCase()}`}
            className="h-7 w-10 cursor-pointer rounded border bg-transparent"
            value={value ?? '#000000'}
            onChange={(e) => onPick(e.target.value)}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onPick(undefined)
              setOpen(false)
            }}
          >
            None
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
