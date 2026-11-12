import {
  CalendarRangeIcon,
  LayoutDashboardIcon,
  ListChecksIcon,
  RotateCcwIcon,
  SaveIcon,
  Trash2Icon,
} from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { BarList } from '@/components/charts/BarList'
import { BulletBars } from '@/components/charts/BulletBars'
import { FlowChart } from '@/components/charts/FlowChart'
import { EmptyState } from '@/components/common/EmptyState'
import { ErrorState } from '@/components/common/ErrorState'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'
import { useActivities } from '@/features/activities/api'
import {
  MONTH_LABELS,
  QUARTER_LABELS,
  quarters,
  twelve,
  useActivityPhysical,
} from '@/features/activities/physical'
import { useAuth } from '@/features/auth/auth-context'
import { canManageProgram } from '@/features/auth/permissions'
import { useYearBudgets } from '@/features/finance/budget-api'
import { useAppSettings } from '@/features/settings/api'
import { useCardMutations, useDashboardCards, useFinanceSheets } from '@/features/sheets/api'
import { idsToRange } from '@/features/sheets/cards'
import type { Scalar } from '@/features/sheets/formula'
import {
  aggregate,
  createEvaluator,
  rangeName,
  SHEET_NAME,
  type Evaluator,
  type Sheet,
  type SheetKind,
} from '@/features/sheets/model'
import { wfpTotals, type WfpTotals } from '@/features/sheets/wfp'
import { useWorkspace } from '@/features/workspace/workspace-context'
import { formatDate, formatPeso, formatPesoCompact } from '@/lib/format'
import { errorMessage } from '@/lib/supabase'
import type { CardRange, DashboardCardRow } from '@/types/database'
import { useDashboardSummary } from './api'
import { AttentionPanel } from './components/AttentionPanel'
import { ComplianceScorecard } from './components/ComplianceScorecard'
import { DashboardGrid } from './components/DashboardGrid'
import { OverduePanel } from './components/OverduePanel'
import { BudgetCard, SheetCard, type BudgetLine } from './components/SheetCards'
import { Panel } from './components/Panel'
import { DeliveriesPanel, FunnelPanel, StatusPanel } from './components/Widgets'
import {
  cardIdOf,
  normalizeLayout,
  toggleWidget,
  widgetCatalog,
  type LayoutItem,
  type WidgetId,
} from './layout'
import { useLayoutMutations, useUserLayout } from './layout-api'

/**
 * Dashboard for the workspace fiscal year and programs. Finance figures come from
 * cards that people make from cells in the finance sheets; the rest comes from
 * dashboard_summary().
 */
