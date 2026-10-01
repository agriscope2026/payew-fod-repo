import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type {
  AllotmentRow,
  DeliveryItemRow,
  DeliveryRow,
  DisbursementLinkRow,
  DisbursementRow,
  FinancePlanLine,
  Json,
  PlanStatus,
  PlanType,
  SaveResult,
  SavingsStatus,
} from '@/types/database'

export const financeKey = ['finance'] as const

/** Filters shared by the registers (program/FY from the workspace selector). */
export interface FinanceScope {
  programIds: string[]
  fiscalYearId: string | null
}

const enabled = (s: FinanceScope) => s.programIds.length > 0 && !!s.fiscalYearId

export function useProgramFinance(scope: FinanceScope) {
  return useQuery({
    queryKey: [...financeKey, 'program', scope],
    enabled: enabled(scope),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_program_finance')
        .select('*')
        .in('program_id', scope.programIds)
        .eq('fiscal_year_id', scope.fiscalYearId!)
      if (error) throw error
      return data
    },
  })
}

export function useActivityFinanceList(scope: FinanceScope) {
  return useQuery({
    queryKey: [...financeKey, 'activities', scope],
    enabled: enabled(scope),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_activity_financials')
        .select('*')
        .in('program_id', scope.programIds)
        .eq('fiscal_year_id', scope.fiscalYearId!)
        .order('code')
      if (error) throw error
      return data
    },
  })
}

export function useActivityFinance(activityId: string | undefined) {
  return useQuery({
    queryKey: [...financeKey, 'activity', activityId],
    enabled: !!activityId,
    queryFn: async () => {
      const [summary, packages] = await Promise.all([
        supabase
          .from('v_activity_financials')
          .select('*')
          .eq('activity_id', activityId!)
          .maybeSingle(),
        supabase
          .from('v_package_financial_summary')
          .select('*')
          .eq('activity_id', activityId!)
          .order('code'),
      ])
      if (summary.error) throw summary.error
      if (packages.error) throw packages.error
      return { summary: summary.data, packages: packages.data }
    },
  })
}

export type DeliveryWithItems = DeliveryRow & { items: DeliveryItemRow[] }
export type DisbursementWithLinks = DisbursementRow & { links: DisbursementLinkRow[] }

async function withLinks(dvs: DisbursementRow[]): Promise<DisbursementWithLinks[]> {
  if (!dvs.length) return []
  const { data, error } = await supabase
    .from('disbursement_obligations')
    .select('*')
    .in(
      'disbursement_id',
      dvs.map((d) => d.id),
    )
  if (error) throw error
  return dvs.map((d) => ({ ...d, links: data.filter((l) => l.disbursement_id === d.id) }))
}

export function usePackageFinance(packageId: string | undefined) {
  return useQuery({
    queryKey: [...financeKey, 'package', packageId],
    enabled: !!packageId,
    queryFn: async () => {
      const [summary, ors, deliveries, dvs] = await Promise.all([
        supabase
          .from('v_package_financial_summary')
          .select('*')
          .eq('package_id', packageId!)
          .maybeSingle(),
        supabase.from('obligations').select('*').eq('package_id', packageId!).order('ors_date'),
        supabase
          .from('package_deliveries')
          .select('*')
          .eq('package_id', packageId!)
          .order('delivery_no'),
        supabase.from('disbursements').select('*').eq('package_id', packageId!).order('dv_date'),
      ])
      if (summary.error) throw summary.error
      if (ors.error) throw ors.error
      if (deliveries.error) throw deliveries.error
      if (dvs.error) throw dvs.error
      let items: DeliveryItemRow[] = []
      if (deliveries.data.length) {
        const r = await supabase
          .from('package_delivery_items')
          .select('*')
          .in(
            'delivery_id',
            deliveries.data.map((d) => d.id),
          )
          .order('sort_order')
        if (r.error) throw r.error
        items = r.data
      }
      return {
        summary: summary.data,
        obligations: ors.data,
        deliveries: deliveries.data.map((d) => ({
          ...d,
          items: items.filter((i) => i.delivery_id === d.id),
        })) as DeliveryWithItems[],
        disbursements: await withLinks(dvs.data),
      }
    },
  })
}

