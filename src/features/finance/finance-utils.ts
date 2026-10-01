import { toast } from 'sonner'
import type { Thresholds } from '@/features/settings/api'

/** Shows each server warning after a save that went through in "warn" mode. */
export function toastWarnings(warnings: string[] | undefined) {
  for (const w of warnings ?? []) toast.warning(w, { duration: 8000 })
}

export type RateState = 'good' | 'warning' | 'critical' | 'none'

/** RAG state of a rate against Settings → dashboard thresholds. */
export function rateState(pct: number | null | undefined, t: Thresholds | undefined): RateState {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return 'none'
  const th = t ?? { green: 80, amber: 50 }
  return pct >= th.green ? 'good' : pct >= th.amber ? 'warning' : 'critical'
}

export const pct = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : null)
