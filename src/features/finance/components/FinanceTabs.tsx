import type { ColumnDef } from '@tanstack/react-table'
import {
  AlertTriangleIcon,
  CheckIcon,
  DownloadIcon,
  Loader2Icon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { DataTable } from '@/components/common/DataTable'
import { FormField } from '@/components/common/FormField'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { SelectNative } from '@/components/ui/select-native'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { RequestDialog } from '@/features/approvals/components/RequestDialog'
import { useAuth } from '@/features/auth/auth-context'
import { canManageProgram, canWriteProgram } from '@/features/auth/permissions'
import { useProcurementLookups } from '@/features/packages/use-procurement-lookups'
import { useAppSettings } from '@/features/settings/api'
import { useMasterList } from '@/features/settings/master-lists/api'
import { useSuppliers } from '@/features/suppliers/api'
import { formatDate, formatPeso, todayManila } from '@/lib/format'
import { errorMessage } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { exportSheet } from '@/lib/xlsx-export'
import type {
  AllotmentKind,
  AllotmentRow,
  ObligationRow,
  PayableRow,
  SavingsEntryRow,
} from '@/types/database'
import {
  useActivityFinanceList,
  useAllotments,
  useDisbursements,
  useFinanceLabels,
  useFinanceMutations,
  useObligations,
  usePayables,
  useProgramFinance,
  useSavings,
  type DisbursementWithLinks,
  type FinanceScope,
} from '../api'
import { Meter, RateBadge } from './FinanceBits'
import { pct, rateState } from '../finance-utils'

function useLabelMaps(scope: FinanceScope) {
  const { data } = useFinanceLabels(scope)
  return useMemo(() => {
    const act = new Map((data?.activities ?? []).map((a) => [a.id, a]))
    const pkg = new Map((data?.packages ?? []).map((p) => [p.id, p]))
    return { act, pkg }
  }, [data])
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------
export function FinanceOverview({ scope }: { scope: FinanceScope }) {
  const { data: byClass = [], isPending } = useProgramFinance(scope)
  const { data: acts = [] } = useActivityFinanceList(scope)
  const { data: payables = [] } = usePayables(scope)
  const { data: settings } = useAppSettings()
  const th = settings?.dashboard_thresholds

  if (isPending) return <Skeleton className="h-64" />
  const t = byClass.reduce(
    (s, r) => ({
      allotted: s.allotted + Number(r.allotted),
      planned: s.planned + Number(r.planned),
      obligated: s.obligated + Number(r.obligated),
      disbursed: s.disbursed + Number(r.disbursed),
    }),
    { allotted: 0, planned: 0, obligated: 0, disbursed: 0 },
  )
  const obligationRate = pct(t.obligated, t.allotted)
  const disbursementRate = pct(t.disbursed, t.obligated)
  const payable = payables.reduce((s, p) => s + Number(p.delivered_unpaid), 0)

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          label="Allotment"
          value={formatPeso(t.allotted)}
          hint={`WFP plan ${formatPeso(t.planned)}`}
        />
        <Tile label="Obligated (ORS)" value={formatPeso(t.obligated)}>
          <Meter pct={obligationRate} label="Obligation rate" />
          <RateBadge pct={obligationRate} state={rateState(obligationRate, th?.obligation_rate)} />
        </Tile>
        <Tile label="Disbursed (DV)" value={formatPeso(t.disbursed)}>
          <Meter pct={disbursementRate} label="Disbursement rate" />
          <RateBadge
            pct={disbursementRate}
            state={rateState(disbursementRate, th?.disbursement_rate)}
          />
        </Tile>
        <Tile
          label="Unobligated allotment"
          value={formatPeso(t.allotted - t.obligated)}
          hint={`${payables.length} package(s) with payables · ${formatPeso(payable)}`}
        />
      </div>

      <Card className="py-0">
        <CardContent className="overflow-x-auto px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Expense class</TableHead>
                <TableHead className="text-right">Allotment</TableHead>
                <TableHead className="text-right">WFP plan</TableHead>
                <TableHead className="text-right">Obligated</TableHead>
                <TableHead className="w-40">Obligation rate</TableHead>
                <TableHead className="text-right">Disbursed</TableHead>
                <TableHead className="text-right">Unobligated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byClass.map((r) => {
                const rate = pct(Number(r.obligated), Number(r.allotted))
                const over = Number(r.obligated) > Number(r.allotted)
                return (
                  <TableRow key={`${r.program_id}-${r.expense_class_id}`}>
                    <TableCell className="font-medium">{r.expense_class_code}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPeso(r.allotted)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPeso(r.planned)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPeso(r.obligated)}
                    </TableCell>
                    <TableCell>
                      <Meter
                        pct={rate}
                        label={`${r.expense_class_code} obligation rate`}
                        danger={over}
                      />
                      <span
                        className={cn(
                          'text-xs',
                          over ? 'text-destructive' : 'text-muted-foreground',
                        )}
                      >
                        {over && <AlertTriangleIcon className="mr-0.5 inline size-3" />}
                        {rate === null ? '—' : `${rate.toFixed(1)}%`}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPeso(r.disbursed)}
                    </TableCell>
                    <TableCell
                      className={cn('text-right tabular-nums', over && 'text-destructive')}
                    >
                      {formatPeso(Number(r.allotted) - Number(r.obligated))}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell>Total</TableCell>
                <TableCell className="text-right tabular-nums">{formatPeso(t.allotted)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatPeso(t.planned)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatPeso(t.obligated)}</TableCell>
                <TableCell className="text-xs">
                  {obligationRate === null ? '—' : `${obligationRate.toFixed(1)}%`}
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatPeso(t.disbursed)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatPeso(t.allotted - t.obligated)}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>

      <DataTable
        data={acts}
        getRowId={(a) => a.activity_id}
        searchPlaceholder="Search activities…"
        columns={[
          {
            accessorKey: 'code',
            header: 'Activity',
            cell: ({ row: { original: a } }) => (
              <Link to={`/activities/${a.activity_id}?tab=finance`} className="hover:underline">
                <span className="font-medium">{a.title}</span>
                <span className="text-muted-foreground block font-mono text-xs">{a.code}</span>
              </Link>
            ),
          },
          {
            accessorKey: 'budget_amount',
            header: 'Budget',
            cell: ({ getValue }) => <Money v={getValue()} />,
          },
          {
            accessorKey: 'obligated',
            header: 'Obligated',
            cell: ({ getValue }) => <Money v={getValue()} />,
          },
          {
            accessorKey: 'utilization_pct',
            header: 'Utilization',
            cell: ({ row: { original: a } }) => (
              <RateBadge
                pct={a.utilization_pct}
                state={rateState(a.utilization_pct, th?.utilization)}
              />
            ),
          },
          {
            accessorKey: 'disbursed',
            header: 'Disbursed',
            cell: ({ getValue }) => <Money v={getValue()} />,
          },
          {
            accessorKey: 'payables',
            header: 'Payables',
            cell: ({ getValue }) => <Money v={getValue()} danger={Number(getValue()) > 0} />,
          },
        ]}
      />
    </div>
  )
}

function Tile({
  label,
  value,
  hint,
  children,
}: {
  label: string
  value: string
  hint?: string
  children?: React.ReactNode
}) {
  return (
    <Card className="gap-1 py-4">
      <CardContent className="space-y-1.5 px-4">
        <p className="text-muted-foreground text-xs">{label}</p>
        <p className="text-lg font-semibold tabular-nums">{value}</p>
        {children}
        {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
      </CardContent>
    </Card>
  )
}

function Money({ v, danger }: { v: unknown; danger?: boolean }) {
  return (
    <span className={cn('tabular-nums', danger && 'text-destructive')}>
      {formatPeso(Number(v ?? 0))}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Allotments
// ---------------------------------------------------------------------------
const KIND_LABEL: Record<AllotmentKind, string> = {
  saro: 'SARO',
  sub_allotment: 'Sub-allotment (SAA)',
  realignment: 'Realignment (±)',
  reversion: 'Reversion (−)',
}

export function AllotmentsTab({ scope }: { scope: FinanceScope }) {
  const { profile, programs } = useAuth()
  const { data = [], isPending } = useAllotments(scope)
  const lookups = useProcurementLookups()
  const { data: funds = [] } = useMasterList('fund_sources')
  const { removeAllotment } = useFinanceMutations()
  const [editing, setEditing] = useState<Partial<AllotmentRow> | null>(null)
  const [realign, setRealign] = useState<string | null>(null)
  const programIds = programs.map((p) => p.id)
  const manageable = scope.programIds.filter((id) => canManageProgram(profile, programIds, id))
  const writable = scope.programIds.filter((id) => canWriteProgram(profile, programIds, id))
  const code = (id: string) => programs.find((p) => p.id === id)?.code ?? ''
  const fund = (id: string | null) => String(funds.find((f) => f.id === id)?.code ?? '')

  if (isPending) return <Skeleton className="h-64" />
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {manageable.length > 0 && (
          <Button
            size="sm"
            onClick={() => setEditing({ program_id: manageable[0], kind: 'sub_allotment' })}
          >
            <PlusIcon /> Allotment
          </Button>
        )}
        {writable.map((id) => (
          <Button key={id} size="sm" variant="outline" onClick={() => setRealign(id)}>
            Request realignment{writable.length > 1 ? ` (${code(id)})` : ''}
          </Button>
        ))}
      </div>
      {realign && scope.fiscalYearId && (
        <RequestDialog
          type="realignment"
          target={{
            entityType: 'program',
            entityId: realign,
            programId: realign,
            fiscalYearId: scope.fiscalYearId,
            label: `${code(realign)} allotment / activity budgets`,
          }}
          onClose={() => setRealign(null)}
        />
      )}
      <DataTable
        data={data}
        getRowId={(a) => a.id}
        searchPlaceholder="Search SARO/SAA No., remarks…"
        columns={[
          {
            accessorKey: 'allotment_date',
            header: 'Date',
            cell: ({ getValue }) => formatDate(String(getValue())),
          },
          {
            accessorKey: 'allotment_no',
            header: 'No.',
            cell: ({ row: { original: a } }) => (
              <span>
                <span className="font-medium">{a.allotment_no ?? '—'}</span>
                {scope.programIds.length > 1 && (
                  <span className="text-muted-foreground block text-xs">{code(a.program_id)}</span>
                )}
              </span>
            ),
          },
          {
            accessorKey: 'kind',
            header: 'Kind',
            cell: ({ getValue }) => KIND_LABEL[getValue() as AllotmentKind],
          },
          {
            id: 'class',
            header: 'Class / UACS',
            accessorFn: (a) => lookups.expenseClassName(a.expense_class_id),
            cell: ({ row: { original: a } }) => (
              <span className="text-sm">
                {lookups.expenseClassName(a.expense_class_id)}
                {a.uacs_code_id && (
                  <span className="text-muted-foreground block text-xs">
                    {lookups.uacsLabel(a.uacs_code_id)}
                  </span>
                )}
              </span>
            ),
          },
          { id: 'fund', header: 'Fund', accessorFn: (a) => fund(a.fund_source_id) },
          {
            accessorKey: 'amount',
            header: 'Amount',
            cell: ({ getValue }) => <Money v={getValue()} danger={Number(getValue()) < 0} />,
          },
          { accessorKey: 'remarks', header: 'Remarks' },
          {
            id: 'actions',
            enableSorting: false,
            cell: ({ row: { original: a } }) =>
              canManageProgram(profile, programIds, a.program_id) && (
                <span className="flex">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label="Edit"
                    onClick={() => setEditing(a)}
                  >
                    <PencilIcon />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label="Remove"
                    onClick={() =>
                      removeAllotment
                        .mutateAsync(a.id)
                        .then(() => toast.success('Allotment removed'))
                        .catch((e) => toast.error(errorMessage(e)))
                    }
                  >
                    <Trash2Icon />
                  </Button>
                </span>
              ),
          },
        ]}
      />
      {editing && (
        <AllotmentDialog
          allotment={editing}
          programs={programs.filter((p) => manageable.includes(p.id))}
          fiscalYearId={scope.fiscalYearId!}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function AllotmentDialog({
  allotment,
  programs,
  fiscalYearId,
  onClose,
}: {
  allotment: Partial<AllotmentRow>
  programs: { id: string; code: string }[]
  fiscalYearId: string
  onClose: () => void
}) {
  const { saveAllotment } = useFinanceMutations()
  const lookups = useProcurementLookups()
  const { data: funds = [] } = useMasterList('fund_sources')
  const [programId, setProgramId] = useState(allotment.program_id ?? programs[0]?.id ?? '')
  const [kind, setKind] = useState<AllotmentKind>(allotment.kind ?? 'sub_allotment')
  const [no, setNo] = useState(allotment.allotment_no ?? '')
  const [date, setDate] = useState(allotment.allotment_date ?? todayManila())
  const [ec, setEc] = useState(allotment.expense_class_id ?? '')
  const [uacs, setUacs] = useState(allotment.uacs_code_id ?? '')
  const [fund, setFund] = useState(allotment.fund_source_id ?? '')
  const [amount, setAmount] = useState(
    allotment.amount !== undefined ? String(allotment.amount) : '',
  )
  const [remarks, setRemarks] = useState(allotment.remarks ?? '')
  const n = Number(amount.replace(/[,₱\s]/g, ''))
  const amountError =
    !Number.isFinite(n) || n === 0
      ? 'Enter a non-zero amount'
      : kind === 'reversion' && n > 0
        ? 'A reversion is negative'
        : (kind === 'saro' || kind === 'sub_allotment') && n < 0
          ? 'Use a realignment or reversion for negative amounts'
          : null
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{allotment.id ? 'Edit allotment' : 'New allotment'}</DialogTitle>
          <DialogDescription>
            Obligations are checked against the allotment of their expense class.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          {!allotment.id && programs.length > 1 && (
            <FormField id="al-prog" label="Program">
              <SelectNative
                id="al-prog"
                value={programId}
                onChange={(e) => setProgramId(e.target.value)}
              >
                {programs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code}
                  </option>
                ))}
              </SelectNative>
            </FormField>
          )}
          <FormField id="al-kind" label="Kind">
            <SelectNative
              id="al-kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as AllotmentKind)}
            >
              {Object.entries(KIND_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </SelectNative>
          </FormField>
          <FormField id="al-no" label="SARO / SAA No.">
            <Input id="al-no" value={no} onChange={(e) => setNo(e.target.value)} />
          </FormField>
          <FormField id="al-date" label="Date *">
            <Input
              id="al-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </FormField>
          <FormField id="al-ec" label="Expense class *">
            <SelectNative id="al-ec" value={ec} onChange={(e) => setEc(e.target.value)}>
              <option value="">Select…</option>
              {lookups.expenseClasses.map((x) => (
                <option key={x.id} value={x.id}>
                  {String(x.code)} · {String(x.name)}
                </option>
              ))}
            </SelectNative>
          </FormField>
          <FormField id="al-uacs" label="UACS (optional)">
            <SelectNative id="al-uacs" value={uacs} onChange={(e) => setUacs(e.target.value)}>
              <option value="">—</option>
              {lookups.uacs
                .filter((u) => !ec || u.expense_class_id === ec)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {String(u.code)} · {String(u.name)}
                  </option>
                ))}
            </SelectNative>
          </FormField>
          <FormField id="al-fund" label="Fund source">
            <SelectNative id="al-fund" value={fund} onChange={(e) => setFund(e.target.value)}>
              <option value="">—</option>
              {funds.map((f) => (
                <option key={f.id} value={f.id}>
                  {String(f.code)}
                </option>
              ))}
            </SelectNative>
          </FormField>
          <FormField
            id="al-amount"
            label="Amount *"
            error={amount ? (amountError ?? undefined) : undefined}
          >
            <Input
              id="al-amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </FormField>
          <div className="sm:col-span-2">
            <FormField id="al-rem" label="Remarks">
              <Input id="al-rem" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
            </FormField>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!ec || !date || !!amountError || saveAllotment.isPending}
            onClick={() =>
              saveAllotment
                .mutateAsync({
                  id: allotment.id,
                  program_id: programId,
                  fiscal_year_id: fiscalYearId,
                  kind,
                  allotment_no: no.trim() || null,
                  allotment_date: date,
                  fund_source_id: fund || null,
                  expense_class_id: ec,
                  uacs_code_id: uacs || null,
                  amount: n,
                  remarks: remarks.trim() || null,
                })
                .then(() => {
                  toast.success('Allotment saved')
                  onClose()
                })
                .catch((e) => toast.error(errorMessage(e)))
            }
          >
            {saveAllotment.isPending && <Loader2Icon className="animate-spin" />} Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Registers
// ---------------------------------------------------------------------------
function RecordLink({
  activityId,
  packageId,
  maps,
}: {
  activityId: string
  packageId: string | null
  maps: ReturnType<typeof useLabelMaps>
}) {
  const a = maps.act.get(activityId)
  const p = packageId ? maps.pkg.get(packageId) : null
  return (
    <Link
      to={
        p
          ? `/activities/${activityId}/packages/${packageId}?tab=finance`
          : `/activities/${activityId}?tab=finance`
      }
      className="text-sm hover:underline"
    >
      {p ? p.code : (a?.code ?? 'Activity')}
      <span className="text-muted-foreground block max-w-60 truncate text-xs">
        {p ? p.title : (a?.title ?? '')}
      </span>
    </Link>
  )
}

function StatusCell({ status, flags }: { status: string; flags: string[] }) {
  return (
    <div>
      {status === 'cancelled' ? (
        <Badge variant="outline">Cancelled</Badge>
      ) : (
        <Badge variant="outline" className="border-success/40 text-success">
          Active
        </Badge>
      )}
      {flags.length > 0 && (
        <span
          className="mt-1 flex items-center gap-1 text-xs text-[oklch(0.5_0.13_70)]"
          title={flags.join('\n')}
        >
          <AlertTriangleIcon className="size-3" /> {flags.length} flag
          {flags.length === 1 ? '' : 's'}
        </span>
      )}
    </div>
  )
}

export function ObligationsRegister({ scope }: { scope: FinanceScope }) {
  const { data = [], isPending } = useObligations(scope)
  const { data: dvs = [] } = useDisbursements(scope)
  const { data: suppliers = [] } = useSuppliers()
  const maps = useLabelMaps(scope)
  const supplier = new Map(suppliers.map((s) => [s.id, s.business_name]))
  const paid = new Map<string, number>()
  for (const d of dvs.filter((x) => x.status === 'active'))
    for (const l of d.links)
      paid.set(l.obligation_id, (paid.get(l.obligation_id) ?? 0) + Number(l.amount))
  const payee = (o: ObligationRow) =>
    (o.payee_supplier_id ? supplier.get(o.payee_supplier_id) : o.payee_name) ?? '—'

  const columns: ColumnDef<ObligationRow, unknown>[] = [
    {
      accessorKey: 'ors_no',
      header: 'ORS No.',
      cell: ({ row: { original: o } }) => (
        <span>
          <span className="font-medium">{o.ors_no}</span>
          <span className="text-muted-foreground block text-xs">{formatDate(o.ors_date)}</span>
        </span>
      ),
    },
    {
      id: 'record',
      header: 'Activity / package',
      accessorFn: (o) =>
        maps.pkg.get(o.package_id ?? '')?.code ?? maps.act.get(o.activity_id)?.code ?? '',
      cell: ({ row: { original: o } }) => (
        <RecordLink activityId={o.activity_id} packageId={o.package_id} maps={maps} />
      ),
    },
    { id: 'payee', header: 'Payee', accessorFn: payee },
    { accessorKey: 'amount', header: 'Amount', cell: ({ getValue }) => <Money v={getValue()} /> },
    {
      id: 'paid',
      header: 'Paid',
      accessorFn: (o) => paid.get(o.id) ?? 0,
      cell: ({ getValue }) => <Money v={getValue()} />,
    },
    {
      id: 'status',
      header: 'Status',
      accessorFn: (o) => o.status,
      cell: ({ row: { original: o } }) => <StatusCell status={o.status} flags={o.flags} />,
    },
  ]
  if (isPending) return <Skeleton className="h-64" />
  return (
    <DataTable
      data={data}
      columns={columns}
      getRowId={(o) => o.id}
      pageSize={50}
      searchPlaceholder="Search ORS No., payee…"
      rowClassName={(o) => (o.status === 'cancelled' ? 'opacity-60' : undefined)}
      toolbar={
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            void exportSheet(
              'PAYEW-ORS-register.xlsx',
              'ORS',
              [
                'ORS No.',
                'Date',
                'Activity',
                'Package',
                'Payee',
                'Particulars',
                'Amount',
                'Paid',
                'Status',
                'Flags',
              ],
              data.map((o) => [
                o.ors_no,
                o.ors_date,
                maps.act.get(o.activity_id)?.code ?? '',
                maps.pkg.get(o.package_id ?? '')?.code ?? '',
                payee(o),
                o.particulars ?? '',
                Number(o.amount),
                paid.get(o.id) ?? 0,
                o.status,
                o.flags.join('; '),
              ]),
            )
          }
        >
          <DownloadIcon /> Export
        </Button>
      }
    />
  )
}

export function DisbursementsRegister({ scope }: { scope: FinanceScope }) {
  const { data = [], isPending } = useDisbursements(scope)
  const { data: ors = [] } = useObligations(scope)
  const { data: suppliers = [] } = useSuppliers()
  const maps = useLabelMaps(scope)
  const orsNo = new Map(ors.map((o) => [o.id, o.ors_no]))
  const supplier = new Map(suppliers.map((s) => [s.id, s.business_name]))
  const payee = (d: DisbursementWithLinks) =>
    (d.payee_supplier_id ? supplier.get(d.payee_supplier_id) : d.payee_name) ?? '—'
  const charged = (d: DisbursementWithLinks) =>
    d.links.map((l) => orsNo.get(l.obligation_id) ?? 'ORS').join(', ')

  const columns: ColumnDef<DisbursementWithLinks, unknown>[] = [
    {
      accessorKey: 'dv_no',
      header: 'DV No.',
      cell: ({ row: { original: d } }) => (
        <span>
          <span className="font-medium">{d.dv_no}</span>
          <span className="text-muted-foreground block text-xs">
            {formatDate(d.dv_date)}
            {d.check_ada_no && ` · ${d.check_ada_no}`}
          </span>
        </span>
      ),
    },
    {
      id: 'record',
      header: 'Activity / package',
      accessorFn: (d) =>
        maps.pkg.get(d.package_id ?? '')?.code ?? maps.act.get(d.activity_id)?.code ?? '',
      cell: ({ row: { original: d } }) => (
        <RecordLink activityId={d.activity_id} packageId={d.package_id} maps={maps} />
      ),
    },
    { id: 'payee', header: 'Payee', accessorFn: payee },
    { id: 'ors', header: 'Charged to', accessorFn: charged },
    {
      accessorKey: 'gross_amount',
      header: 'Gross',
      cell: ({ getValue }) => <Money v={getValue()} />,
    },
    {
      accessorKey: 'tax_withheld',
      header: 'Tax',
      cell: ({ getValue }) => <Money v={getValue()} />,
    },
    { accessorKey: 'net_amount', header: 'Net', cell: ({ getValue }) => <Money v={getValue()} /> },
    {
      id: 'status',
      header: 'Status',
      accessorFn: (d) => d.status,
      cell: ({ row: { original: d } }) => <StatusCell status={d.status} flags={d.flags} />,
    },
  ]
  if (isPending) return <Skeleton className="h-64" />
  return (
    <DataTable
      data={data}
      columns={columns}
      getRowId={(d) => d.id}
      pageSize={50}
      searchPlaceholder="Search DV No., payee, check…"
      rowClassName={(d) => (d.status === 'cancelled' ? 'opacity-60' : undefined)}
      toolbar={
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            void exportSheet(
              'PAYEW-DV-register.xlsx',
              'DV',
              [
                'DV No.',
                'Date',
                'Activity',
                'Package',
                'Payee',
                'Charged to ORS',
                'Gross',
                'Tax withheld',
                'Other deductions',
                'Net',
                'Check/ADA',
                'Status',
                'Flags',
              ],
              data.map((d) => [
                d.dv_no,
                d.dv_date,
                maps.act.get(d.activity_id)?.code ?? '',
                maps.pkg.get(d.package_id ?? '')?.code ?? '',
                payee(d),
                charged(d),
                Number(d.gross_amount),
                Number(d.tax_withheld),
                Number(d.other_deductions),
                Number(d.net_amount),
                d.check_ada_no ?? '',
                d.status,
                d.flags.join('; '),
              ]),
            )
          }
        >
          <DownloadIcon /> Export
        </Button>
      }
    />
  )
}

const bucket = (days: number) =>
  days <= 30 ? '0–30 days' : days <= 60 ? '31–60 days' : 'Over 60 days'

export function PayablesTab({ scope }: { scope: FinanceScope }) {
  const { data = [], isPending } = usePayables(scope)
  if (isPending) return <Skeleton className="h-64" />
  const buckets = ['0–30 days', '31–60 days', 'Over 60 days'].map((b) => ({
    label: b,
    total: data
      .filter((p) => bucket(p.days_outstanding) === b)
      .reduce((s, p) => s + Number(p.delivered_unpaid), 0),
  }))
  const columns: ColumnDef<PayableRow, unknown>[] = [
    {
      accessorKey: 'code',
      header: 'Package',
      cell: ({ row: { original: p } }) => (
        <Link
          to={`/activities/${p.activity_id}/packages/${p.package_id}?tab=finance`}
          className="hover:underline"
        >
          <span className="font-medium">{p.title}</span>
          <span className="text-muted-foreground block font-mono text-xs">{p.code}</span>
        </Link>
      ),
    },
    { accessorKey: 'supplier_name', header: 'Supplier' },
    {
      accessorKey: 'accepted',
      header: 'Accepted',
      cell: ({ getValue }) => <Money v={getValue()} />,
    },
    { accessorKey: 'disbursed', header: 'Paid', cell: ({ getValue }) => <Money v={getValue()} /> },
    {
      accessorKey: 'delivered_unpaid',
      header: 'Payable',
      cell: ({ getValue }) => <Money v={getValue()} danger />,
    },
    {
      accessorKey: 'days_outstanding',
      header: 'Age',
      cell: ({ row: { original: p } }) => (
        <span className={cn('text-sm', p.days_outstanding > 30 && 'text-destructive font-medium')}>
          {p.days_outstanding} days
          <span className="text-muted-foreground block text-xs">
            since {formatDate(p.oldest_unpaid_acceptance)}
          </span>
        </span>
      ),
    },
  ]
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        {buckets.map((b) => (
          <Tile key={b.label} label={`Payables ${b.label}`} value={formatPeso(b.total)} />
        ))}
      </div>
      <DataTable
        data={data}
        columns={columns}
        getRowId={(p) => p.package_id}
        searchPlaceholder="Search package, supplier…"
        toolbar={
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              void exportSheet(
                'PAYEW-payables.xlsx',
                'Payables',
                [
                  'Package',
                  'Title',
                  'Activity',
                  'Supplier',
                  'Accepted',
                  'Paid',
                  'Payable',
                  'Oldest acceptance',
                  'Days outstanding',
                ],
                data.map((p) => [
                  p.code,
                  p.title,
                  p.activity_code,
                  p.supplier_name ?? '',
                  Number(p.accepted),
                  Number(p.disbursed),
                  Number(p.delivered_unpaid),
                  p.oldest_unpaid_acceptance ?? '',
                  p.days_outstanding,
                ]),
              )
            }
          >
            <DownloadIcon /> Export
          </Button>
        }
      />
    </div>
  )
}

