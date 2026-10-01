import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import {
  CalendarDaysIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ListIcon,
  Loader2Icon,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ErrorState } from '@/components/common/ErrorState'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useWorkspace } from '@/features/workspace/workspace-context'
import { formatDate, todayManila } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { CalendarEvent } from '@/types/database'
import { useCalendarEvents } from './api'
import {
  CATEGORY_SLOTS,
  categorySlot,
  eventHref,
  GROUPS,
  KIND_META,
  OTHER_SLOT,
  OverdueIcon,
  type EventGroup,
} from './events'

const STORE = 'payew.calendar'
const ymd = (d: Date) => format(d, 'yyyy-MM-dd')

interface Prefs {
  groups: EventGroup[]
  view: 'month' | 'agenda'
}

function loadPrefs(): Prefs {
  const fallback: Prefs = {
    groups: GROUPS.map((g) => g.key),
    view: typeof window !== 'undefined' && window.innerWidth < 768 ? 'agenda' : 'month',
  }
  try {
    const raw = localStorage.getItem(STORE)
    return raw ? { ...fallback, ...(JSON.parse(raw) as Partial<Prefs>) } : fallback
  } catch {
    return fallback
  }
}

function savePrefs(p: Prefs) {
  try {
    localStorage.setItem(STORE, JSON.stringify(p))
  } catch {
    // private mode: the preference just isn't remembered
  }
}

