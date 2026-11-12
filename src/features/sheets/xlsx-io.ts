// Reading uploaded spreadsheets into sheets, and writing styled .xlsx files.
// ExcelJS keeps formatting; SheetJS reads the formats ExcelJS can't (xls, csv, ods).
import type ExcelJSType from 'exceljs'
import { EXCEL_FORMAT, formatFromExcel } from './display'
import { colIndex, isError, rewriteRefs, shiftFormula, type Scalar } from './formula'
import {
  cellKey,
  DEFAULT_COL_WIDTH,
  getCell,
  MAX_COLS,
  MAX_ROWS,
  newId,
  type Cell,
  type CellStyle,
  type Evaluator,
  type Merge,
  type Sheet,
} from './model'

export interface UploadedTab {
  name: string
  hidden: boolean
  sheet: Sheet
  /** Rows or columns left out because the tab is bigger than a PAYEW sheet. */
  truncated: boolean
}

const EXCEL_EPOCH = Date.UTC(1899, 11, 30)
const utcSerial = (d: Date) => (d.getTime() - EXCEL_EPOCH) / 86400000

const hex = (argb: string | undefined) => {
  if (!argb || argb.length < 6) return undefined
  return `#${argb.slice(-6).toLowerCase()}`
}

/** Builds a sheet from cells read out of a file (1-based rows and columns). */
function assemble(
  rows: number,
  cols: number,
  read: (add: (r: number, c: number, cell: Cell) => void) => void,
  extra: {
    widths?: (number | undefined)[]
    heights?: (number | undefined)[]
    merges?: Merge[]
    freeze?: Sheet['freeze']
  },
): { sheet: Sheet; truncated: boolean } {
  const truncated = rows > MAX_ROWS - 20 || cols > MAX_COLS - 2
  const nRows = Math.min(Math.max(rows, 1) + 20, MAX_ROWS)
  const nCols = Math.min(Math.max(cols, 1) + 2, MAX_COLS)
  const sheet: Sheet = {
    version: 1,
    cols: Array.from({ length: nCols }, (_, i) => ({
      id: newId(),
      w: Math.round(extra.widths?.[i] ?? DEFAULT_COL_WIDTH),
    })),
    rows: Array.from({ length: nRows }, (_, i) => {
      const h = extra.heights?.[i]
      return h ? { id: newId(), h: Math.round(h) } : { id: newId() }
    }),
    cells: {},
    merges: (extra.merges ?? []).filter((m) => m.r + m.rs <= nRows && m.c + m.cs <= nCols),
    freeze: extra.freeze ?? { rows: 0, cols: 0 },
  }
  read((r, c, cell) => {
    const key = cellKey(sheet, r, c)
    if (key) sheet.cells[key] = cell
  })
  return { sheet, truncated }
}

const parseMerge = (ref: string): Merge | null => {
  const m = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/i.exec(ref)
  if (!m) return null
  const r = Number(m[2]) - 1
  const c = colIndex(m[1])
  return { r, c, rs: Number(m[4]) - r, cs: colIndex(m[3]) - c + 1 }
}

