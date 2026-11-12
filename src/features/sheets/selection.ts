import { expandToMerges, normRange, type Sheet } from './model'

export interface Selection {
  anchor: { r: number; c: number }
  focus: { r: number; c: number }
}

/** The selected range, grown so it never cuts through merged cells. */
export const selectionRange = (sheet: Sheet, sel: Selection) =>
  expandToMerges(sheet, normRange(sel.anchor, sel.focus))