/** /calendar — activity, stage, package, delivery, payment, directive and issue dates. */
export default function CalendarPage() {
  const { selectedProgramIds } = useWorkspace()
  const today = todayManila()
  const [month, setMonth] = useState(() => startOfMonth(parseISO(today)))
  const [prefs, setPrefsState] = useState(loadPrefs)
  const [openDay, setOpenDay] = useState<string | null>(null)
  const setPrefs = (p: Prefs) => {
    setPrefsState(p)
    savePrefs(p)
  }

  const gridStart = startOfWeek(month)
  const gridEnd = endOfWeek(endOfMonth(month))
  const { data, isFetching, isError, refetch } = useCalendarEvents(
    ymd(gridStart),
    ymd(gridEnd),
    selectedProgramIds,
  )
  const events = useMemo(
    () =>
      (data ?? [])
        .filter((e) => prefs.groups.includes(KIND_META[e.kind].group))
        .sort(
          (a, b) =>
            Number(b.kind === 'activity') - Number(a.kind === 'activity') ||
            a.start_date.localeCompare(b.start_date) ||
            a.title.localeCompare(b.title),
        ),
    [data, prefs.groups],
  )
  const onDay = (day: string) => events.filter((e) => e.start_date <= day && e.end_date >= day)
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd })
  const showPackages = prefs.groups.includes('packages')

  const toggle = (g: EventGroup) =>
    setPrefs({
      ...prefs,
      groups: prefs.groups.includes(g) ? prefs.groups.filter((x) => x !== g) : [...prefs.groups, g],
    })

  return (
    <div className="space-y-4">
      <PageHeader
        title="Calendar"
        description="Implementation dates, due dates, package solicitations, awards, deliveries, payments and deadlines."
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            aria-label="Previous month"
            onClick={() => setMonth(addMonths(month, -1))}
          >
            <ChevronLeftIcon />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Next month"
            onClick={() => setMonth(addMonths(month, 1))}
          >
            <ChevronRightIcon />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setMonth(startOfMonth(parseISO(today)))}
          >
            Today
          </Button>
        </div>
        <h2 className="flex items-center gap-2 text-lg font-semibold" aria-live="polite">
          {format(month, 'MMMM yyyy')}
          {isFetching && <Loader2Icon className="text-muted-foreground size-4 animate-spin" />}
        </h2>
        <div className="ml-auto flex rounded-md border p-0.5" role="group" aria-label="View">
          {(['month', 'agenda'] as const).map((v) => (
            <Button
              key={v}
              size="sm"
              variant={prefs.view === v ? 'secondary' : 'ghost'}
              aria-pressed={prefs.view === v}
              onClick={() => setPrefs({ ...prefs, view: v })}
            >
              {v === 'month' ? <CalendarDaysIcon /> : <ListIcon />}
              {v === 'month' ? 'Month' : 'Agenda'}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        {GROUPS.map((g) => (
          <label key={g.key} className="flex cursor-pointer items-center gap-2">
            <Checkbox
              checked={prefs.groups.includes(g.key)}
              onCheckedChange={() => toggle(g.key)}
            />
            {g.label}
          </label>
        ))}
      </div>

      {showPackages && (
        <ul
          className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 text-xs"
          aria-label="Package categories"
        >
          {[...CATEGORY_SLOTS, OTHER_SLOT].map((c) => (
            <li key={c.code} className="flex items-center gap-1.5">
              <span className={cn('inline-block h-3 w-1 rounded-sm', c.swatch)} />
              {c.label}
            </li>
          ))}
        </ul>
      )}

      {isError ? (
        <Card>
          <ErrorState onRetry={() => void refetch()} />
        </Card>
      ) : prefs.view === 'month' ? (
        <Card className="overflow-hidden py-0">
          <div className="text-muted-foreground grid grid-cols-7 border-b text-center text-xs font-medium">
            {days.slice(0, 7).map((d) => (
              <div key={d.toISOString()} className="py-2">
                {format(d, 'EEE')}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map((d) => {
              const day = ymd(d)
              const list = onDay(day).filter(
                // Implementation periods show on their first and last day only.
                (e) => e.start_date === day || e.end_date === day,
              )
              const visible = list.slice(0, 3)
              const more = list.length - visible.length
              return (
                <div
                  key={day}
                  className={cn(
                    'min-h-28 border-r border-b p-1 [&:nth-child(7n)]:border-r-0',
                    !isSameMonth(d, month) && 'bg-muted/40',
                  )}
                >
                  <div className="mb-1 flex justify-end">
                    <span
                      className={cn(
                        'flex size-6 items-center justify-center rounded-full text-xs tabular-nums',
                        day === today && 'bg-primary text-primary-foreground font-semibold',
                        !isSameMonth(d, month) && day !== today && 'text-muted-foreground',
                      )}
                    >
                      {format(d, 'd')}
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    {visible.map((e) => (
                      <EventChip key={`${e.kind}-${e.ref_id}`} e={e} day={day} compact />
                    ))}
                    {more > 0 && (
                      <button
                        type="button"
                        onClick={() => setOpenDay(day)}
                        className="text-muted-foreground hover:text-foreground w-full rounded px-1 text-left text-[11px] hover:underline"
                      >
                        +{more} more
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      ) : (
        <Agenda month={month} events={events} today={today} />
      )}

      {openDay && (
        <Dialog open onOpenChange={(o) => !o && setOpenDay(null)}>
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{formatDate(openDay)}</DialogTitle>
              <DialogDescription>{onDay(openDay).length} events</DialogDescription>
            </DialogHeader>
            <div className="space-y-1">
              {onDay(openDay).map((e) => (
                <EventChip key={`${e.kind}-${e.ref_id}`} e={e} />
              ))}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

function Agenda({ month, events, today }: { month: Date; events: CalendarEvent[]; today: string }) {
  const first = ymd(startOfMonth(month))
  const last = ymd(endOfMonth(month))
  const byDay = new Map<string, CalendarEvent[]>()
  for (const e of events) {
    // Spans are listed once, on the first day that falls in this month.
    const day = e.start_date < first ? first : e.start_date
    if (day > last || e.end_date < first) continue
    byDay.set(day, [...(byDay.get(day) ?? []), e])
  }
  const days = [...byDay.keys()].sort()

  if (!days.length)
    return (
      <Card>
        <CardContent className="text-muted-foreground py-10 text-center text-sm">
          Nothing scheduled this month.
        </CardContent>
      </Card>
    )

  return (
    <div className="space-y-4">
      {days.map((day) => (
        <section key={day} className="space-y-1.5">
          <h3 className={cn('text-sm font-semibold', day === today && 'text-primary')}>
            {format(parseISO(day), 'EEE, MMM d')}
            {day === today && ' · Today'}
          </h3>
          <Card className="gap-1 py-2">
            <CardContent className="space-y-1 px-2">
              {byDay.get(day)!.map((e) => (
                <EventChip key={`${e.kind}-${e.ref_id}`} e={e} />
              ))}
            </CardContent>
          </Card>
        </section>
      ))}
    </div>
  )
}

function EventChip({ e, day, compact }: { e: CalendarEvent; day?: string; compact?: boolean }) {
  const meta = KIND_META[e.kind]
  const isPackage = meta.group === 'packages'
  const slot = isPackage ? categorySlot(e.category_code) : null
  const span = e.end_date > e.start_date
  const label = `${meta.label}: ${e.title}${e.detail ? ` (${e.detail})` : ''}${
    span ? `, ${formatDate(e.start_date)} – ${formatDate(e.end_date)}` : ''
  }${e.is_overdue ? ', overdue' : ''}${isPackage ? `, ${slot!.label}` : ''}`

  return (
    <Link
      to={eventHref(e)}
      title={label}
      aria-label={label}
      className={cn(
        'bg-muted/70 hover:bg-muted flex items-center gap-1.5 rounded-r-sm border-l-[3px] px-1.5',
        compact ? 'py-0.5 text-[11px]' : 'py-1.5 text-sm',
        slot ? slot.border : 'border-l-transparent',
        e.is_done && 'opacity-60',
      )}
    >
      {e.is_overdue ? (
        <OverdueIcon className="text-destructive size-3 shrink-0" />
      ) : (
        <meta.icon className="text-muted-foreground size-3 shrink-0" />
      )}
      <span className={cn('min-w-0 flex-1 truncate', e.is_done && 'line-through')}>
        {compact ? (
          e.kind === 'stage_due' && e.detail ? (
            `${e.detail}: ${e.title}`
          ) : (
            e.title
          )
        ) : (
          <>
            <span className="font-medium">{e.title}</span>
            <span className="text-muted-foreground">
              {' '}
              · {meta.label}
              {e.detail ? ` · ${e.detail}` : ''}
              {span ? ` · until ${formatDate(e.end_date)}` : ''}
            </span>
          </>
        )}
      </span>
      {compact && span && day && (
        <span className="text-muted-foreground shrink-0">
          {day === e.start_date ? 'starts' : 'ends'}
        </span>
      )}
    </Link>
  )
}
