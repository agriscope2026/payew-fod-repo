import {
  CheckCircle2Icon,
  DownloadIcon,
  FileSpreadsheetIcon,
  Loader2Icon,
  RotateCcwIcon,
  SaveIcon,
  SendIcon,
  UploadIcon,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useBlocker } from 'react-router-dom'
import { toast } from 'sonner'
import { EmptyState } from '@/components/common/EmptyState'
import { parseCell } from '@/components/grid/grid-logic'
import { SpreadsheetGrid, type GridColumn } from '@/components/grid/SpreadsheetGrid'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/features/auth/auth-context'
import { canManageProgram, canWriteProgram } from '@/features/auth/permissions'
import { parseWorkbook } from '@/features/beneficiaries/excel'
import { useProcurementLookups } from '@/features/packages/use-procurement-lookups'
import { useMasterList } from '@/features/settings/master-lists/api'
import { formatDateTime, formatPeso } from '@/lib/format'
import { errorMessage } from '@/lib/supabase'
import { exportSheet } from '@/lib/xlsx-export'
import { MONTH_KEYS, type FinancePlanLine, type PlanType } from '@/types/database'
import { useFinanceLabels, usePlan, usePlanMutations, type PlanRowInput } from '../api'

type Row = Partial<FinancePlanLine> & { _key: string; description: string }

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const PLAN_INFO: Record<PlanType, string> = {
  WFP: 'Work and Financial Plan: activities, budget by expense class and monthly financial targets.',
  PPMP: 'Project Procurement Management Plan: items to procure, mode and schedule. Tag rows to their package.',
  APP: 'Annual Procurement Plan: the consolidated procurement list submitted to the BAC.',
}

const blank = (): Row => ({ _key: crypto.randomUUID(), description: '' })

/** amount = qty × unit cost whenever both are given (mirrors save_plan_rows). */
function normalize(rows: Row[]): Row[] {
  return rows.map((r) =>
    r.quantity !== null &&
    r.quantity !== undefined &&
    r.unit_cost !== null &&
    r.unit_cost !== undefined
      ? { ...r, amount: Math.round(Number(r.quantity) * Number(r.unit_cost) * 100) / 100 }
      : r,
  )
}

const monthsTotal = (r: Row) => MONTH_KEYS.reduce((s, k) => s + (Number(r[k]) || 0), 0)

