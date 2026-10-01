import { ArrowLeftIcon, ChevronRightIcon, PrinterIcon, SearchXIcon } from 'lucide-react'
import type { ComponentType } from 'react'
import { Link, Route, Routes, useParams } from 'react-router-dom'
import { EmptyState } from '@/components/common/EmptyState'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useWorkspace } from '@/features/workspace/workspace-context'
import { formatDateTime } from '@/lib/format'
import { REPORT_GROUPS, REPORTS, type ReportId } from './catalog'
import { BurReport } from './pages/BurReport'
import {
  AccomplishmentReport,
  BeneficiariesReport,
  ComplianceReport,
  PayablesReport,
  ProcurementReport,
  SavingsReport,
  SupplierAwardsReport,
  SupplierPerformanceReport,
  type ReportProps,
} from './pages/Reports'

const VIEWS: Record<ReportId, ComponentType<ReportProps>> = {
  bur: BurReport,
  accomplishment: AccomplishmentReport,
  procurement: ProcurementReport,
  'supplier-performance': SupplierPerformanceReport,
  'supplier-awards': SupplierAwardsReport,
  savings: SavingsReport,
  payables: PayablesReport,
  beneficiaries: BeneficiariesReport,
  compliance: ComplianceReport,
}

/** /reports, /reports/:id */
export default function ReportsModule() {
  return (
    <Routes>
      <Route index element={<ReportsIndex />} />
      <Route path=":id" element={<ReportPage />} />
    </Routes>
  )
}

function ReportsIndex() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Every report follows the fiscal year and program selector, and exports to Excel or prints."
      />
      {REPORT_GROUPS.map((g) => (
        <section key={g} className="space-y-3">
          <h2 className="text-muted-foreground text-sm font-semibold tracking-wide uppercase">
            {g}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {REPORTS.filter((r) => r.group === g).map((r) => (
              <Link key={r.id} to={r.id} className="group">
                <Card className="group-hover:border-primary/50 h-full py-4 transition-colors">
                  <CardContent className="flex items-start gap-3 px-4">
                    <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
                      <r.icon className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium group-hover:underline">{r.title}</span>
                      <span className="text-muted-foreground mt-0.5 block text-sm">
                        {r.description}
                      </span>
                    </span>
                    <ChevronRightIcon className="text-muted-foreground mt-1 size-4 shrink-0" />
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function ReportPage() {
  const { id } = useParams()
  const { fiscalYear, programs, programFilter, selectedProgramIds } = useWorkspace()
  const meta = REPORTS.find((r) => r.id === id)
  const programCode = (pid: string) => programs.find((p) => p.id === pid)?.code ?? '—'

  if (!meta)
    return (
      <EmptyState
        icon={SearchXIcon}
        title="Report not found"
        action={
          <Button asChild variant="outline">
            <Link to="/reports">All reports</Link>
          </Button>
        }
      />
    )

  const View = VIEWS[meta.id]
  const scopeLabel =
    programFilter === 'all' ? 'All programs' : selectedProgramIds.map(programCode).join(', ')

  return (
    <div className="space-y-5">
      <div className="print:hidden">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/reports">
            <ArrowLeftIcon /> All reports
          </Link>
        </Button>
      </div>
      <PageHeader
        title={meta.title}
        description={`${fiscalYear?.label ?? 'No fiscal year'} · ${scopeLabel}`}
        actions={
          <Button
            variant="outline"
            size="sm"
            className="print:hidden"
            onClick={() => window.print()}
          >
            <PrinterIcon /> Print
          </Button>
        }
      />
      <p className="text-muted-foreground text-sm print:hidden">{meta.description}</p>
      <p className="text-muted-foreground hidden text-xs print:block">
        Generated {formatDateTime(new Date())}
      </p>
      {fiscalYear && selectedProgramIds.length ? (
        <View
          scope={{ fiscalYearId: fiscalYear.id, programIds: selectedProgramIds }}
          programCode={programCode}
        />
      ) : (
        <p className="text-muted-foreground text-sm">
          Pick a fiscal year and at least one program in the top bar.
        </p>
      )}
    </div>
  )
}
