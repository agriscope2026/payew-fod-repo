import { ListIcon } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Textarea } from '@/components/ui/textarea'
import { colName } from '../formula'
import { listFor, setList, type Range, type Sheet } from '../model'

/** Sets the dropdown choices of the selected columns, like Excel's list validation. */
export function DropdownChoices({
  sheet,
  range,
  disabled,
  onChange,
}: {
  sheet: Sheet
  range: Range
  disabled: boolean
  onChange: (next: Sheet) => void
}) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const cols = Array.from({ length: range.c2 - range.c1 + 1 }, (_, i) => range.c1 + i)
  const label =
    range.c1 === range.c2
      ? `column ${colName(range.c1)}`
      : `columns ${colName(range.c1)}–${colName(range.c2)}`
  const current = listFor(sheet, range.c1)

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        if (o) setText((current ?? []).join('\n'))
        setOpen(o)
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1 px-2"
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
        >
          <ListIcon /> Dropdown
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 space-y-2">
        <p className="text-sm font-medium">Dropdown choices for {label}</p>
        <p className="text-muted-foreground text-xs">
          One choice per line. Cells in the column then pick from this list.
        </p>
        <Textarea
          rows={8}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'Accomplished\nOngoing\nCancelled'}
        />
        <div className="flex justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={!current}
            onClick={() => {
              onChange(setList(sheet, cols, null))
              setOpen(false)
            }}
          >
            Remove dropdown
          </Button>
          <Button
            size="sm"
            onClick={() => {
              const options = [
                ...new Set(
                  text
                    .split('\n')
                    .map((s) => s.trim())
                    .filter(Boolean),
                ),
              ].slice(0, 200)
              onChange(setList(sheet, cols, options))
              setOpen(false)
            }}
          >
            Save choices
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