export function PlanSheet({
  programId,
  fiscalYearId,
  type,
}: {
  programId: string
  fiscalYearId: string
  type: PlanType
}) {
  const { profile, programs } = useAuth()
  const programIds = programs.map((p) => p.id)
  const { data, isPending } = usePlan(programId, fiscalYearId, type)
  const { data: labels } = useFinanceLabels({ programIds: [programId], fiscalYearId })
  const lookups = useProcurementLookups()
  const { data: funds = [] } = useMasterList('fund_sources')
  const { data: units = [] } = useMasterList('units')
  const { save, status } = usePlanMutations()
  const [draft, setDraft] = useState<Row[] | null>(null)

  const canWrite = canWriteProgram(profile, programIds, programId)
  const canManage = canManageProgram(profile, programIds, programId)
  const plan = data?.plan
  const editable = !!plan && plan.status === 'draft' && canWrite
  const saved: Row[] = useMemo(
    () => (data?.rows ?? []).map((r) => ({ ...r, _key: r.id }) as Row),
    [data],
  )
  const rows = draft ?? saved
  const dirty = draft !== null

  // Leaving with unsaved changes
  useEffect(() => {
    if (!dirty) return
    const h = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])
  const blocker = useBlocker(dirty)
  useEffect(() => {
    if (blocker.state === 'blocked') {
      if (window.confirm('Discard unsaved changes to this plan?')) blocker.proceed()
      else blocker.reset()
    }
  }, [blocker])

  const columns = useMemo<GridColumn<Row>[]>(() => {
    const opt = <T extends { id: string }>(list: T[], label: (x: T) => string) =>
      list.map((x) => ({ value: x.id, label: label(x) }))
    const actOpts = opt(labels?.activities ?? [], (a) => `${a.code} ${a.title}`)
    const pkgOpts = opt(labels?.packages ?? [], (p) => `${p.code} ${p.title}`)
    const ecOpts = opt(lookups.expenseClasses, (e) => String(e.code))
    const uacsOpts = opt(lookups.uacs, (u) => `${String(u.code)} ${String(u.name)}`)
    const fundOpts = opt(funds, (f) => String(f.code))
    const modeOpts = opt(lookups.modes, (m) => m.name)
    const unitOpts = opt(units, (u) => String(u.abbreviation ?? u.name))
    const money = (
      key: Extract<keyof Row, string>,
      header: string,
      width = 120,
    ): GridColumn<Row> => ({
      key,
      header,
      type: 'number',
      width,
      align: 'right',
      total: true,
    })
    const cols: GridColumn<Row>[] = [
      { key: 'description', header: 'Particulars *', type: 'text', width: 260, frozen: true },
      { key: 'activity_id', header: 'Activity', type: 'select', options: actOpts, width: 200 },
    ]
    if (type !== 'WFP')
      cols.push({
        key: 'package_id',
        header: 'Package',
        type: 'select',
        options: pkgOpts,
        width: 200,
      })
    cols.push({
      key: 'expense_class_id',
      header: 'Class',
      type: 'select',
      options: ecOpts,
      width: 80,
    })
    cols.push({
      key: 'uacs_code_id',
      header: 'UACS',
      type: 'select',
      options: uacsOpts,
      width: 170,
    })
    if (type === 'WFP')
      cols.push({
        key: 'fund_source_id',
        header: 'Fund',
        type: 'select',
        options: fundOpts,
        width: 80,
      })
    if (type !== 'WFP')
      cols.push({
        key: 'procurement_mode_id',
        header: 'Mode',
        type: 'select',
        options: modeOpts,
        width: 170,
      })
    cols.push(
      { key: 'unit_id', header: 'Unit', type: 'select', options: unitOpts, width: 80 },
      { key: 'quantity', header: 'Qty', type: 'number', width: 80, align: 'right' },
      money('unit_cost', 'Unit cost'),
      money('amount', 'Amount', 130),
    )
    if (type !== 'APP') {
      MONTH_KEYS.forEach((k, i) => cols.push(money(k, MONTHS[i], 100)))
      cols.push({
        key: 'remarks',
        header: 'Schedule check',
        type: 'text',
        width: 130,
        align: 'right',
        value: (r) => monthsTotal(r) - (Number(r.amount) || 0),
        format: (v) =>
          Number(v) === 0 ? '✓ balanced' : `${Number(v) > 0 ? '+' : ''}${formatPeso(Number(v))}`,
      } as GridColumn<Row>)
    }
    cols.push({ key: 'remarks', header: 'Remarks', type: 'text', width: 200 })
    // the schedule-check column reuses the remarks key for typing purposes; give it a unique key
    return cols.map((c, i) =>
      c.value ? { ...c, key: `__check${i}` as Extract<keyof Row, string> } : c,
    )
  }, [labels, lookups, funds, units, type])

  if (isPending) return <Skeleton className="h-[480px]" />
  if (!plan) {
    return (
      <EmptyState
        icon={FileSpreadsheetIcon}
        title={`No ${type} yet`}
        description="Someone who can edit this program's records needs to start it."
      />
    )
  }

  const total = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0)

  const doSave = async () => {
    try {
      const payload: PlanRowInput[] = normalize(rows)
        .filter((r) => r.description.trim() || Number(r.amount))
        .map(({ _key, ...r }) => {
          void _key
          return {
            ...r,
            id: saved.some((x) => x._key === r.id) ? r.id : undefined,
            description: r.description.trim() || '(no particulars)',
          }
        })
      await save.mutateAsync({ planId: plan.id, rows: payload })
      setDraft(null)
      toast.success(`${type} saved (${payload.length} rows)`)
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const setStatus = (next: 'submitted' | 'approved' | 'draft', ok: string) =>
    status
      .mutateAsync({ planId: plan.id, status: next })
      .then(() => toast.success(ok))
      .catch((e) => toast.error(errorMessage(e)))

  const exportXlsx = () => {
    const shown = columns.filter((c) => !c.value)
    return exportSheet(
      `PAYEW-${type}-${programs.find((p) => p.id === programId)?.code ?? ''}.xlsx`,
      type,
      shown.map((c) => c.header.replace(' *', '')),
      rows.map((r) =>
        shown.map((c) => {
          const v = r[c.key as keyof Row]
          if (c.type === 'select') return c.options?.find((o) => o.value === v)?.label ?? ''
          return (v as string | number | null | undefined) ?? ''
        }),
      ),
    )
  }

  const importXlsx = async (file: File) => {
    try {
      const [sheet] = await parseWorkbook(file)
      if (!sheet?.rows.length) throw new Error('The first sheet has no rows.')
      const shown = columns.filter((c) => !c.value)
      let bad = 0
      const imported = sheet.rows.map((raw) => {
        const r = blank()
        for (const c of shown) {
          const text = raw[c.header.replace(' *', '')] ?? raw[c.header]
          if (text === undefined || text === '') continue
          const v = parseCell(String(text), c)
          if (v === undefined) bad++
          else (r as Record<string, unknown>)[c.key] = v
        }
        return r
      })
      setDraft(normalize([...rows, ...imported.filter((r) => r.description)]))
      toast.success(`${imported.length} rows added from ${file.name} — review, then Save.`)
      if (bad) toast.warning(`${bad} cell(s) didn't match a list value and were left blank.`)
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const STATUS_BADGE = {
    draft: <Badge variant="outline">Draft</Badge>,
    submitted: (
      <Badge variant="outline" className="border-primary/40 text-primary gap-1">
        <SendIcon /> Submitted
      </Badge>
    ),
    approved: (
      <Badge variant="outline" className="border-success/40 text-success gap-1">
        <CheckCircle2Icon /> Approved
      </Badge>
    ),
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-0.5">
          <p className="flex items-center gap-2 text-sm font-medium">
            {type} {STATUS_BADGE[plan.status]}
            {dirty && <Badge variant="secondary">Unsaved changes</Badge>}
          </p>
          <p className="text-muted-foreground text-xs">
            {PLAN_INFO[type]} {rows.length} rows · {formatPeso(total)}
            {plan.approved_at && ` · approved ${formatDateTime(plan.approved_at)}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => void exportXlsx()}>
            <DownloadIcon /> Export
          </Button>
          {plan.status === 'draft' && canWrite && (
            <Button
              size="sm"
              variant="outline"
              disabled={dirty}
              onClick={() => void setStatus('submitted', `${type} submitted`)}
            >
              <SendIcon /> Submit
            </Button>
          )}
          {plan.status === 'submitted' && canManage && (
            <Button size="sm" onClick={() => void setStatus('approved', `${type} approved`)}>
              <CheckCircle2Icon /> Approve
            </Button>
          )}
          {plan.status !== 'draft' && canManage && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => void setStatus('draft', `${type} returned to draft`)}
            >
              <RotateCcwIcon /> {plan.status === 'approved' ? 'Reopen' : 'Return to draft'}
            </Button>
          )}
        </div>
      </div>

      <SpreadsheetGrid<Row>
        label={`${type} sheet`}
        columns={columns}
        rows={rows}
        onChange={editable ? (next) => setDraft(normalize(next)) : undefined}
        newRow={blank}
        getRowKey={(r) => r._key}
        rowWarning={(r) => {
          if (!r.description?.trim()) return 'Particulars are required'
          if (type === 'APP') return null
          const m = monthsTotal(r)
          return m > 0 && Math.abs(m - (Number(r.amount) || 0)) > 0.005
            ? `Monthly schedule (${formatPeso(m)}) ≠ amount (${formatPeso(r.amount)})`
            : null
        }}
        toolbar={
          editable && (
            <>
              <Button size="sm" variant="outline" asChild>
                <label className="cursor-pointer">
                  <UploadIcon /> Import
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      e.target.value = ''
                      if (f) void importXlsx(f)
                    }}
                  />
                </label>
              </Button>
              {dirty && (
                <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>
                  Discard
                </Button>
              )}
              <Button size="sm" disabled={!dirty || save.isPending} onClick={() => void doSave()}>
                {save.isPending ? <Loader2Icon className="animate-spin" /> : <SaveIcon />} Save
              </Button>
            </>
          )
        }
      />
      {!editable && plan.status !== 'draft' && (
        <p className="text-muted-foreground text-xs">
          This plan is {plan.status}.{' '}
          {canManage ? 'Reopen it to make changes.' : 'Ask a program admin to reopen it.'}
        </p>
      )}
    </div>
  )
}