/** Activity-level (non-procurement) ORS and DV. */
export function useDirectExpenses(activityId: string | undefined) {
  return useQuery({
    queryKey: [...financeKey, 'direct', activityId],
    enabled: !!activityId,
    queryFn: async () => {
      const [ors, dvs] = await Promise.all([
        supabase
          .from('obligations')
          .select('*')
          .eq('activity_id', activityId!)
          .is('package_id', null)
          .order('ors_date'),
        supabase
          .from('disbursements')
          .select('*')
          .eq('activity_id', activityId!)
          .is('package_id', null)
          .order('dv_date'),
      ])
      if (ors.error) throw ors.error
      if (dvs.error) throw dvs.error
      return { obligations: ors.data, disbursements: await withLinks(dvs.data) }
    },
  })
}

/** Registers: ORS / DV across the selected programs and year. */
export function useObligations(scope: FinanceScope) {
  return useQuery({
    queryKey: [...financeKey, 'ors', scope],
    enabled: enabled(scope),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('obligations')
        .select('*')
        .in('program_id', scope.programIds)
        .eq('fiscal_year_id', scope.fiscalYearId!)
        .order('ors_date', { ascending: false })
        .range(0, 4999)
      if (error) throw error
      return data
    },
  })
}

export function useDisbursements(scope: FinanceScope) {
  return useQuery({
    queryKey: [...financeKey, 'dv', scope],
    enabled: enabled(scope),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('disbursements')
        .select('*')
        .in('program_id', scope.programIds)
        .eq('fiscal_year_id', scope.fiscalYearId!)
        .order('dv_date', { ascending: false })
        .range(0, 4999)
      if (error) throw error
      return withLinks(data)
    },
  })
}

/** Codes/titles of the activities and packages in scope (labels for registers and plan tags). */
export function useFinanceLabels(scope: FinanceScope) {
  return useQuery({
    queryKey: [...financeKey, 'labels', scope],
    enabled: enabled(scope),
    staleTime: 60_000,
    queryFn: async () => {
      const [acts, pkgs] = await Promise.all([
        supabase
          .from('activities')
          .select('id, code, title, program_id, budget_amount')
          .in('program_id', scope.programIds)
          .eq('fiscal_year_id', scope.fiscalYearId!)
          .is('deleted_at', null)
          .order('code'),
        supabase
          .from('procurement_packages')
          .select(
            'id, code, title, activity_id, program_id, status, supplier_id, abc_amount, contract_amount',
          )
          .in('program_id', scope.programIds)
          .eq('fiscal_year_id', scope.fiscalYearId!)
          .is('deleted_at', null)
          .order('code'),
      ])
      if (acts.error) throw acts.error
      if (pkgs.error) throw pkgs.error
      return { activities: acts.data, packages: pkgs.data }
    },
  })
}