async function readWithExcelJS(data: ArrayBuffer): Promise<UploadedTab[]> {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(data)
  return wb.worksheets.map((ws) => {
    const rows = ws.actualRowCount ? ws.rowCount : 0
    const cols = ws.actualColumnCount ? ws.columnCount : 0
    const widths: (number | undefined)[] = []
    for (let c = 1; c <= Math.min(cols, MAX_COLS); c++) {
      const w = ws.getColumn(c).width
      widths.push(w ? w * 7 + 5 : undefined)
    }
    const heights: (number | undefined)[] = []
    const merges = ((ws.model as { merges?: string[] }).merges ?? []).flatMap(
      (m) => parseMerge(m) ?? [],
    )
    const view = ws.views?.[0] as { state?: string; xSplit?: number; ySplit?: number } | undefined
    const freeze =
      view?.state === 'frozen'
        ? { rows: view.ySplit ?? 0, cols: view.xSplit ?? 0 }
        : { rows: 0, cols: 0 }

    const built = assemble(
      rows,
      cols,
      (add) => {
        ws.eachRow({ includeEmpty: false }, (row, rn) => {
          if (rn > MAX_ROWS) return
          if (row.height) heights[rn - 1] = (row.height * 4) / 3
          row.eachCell({ includeEmpty: false }, (cell, cn) => {
            if (cn > MAX_COLS) return
            // ExcelJS repeats a merged cell's value in every cell it covers; keep the first.
            if (cell.isMerged && cell.master && cell.master.address !== cell.address) return
            const out: Cell = {}
            const value = cell.value as unknown
            const formula = (cell as unknown as { formula?: string }).formula
            if (formula) out.f = formula.replace(/^=/, '')
            else if (value instanceof Date) out.v = utcSerial(value)
            else if (value && typeof value === 'object') {
              const o = value as {
                richText?: { text: string }[]
                text?: string
                error?: string
                result?: unknown
              }
              if (o.richText) out.v = o.richText.map((t) => t.text).join('')
              else if (o.text !== undefined) out.v = String(o.text)
              else if (o.error) out.v = o.error
            } else if (value !== null && value !== undefined) {
              out.v = value as string | number | boolean
            }
            const style = readStyle(cell)
            if (value instanceof Date && !style.fmt) style.fmt = 'date'
            if (Object.keys(style).length) out.s = style
            if (out.v !== undefined || out.f !== undefined || out.s) add(rn - 1, cn - 1, out)
          })
        })
      },
      { widths, heights, merges, freeze },
    )
    return { name: ws.name, hidden: ws.state !== 'visible', ...built }
  })
}

function readStyle(cell: ExcelJSType.Cell): CellStyle {
  const s: CellStyle = {}
  const font = cell.font ?? {}
  if (font.bold) s.b = true
  if (font.italic) s.i = true
  if (font.underline) s.u = true
  if (font.strike) s.strike = true
  const color = hex(font.color?.argb)
  if (color && color !== '#000000') s.color = color
  if (font.size && font.size !== 10 && font.size !== 11) s.size = font.size
  const fill = cell.fill as
    { type?: string; pattern?: string; fgColor?: { argb?: string } } | undefined
  if (fill?.type === 'pattern' && fill.pattern === 'solid') {
    const bg = hex(fill.fgColor?.argb)
    if (bg && bg !== '#ffffff') s.bg = bg
  }
  const al = cell.alignment ?? {}
  if (al.horizontal === 'center' || al.horizontal === 'centerContinuous') s.align = 'center'
  else if (al.horizontal === 'right') s.align = 'right'
  else if (al.horizontal === 'left') s.align = 'left'
  if (al.vertical === 'middle' || al.vertical === 'top' || al.vertical === 'bottom')
    s.valign = al.vertical
  if (al.wrapText) s.wrap = true
  const fmt = formatFromExcel(cell.numFmt)
  if (fmt) s.fmt = fmt
  const b = cell.border ?? {}
  const border = {
    t: !!b.top?.style,
    r: !!b.right?.style,
    b: !!b.bottom?.style,
    l: !!b.left?.style,
  }
  if (border.t || border.r || border.b || border.l) {
    s.border = Object.fromEntries(Object.entries(border).filter(([, v]) => v))
  }
  return s
}

