// Consistent numbering for a WFP: "Phase 1:", "1.1.", "1.1.1.", "a.", "b."…
// Existing numbers say how deep a row sits; this rewrites them in sequence.
import type { Scalar } from './formula'
import { getCell, setCells, type CellUpdate, type Evaluator, type Sheet } from './model'
import { headerRowCount, resolveRoles } from './wfp'

const text = (v: Scalar) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '')
const PHASE = /^phase\s+([ivxlc]+|\d+)\s*[:.\-–]?\s*(.*)$/i
const NUMBERED = /^(\d+(?:\.\d+)*)\.\s*(.*)$/
const LETTERED = /^([a-z])[.)]\s+(.*)$/i
const letter = (n: number) => String.fromCharCode(97 + ((n - 1) % 26))

/** Splits "2.1.4. Field school" into its depth (3) and bare title. */
function parse(s: string): { depth: number; lettered: boolean; title: string } {
  // "3 grass cutter" is a quantity, not a number: a real prefix has a dot.
  const n = NUMBERED.exec(s)
  if (n) return { depth: n[1].split('.').length, lettered: false, title: n[2].trim() }
  const l = LETTERED.exec(s)
  if (l) return { depth: 0, lettered: true, title: l[2].trim() }
  return { depth: 0, lettered: false, title: s }
}

/** Renumbers phases, activities, sub-activities and lettered items in order. */
export function renumberWfp(sheet: Sheet, name: string, ev: Evaluator): Sheet {
  const roles = resolveRoles(sheet)
  if (roles.phase === undefined || roles.pap === undefined) return sheet
  const updates: CellUpdate[] = []
  const put = (r: number, c: number, next: string, old: string) => {
    const cell = getCell(sheet, r, c)
    if (next !== old && cell?.f === undefined) updates.push({ r, c, cell: { v: next } })
  }
  let phases = 0
  let phaseNo: number | null = null
  // counters[d] is the last number used at depth d (depth 1 is the phase itself).
  let counters: number[] = []
  let letters = 0
  let activityDepth = 2

  const number = (depth: number) => {
    counters[depth] = (counters[depth] ?? 0) + 1
    counters = counters.slice(0, depth + 1)
    letters = 0
    const parts = [phaseNo, ...Array.from({ length: depth - 1 }, (_, i) => counters[i + 2] ?? 1)]
    return `${parts.join('.')}. `
  }

  for (let r = headerRowCount(sheet); r < sheet.rows.length; r++) {
    const phase = text(ev.value(name, r, roles.phase))
    if (phase) {
      const m = PHASE.exec(phase)
      if (m) {
        phases++
        phaseNo = phases
        put(r, roles.phase, `Phase ${phases}${m[2] ? `: ${m[2]}` : ''}`, phase)
      } else phaseNo = null
      counters = []
      letters = 0
      activityDepth = 2
      continue
    }
    for (const [c, isSub] of [
      [roles.pap, false],
      [roles.sub, true],
    ] as const) {
      if (c === undefined) continue
      const raw = text(ev.value(name, r, c))
      if (!raw) continue
      const p = parse(raw)
      if (p.lettered) {
        letters++
        put(r, c, `${letter(letters)}. ${p.title}`, raw)
      } else if (phaseNo === null) {
        // Under an unnumbered heading such as PMO, rows stay unnumbered.
      } else if (p.depth >= 2) {
        if (!isSub) activityDepth = p.depth
        put(r, c, number(isSub ? Math.max(p.depth, activityDepth + 1) : p.depth) + p.title, raw)
      } else if (!isSub && p.depth === 0) {
        // A new row typed without a number joins the level of the rows around it.
        put(r, c, number(activityDepth) + p.title, raw)
      }
    }
  }
  return setCells(sheet, updates)
}
