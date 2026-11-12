/* eslint-disable react-hooks/refs -- renderRow builds the cells' event handlers during render;
   the refs are only read inside those handlers, never while rendering. */
import { ContextMenu } from 'radix-ui'
import { ChevronDownIcon, ChevronRightIcon, Maximize2Icon } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { formatValue } from '../display'
import { cellName, colName, isError, type Scalar } from '../formula'
import {
  clearRange,
  copyRange,
  DEFAULT_ROW_HEIGHT,
  deleteCols,
  deleteRows,
  editText,
  fillRange,
  getCell,
  insertCols,
  insertRows,
  listFor,
  MAX_COLS,
  MAX_ROWS,
  mergeAt,
  mergeRange,
  normRange,
  numbersIn,
  pasteClip,
  pasteText,
  rangeName,
  resizeCol,
  resizeRow,
  sortRows,
  typeInto,
  type Clip,
  type Evaluator,
  type NumberFormat,
  type Range,
  type Sheet,
} from '../model'

import { selectionRange, type Selection } from '../selection'

const HEADER_H = 24
const ROWNUM_W = 60
const OVERSCAN = 8
const menuItem =
  'relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground'

const isBlank = (v: Scalar) => v === null || v === ''

interface Edit {
  r: number
  c: number
  text: string
  /** Where a reference picked by clicking starts, while writing a formula. */
  pointAt: number | null
  pointAnchor: { r: number; c: number } | null
}

export interface SheetGridProps {
  sheet: Sheet
  sheetName: string
  evaluator: Evaluator
  readOnly: boolean
  selection: Selection
  onSelectionChange: (sel: Selection) => void
  onChange: (next: Sheet) => void
  onUndo: () => void
  onRedo: () => void
  onSave?: () => void
  onAddCard?: () => void
  /** Opens the row's details dialog. */
  onOpenRow?: (r: number) => void
  /** Outline level per row (0 phase, 1 activity, 2 detail), for expand and collapse. */
  outline?: (number | null)[]
  /** Ids of collapsed rows. */
  collapsed?: Set<string>
  onToggleRow?: (rowId: string) => void
  /** Clicking a column total in the bottom row. */
  onTotalCard?: (c: number) => void
  /** Keyboard shortcuts for formatting, handled by the toolbar's owner. */
  onFormatKey?: (key: 'b' | 'i' | 'u') => void
}