export function SavingsTab({ scope }: { scope: FinanceScope }) {
  const { profile, programs } = useAuth()
  const { data = [], isPending } = useSavings(scope)
  const maps = useLabelMaps(scope)
  const { decideSavings } = useFinanceMutations()
  const programIds = programs.map((p) => p.id)
  if (isPending) return <Skeleton className="h-64" />
  const total = (s: string) =>
    data.filter((x) => x.status === s).reduce((t, x) => t + Number(x.amount), 0)
  const decide = (x: SavingsEntryRow, status: 'confirmed' | 'dismissed' | 'suggested') =>
    decideSavings
      .mutateAsync({ id: x.id, status })
      .then(() =>
        toast.success(
          status === 'confirmed'
            ? 'Savings confirmed'
            : status === 'dismissed'
              ? 'Dismissed'
              : 'Reopened',
        ),
      )
      .catch((e) => toast.error(errorMessage(e)))
  const columns: ColumnDef<SavingsEntryRow, unknown>[] = [
    {
      id: 'record',
      header: 'Package',
      accessorFn: (x) => maps.pkg.get(x.package_id ?? '')?.code ?? '',
      cell: ({ row: { original: x } }) => (
        <RecordLink activityId={x.activity_id} packageId={x.package_id} maps={maps} />
      ),
    },
    {
      id: 'abc',
      header: 'ABC',
      accessorFn: (x) => Number(maps.pkg.get(x.package_id ?? '')?.abc_amount ?? 0),
      cell: ({ getValue }) => <Money v={getValue()} />,
    },
    {
      id: 'contract',
      header: 'Contract',
      accessorFn: (x) => Number(maps.pkg.get(x.package_id ?? '')?.contract_amount ?? 0),
      cell: ({ getValue }) => <Money v={getValue()} />,
    },
    { accessorKey: 'amount', header: 'Savings', cell: ({ getValue }) => <Money v={getValue()} /> },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row: { original: x } }) => (
        <span className="text-sm">
          {x.status === 'confirmed' ? (
            <span className="text-success inline-flex items-center gap-1">
              <CheckIcon className="size-3.5" /> Confirmed
            </span>
          ) : x.status === 'dismissed' ? (
            <span className="text-muted-foreground inline-flex items-center gap-1">
              <XIcon className="size-3.5" /> Dismissed
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[oklch(0.5_0.13_70)]">
              <AlertTriangleIcon className="size-3.5" /> To review
            </span>
          )}
          {x.remarks && <span className="text-muted-foreground block text-xs">{x.remarks}</span>}
        </span>
      ),
    },
    {
      id: 'actions',
      enableSorting: false,
      cell: ({ row: { original: x } }) =>
        canManageProgram(profile, programIds, x.program_id) && (
          <span className="flex gap-1">
            {x.status !== 'confirmed' && (
              <Button size="sm" variant="outline" onClick={() => void decide(x, 'confirmed')}>
                <CheckIcon /> Confirm
              </Button>
            )}
            {x.status === 'suggested' && (
              <Button size="sm" variant="ghost" onClick={() => void decide(x, 'dismissed')}>
                Dismiss
              </Button>
            )}
            {x.status !== 'suggested' && (
              <Button size="sm" variant="ghost" onClick={() => void decide(x, 'suggested')}>
                Reopen
              </Button>
            )}
          </span>
        ),
    },
  ]
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Tile
          label="Confirmed savings"
          value={formatPeso(total('confirmed'))}
          hint="Available for realignment"
        />
        <Tile
          label="To review"
          value={formatPeso(total('suggested'))}
          hint="Suggested from awards (ABC − contract)"
        />
        <Tile label="Dismissed" value={formatPeso(total('dismissed'))} />
      </div>
      <DataTable
        data={data}
        columns={columns}
        getRowId={(x) => x.id}
        searchPlaceholder="Search packages…"
      />
      <p className="text-muted-foreground text-xs">
        To use confirmed savings elsewhere, submit a realignment request (Allotments tab).
      </p>
    </div>
  )
}