async function readWithSheetJS(data: ArrayBuffer): Promise<UploadedTab[]> {
  const XLSX = await import('xlsx')
  const wb = XLSX.read(data, { cellFormula: true, cellNF: true, cellDates: false })
  return wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name]
    const range = ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']) : null
    const rows = range ? range.e.r + 1 : 0
    const cols = range ? range.e.c + 1 : 0
    const widths = (ws['!cols'] ?? []).map((c) => c?.wpx ?? (c?.wch ? c.wch * 7 + 5 : undefined))
    const merges = (ws['!merges'] ?? []).map((m) => ({
      r: m.s.r,
      c: m.s.c,
      rs: m.e.r - m.s.r + 1,
      cs: m.e.c - m.s.c + 1,
    }))
    const built = assemble(
      rows,
      cols,
      (add) => {
        for (const [addr, raw] of Object.entries(ws)) {
          if (addr.startsWith('!')) continue
          const { r, c } = XLSX.utils.decode_cell(addr)
          if (r >= MAX_ROWS || c >= MAX_COLS) continue
          const cell = raw as { t: string; v?: unknown; f?: string; z?: string; w?: string }
          const out: Cell = {}
          if (cell.f) out.f = cell.f
          else if (cell.t === 'e') out.v = cell.w ?? '#N/A'
          else if (cell.v !== undefined) out.v = cell.v as string | number | boolean
          const fmt = formatFromExcel(cell.z)
          if (fmt) out.s = { fmt }
          if (out.v !== undefined || out.f !== undefined) add(r, c, out)
        }
      },
      { widths, merges },
    )
    const hidden = !!wb.Workbook?.Sheets?.find((s) => s.name === name)?.Hidden
    return { name, hidden, ...built }
  })
}

/** Reads every tab of an uploaded file. */
export async function readSpreadsheet(data: ArrayBuffer, fileName: string): Promise<UploadedTab[]> {
  const isXlsx = /\.(xlsx|xlsm)$/i.test(fileName) || fileName === ''
  if (isXlsx) {
    try {
      return await readWithExcelJS(data)
    } catch {
      // Some generators write files ExcelJS can't read; fall back to values and formulas only.
    }
  }
  return readWithSheetJS(data)
}

// ---------------------------------------------------------------------------
// Export: Department of Agriculture look (green and gold, seal, title block)
// ---------------------------------------------------------------------------
const DA_GREEN = 'FF1E6B34'
const DA_GREEN_DARK = 'FF14502A'
const DA_GREEN_SOFT = 'FFEAF4EC'
const DA_GOLD = 'FFF2B21B'
const DA_GOLD_SOFT = 'FFFFF6DC'
const INK = 'FF1F2937'
const MUTED = 'FF5F6B66'
const RULE = 'FFDCE5DE'
const TOTAL_ROW = /^\s*(grand\s+|sub-?\s*)?total\b/i
const argb = (color: string) => `FF${color.replace('#', '').toUpperCase()}`

export const DA_OFFICE = 'Regional Field Office · Cordillera Administrative Region'

export interface ExportInput {
  sheet: Sheet
  sheetName: string
  evaluator: Evaluator
  /** e.g. "FY 2026 Annual Work and Financial Plan". */
  title: string
  /** e.g. the program and the export date. */
  subtitle: string
  fileName: string
  /** The DA seal as PNG; downloadXlsx loads it. */
  logo?: ArrayBuffer | null
}

/** Last row and column with content, so empty starter rows aren't exported. */
function usedSize(sheet: Sheet) {
  let rows = 0
  let cols = 0
  sheet.rows.forEach((_, r) =>
    sheet.cols.forEach((__, c) => {
      const cell = getCell(sheet, r, c)
      if (
        cell &&
        (cell.f !== undefined ||
          (cell.v !== undefined && cell.v !== null && cell.v !== '' && cell.v !== false))
      ) {
        rows = Math.max(rows, r + 1)
        cols = Math.max(cols, c + 1)
      }
    }),
  )
  for (const m of sheet.merges) {
    if (m.r < rows) cols = Math.max(cols, m.c + m.cs)
  }
  return { rows: Math.max(rows, sheet.freeze.rows), cols }
}

