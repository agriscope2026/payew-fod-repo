import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageHeader } from '@/components/layout/PageHeader'
import { SelectNative } from '@/components/ui/select-native'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { FinanceSheetView } from '@/features/sheets/components/FinanceSheetView'
import type { SheetKind } from '@/features/sheets/model'
import { useWorkspace } from '@/features/workspace/workspace-context'
import { BudgetSettings } from './components/BudgetSettings'

const SHEET_TABS: { tab: string; kind: SheetKind; label: string }[] = [
  { tab: 'wfp', kind: 'WFP', label: 'WFP' },
  { tab: 'ppmp', kind: 'PPMP', label: 'PPMP' },
  { tab: 'app', kind: 'APP', label: 'APP' },
  { tab: 'allotments', kind: 'allotments', label: 'Allotments' },
  { tab: 'ors', kind: 'obligations', label: 'ORS register' },
  { tab: 'dv', kind: 'disbursements', label: 'DV register' },
]
const TABS = [...SHEET_TABS.map((t) => t.tab), 'budget']

/** /finance: the program's finance sheets for the workspace fiscal year. */
export default function FinancePage() {
  const [params, setParams] = useSearchParams()
  const requested =
    params.get('tab') === 'plans' ? (params.get('plan') ?? 'wfp').toLowerCase() : params.get('tab')
  const tab = TABS.includes(requested ?? '') ? requested! : 'wfp'

  const { fiscalYear, selectedProgramIds, programs } = useWorkspace()
  const scope = { programIds: selectedProgramIds, fiscalYearId: fiscalYear?.id ?? null }
  const scopePrograms = programs.filter((p) => selectedProgramIds.includes(p.id))
  const [picked, setPicked] = useState('')
  const program = scopePrograms.find((p) => p.id === picked) ?? scopePrograms[0]

  return (
    <div className="space-y-4">
      <PageHeader
        title="Finance"
        description={`${fiscalYear?.label ?? 'No fiscal year'} · ${
          program ? `${program.code} — ${program.name}` : 'No program'
        }. Sheets work like Excel: type, paste, use formulas, and upload your own files.`}
        actions={
          scopePrograms.length > 1 && (
            <SelectNative
              aria-label="Program"
              className="w-56"
              value={program?.id ?? ''}
              onChange={(e) => setPicked(e.target.value)}
            >
              {scopePrograms.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} — {p.name}
                </option>
              ))}
            </SelectNative>
          )
        }
      />
      <Tabs
        value={tab}
        onValueChange={(t) => setParams(t === 'wfp' ? {} : { tab: t }, { replace: true })}
      >
        <div className="overflow-x-auto">
          <TabsList>
            {SHEET_TABS.map((t) => (
              <TabsTrigger key={t.tab} value={t.tab}>
                {t.label}
              </TabsTrigger>
            ))}
            <TabsTrigger value="budget">Budget settings</TabsTrigger>
          </TabsList>
        </div>

        {SHEET_TABS.map((t) => (
          <TabsContent key={t.tab} value={t.tab} className="mt-3">
            {program && fiscalYear ? (
              <FinanceSheetView
                key={`${program.id}-${fiscalYear.id}-${t.kind}`}
                program={program}
                fiscalYear={fiscalYear}
                kind={t.kind}
              />
            ) : (
              <p className="text-muted-foreground text-sm">
                Pick a fiscal year and program in the top bar.
              </p>
            )}
          </TabsContent>
        ))}
        <TabsContent value="budget" className="mt-3">
          <BudgetSettings scope={scope} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