export default function DashboardPage() {
  const { profile } = useAuth()
  const { fiscalYear, programFilter, programs, selectedProgramIds } = useWorkspace()
  const { data: settings } = useAppSettings()
  const fyId = fiscalYear?.id ?? null
  const summary = useDashboardSummary(fyId, selectedProgramIds)
  const { data: yearBudgets } = useYearBudgets({
    programIds: selectedProgramIds,
    fiscalYearId: fyId,
  })
  const { data: cards = [] } = useDashboardCards(selectedProgramIds, fyId)
  const { data: sheets = [] } = useFinanceSheets(selectedProgramIds, fyId)
  const { data: physical } = useActivityPhysical(selectedProgramIds, fyId)
  const { data: activityRows = [] } = useActivities({
    programIds: selectedProgramIds,
    fiscalYearId: fyId,
  })
  const activityTitle = useMemo(
    () => new Map(activityRows.map((a) => [a.id, a.title])),
    [activityRows],
  )

  // Physical progress, statuses and phases, from the activities that come from the WFP.
  const fromActivities = useMemo(() => {
    const rows = [...(physical?.values() ?? [])].filter((p) => !p.wfp_removed_at)
    const targets = Array(12).fill(0) as number[]
    const done = Array(12).fill(0) as number[]
    const statuses = new Map<string, number>()
    const phases = new Map<string, { budget: number; obligated: number; disbursed: number }>()
    const ranked: { id: string; budget: number; obligated: number; disbursed: number }[] = []
    for (const p of rows) {
      twelve(p.monthly_targets).forEach((v, i) => (targets[i] += v))
      twelve(p.monthly_done).forEach((v, i) => (done[i] += v))
      if (!p.wfp_row_id) continue
      const status = p.wfp_status ?? 'Not set'
      statuses.set(status, (statuses.get(status) ?? 0) + 1)
      const phase = p.wfp_phase ?? 'No phase'
      const sum = phases.get(phase) ?? { budget: 0, obligated: 0, disbursed: 0 }
      sum.budget += Number(p.wfp_budget ?? 0)
      sum.obligated += Number(p.wfp_obligated ?? 0)
      sum.disbursed += Number(p.wfp_disbursed ?? 0)
      ranked.push({
        id: p.activity_id,
        budget: Number(p.wfp_budget ?? 0),
        obligated: Number(p.wfp_obligated ?? 0),
        disbursed: Number(p.wfp_disbursed ?? 0),
      })
      phases.set(phase, sum)
    }
    const cumulative = (xs: number[]) => {
      let run = 0
      return xs.map((v) => (run += v))
    }
    return {
      targets: cumulative(targets),
      done: cumulative(done),
      quarterTargets: quarters(targets),
      quarterDone: quarters(done),
      statuses,
      phases,
      ranked: ranked.sort((a, b) => b.budget - a.budget).slice(0, 10),
    }
  }, [physical])
  const cardMutations = useCardMutations()
  const scope = programs.filter((p) => selectedProgramIds.includes(p.id))
  const firstName = profile?.full_name.split(' ')[0]

  const { data: userLayout } = useUserLayout()
  const mutations = useLayoutMutations()
  const [draft, setDraft] = useState<LayoutItem[] | null>(null)
  const defaultLayout = (settings as { dashboard_default_layout?: unknown } | undefined)
    ?.dashboard_default_layout
  const ownCards = useMemo(() => cards.filter((c) => c.placement === 'card'), [cards])
  const catalog = useMemo(() => widgetCatalog(ownCards), [ownCards])
  const layout = useMemo(
    () => normalizeLayout(userLayout ?? defaultLayout, catalog),
    [userLayout, defaultLayout, catalog],
  )

  // One evaluator per program, so formulas can read that program's other sheets.
  const values = useMemo(() => {
    const byProgram = new Map<string, Map<string, Sheet>>()
    const sheetById = new Map<string, { name: string; sheet: Sheet; programId: string }>()
    for (const s of sheets) {
      const name = SHEET_NAME[s.meta.kind as SheetKind]
      const map = byProgram.get(s.meta.program_id) ?? new Map<string, Sheet>()
      map.set(name, s.data)
      byProgram.set(s.meta.program_id, map)
      sheetById.set(s.meta.id, { name, sheet: s.data, programId: s.meta.program_id })
    }
    const evaluators = new Map<string, Evaluator>()
    const evaluatorFor = (programId: string) => {
      let ev = evaluators.get(programId)
      if (!ev) {
        ev = createEvaluator({ sheets: byProgram.get(programId) ?? new Map() })
        evaluators.set(programId, ev)
      }
      return ev
    }
    const compute = (card: DashboardCardRow, ids: CardRange, agg: DashboardCardRow['agg']) => {
      const source = sheetById.get(card.sheet_id)
      if (!source) return { value: undefined, where: '' }
      const range = idsToRange(source.sheet, ids)
      if (!range) return { value: undefined, where: source.name, missing: true }
      return {
        value: aggregate(evaluatorFor(source.programId), source.name, range, agg),
        where: `${source.name} ${rangeName(range)}`,
      }
    }
    // WFP totals across the selected programs.
    let wfp: WfpTotals | null = null
    let wfpSheets = 0
    for (const s of sheets) {
      if (s.meta.kind !== 'WFP') continue
      const t = wfpTotals(s.data, 'WFP', evaluatorFor(s.meta.program_id))
      if (!t) continue
      wfpSheets++
      wfp = wfp
        ? {
            budget: wfp.budget + t.budget,
            forObligation: wfp.forObligation + t.forObligation,
            obligated: wfp.obligated + t.obligated,
            forDisbursement: wfp.forDisbursement + t.forDisbursement,
            disbursed: wfp.disbursed + t.disbursed,
          }
        : t
    }
    return { compute, wfp, wfpSheets }
  }, [sheets])

  const title = `Magandang araw, ${firstName}!`
  const description = `${fiscalYear?.label ?? 'No fiscal year'} · ${
    programFilter === 'all' ? 'All programs' : scope.map((p) => p.code).join(', ')
  }${summary.data ? ` · as of ${formatDate(summary.data.as_of)}` : ''}`
  const header = <PageHeader title={title} description={description} />

  if (!fiscalYear || !selectedProgramIds.length) {
    return (
      <div className="space-y-6">
        {header}
        <EmptyState
          icon={CalendarRangeIcon}
          title="Nothing to show yet"
          description="Pick a fiscal year and at least one program in the top bar."
        />
      </div>
    )
  }

  if (summary.isError) {
    return (
      <div className="space-y-6">
        {header}
        <ErrorState onRetry={() => void summary.refetch()} />
      </div>
    )
  }

  const d = summary.data
  if (!d) {
    return (
      <div className="space-y-6">
        {header}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-72 lg:col-span-2" />
          <Skeleton className="h-72" />
        </div>
      </div>
    )
  }

  const programCode = (id: string) => programs.find((p) => p.id === id)?.code ?? ''
  const several = selectedProgramIds.length > 1

  // Lines under the budget card; the same label across programs adds up.
  const budgetLines: BudgetLine[] = []
  for (const card of cards.filter((c) => c.placement === 'budget_line')) {
    const { value } = values.compute(card, card.range, card.agg)
    const line = budgetLines.find((l) => l.label === card.title)
    if (line && typeof line.value === 'number' && typeof value === 'number') line.value += value
    else if (!line)
      budgetLines.push({ label: card.title, value: value ?? null, format: card.number_format })
  }
  const yearBudget = yearBudgets?.size ? [...yearBudgets.values()].reduce((a, b) => a + b, 0) : null

  const renderWidget = (id: WidgetId): ReactNode => {
    const cardId = cardIdOf(id)
    if (cardId) {
      const card = ownCards.find((c) => c.id === cardId)
      if (!card) return null
      const main = values.compute(card, card.range, card.agg)
      const sub =
        card.sub_range && card.sub_label
          ? {
              label: card.sub_label,
              value: values.compute(card, card.sub_range, card.sub_agg ?? 'sum').value as
                Scalar | undefined,
              format: card.number_format,
            }
          : null
      return (
        <SheetCard
          title={card.title}
          details={card.details}
          value={main.value}
          format={card.number_format}
          sub={sub}
          missing={!!main.missing}
          source={`${several ? `${programCode(card.program_id)} · ` : ''}${main.where}`}
        />
      )
    }
    if (id === 'physical_progress') {
      return (
        <Panel
          title="Physical targets vs accomplishments"
          description="Cumulative by month, from Activities (Physical)."
        >
          <FlowChart
            title="Cumulative physical targets and accomplishments by month"
            labels={MONTH_LABELS}
            series={[
              {
                label: 'Target',
                stroke: 'stroke-viz-1',
                fill: 'fill-viz-1',
                swatch: 'bg-viz-1',
                values: fromActivities.targets,
              },
              {
                label: 'Accomplished',
                stroke: 'stroke-viz-2',
                fill: 'fill-viz-2',
                swatch: 'bg-viz-2',
                values: fromActivities.done,
              },
            ]}
            format={(v) => v.toLocaleString('en-PH', { maximumFractionDigits: 1 })}
          />
        </Panel>
      )
    }
    if (id === 'activity_status') {
      const total = [...fromActivities.statuses.values()].reduce((a, b) => a + b, 0)
      return (
        <Panel
          title="Activities by status"
          description="The Status column of the WFP; also set in each activity’s workflow."
        >
          <BarList
            rows={[...fromActivities.statuses]
              .sort((a, b) => b[1] - a[1])
              .map(([label, value]) => ({
                key: label,
                label,
                value,
                valueLabel: `${value} · ${total ? Math.round((value / total) * 100) : 0}%`,
              }))}
            emptyText="No activities from the WFP yet."
          />
        </Panel>
      )
    }
    if (id === 'phase_budget') {
      return (
        <Panel
          title="Budget, obligated and disbursed by phase"
          description="From the WFP. The thinner the bar, the further along the money is."
        >
          <BulletBars
            series={['Budget', 'Obligated', 'Disbursed']}
            rows={[...fromActivities.phases].map(([label, v]) => ({
              key: label,
              label,
              values: [v.budget, v.obligated, v.disbursed],
              note: `${formatPesoCompact(v.budget)} · ${v.budget > 0 ? Math.round((v.obligated / v.budget) * 100) : 0}% obligated`,
            }))}
            format={formatPeso}
            emptyText="No activities from the WFP yet."
          />
        </Panel>
      )
    }
    if (id === 'quarter_targets') {
      return (
        <Panel
          title="Physical targets by quarter"
          description="Monthly targets added up per quarter, with what is accomplished so far."
        >
          <BulletBars
            series={['Target', 'Accomplished']}
            rows={QUARTER_LABELS.map((label, q) => ({
              key: label,
              label,
              values: [fromActivities.quarterTargets[q], fromActivities.quarterDone[q]],
              note: `${fromActivities.quarterDone[q]} of ${fromActivities.quarterTargets[q]}`,
            }))}
            format={(v) => v.toLocaleString('en-PH')}
            emptyText="No monthly targets yet. They come with the WFP upload or are typed in each activity."
          />
        </Panel>
      )
    }
    if (id === 'top_activities') {
      return (
        <Panel
          title="Largest activities: budget use"
          description="The ten activities with the biggest budgets. Click one to open it."
        >
          <BulletBars
            series={['Budget', 'Obligated', 'Disbursed']}
            rows={fromActivities.ranked.map((r) => ({
              key: r.id,
              label: activityTitle.get(r.id) ?? 'Activity',
              href: `/activities/${r.id}`,
              values: [r.budget, r.obligated, r.disbursed],
              note: `${formatPesoCompact(r.budget)} · ${r.budget > 0 ? Math.round((r.obligated / r.budget) * 100) : 0}% obligated`,
            }))}
            format={formatPeso}
            emptyText="No activities from the WFP yet."
          />
        </Panel>
      )
    }
    if (id.startsWith('wfp_')) {
      const t = values.wfp
      const rate = (part: number, whole: number) => (whole > 0 ? part / whole : null)
      const source = t
        ? `WFP sheet${values.wfpSheets > 1 ? `s of ${values.wfpSheets} programs` : ''} · updates when it is saved`
        : 'Shows once a WFP is saved in Finance'
      const card = {
        wfp_budget: {
          value: t?.budget,
          sub:
            yearBudget === null || !t
              ? null
              : { label: 'Share of the total budget', value: rate(t.budget, yearBudget) },
        },
        wfp_obligated: {
          meter: true,
          value: t?.obligated,
          sub: t ? { label: 'Share of the WFP budget', value: rate(t.obligated, t.budget) } : null,
        },
        wfp_disbursed: {
          meter: true,
          value: t?.disbursed,
          sub: t ? { label: 'Share of obligations', value: rate(t.disbursed, t.obligated) } : null,
        },
        wfp_balance: {
          value: t ? t.budget - t.obligated : undefined,
          sub: t
            ? { label: 'Share of the WFP budget', value: rate(t.budget - t.obligated, t.budget) }
            : null,
        },
      }[id] as
        | {
            value: number | undefined
            sub: { label: string; value: number | null; peso?: boolean } | null
            meter?: boolean
          }
        | undefined
      if (!card) return null
      return (
        <SheetCard
          title={titleOf(id)}
          details={null}
          value={card.value}
          format="peso"
          sub={
            card.sub && {
              label: card.sub.label,
              value: card.sub.value,
              format: card.sub.peso ? 'peso' : 'percent',
            }
          }
          missing={false}
          meter={
            card.meter && card.sub && typeof card.sub.value === 'number'
              ? { pct: card.sub.value * 100, label: card.sub.label }
              : undefined
          }
          source={source}
        />
      )
    }
    switch (id) {
      case 'kpi_budget':
        return <BudgetCard total={yearBudget} lines={budgetLines} />
      case 'attention':
        return <AttentionPanel attention={d.attention} />
      case 'status':
        return <StatusPanel data={d} />
      case 'overdue':
        return (
          <OverduePanel
            activities={d.overdue_activities}
            packages={d.overdue_packages}
            activityTotal={d.activities.delayed}
            packageTotal={d.packages.delayed}
          />
        )
      case 'deliveries':
        return <DeliveriesPanel rows={d.pending_deliveries} />
      case 'funnel':
        return <FunnelPanel rows={d.funnel} />
      case 'compliance':
        return (
          <ComplianceScorecard
            rows={d.compliance}
            progressDays={settings?.approvals?.progress_update_days ?? 30}
          />
        )
    }
    return null
  }

  const finish = (work: Promise<unknown>, message: string) =>
    work
      .then(() => {
        toast.success(message)
        setDraft(null)
      })
      .catch((e) => toast.error(errorMessage(e)))

  const programIds = programs.map((p) => p.id)
  const canRemove = (card: DashboardCardRow) =>
    card.created_by === profile?.id || canManageProgram(profile, programIds, card.program_id)
  const removeCard = (card: DashboardCardRow) => {
    if (!window.confirm(`Remove “${card.title}” from the dashboard for everyone?`)) return
    cardMutations.remove
      .mutateAsync(card.id)
      .then(() => toast.success('Card removed'))
      .catch((e) => toast.error(errorMessage(e)))
  }
  const titleOf = (id: WidgetId) => catalog.find((w) => w.id === id)?.title ?? id

  const toolbar = draft ? (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm">
            <ListChecksIcon /> Cards
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="max-h-96 w-80 space-y-2 overflow-y-auto">
          {draft.map((item) => (
            <div key={item.id} className="flex items-center gap-2 text-sm">
              <label className="flex min-w-0 flex-1 items-center gap-2">
                <Checkbox
                  checked={!item.hidden}
                  onCheckedChange={(v) => setDraft(toggleWidget(draft, item.id, v === true))}
                />
                <span className="truncate">{titleOf(item.id)}</span>
              </label>
              {(() => {
                const card = ownCards.find((c) => c.id === cardIdOf(item.id))
                return (
                  card &&
                  canRemove(card) && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      aria-label={`Remove ${card.title} for everyone`}
                      onClick={() => removeCard(card)}
                    >
                      <Trash2Icon className="size-3.5" />
                    </Button>
                  )
                )
              })()}
            </div>
          ))}
          {cards
            .filter((c) => c.placement === 'budget_line')
            .map((card) => (
              <div key={card.id} className="text-muted-foreground flex items-center gap-2 text-sm">
                <span className="flex-1 truncate">Budget line: {card.title}</span>
                {canRemove(card) && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label={`Remove budget line ${card.title}`}
                    onClick={() => removeCard(card)}
                  >
                    <Trash2Icon className="size-3.5" />
                  </Button>
                )}
              </div>
            ))}
          <p className="text-muted-foreground border-t pt-2 text-xs">
            To add a card, select cells in a Finance sheet, right-click and choose “Show on
            dashboard”.
          </p>
        </PopoverContent>
      </Popover>
      <Button
        variant="outline"
        size="sm"
        onClick={() => void finish(mutations.reset.mutateAsync(), 'Dashboard reset to the default')}
      >
        <RotateCcwIcon /> Reset
      </Button>
      {profile?.role === 'superadmin' && (
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            void finish(
              mutations.setDefault.mutateAsync(draft),
              'Default layout saved for all users',
            )
          }
        >
          Set as default for all
        </Button>
      )}
      <Button variant="ghost" size="sm" onClick={() => setDraft(null)}>
        Cancel
      </Button>
      <Button
        size="sm"
        onClick={() => void finish(mutations.save.mutateAsync(draft), 'Dashboard layout saved')}
      >
        <SaveIcon /> Save layout
      </Button>
    </>
  ) : (
    <Button variant="outline" size="sm" onClick={() => setDraft(layout)}>
      <LayoutDashboardIcon /> Customize
    </Button>
  )

  return (
    <div className="space-y-6">
      <PageHeader title={title} description={description} actions={toolbar} />
      <DashboardGrid
        layout={draft ?? layout}
        editing={!!draft}
        onChange={setDraft}
        renderWidget={renderWidget}
        titleOf={titleOf}
      />
    </div>
  )
}