export async function buildXlsx(input: ExportInput): Promise<ArrayBuffer> {
  const { sheet, sheetName, evaluator, title, subtitle, logo } = input
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'PAYEW · Department of Agriculture'
  wb.created = new Date()

  const OFFSET = 7
  const { rows, cols } = usedSize(sheet)
  const lastCol = Math.max(cols, 1)
  const headerRows = Math.max(1, sheet.freeze.rows)
  const ws = wb.addWorksheet(sheetName.slice(0, 31), {
    views: [
      {
        state: 'frozen',
        ySplit: OFFSET + headerRows,
        xSplit: sheet.freeze.cols,
        showGridLines: false,
      },
    ],
    pageSetup: {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.6, header: 0.3, footer: 0.3 },
      printTitlesRow: `${OFFSET + 1}:${OFFSET + headerRows}`,
    },
    headerFooter: {
      oddFooter: `&L&9&K5F6B66Department of Agriculture · ${title.replace(/&/g, '&&')}&R&9&K5F6B66Page &P of &N`,
    },
  })
  ws.properties.defaultRowHeight = 21

  sheet.cols.slice(0, lastCol).forEach((col, c) => {
    ws.getColumn(c + 1).width = Math.max(5, Math.round((col.w - 5) / 6.3))
  })

  // Title block: seal on the left, centered agency lines, gold rule.
  const titleLines: {
    text: string
    size: number
    bold?: boolean
    color: string
    height: number
  }[] = [
    { text: 'Republic of the Philippines', size: 11, color: MUTED, height: 17 },
    { text: 'DEPARTMENT OF AGRICULTURE', size: 18, bold: true, color: DA_GREEN_DARK, height: 26 },
    { text: DA_OFFICE, size: 12, color: INK, height: 18 },
    { text: title.toUpperCase(), size: 15, bold: true, color: DA_GREEN, height: 24 },
    { text: subtitle, size: 11, color: MUTED, height: 17 },
  ]
  titleLines.forEach((line, i) => {
    const row = ws.getRow(i + 1)
    row.height = line.height
    if (lastCol > 1) ws.mergeCells(i + 1, 1, i + 1, lastCol)
    const cell = ws.getCell(i + 1, 1)
    cell.value = line.text
    cell.font = { name: 'Calibri', size: line.size, bold: line.bold, color: { argb: line.color } }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
  })
  ws.getRow(6).height = 5
  for (let c = 1; c <= lastCol; c++) {
    ws.getCell(6, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DA_GOLD } }
  }
  ws.getRow(7).height = 8
  if (logo) {
    const image = wb.addImage({ buffer: logo, extension: 'png' })
    ws.addImage(image, {
      tl: { col: 0.15, row: 0.2 },
      ext: { width: 96, height: 96 },
      editAs: 'oneCell',
    })
  }

  const ownName = sheetName
  // Formulas move down by the title rows; formulas into other sheets are written as values.
  const exportFormula = (f: string) => {
    let other = false
    rewriteRefs(f, (ref) => {
      if (ref.sheet && ref.sheet.toLowerCase() !== ownName.toLowerCase()) other = true
      return ref
    })
    if (other) return null
    const shifted = shiftFormula(f, 'row', 0, OFFSET, ownName, true)
    return rewriteRefs(shifted, (ref) => ({ ...ref, sheet: undefined }))
  }
  const toExcel = (v: Scalar, fmt: CellStyle['fmt']): ExcelJSType.CellValue => {
    if (v === null || v === undefined) return null
    if (isError(v)) return { error: v.code } as ExcelJSType.CellErrorValue
    if (typeof v === 'number' && fmt === 'date')
      return new Date(EXCEL_EPOCH + Math.round(v * 86400000))
    return v
  }

  for (let r = 0; r < rows; r++) {
    const xr = ws.getRow(r + 1 + OFFSET)
    const h = sheet.rows[r]?.h
    if (h) xr.height = (h * 3) / 4 + 3
    const isHeader = r < headerRows
    const firstText = sheet.cols
      .slice(0, lastCol)
      .map((_, c) => evaluator.value(ownName, r, c))
      .find((v) => typeof v === 'string' && v.trim() !== '')
    const isTotal = !isHeader && typeof firstText === 'string' && TOTAL_ROW.test(firstText)

    for (let c = 0; c < lastCol; c++) {
      const cell = getCell(sheet, r, c)
      const xc = xr.getCell(c + 1)
      const s = cell?.s ?? {}
      const value = evaluator.value(ownName, r, c)
      if (cell?.f !== undefined) {
        const f = exportFormula(cell.f)
        const result = toExcel(value, s.fmt)
        xc.value = f
          ? ({
              formula: f,
              result: result instanceof Date || typeof result !== 'object' ? result : undefined,
            } as ExcelJSType.CellFormulaValue)
          : result
      } else if (typeof cell?.v === 'boolean') {
        // Checkboxes print as a tick, or nothing.
        xc.value = cell.v ? '✓' : null
      } else {
        xc.value = toExcel(cell?.v ?? null, s.fmt)
      }

      // Headers use the DA colors; elsewhere the sheet's own colors win.
      xc.font = {
        name: 'Calibri',
        // A little larger than the screen, so printed pages stay readable.
        size: s.size ? s.size + 1 : isHeader ? 11 : 11.5,
        bold: s.b || isHeader || isTotal || undefined,
        italic: s.i || undefined,
        underline: s.u || undefined,
        strike: s.strike || undefined,
        color: { argb: isHeader ? 'FFFFFFFF' : s.color ? argb(s.color) : INK },
      }
      const bg = isHeader ? DA_GREEN : isTotal ? DA_GOLD_SOFT : s.bg ? argb(s.bg) : undefined
      if (bg) xc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
      const numeric = typeof value === 'number'
      xc.alignment = {
        horizontal:
          typeof cell?.v === 'boolean'
            ? 'center'
            : (s.align ?? (isHeader ? 'center' : numeric ? 'right' : 'left')),
        vertical: isHeader ? 'middle' : (s.valign ?? 'top'),
        wrapText: s.wrap || isHeader || undefined,
      }
      const fmt = s.fmt ?? (numeric && !Number.isInteger(value) ? 'number' : undefined)
      const code = fmt ? EXCEL_FORMAT[fmt] : undefined
      if (code) xc.numFmt = code

      const thin = { style: 'thin' as const, color: { argb: DA_GREEN } }
      const border: Partial<ExcelJSType.Borders> = isHeader
        ? {
            left: { style: 'thin', color: { argb: DA_GREEN_DARK } },
            right: { style: 'thin', color: { argb: DA_GREEN_DARK } },
            bottom:
              r === headerRows - 1
                ? { style: 'medium', color: { argb: DA_GOLD } }
                : { style: 'thin', color: { argb: DA_GREEN_DARK } },
          }
        : { bottom: { style: 'hair', color: { argb: RULE } } }
      if (isTotal) {
        border.top = { style: 'thin', color: { argb: DA_GREEN } }
        border.bottom = { style: 'thin', color: { argb: DA_GREEN } }
      }
      if (!isHeader) {
        if (s.border?.t) border.top = thin
        if (s.border?.b) border.bottom = thin
        if (s.border?.l) border.left = thin
        if (s.border?.r) border.right = thin
      }
      xc.border = border
    }
  }

  // Soft green bands on every other data row make long sheets easier to follow.
  for (let r = headerRows; r < rows; r++) {
    if ((r - headerRows) % 2 === 0) continue
    for (let c = 0; c < lastCol; c++) {
      const xc = ws.getCell(r + 1 + OFFSET, c + 1)
      if (!xc.fill || (xc.fill as { fgColor?: unknown }).fgColor === undefined) {
        xc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DA_GREEN_SOFT } }
      }
    }
  }

  for (const m of sheet.merges) {
    if (m.r >= rows || m.c >= lastCol) continue
    ws.mergeCells(m.r + 1 + OFFSET, m.c + 1, m.r + m.rs + OFFSET, Math.min(m.c + m.cs, lastCol))
  }
  return wb.xlsx.writeBuffer() as Promise<ArrayBuffer>
}

let logoCache: Promise<ArrayBuffer | null> | null = null
/** The DA seal served with the app; null if it can't be loaded. */
export function loadLogo() {
  logoCache ??= fetch('/brand/da-car-logo.png')
    .then((r) => (r.ok ? r.arrayBuffer() : null))
    .catch(() => null)
  return logoCache
}

export async function downloadXlsx(input: ExportInput) {
  const buffer = await buildXlsx({ ...input, logo: input.logo ?? (await loadLogo()) })
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = input.fileName
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
