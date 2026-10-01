const monthFmt = new Intl.DateTimeFormat('en-PH', { month: 'short', timeZone: 'UTC' })

/** "2026-03" → "Mar" */
export const monthLabel = (ym: string) => monthFmt.format(new Date(`${ym}-01T00:00:00Z`))