/** Excel-like sheet grid with a formula bar and a status bar. */
export function SheetGrid({
  sheet,
  sheetName,
  evaluator,
  readOnly,
  selection,
  onSelectionChange,
  onChange,
  onUndo,
  onRedo,
  onSave,
  onAddCard,
  onOpenRow,
  outline,
  collapsed,
  onToggleRow,
  onTotalCard,
  onFormatKey,
}: SheetGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<HTMLTextAreaElement>(null)
  const barRef = useRef<HTMLTextAreaElement>(null)
  const clipRef = useRef<{ text: string; clip: Clip; cut: Range | null } | null>(null)
  const [edit, setEdit] = useState<Edit | null>(null)
  const [scroll, setScroll] = useState({ top: 0, height: 600 })
  // True while there is more of the sheet to the right of what is on screen.
  const [moreRight, setMoreRight] = useState(false)
  const [picker, setPicker] = useState<{
    r: number
    c: number
    options: string[]
    index: number
    left: number
    top: number
    above: number
    width: number
  } | null>(null)
  const [drag, setDrag] = useState<null | 'select' | 'fill' | 'point' | 'rows' | 'cols'>(null)
  const [fillTo, setFillTo] = useState<{ r: number; c: number } | null>(null)
  const [resizing, setResizing] = useState<{
    kind: 'col' | 'row'
    index: number
    start: number
    size: number
    now: number
  } | null>(null)

  const range = selectionRange(sheet, selection)
  const active = selection.anchor
  const rowCount = sheet.rows.length
  const colCount = sheet.cols.length
  const fr = Math.min(sheet.freeze.rows, rowCount)
  const fc = Math.min(sheet.freeze.cols, colCount)

  const widths = sheet.cols.map((c, i) =>
    resizing?.kind === 'col' && resizing.index === i ? Math.max(24, resizing.now) : c.w,
  )
  // Rows under a collapsed phase or activity are hidden.
  const hidden: boolean[] = []
  if (outline?.length && collapsed?.size) {
    let under: number | null = null
    sheet.rows.forEach((row, i) => {
      const level = outline[i]
      if (level === null || level === undefined) return
      if (under !== null && level > under) {
        hidden[i] = true
        return
      }
      under = collapsed.has(row.id) ? level : null
    })
  }
  const hasChildren = (r: number) => {
    const level = outline?.[r]
    const next = outline?.[r + 1]
    return (
      level !== null &&
      level !== undefined &&
      level < 2 &&
      next !== null &&
      next !== undefined &&
      next > level
    )
  }
  const heights = sheet.rows.map((r, i) =>
    hidden[i]
      ? 0
      : resizing?.kind === 'row' && resizing.index === i
        ? Math.max(18, resizing.now)
        : (r.h ?? DEFAULT_ROW_HEIGHT),
  )
  const colLeft = [ROWNUM_W]
  for (const w of widths) colLeft.push(colLeft[colLeft.length - 1] + w)
  const rowTop = [0]
  for (const h of heights) rowTop.push(rowTop[rowTop.length - 1] + h)
  const frozenHeight = rowTop[fr]

  // Visible body rows, from scroll position.
  const findRow = (y: number) => {
    let lo = fr
    let hi = rowCount - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (rowTop[mid] <= y) lo = mid
      else hi = mid - 1
    }
    return lo
  }
  const bodyTop = scroll.top + frozenHeight
  const first = Math.max(fr, findRow(bodyTop) - OVERSCAN)
  const last = Math.min(rowCount - 1, findRow(bodyTop + scroll.height) + OVERSCAN)

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const update = () => {
      setScroll({ top: el.scrollTop, height: el.clientHeight })
      setMoreRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const select = useCallback(
    (anchor: { r: number; c: number }, focus = anchor) => onSelectionChange({ anchor, focus }),
    [onSelectionChange],
  )

  // Keeps the active cell in view.
  const reveal = (r: number, c: number) => {
    const el = scrollRef.current
    if (!el) return
    if (r >= fr) {
      const top = rowTop[r] - frozenHeight
      const bottom = rowTop[r + 1] - frozenHeight
      if (top < el.scrollTop) el.scrollTop = top
      else if (bottom > el.scrollTop + el.clientHeight - HEADER_H - frozenHeight)
        el.scrollTop = bottom - el.clientHeight + HEADER_H + frozenHeight
    }
    if (c >= fc) {
      const frozenW = colLeft[fc] - ROWNUM_W
      const left = colLeft[c] - ROWNUM_W - frozenW
      const right = colLeft[c + 1] - frozenW
      if (left < el.scrollLeft) el.scrollLeft = left
      else if (right > el.scrollLeft + el.clientWidth) el.scrollLeft = right - el.clientWidth
    }
  }

  const focusGrid = () => scrollRef.current?.focus({ preventScroll: true })

  // ---- editing -----------------------------------------------------------
  /** Opens the list of choices under a dropdown cell. */
  const openPicker = (r: number, c: number) => {
    if (readOnly) return
    const el = scrollRef.current?.querySelector<HTMLElement>(`td[data-r="${r}"][data-c="${c}"]`)
    if (!el) return
    const box = el.getBoundingClientRect()
    const options = ['', ...(listFor(sheet, c) ?? [])]
    const current = editText(getCell(sheet, r, c))
    if (current && !options.includes(current)) options.push(current)
    setEdit(null)
    setPicker({
      r,
      c,
      options,
      index: Math.max(0, options.indexOf(current)),
      left: box.left,
      top: box.bottom,
      above: box.top,
      width: box.width,
    })
  }
  const choose = (value: string) => {
    if (!picker) return
    onChange(typeInto(sheet, picker.r, picker.c, value))
    setPicker(null)
    focusGrid()
  }

  const startEdit = (text?: string, from: 'cell' | 'bar' = 'cell') => {
    if (readOnly) return
    const m = mergeAt(sheet, active.r, active.c)
    const r = m ? m.r : active.r
    const c = m ? m.c : active.c
    // A dropdown cell opens its list, never a text box.
    if (from === 'cell' && r >= fr && listFor(sheet, c)) return openPicker(r, c)
    setEdit({
      r,
      c,
      text: text ?? editText(getCell(sheet, r, c)),
      pointAt: null,
      pointAnchor: null,
    })
    requestAnimationFrame(() => {
      const target = from === 'bar' ? barRef.current : editorRef.current
      target?.focus()
      target?.setSelectionRange(target.value.length, target.value.length)
    })
  }

  const commit = (move?: { dr: number; dc: number }) => {
    if (!edit) return
    const old = editText(getCell(sheet, edit.r, edit.c))
    if (edit.text !== old) onChange(typeInto(sheet, edit.r, edit.c, edit.text))
    setEdit(null)
    focusGrid()
    if (move) {
      const next = clampPos(edit.r + move.dr, edit.c + move.dc)
      select(next)
      reveal(next.r, next.c)
    }
  }

  // The editor and the formula bar grow to fit what is in them.
  const editingText = edit?.text
  const shownText = edit
    ? edit.text
    : editText(getCell(sheet, selection.anchor.r, selection.anchor.c))
  useLayoutEffect(() => {
    for (const el of [editorRef.current, barRef.current]) {
      if (!el) continue
      el.style.height = 'auto'
      el.style.height = `${el.scrollHeight + 2}px`
    }
  }, [editingText, shownText])

  const clampPos = (r: number, c: number) => ({
    r: Math.max(0, Math.min(rowCount - 1, r)),
    c: Math.max(0, Math.min(colCount - 1, c)),
  })

  const wantsRef = (e: Edit) =>
    e.text.startsWith('=') && (e.pointAt !== null || /[=(,+\-*/^&<>:;]\s*$/.test(e.text))

  // ---- keyboard ----------------------------------------------------------
  const valueAt = (r: number, c: number) => evaluator.value(sheetName, r, c)

  /** Ctrl+arrow: to the edge of the current block of data. */
  const jump = (r: number, c: number, dr: number, dc: number) => {
    const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < rowCount && y < colCount
    const filled = (x: number, y: number) => !isBlank(valueAt(x, y))
    let x = r
    let y = c
    if (!inside(x + dr, y + dc)) return { r: x, c: y }
    if (filled(x, y) && filled(x + dr, y + dc)) {
      while (inside(x + dr, y + dc) && filled(x + dr, y + dc)) {
        x += dr
        y += dc
      }
    } else {
      x += dr
      y += dc
      while (inside(x + dr, y + dc) && !filled(x, y)) {
        x += dr
        y += dc
      }
    }
    return { r: x, c: y }
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (edit) return
    const mod = e.ctrlKey || e.metaKey
    const key = e.key
    if (mod && key.toLowerCase() === 'z') {
      e.preventDefault()
      if (e.shiftKey) onRedo()
      else onUndo()
      return
    }
    if (mod && key.toLowerCase() === 'y') {
      e.preventDefault()
      onRedo()
      return
    }
    if (mod && key.toLowerCase() === 's') {
      e.preventDefault()
      onSave?.()
      return
    }
    if (mod && key.toLowerCase() === 'a') {
      e.preventDefault()
      onSelectionChange({ anchor: { r: 0, c: 0 }, focus: { r: rowCount - 1, c: colCount - 1 } })
      return
    }
    if (mod && ['b', 'i', 'u'].includes(key.toLowerCase())) {
      e.preventDefault()
      if (!readOnly) onFormatKey?.(key.toLowerCase() as 'b' | 'i' | 'u')
      return
    }
    if (mod && key.toLowerCase() === 'd') {
      e.preventDefault()
      if (!readOnly && range.r2 > range.r1) {
        onChange(fillRange(sheet, { ...range, r2: range.r1 }, range))
      }
      return
    }
    const moves: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    }
    if (moves[key]) {
      e.preventDefault()
      const [dr, dc] = moves[key]
      const from = e.shiftKey ? selection.focus : active
      const m = !e.shiftKey ? mergeAt(sheet, from.r, from.c) : undefined
      let next = mod
        ? jump(from.r, from.c, dr, dc)
        : clampPos(
            (m && dr > 0 ? m.r + m.rs - 1 : m && dr < 0 ? m.r : from.r) + dr,
            (m && dc > 0 ? m.c + m.cs - 1 : m && dc < 0 ? m.c : from.c) + dc,
          )
      next = clampPos(next.r, next.c)
      // Step over rows hidden under a collapsed phase or activity.
      if (dr !== 0 && hidden[next.r]) {
        let r = next.r
        while (r >= 0 && r < rowCount && hidden[r]) r += dr
        next = r >= 0 && r < rowCount ? { r, c: next.c } : from
      }
      if (e.shiftKey) onSelectionChange({ anchor: active, focus: next })
      else select(next)
      reveal(next.r, next.c)
      return
    }
    if (key === 'PageDown' || key === 'PageUp') {
      e.preventDefault()
      const rows = Math.max(1, Math.floor(scroll.height / DEFAULT_ROW_HEIGHT) - 2)
      const next = clampPos(active.r + (key === 'PageDown' ? rows : -rows), active.c)
      select(next)
      reveal(next.r, next.c)
      return
    }
    if (key === 'Home') {
      e.preventDefault()
      const next = clampPos(mod ? 0 : active.r, 0)
      select(next)
      reveal(next.r, next.c)
      return
    }
    if (key === 'Tab' || key === 'Enter') {
      e.preventDefault()
      if (
        key === 'Enter' &&
        range.r1 === range.r2 &&
        range.c1 === range.c2 &&
        !readOnly &&
        e.altKey
      )
        return
      const back = e.shiftKey ? -1 : 1
      const next =
        key === 'Tab' ? clampPos(active.r, active.c + back) : clampPos(active.r + back, active.c)
      select(next)
      reveal(next.r, next.c)
      return
    }
    if (key === 'F2') {
      e.preventDefault()
      startEdit()
      return
    }
    if (key === 'Delete' || key === 'Backspace') {
      e.preventDefault()
      if (!readOnly) onChange(clearRange(sheet, range, 'contents'))
      return
    }
    if (key === 'Escape') {
      clipRef.current = null
      return
    }
    if (!mod && !e.altKey && key.length === 1) {
      e.preventDefault()
      startEdit(key)
    }
  }

  // ---- clipboard ---------------------------------------------------------
  const rangeText = useCallback(
    (r: Range) => {
      const lines: string[] = []
      for (let i = r.r1; i <= r.r2; i++) {
        const row: string[] = []
        for (let j = r.c1; j <= r.c2; j++) {
          const v = evaluator.value(sheetName, i, j)
          const cell = getCell(sheet, i, j)
          const text =
            typeof v === 'number' && !cell?.s?.fmt
              ? String(v)
              : formatValue(v, cell?.s?.fmt === 'peso' ? 'number' : cell?.s?.fmt)
          row.push(/[\t\n"]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text)
        }
        lines.push(row.join('\t'))
      }
      return lines.join('\n')
    },
    [evaluator, sheet, sheetName],
  )

  const doCopy = (cut: boolean) => {
    const text = rangeText(range)
    clipRef.current = { text, clip: copyRange(sheet, range), cut: cut ? range : null }
    return text
  }

  const doPaste = (text: string) => {
    if (readOnly) return
    const internal = clipRef.current
    if (
      internal &&
      internal.text.replace(/\r/g, '') === text.replace(/\r/g, '').replace(/\n$/, '')
    ) {
      let next = sheet
      if (internal.cut) next = clearRange(next, internal.cut, 'all')
      next = pasteClip(next, range, internal.clip)
      if (internal.cut) clipRef.current = null
      onChange(next)
      const h = Math.max(internal.clip.rows, range.r2 - range.r1 + 1)
      const w = Math.max(internal.clip.cols, range.c2 - range.c1 + 1)
      onSelectionChange({
        anchor: { r: range.r1, c: range.c1 },
        focus: clampPos(range.r1 + h - 1, range.c1 + w - 1),
      })
      return
    }
    const pasted = pasteText(sheet, { r: range.r1, c: range.c1 }, text)
    onChange(pasted.sheet)
    onSelectionChange({
      anchor: { r: pasted.range.r1, c: pasted.range.c1 },
      focus: { r: pasted.range.r2, c: pasted.range.c2 },
    })
  }

  useEffect(() => {
    const inGrid = () => {
      const el = scrollRef.current
      return !!el && document.activeElement === el
    }
    const copy = (e: ClipboardEvent) => {
      if (!inGrid()) return
      e.preventDefault()
      e.clipboardData?.setData('text/plain', doCopy(false))
    }
    const cut = (e: ClipboardEvent) => {
      if (!inGrid() || readOnly) return
      e.preventDefault()
      e.clipboardData?.setData('text/plain', doCopy(true))
    }
    const paste = (e: ClipboardEvent) => {
      if (!inGrid()) return
      e.preventDefault()
      const text = e.clipboardData?.getData('text/plain') ?? ''
      if (text) doPaste(text)
    }
    document.addEventListener('copy', copy)
    document.addEventListener('cut', cut)
    document.addEventListener('paste', paste)
    return () => {
      document.removeEventListener('copy', copy)
      document.removeEventListener('cut', cut)
      document.removeEventListener('paste', paste)
    }
  })

  // ---- mouse -------------------------------------------------------------
  const cellFromPoint = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-cell]')
    if (!el) return null
    return { r: Number(el.dataset.r), c: Number(el.dataset.c) }
  }

  const insertPointRef = (e: Edit, a: { r: number; c: number }, b: { r: number; c: number }) => {
    const at = e.pointAt ?? e.text.length
    const ref = a.r === b.r && a.c === b.c ? cellName(a.r, a.c) : rangeName(normRange(a, b))
    setEdit({ ...e, text: e.text.slice(0, at) + ref, pointAt: at, pointAnchor: a })
  }

  const onCellMouseDown = (e: React.MouseEvent, r: number, c: number) => {
    if (e.button !== 0) return
    if (edit) {
      if (wantsRef(edit)) {
        e.preventDefault()
        insertPointRef(edit, { r, c }, { r, c })
        setDrag('point')
        return
      }
      commit()
    }
    e.preventDefault()
    focusGrid()
    if (e.shiftKey) onSelectionChange({ anchor: active, focus: { r, c } })
    else select({ r, c })
    setDrag('select')
  }

  useEffect(() => {
    if (!drag) return
    const move = (e: MouseEvent) => {
      const el = scrollRef.current
      if (el) {
        const box = el.getBoundingClientRect()
        if (e.clientY > box.bottom - 24) el.scrollTop += 24
        else if (e.clientY < box.top + HEADER_H + frozenHeight + 12) el.scrollTop -= 24
        if (e.clientX > box.right - 24) el.scrollLeft += 24
        else if (e.clientX < box.left + ROWNUM_W + 12) el.scrollLeft -= 24
      }
      const pos = cellFromPoint(e.clientX, e.clientY)
      if (!pos) return
      if (drag === 'select') onSelectionChange({ anchor: active, focus: pos })
      else if (drag === 'rows')
        onSelectionChange({ anchor: { r: active.r, c: 0 }, focus: { r: pos.r, c: colCount - 1 } })
      else if (drag === 'cols')
        onSelectionChange({ anchor: { r: 0, c: active.c }, focus: { r: rowCount - 1, c: pos.c } })
      else if (drag === 'fill') setFillTo(pos)
      else if (drag === 'point' && edit?.pointAnchor) insertPointRef(edit, edit.pointAnchor, pos)
    }
    const up = () => {
      if (drag === 'fill' && fillTo) {
        const down = fillTo.r - range.r2
        const right = fillTo.c - range.c2
        const target =
          down >= right && down > 0
            ? { ...range, r2: fillTo.r }
            : right > 0
              ? { ...range, c2: fillTo.c }
              : null
        if (target) {
          onChange(fillRange(sheet, range, target))
          onSelectionChange({
            anchor: { r: target.r1, c: target.c1 },
            focus: { r: target.r2, c: target.c2 },
          })
        }
      }
      setFillTo(null)
      setDrag(null)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    return () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
  })

  useEffect(() => {
    if (!resizing) return
    const move = (e: MouseEvent) =>
      setResizing(
        (x) => x && { ...x, now: x.size + ((x.kind === 'col' ? e.clientX : e.clientY) - x.start) },
      )
    const up = () => {
      if (resizing.kind === 'col') onChange(resizeCol(sheet, resizing.index, resizing.now))
      else onChange(resizeRow(sheet, resizing.index, resizing.now))
      setResizing(null)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    return () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
  })

  const fillRangeShown = fillTo
    ? fillTo.r - range.r2 >= fillTo.c - range.c2
      ? { ...range, r2: Math.max(range.r2, fillTo.r) }
      : { ...range, c2: Math.max(range.c2, fillTo.c) }
    : null

  // ---- structure -----------------------------------------------------------
  const rowsSelected = range.c1 === 0 && range.c2 === colCount - 1
  const colsSelected = range.r1 === 0 && range.r2 === rowCount - 1
  const structural = {
    insertRows: (below: boolean) => {
      const n = range.r2 - range.r1 + 1
      onChange(insertRows(sheet, below ? range.r2 + 1 : range.r1, n, sheetName))
      if (!below)
        onSelectionChange({
          anchor: { r: range.r1 + n, c: range.c1 },
          focus: { r: range.r2 + n, c: range.c2 },
        })
    },
    insertCols: (right: boolean) => {
      const n = range.c2 - range.c1 + 1
      onChange(insertCols(sheet, right ? range.c2 + 1 : range.c1, n, sheetName))
    },
    deleteRows: () => {
      if (range.r2 - range.r1 + 1 >= rowCount) return toast.error('A sheet needs at least one row.')
      onChange(deleteRows(sheet, range.r1, range.r2 - range.r1 + 1, sheetName))
      select(clampPos(range.r1, range.c1))
    },
    deleteCols: () => {
      if (range.c2 - range.c1 + 1 >= colCount)
        return toast.error('A sheet needs at least one column.')
      onChange(deleteCols(sheet, range.c1, range.c2 - range.c1 + 1, sheetName))
      select(clampPos(range.r1, range.c1))
    },
    sort: (descending: boolean) => {
      let target = range
      if (range.r1 === range.r2) {
        // One cell: sort the data under the header, leaving total rows at the bottom.
        let end = rowCount - 1
        while (end > fr && sheet.cols.every((_, c) => isBlank(valueAt(end, c)))) end--
        while (end > fr && /^\s*(grand\s+|sub-?\s*)?total\b/i.test(String(valueAt(end, 0) ?? '')))
          end--
        target = { r1: Math.max(fr, 1), c1: 0, r2: end, c2: colCount - 1 }
      }
      if (sheet.merges.some((m) => m.r <= target.r2 && m.r + m.rs - 1 >= target.r1)) {
        return toast.error('Unmerge the cells in these rows before sorting.')
      }
      onChange(sortRows(sheet, target, active.c, descending, valueAt))
    },
  }

  // ---- render ------------------------------------------------------------
  // Column sums for the pinned bottom row: numbers in the data rows, leaving out
  // the sheet's own total rows, dates and percentages.
  const columnTotals = useMemo(() => {
    const sums: (number | null)[] = Array(colCount).fill(null)
    const formats: (NumberFormat | undefined)[] = Array(colCount).fill(undefined)
    for (let r = fr; r < rowCount; r++) {
      let label: string | null = null
      const values: Scalar[] = []
      for (let c = 0; c < colCount; c++) {
        const v = evaluator.value(sheetName, r, c)
        values.push(v)
        if (label === null && typeof v === 'string' && v.trim()) label = v
      }
      if (label !== null && /^s*(grands+|sub-?s*)?total\b/i.test(label)) continue
      values.forEach((v, c) => {
        if (typeof v !== 'number') return
        const fmt = getCell(sheet, r, c)?.s?.fmt
        if (fmt === 'date' || fmt === 'percent' || fmt === 'text') return
        sums[c] = (sums[c] ?? 0) + v
        formats[c] ??= fmt
      })
    }
    return { sums, formats }
  }, [evaluator, sheet, sheetName, fr, rowCount, colCount])

  const stats = useMemo(() => {
    if (range.r1 === range.r2 && range.c1 === range.c2) return null
    const cells = (range.r2 - range.r1 + 1) * (range.c2 - range.c1 + 1)
    if (cells > 200_000) return null
    const { numbers, count } = numbersIn(evaluator, sheetName, range)
    const sum = numbers.reduce((a, b) => a + b, 0)
    return {
      sum,
      avg: numbers.length ? sum / numbers.length : null,
      count,
      numeric: numbers.length,
    }
  }, [evaluator, sheetName, range.r1, range.r2, range.c1, range.c2]) // eslint-disable-line react-hooks/exhaustive-deps

  const activeCell = getCell(sheet, active.r, active.c)
  const barText = edit ? edit.text : editText(activeCell)
  const frozenW = colLeft[fc]

  const renderRow = (r: number, frozen: boolean) => {
    const top = frozen ? HEADER_H + rowTop[r] : undefined
    const regionStart = frozen ? 0 : first
    const regionEnd = frozen ? fr : last + 1
    const tds = []
    tds.push(
      <th
        key="n"
        data-cell
        data-r={r}
        data-c={0}
        onMouseDown={(e) => {
          if (e.button !== 0) return
          e.preventDefault()
          if (edit) commit()
          focusGrid()
          if (e.shiftKey)
            onSelectionChange({ anchor: { r: active.r, c: 0 }, focus: { r, c: colCount - 1 } })
          else onSelectionChange({ anchor: { r, c: 0 }, focus: { r, c: colCount - 1 } })
          setDrag('rows')
        }}
        className={cn(
          'bg-muted text-muted-foreground sticky left-0 z-20 border-r border-b text-center text-[11px] font-normal select-none',
          rowsSelected && r >= range.r1 && r <= range.r2 && 'bg-primary/15 text-foreground',
          !rowsSelected && r >= range.r1 && r <= range.r2 && 'text-foreground font-medium',
          frozen && 'z-30',
        )}
        style={{ top, height: heights[r] }}
        onDoubleClick={() => onOpenRow?.(r)}
        title={onOpenRow ? 'Double-click to open the row' : undefined}
      >
        {onToggleRow && hasChildren(r) && (
          <button
            type="button"
            aria-expanded={!collapsed?.has(sheet.rows[r].id)}
            aria-label={`${collapsed?.has(sheet.rows[r].id) ? 'Expand' : 'Collapse'} row ${r + 1}`}
            title={collapsed?.has(sheet.rows[r].id) ? 'Expand' : 'Collapse'}
            className={cn(
              'hover:bg-accent text-foreground absolute inset-y-0 left-0 flex w-5 items-center justify-center',
              outline?.[r] === 1 && 'left-1.5',
            )}
            onMouseDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            onClick={() => onToggleRow(sheet.rows[r].id)}
          >
            {collapsed?.has(sheet.rows[r].id) ? (
              <ChevronRightIcon className="size-3.5" />
            ) : (
              <ChevronDownIcon className="size-3.5" />
            )}
          </button>
        )}
        <span className={cn('block pl-4', onOpenRow && 'group-hover/row:pr-3')}>{r + 1}</span>
        {onOpenRow && (
          <button
            type="button"
            aria-label={`Open row ${r + 1}`}
            className="text-primary hover:bg-accent absolute inset-y-0 right-0 hidden w-5 items-center justify-center group-hover/row:flex"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => onOpenRow(r)}
          >
            <Maximize2Icon className="size-3" />
          </button>
        )}
        {!readOnly && (
          <div
            className="absolute inset-x-0 -bottom-0.5 h-1.5 cursor-row-resize"
            onMouseDown={(e) => {
              e.stopPropagation()
              e.preventDefault()
              setResizing({
                kind: 'row',
                index: r,
                start: e.clientY,
                size: heights[r],
                now: heights[r],
              })
            }}
          />
        )}
      </th>,
    )
    for (let c = 0; c < colCount; c++) {
      const m = mergeAt(sheet, r, c)
      let rowSpan = 1
      let colSpan = 1
      let ar = r
      let ac = c
      if (m) {
        const anchorRow = Math.max(m.r, regionStart)
        if (r !== anchorRow || c !== m.c) continue
        rowSpan = Math.min(m.r + m.rs, regionEnd) - r
        colSpan = m.cs
        ar = m.r
        ac = m.c
      }
      const cell = getCell(sheet, ar, ac)
      const s = cell?.s
      const value = evaluator.value(sheetName, ar, ac)
      const text = formatValue(value, s?.fmt)
      const error = isError(value)
      const align =
        s?.align ??
        (error || typeof value === 'boolean'
          ? 'center'
          : typeof value === 'number'
            ? 'right'
            : 'left')
      const r2 = m ? m.r + m.rs - 1 : r
      const c2 = m ? m.c + m.cs - 1 : c
      const inSel = ar <= range.r2 && r2 >= range.r1 && ac <= range.c2 && c2 >= range.c1
      const isActive = ar === active.r && ac === active.c
      const inFill =
        fillRangeShown &&
        ar <= fillRangeShown.r2 &&
        r2 >= fillRangeShown.r1 &&
        ac <= fillRangeShown.c2 &&
        c2 >= fillRangeShown.c1
      const frozenCol = c < fc
      const editing = edit && edit.r === ar && edit.c === ac
      const custom: string[] = []
      if (s?.border?.t) custom.push('inset 0 1px 0 0 var(--foreground)')
      if (s?.border?.b) custom.push('inset 0 -1px 0 0 var(--foreground)')
      if (s?.border?.l) custom.push('inset 1px 0 0 0 var(--foreground)')
      if (s?.border?.r) custom.push('inset -1px 0 0 0 var(--foreground)')
      const style: CSSProperties = {
        top,
        left: frozenCol ? colLeft[c] : undefined,
        fontWeight: s?.b ? 600 : undefined,
        fontStyle: s?.i ? 'italic' : undefined,
        textDecoration:
          [s?.u && 'underline', s?.strike && 'line-through'].filter(Boolean).join(' ') || undefined,
        color: error ? 'var(--destructive)' : s?.color,
        background: s?.bg ?? (frozen || frozenCol ? 'var(--card)' : undefined),
        fontSize: s?.size ? `${Math.round(s.size * 1.2)}px` : undefined,
        textAlign: align,
        verticalAlign: s?.valign ?? 'bottom',
        boxShadow: custom.join(', ') || undefined,
      }
      const selEdges = inSel
        ? [
            ar <= range.r1 && 'inset 0 2px 0 0 var(--primary)',
            r2 >= range.r2 && 'inset 0 -2px 0 0 var(--primary)',
            ac <= range.c1 && 'inset 2px 0 0 0 var(--primary)',
            c2 >= range.c2 && 'inset -2px 0 0 0 var(--primary)',
          ].filter(Boolean)
        : []
      const showFillHandle = !readOnly && !edit && r2 === range.r2 && c2 === range.c2 && inSel
      tds.push(
        <td
          key={c}
          data-cell
          data-r={ar}
          data-c={ac}
          rowSpan={rowSpan > 1 ? rowSpan : undefined}
          colSpan={colSpan > 1 ? colSpan : undefined}
          onMouseDown={(e) => onCellMouseDown(e, ar, ac)}
          onDoubleClick={() => startEdit()}
          onContextMenu={() => {
            if (!inSel) select({ r: ar, c: ac })
          }}
          className={cn(
            'relative overflow-hidden border-r border-b px-1.5 leading-tight',
            // The editor grows past the cell to show long text in full.
            editing && '!z-40 !overflow-visible',
            (frozen || frozenCol) && 'sticky',
            frozen && frozenCol ? 'z-20' : frozen || frozenCol ? 'z-10' : undefined,
            c === fc - 1 && 'border-r-foreground/30',
            r === fr - 1 && 'border-b-foreground/30',
          )}
          style={style}
        >
          {editing ? (
            <textarea
              ref={editorRef}
              rows={1}
              aria-label={`Edit ${cellName(ar, ac)}`}
              className="bg-background outline-primary absolute top-0 left-0 z-10 min-h-full min-w-full cursor-text resize-none overflow-hidden px-1.5 py-1 leading-snug break-words whitespace-pre-wrap shadow-lg outline-2 select-text"
              style={{
                fontWeight: style.fontWeight,
                textAlign: edit.text.length > 40 ? 'left' : align,
                fontSize: style.fontSize,
                // Wide enough to read long text, wrapping after that.
                width: Math.max(widths[ac], Math.min(560, 28 + edit.text.length * 7.5)),
              }}
              value={edit.text}
              onChange={(e) =>
                setEdit({ ...edit, text: e.target.value, pointAt: null, pointAnchor: null })
              }
              onKeyDown={(e) => editKeys(e)}
              // Clicks inside the box place the cursor; they must not reach the cell.
              onMouseDown={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
              onContextMenu={(e) => e.stopPropagation()}
              onBlur={(e) => {
                if (e.relatedTarget === barRef.current) return
                if (drag !== 'point') commit()
              }}
            />
          ) : typeof value === 'boolean' && cell?.f === undefined ? (
            <span
              role="checkbox"
              aria-checked={value}
              aria-label={`${cellName(ar, ac)} ${value ? 'ticked' : 'not ticked'}`}
              className={cn(
                'mx-auto flex size-4 items-center justify-center rounded border text-[11px] leading-none',
                value ? 'bg-primary border-primary text-primary-foreground' : 'bg-background',
                !readOnly && 'cursor-pointer',
              )}
              onMouseDown={(e) => {
                if (readOnly || e.button !== 0) return
                e.stopPropagation()
                e.preventDefault()
                select({ r: ar, c: ac })
                onChange(typeInto(sheet, ar, ac, value ? 'FALSE' : 'TRUE'))
              }}
            >
              {value ? '✓' : ''}
            </span>
          ) : (
            <div
              className={cn(
                s?.wrap ? 'break-words whitespace-pre-wrap' : 'truncate whitespace-pre',
                listFor(sheet, ac) && ar >= fr && 'pr-5',
              )}
            >
              {text}
              {listFor(sheet, ac) && ar >= fr && !readOnly && (
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={`Choose a value for ${cellName(ar, ac)}`}
                  className="bg-muted hover:bg-primary hover:text-primary-foreground text-foreground absolute top-1/2 right-0.5 flex size-5 -translate-y-1/2 items-center justify-center rounded border"
                  onMouseDown={(e) => {
                    e.stopPropagation()
                    e.preventDefault()
                    if (edit) commit()
                    select({ r: ar, c: ac })
                    openPicker(ar, ac)
                  }}
                >
                  <ChevronDownIcon className="size-3.5" />
                </button>
              )}
            </div>
          )}
          {inSel && !isActive && (
            <div className="bg-primary/10 pointer-events-none absolute inset-0" />
          )}
          {selEdges.length > 0 && (
            <div
              className="pointer-events-none absolute inset-0"
              style={{ boxShadow: selEdges.join(', ') }}
            />
          )}
          {inFill && (
            <div className="border-primary pointer-events-none absolute inset-0 border border-dashed" />
          )}
          {showFillHandle && (
            <div
              className="bg-primary absolute right-0 bottom-0 z-10 size-2 cursor-crosshair border border-white"
              onMouseDown={(e) => {
                e.stopPropagation()
                e.preventDefault()
                setFillTo({ r: range.r2, c: range.c2 })
                setDrag('fill')
              }}
            />
          )}
        </td>,
      )
    }
    return (
      <tr key={sheet.rows[r].id} className="group/row" style={{ height: heights[r] }}>
        {tds}
      </tr>
    )
  }

  const editKeys = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!edit) return
    if (e.key === 'Enter' && e.altKey) {
      // Alt+Enter starts a new line inside the cell, as in Excel.
      e.preventDefault()
      const el = e.currentTarget
      const at = el.selectionStart ?? edit.text.length
      const text =
        edit.text.slice(0, at) + String.fromCharCode(10) + edit.text.slice(el.selectionEnd ?? at)
      setEdit({ ...edit, text, pointAt: null, pointAnchor: null })
      requestAnimationFrame(() => el.setSelectionRange(at + 1, at + 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      commit({ dr: e.shiftKey ? -1 : 1, dc: 0 })
    } else if (e.key === 'Tab') {
      e.preventDefault()
      commit({ dr: 0, dc: e.shiftKey ? -1 : 1 })
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setEdit(null)
      focusGrid()
    } else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !edit.text.startsWith('=')) {
      e.preventDefault()
      commit({ dr: e.key === 'ArrowUp' ? -1 : 1, dc: 0 })
    }
  }

  const totalWidth = colLeft[colCount]
  const bodyRows = []
  for (let r = first; r <= last; r++) if (!hidden[r]) bodyRows.push(renderRow(r, false))

  return (
    <div className="bg-card flex flex-col overflow-hidden rounded-md border">
      <div className="flex items-center gap-2 border-b px-2 py-1">
        <div
          className="text-muted-foreground w-20 shrink-0 font-mono text-xs"
          aria-label="Selected cells"
        >
          {rangeName(range)}
        </div>
        <span className="text-muted-foreground text-xs italic select-none">fx</span>
        <textarea
          ref={barRef}
          rows={1}
          aria-label="Formula bar"
          readOnly={readOnly}
          className="focus:ring-ring max-h-32 min-h-7 min-w-0 flex-1 resize-none overflow-y-auto rounded px-2 py-1 font-mono text-sm leading-5 break-words whitespace-pre-wrap outline-none focus:ring-1"
          value={barText}
          onFocus={() => {
            if (!edit && !readOnly) startEdit(undefined, 'bar')
          }}
          onChange={(e) =>
            edit && setEdit({ ...edit, text: e.target.value, pointAt: null, pointAnchor: null })
          }
          onKeyDown={editKeys}
          onBlur={(e) => {
            if (e.relatedTarget === editorRef.current) return
            if (drag !== 'point') commit()
          }}
        />
      </div>

      <div className="relative">
        <ContextMenu.Root>
          <ContextMenu.Trigger asChild>
            <div
              ref={scrollRef}
              tabIndex={0}
              role="grid"
              aria-label={`${sheetName} sheet`}
              aria-rowcount={rowCount}
              aria-colcount={colCount}
              onKeyDown={onKeyDown}
              onScroll={(e) => {
                const el = e.currentTarget
                setScroll({ top: el.scrollTop, height: el.clientHeight })
                setMoreRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
                if (picker) setPicker(null)
              }}
              className="scroll-strong relative h-[calc(100vh-330px)] min-h-[380px] overflow-auto text-sm outline-none select-none"
            >
              <table
                className="border-separate border-spacing-0"
                style={{ tableLayout: 'fixed', width: totalWidth }}
              >
                <colgroup>
                  <col style={{ width: ROWNUM_W }} />
                  {widths.map((w, i) => (
                    <col key={sheet.cols[i].id} style={{ width: w }} />
                  ))}
                </colgroup>
                <thead>
                  <tr style={{ height: HEADER_H }}>
                    <th
                      className="bg-muted sticky top-0 left-0 z-40 border-r border-b"
                      onMouseDown={(e) => {
                        e.preventDefault()
                        focusGrid()
                        onSelectionChange({
                          anchor: { r: 0, c: 0 },
                          focus: { r: rowCount - 1, c: colCount - 1 },
                        })
                      }}
                    />
                    {sheet.cols.map((col, c) => (
                      <th
                        key={col.id}
                        data-cell
                        data-r={0}
                        data-c={c}
                        onMouseDown={(e) => {
                          if (e.button !== 0) return
                          e.preventDefault()
                          if (edit) commit()
                          focusGrid()
                          if (e.shiftKey)
                            onSelectionChange({
                              anchor: { r: 0, c: active.c },
                              focus: { r: rowCount - 1, c },
                            })
                          else
                            onSelectionChange({
                              anchor: { r: 0, c },
                              focus: { r: rowCount - 1, c },
                            })
                          setDrag('cols')
                        }}
                        className={cn(
                          'bg-muted text-muted-foreground sticky top-0 z-30 border-r border-b text-center text-[11px] font-normal select-none',
                          c < fc && 'z-40',
                          c >= range.c1 &&
                            c <= range.c2 &&
                            (colsSelected
                              ? 'bg-primary/15 text-foreground'
                              : 'text-foreground font-medium'),
                        )}
                        style={{ left: c < fc ? colLeft[c] : undefined }}
                      >
                        {colName(c)}
                        {!readOnly && (
                          <div
                            className="absolute inset-y-0 -right-0.5 w-1.5 cursor-col-resize"
                            onMouseDown={(e) => {
                              e.stopPropagation()
                              e.preventDefault()
                              setResizing({
                                kind: 'col',
                                index: c,
                                start: e.clientX,
                                size: widths[c],
                                now: widths[c],
                              })
                            }}
                          />
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: fr }, (_, r) => renderRow(r, true))}
                  <tr aria-hidden style={{ height: rowTop[first] - rowTop[fr] }} />
                  {bodyRows}
                  <tr aria-hidden style={{ height: rowTop[rowCount] - rowTop[last + 1] }} />
                </tbody>
                <tfoot>
                  <tr style={{ height: DEFAULT_ROW_HEIGHT + 2 }}>
                    <th
                      scope="row"
                      className="bg-muted text-muted-foreground sticky bottom-0 left-0 z-40 border-t-2 border-r text-center text-[11px] font-semibold"
                      title="Totals of each column"
                    >
                      Σ
                    </th>
                    {sheet.cols.map((col, c) => {
                      const sum = columnTotals.sums[c]
                      return (
                        <td
                          key={col.id}
                          className={cn(
                            'bg-muted sticky bottom-0 z-30 truncate border-t-2 border-r px-1.5 text-right font-semibold tabular-nums',
                            c < fc && 'z-40',
                            sum !== null && onTotalCard && 'hover:bg-accent cursor-pointer',
                          )}
                          style={{ left: c < fc ? colLeft[c] : undefined }}
                          title={
                            sum === null
                              ? undefined
                              : `Total of column ${colName(c)}${onTotalCard ? '. Click to show it on the dashboard.' : ''}`
                          }
                          onClick={sum !== null && onTotalCard ? () => onTotalCard(c) : undefined}
                        >
                          {sum === null ? (
                            c === 0 ? (
                              <span className="block text-left">Total</span>
                            ) : (
                              ''
                            )
                          ) : (
                            formatValue(
                              sum,
                              columnTotals.formats[c] ??
                                (Number.isInteger(sum) ? 'integer' : 'number'),
                            )
                          )}
                        </td>
                      )
                    })}
                  </tr>
                </tfoot>
              </table>
              {frozenW > ROWNUM_W && <div className="sr-only">{fc} frozen columns</div>}
            </div>
          </ContextMenu.Trigger>
          <ContextMenu.Portal>
            <ContextMenu.Content className="bg-popover text-popover-foreground z-50 min-w-52 rounded-md border p-1 shadow-md">
              <ContextMenu.Item
                className={menuItem}
                onSelect={() => void navigator.clipboard.writeText(doCopy(false))}
              >
                Copy
              </ContextMenu.Item>
              {!readOnly && (
                <>
                  <ContextMenu.Item
                    className={menuItem}
                    onSelect={() => void navigator.clipboard.writeText(doCopy(true))}
                  >
                    Cut
                  </ContextMenu.Item>
                  <ContextMenu.Item
                    className={menuItem}
                    onSelect={() =>
                      void navigator.clipboard
                        .readText()
                        .then(doPaste)
                        .catch(() =>
                          toast.error(
                            'Press Ctrl+V to paste. The browser blocked reading the clipboard.',
                          ),
                        )
                    }
                  >
                    Paste
                  </ContextMenu.Item>
                  <ContextMenu.Separator className="bg-border -mx-1 my-1 h-px" />
                  <ContextMenu.Item
                    className={menuItem}
                    onSelect={() => structural.insertRows(false)}
                  >
                    Insert {range.r2 - range.r1 + 1 > 1 ? `${range.r2 - range.r1 + 1} rows` : 'row'}{' '}
                    above
                  </ContextMenu.Item>
                  <ContextMenu.Item
                    className={menuItem}
                    onSelect={() => structural.insertRows(true)}
                  >
                    Insert row below
                  </ContextMenu.Item>
                  <ContextMenu.Item
                    className={menuItem}
                    onSelect={() => structural.insertCols(false)}
                  >
                    Insert column left
                  </ContextMenu.Item>
                  <ContextMenu.Item
                    className={menuItem}
                    onSelect={() => structural.insertCols(true)}
                  >
                    Insert column right
                  </ContextMenu.Item>
                  <ContextMenu.Item className={menuItem} onSelect={structural.deleteRows}>
                    Delete{' '}
                    {range.r2 > range.r1
                      ? `rows ${range.r1 + 1}–${range.r2 + 1}`
                      : `row ${range.r1 + 1}`}
                  </ContextMenu.Item>
                  <ContextMenu.Item className={menuItem} onSelect={structural.deleteCols}>
                    Delete{' '}
                    {range.c2 > range.c1
                      ? `columns ${colName(range.c1)}–${colName(range.c2)}`
                      : `column ${colName(range.c1)}`}
                  </ContextMenu.Item>
                  <ContextMenu.Separator className="bg-border -mx-1 my-1 h-px" />
                  <ContextMenu.Item className={menuItem} onSelect={() => structural.sort(false)}>
                    Sort A → Z by column {colName(active.c)}
                  </ContextMenu.Item>
                  <ContextMenu.Item className={menuItem} onSelect={() => structural.sort(true)}>
                    Sort Z → A by column {colName(active.c)}
                  </ContextMenu.Item>
                  <ContextMenu.Item
                    className={menuItem}
                    onSelect={() => onChange(mergeRange(sheet, range))}
                  >
                    {sheet.merges.some(
                      (m) =>
                        m.r <= range.r2 &&
                        m.r + m.rs - 1 >= range.r1 &&
                        m.c <= range.c2 &&
                        m.c + m.cs - 1 >= range.c1,
                    )
                      ? 'Unmerge cells'
                      : 'Merge cells'}
                  </ContextMenu.Item>
                  <ContextMenu.Item
                    className={menuItem}
                    onSelect={() => onChange(clearRange(sheet, range, 'contents'))}
                  >
                    Clear contents
                  </ContextMenu.Item>
                </>
              )}
              {onOpenRow && (
                <>
                  <ContextMenu.Separator className="bg-border -mx-1 my-1 h-px" />
                  <ContextMenu.Item className={menuItem} onSelect={() => onOpenRow(active.r)}>
                    Open row details…
                  </ContextMenu.Item>
                </>
              )}
              {onAddCard && (
                <>
                  <ContextMenu.Separator className="bg-border -mx-1 my-1 h-px" />
                  <ContextMenu.Item className={menuItem} onSelect={onAddCard}>
                    Show on dashboard…
                  </ContextMenu.Item>
                </>
              )}
            </ContextMenu.Content>
          </ContextMenu.Portal>
        </ContextMenu.Root>
        {moreRight && (
          <>
            <div
              aria-hidden
              className="from-primary/25 pointer-events-none absolute top-0 right-3.5 bottom-3.5 w-10 bg-gradient-to-l to-transparent"
            />
            <button
              type="button"
              title="More columns to the right"
              aria-label="Scroll right to see more columns"
              className="bg-primary text-primary-foreground hover:bg-primary/90 absolute top-1/2 right-5 flex h-12 w-7 -translate-y-1/2 items-center justify-center rounded-full shadow-lg"
              onClick={() => scrollRef.current?.scrollBy({ left: 480, behavior: 'smooth' })}
            >
              <ChevronRightIcon className="size-5" />
            </button>
          </>
        )}
      </div>
      {picker &&
        createPortal(
          <>
            <div className="fixed inset-0 z-50" onMouseDown={() => setPicker(null)} />
            <div
              role="listbox"
              aria-label={`Choices for ${cellName(picker.r, picker.c)}`}
              tabIndex={-1}
              ref={(el) => el?.focus()}
              className="bg-popover text-popover-foreground fixed z-50 max-h-72 overflow-y-auto rounded-md border p-1 text-sm shadow-lg outline-none"
              style={{
                left: Math.min(picker.left, window.innerWidth - Math.max(picker.width, 200) - 8),
                minWidth: Math.max(picker.width, 200),
                ...(window.innerHeight - picker.top < 300 && picker.above > 300
                  ? { bottom: window.innerHeight - picker.above }
                  : { top: picker.top }),
              }}
              onKeyDown={(e) => {
                e.stopPropagation()
                const n = picker.options.length
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                  e.preventDefault()
                  const step = e.key === 'ArrowDown' ? 1 : -1
                  setPicker({ ...picker, index: (picker.index + step + n) % n })
                } else if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  choose(picker.options[picker.index])
                } else if (e.key === 'Escape' || e.key === 'Tab') {
                  e.preventDefault()
                  setPicker(null)
                  focusGrid()
                } else if (e.key.length === 1) {
                  // Typing a letter jumps to the first choice that starts with it.
                  const hit = picker.options.findIndex((o) =>
                    o.toLowerCase().startsWith(e.key.toLowerCase()),
                  )
                  if (hit >= 0) setPicker({ ...picker, index: hit })
                }
              }}
            >
              {picker.options.map((o, i) => (
                <div
                  key={o || '(blank)'}
                  role="option"
                  aria-selected={i === picker.index}
                  className={cn(
                    'cursor-pointer rounded px-2 py-1.5',
                    i === picker.index ? 'bg-primary text-primary-foreground' : 'hover:bg-accent',
                    !o && 'italic opacity-80',
                  )}
                  onMouseEnter={() => setPicker({ ...picker, index: i })}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    choose(o)
                  }}
                >
                  {o || 'Blank'}
                </div>
              ))}
            </div>
          </>,
          document.body,
        )}

      <div className="text-muted-foreground flex min-h-7 flex-wrap items-center justify-end gap-x-4 border-t px-3 py-1 text-xs tabular-nums">
        {stats && stats.numeric > 0 && (
          <>
            <span>Sum: {formatValue(stats.sum, 'number')}</span>
            <span>Average: {formatValue(stats.avg, 'number')}</span>
          </>
        )}
        {stats && <span>Count: {stats.count}</span>}
        <span>
          {rowCount.toLocaleString()} rows × {colCount} columns
          {rowCount >= MAX_ROWS || colCount >= MAX_COLS ? ' (limit)' : ''}
        </span>
      </div>
    </div>
  )
}
