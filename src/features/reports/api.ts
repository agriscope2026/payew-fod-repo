import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export const reportsKey = ['reports'] as const

export interface ReportScope {
  programIds: string[]
  fiscalYearId: string | null
}

const ready = (s: ReportScope) => s.programIds.length > 0 && !!s.fiscalYearId

function check<T>(r: { data: T | null; error: unknown }): T {
  if (r.error) throw r.error
  return r.data as T
}

/** Budget Utilization: by expense class, and activity → package → supplier. */
export function useBurReport(s: ReportScope) {
  return useQuery({
    queryKey: [...reportsKey, 'bur', s],
    enabled: ready(s),
    queryFn: async () => {
      const [classes, activities, packages, money] = await Promise.all([
        supabase
          .from('v_program_finance')
          .select('*')
          .in('program_id', s.programIds)
          .eq('fiscal_year_id', s.fiscalYearId!),
        supabase
          .from('v_activity_financials')
          .select('*')
          .in('program_id', s.programIds)
          .eq('fiscal_year_id', s.fiscalYearId!)
          .order('code'),
        supabase
          .from('v_packages')
          .select('id, activity_id, code, title, status, supplier_name, category_name')
          .in('program_id', s.programIds)
          .eq('fiscal_year_id', s.fiscalYearId!)
          .is('deleted_at', null)
          .neq('status', 'cancelled')
          .order('code'),
        supabase
          .from('v_package_financial_summary')
          .select('package_id, abc_amount, contract_amount, obligated, accepted, disbursed')
          .in('program_id', s.programIds)
          .eq('fiscal_year_id', s.fiscalYearId!),
      ])
      const fin = new Map(check(money).map((m) => [m.package_id, m]))
      return {
        classes: check(classes),
        activities: check(activities),
        packages: check(packages).map((p) => ({ ...p, ...fin.get(p.id)! })),
      }
    },
  })
}

/** Physical & financial accomplishment per activity. */
export function useAccomplishmentReport(s: ReportScope) {
  return useQuery({
    queryKey: [...reportsKey, 'accomplishment', s],
    enabled: ready(s),
    queryFn: async () => {
      const [acts, fin, prog] = await Promise.all([
        supabase
          .from('v_activities')
          .select('*')
          .in('program_id', s.programIds)
          .eq('fiscal_year_id', s.fiscalYearId!)
          .is('deleted_at', null)
          .neq('status', 'cancelled')
          .order('code'),
        supabase
          .from('v_activity_financials')
          .select('activity_id, obligated, disbursed, utilization_pct')
          .in('program_id', s.programIds)
          .eq('fiscal_year_id', s.fiscalYearId!),
        supabase
          .from('v_activity_progress')
          .select('*')
          .in('program_id', s.programIds)
          .eq('fiscal_year_id', s.fiscalYearId!),
      ])
      const f = new Map(check(fin).map((x) => [x.activity_id, x]))
      const p = new Map(check(prog).map((x) => [x.activity_id, x]))
      return check(acts).map((a) => ({ ...a, fin: f.get(a.id), progress: p.get(a.id) }))
    },
  })
}

/** Procurement Status per package (with its money). */
export function useProcurementReport(s: ReportScope) {
  return useQuery({
    queryKey: [...reportsKey, 'procurement', s],
    enabled: ready(s),
    queryFn: async () => {
      const [pkgs, money] = await Promise.all([
        supabase
          .from('v_packages')
          .select('*')
          .in('program_id', s.programIds)
          .eq('fiscal_year_id', s.fiscalYearId!)
          .is('deleted_at', null)
          .order('code'),
        supabase
          .from('v_package_financial_summary')
          .select('package_id, obligated, accepted, disbursed, delivered_unpaid')
          .in('program_id', s.programIds)
          .eq('fiscal_year_id', s.fiscalYearId!),
      ])
      const fin = new Map(check(money).map((m) => [m.package_id, m]))
      return check(pkgs).map((p) => ({ ...p, fin: fin.get(p.id) }))
    },
  })
}

/** Procurement savings: ABC vs contract per awarded package, with the savings decision. */
export function useSavingsReport(s: ReportScope) {
  return useQuery({
    queryKey: [...reportsKey, 'savings', s],
    enabled: ready(s),
    queryFn: async () => {
      const [pkgs, entries] = await Promise.all([
        supabase
          .from('v_packages')
          .select('*')
          .in('program_id', s.programIds)
          .eq('fiscal_year_id', s.fiscalYearId!)
          .is('deleted_at', null)
          .neq('status', 'cancelled')
          .not('contract_amount', 'is', null)
          .order('code'),
        supabase
          .from('savings_entries')
          .select('package_id, status, amount')
          .in('program_id', s.programIds)
          .eq('fiscal_year_id', s.fiscalYearId!)
          .eq('source', 'procurement'),
      ])
      const byPkg = new Map(check(entries).map((e) => [e.package_id, e]))
      return check(pkgs).map((p) => ({ ...p, entry: byPkg.get(p.id) }))
    },
  })
}

export function usePayablesReport(s: ReportScope) {
  return useQuery({
    queryKey: [...reportsKey, 'payables', s],
    enabled: ready(s),
    queryFn: async () =>
      check(
        await supabase
          .from('v_payables')
          .select('*')
          .in('program_id', s.programIds)
          .eq('fiscal_year_id', s.fiscalYearId!)
          .order('days_outstanding', { ascending: false }),
      ),
  })
}

export function useSupplierReport(s: ReportScope) {
  return useQuery({
    queryKey: [...reportsKey, 'suppliers', s],
    enabled: ready(s),
    queryFn: async () =>
      check(
        await supabase.rpc('report_suppliers', {
          p_fiscal_year_id: s.fiscalYearId!,
          p_program_ids: s.programIds,
        }),
      ),
  })
}

export function useBeneficiaryReport(s: ReportScope) {
  return useQuery({
    queryKey: [...reportsKey, 'beneficiaries', s],
    enabled: ready(s),
    queryFn: async () =>
      check(
        await supabase.rpc('report_beneficiaries', {
          p_fiscal_year_id: s.fiscalYearId!,
          p_program_ids: s.programIds,
        }),
      ),
  })
}
