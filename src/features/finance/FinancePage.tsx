import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageHeader } from '@/components/layout/PageHeader'
import { SelectNative } from '@/components/ui/select-native'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useWorkspace } from '@/features/workspace/workspace-context'
import { cn } from '@/lib/utils'
import type { PlanType } from '@/types/database'
import {
  AllotmentsTab,
  DisbursementsRegister,
  FinanceOverview,
  ObligationsRegister,
  PayablesTab,
  SavingsTab,
} from './components/FinanceTabs'
import { PlanSheet } from './components/PlanSheet'

const TABS = ['overview', 'plans', 'allotments', 'ors', 'dv', 'payables', 'savings'] as const
type Tab = (typeof TABS)[number]

/** /finance — follows the workspace FY and program selector. */
export default function FinancePage() {
  const [params, setParams] = useSearchParams()
  const tab = (TABS as readonly string[]).includes(params.get('tab') ?? '')
    ? (params.get('tab') as Tab)
    : 'overview'
  const planParam = params.get('plan')
  const planType: PlanType = planParam === 'PPMP' || planParam === 'APP' ? planParam : 'WFP'
  const set = (next: Record<string, string>) => setParams(next, { replace: true })

  const { fiscalYear, selectedProgramIds, programs } = useWorkspace()
  const scope = { programIds: selectedProgramIds, fiscalYearId: fiscalYear?.id ?? null }
  const scopePrograms = programs.filter((p) => selectedProgramIds.includes(p.id))
  const [planProgram, setPlanProgram] = useState('')
  const planProgramId = scopePrograms.some((p) => p.id === planProgram)
    ? planProgram
    : (scopePrograms[0]?.id ?? '')

  return (
    <div className="space-y-6">
      <PageHeader
        title="Finance"
        description={`${fiscalYear?.label ?? 'No fiscal year'} · ${
          scopePrograms.length === 1 ? scopePrograms[0].code : `${scopePrograms.length} programs`
        } — plans, allotments, obligations (ORS), disbursements (DV), payables and savings.`}
      />
      <Tabs value={tab} onValueChange={(t) => set(t === 'overview' ? {} : { tab: t })}>
        <div className="overflow-x-auto">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="plans">WFP / PPMP / APP</TabsTrigger>
            <TabsTrigger value="allotments">Allotments</TabsTrigger>
            <TabsTrigger value="ors">ORS register</TabsTrigger>
            <TabsTrigger value="dv">DV register</TabsTrigger>
            <TabsTrigger value="payables">Payables</TabsTrigger>
            <TabsTrigger value="savings">Savings</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="mt-4">
          <FinanceOverview scope={scope} />
        </TabsContent>

        <TabsContent value="plans" className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div
              className="bg-card inline-flex rounded-md border p-0.5"
              role="group"
              aria-label="Plan"
            >
              {(['WFP', 'PPMP', 'APP'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={planType === t}
                  onClick={() => set({ tab: 'plans', plan: t })}
                  className={cn(
                    'rounded px-3 py-1 text-sm',
                    planType === t ? 'bg-primary text-primary-foreground' : 'hover:bg-accent',
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
            {scopePrograms.length > 1 && (
              <SelectNative
                aria-label="Program"
                className="w-48"
                value={planProgramId}
                onChange={(e) => setPlanProgram(e.target.value)}
              >
                {scopePrograms.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} — {p.name}
                  </option>
                ))}
              </SelectNative>
            )}
          </div>
          {planProgramId && fiscalYear ? (
            <PlanSheet
              key={`${planProgramId}-${fiscalYear.id}-${planType}`}
              programId={planProgramId}
              fiscalYearId={fiscalYear.id}
              type={planType}
            />
          ) : (
            <p className="text-muted-foreground text-sm">Pick a fiscal year and program.</p>
          )}
        </TabsContent>

        <TabsContent value="allotments" className="mt-4">
          <AllotmentsTab scope={scope} />
        </TabsContent>
        <TabsContent value="ors" className="mt-4">
          <ObligationsRegister scope={scope} />
        </TabsContent>
        <TabsContent value="dv" className="mt-4">
          <DisbursementsRegister scope={scope} />
        </TabsContent>
        <TabsContent value="payables" className="mt-4">
          <PayablesTab scope={scope} />
        </TabsContent>
        <TabsContent value="savings" className="mt-4">
          <SavingsTab scope={scope} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