export function usePayables(scope: FinanceScope) {
  return useQuery({
    queryKey: [...financeKey, 'payables', scope],
    enabled: enabled(scope),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_payables')
        .select('*')
        .in('program_id', scope.programIds)
        .eq('fiscal_year_id', scope.fiscalYearId!)
        .order('days_outstanding', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export function useSavings(scope: FinanceScope) {
  return useQuery({
    queryKey: [...financeKey, 'savings', scope],
    enabled: enabled(scope),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('savings_entries')
        .select('*')
        .in('program_id', scope.programIds)
        .eq('fiscal_year_id', scope.fiscalYearId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export function useAllotments(scope: FinanceScope) {
  return useQuery({
    queryKey: [...financeKey, 'allotments', scope],
    enabled: enabled(scope),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('allotments')
        .select('*')
        .in('program_id', scope.programIds)
        .eq('fiscal_year_id', scope.fiscalYearId!)
        .is('deleted_at', null)
        .order('allotment_date')
      if (error) throw error
      return data
    },
  })
}

/** The plan sheet of one program/year/type (created on first open for writers). */
export function usePlan(programId: string | null, fiscalYearId: string | null, type: PlanType) {
  return useQuery({
    queryKey: [...financeKey, 'plan', programId, fiscalYearId, type],
    enabled: !!programId && !!fiscalYearId,
    queryFn: async () => {
      const { data: id, error } = await supabase.rpc('ensure_finance_plan', {
        p_program_id: programId!,
        p_fiscal_year_id: fiscalYearId!,
        p_plan_type: type,
      })
      if (error) throw error
      if (!id) return null
      const [plan, rows] = await Promise.all([
        supabase.from('finance_plans').select('*').eq('id', id).single(),
        supabase
          .from('finance_plan_rows')
          .select('*')
          .eq('plan_id', id)
          .order('sort_order')
          .range(0, 2999),
      ])
      if (plan.error) throw plan.error
      if (rows.error) throw rows.error
      return { plan: plan.data, rows: rows.data }
    },
  })
}

function useInvalidate() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: financeKey }),
      queryClient.invalidateQueries({ queryKey: ['packages'] }),
    ])
}

export type PlanRowInput = Partial<
  Omit<FinancePlanLine, 'plan_id' | 'program_id' | 'fiscal_year_id'>
> & {
  description: string
}

export function usePlanMutations() {
  const invalidate = useInvalidate()
  const save = useMutation({
    mutationFn: async ({ planId, rows }: { planId: string; rows: PlanRowInput[] }) => {
      const { data, error } = await supabase.rpc('save_plan_rows', {
        p_plan_id: planId,
        p_rows: rows as unknown as Json,
      })
      if (error) throw error
      return data
    },
    onSuccess: invalidate,
  })
  const status = useMutation({
    mutationFn: async (v: { planId: string; status: PlanStatus; remarks?: string }) => {
      const { error } = await supabase.rpc('set_plan_status', {
        p_plan_id: v.planId,
        p_status: v.status,
        p_remarks: v.remarks ?? null,
      })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
  return { save, status }
}

export function useFinanceMutations() {
  const invalidate = useInvalidate()
  const saveObligation = useMutation({
    mutationFn: async (p: Record<string, unknown>) => {
      const { data, error } = await supabase.rpc('save_obligation', { p: p as Json })
      if (error) throw error
      return data as SaveResult
    },
    onSuccess: invalidate,
  })
  const cancelObligation = useMutation({
    mutationFn: async (v: { id: string; reason: string }) => {
      const { error } = await supabase.rpc('cancel_obligation', { p_id: v.id, p_reason: v.reason })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
  const saveDelivery = useMutation({
    mutationFn: async (v: { p: Record<string, unknown>; items: Record<string, unknown>[] }) => {
      const { data, error } = await supabase.rpc('save_delivery', {
        p: v.p as Json,
        p_items: v.items as unknown as Json,
      })
      if (error) throw error
      return data as SaveResult
    },
    onSuccess: invalidate,
  })
  const deleteDelivery = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('delete_delivery', { p_id: id })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
  const saveDisbursement = useMutation({
    mutationFn: async (v: {
      p: Record<string, unknown>
      links: { obligation_id: string; amount: number }[]
    }) => {
      const { data, error } = await supabase.rpc('save_disbursement', {
        p: v.p as Json,
        p_links: v.links as unknown as Json,
      })
      if (error) throw error
      return data as SaveResult
    },
    onSuccess: invalidate,
  })
  const cancelDisbursement = useMutation({
    mutationFn: async (v: { id: string; reason: string }) => {
      const { error } = await supabase.rpc('cancel_disbursement', {
        p_id: v.id,
        p_reason: v.reason,
      })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
  const decideSavings = useMutation({
    mutationFn: async (v: { id: string; status: SavingsStatus; remarks?: string }) => {
      const { error } = await supabase.rpc('decide_savings', {
        p_id: v.id,
        p_status: v.status,
        p_remarks: v.remarks ?? null,
      })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
  const saveAllotment = useMutation({
    mutationFn: async (
      a: Pick<
        AllotmentRow,
        | 'program_id'
        | 'fiscal_year_id'
        | 'kind'
        | 'allotment_no'
        | 'allotment_date'
        | 'fund_source_id'
        | 'expense_class_id'
        | 'uacs_code_id'
        | 'amount'
        | 'remarks'
      > & { id?: string },
    ) => {
      const { id, program_id, fiscal_year_id, ...fields } = a
      const { error } = id
        ? await supabase.from('allotments').update(fields).eq('id', id)
        : await supabase.from('allotments').insert({ program_id, fiscal_year_id, ...fields })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
  const removeAllotment = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('allotments')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
        .select('id')
      if (error) throw error
      if (!data.length) throw new Error('Only program admins can remove allotments.')
    },
    onSuccess: invalidate,
  })
  return {
    saveObligation,
    cancelObligation,
    saveDelivery,
    deleteDelivery,
    saveDisbursement,
    cancelDisbursement,
    decideSavings,
    saveAllotment,
    removeAllotment,
  }
}
