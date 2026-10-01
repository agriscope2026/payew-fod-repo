import {
  ActivityIcon,
  BadgePercentIcon,
  ClipboardListIcon,
  HandCoinsIcon,
  LandmarkIcon,
  PackageSearchIcon,
  ReceiptIcon,
  ShieldCheckIcon,
  StarIcon,
  UsersIcon,
  type LucideIcon,
} from 'lucide-react'

export type ReportId =
  | 'bur'
  | 'accomplishment'
  | 'procurement'
  | 'supplier-performance'
  | 'supplier-awards'
  | 'savings'
  | 'payables'
  | 'beneficiaries'
  | 'compliance'

export interface ReportMeta {
  id: ReportId
  title: string
  description: string
  group: 'Finance' | 'Implementation' | 'Procurement'
  icon: LucideIcon
}

export const REPORTS: ReportMeta[] = [
  {
    id: 'bur',
    title: 'Budget Utilization Report',
    description:
      'Allotment, obligations and disbursements by expense class, with a drill-down by activity → package → supplier.',
    group: 'Finance',
    icon: LandmarkIcon,
  },
  {
    id: 'payables',
    title: 'Payables (delivered but unpaid)',
    description:
      'Accepted deliveries not yet paid, per package and supplier, with days outstanding.',
    group: 'Finance',
    icon: ReceiptIcon,
  },
  {
    id: 'savings',
    title: 'Procurement Savings Report',
    description: 'ABC vs contract amount per awarded package and whether the saving was confirmed.',
    group: 'Finance',
    icon: BadgePercentIcon,
  },
  {
    id: 'accomplishment',
    title: 'Physical & Financial Accomplishment',
    description:
      'Per activity: target, latest physical progress, budget, obligated, disbursed and status.',
    group: 'Implementation',
    icon: ActivityIcon,
  },
  {
    id: 'beneficiaries',
    title: 'Beneficiaries Served',
    description:
      'Farmers’ associations, cooperatives and farmers served this fiscal year, with membership by sector.',
    group: 'Implementation',
    icon: UsersIcon,
  },
  {
    id: 'compliance',
    title: 'Compliance Report',
    description:
      'Per program: on-schedule activities, progress reporting, directive responses, rates and plans.',
    group: 'Implementation',
    icon: ShieldCheckIcon,
  },
  {
    id: 'procurement',
    title: 'Procurement Status Report',
    description:
      'Every package: category, mode, supplier, ABC, contract, current step, status and days late.',
    group: 'Procurement',
    icon: PackageSearchIcon,
  },
  {
    id: 'supplier-performance',
    title: 'Supplier Performance Report',
    description: 'Packages closed on time, late and rejected deliveries, and ratings per supplier.',
    group: 'Procurement',
    icon: StarIcon,
  },
  {
    id: 'supplier-awards',
    title: 'Supplier Awards & Payments',
    description: 'Contract amounts awarded, obligated, accepted and paid per supplier.',
    group: 'Procurement',
    icon: HandCoinsIcon,
  },
]

export const REPORT_GROUPS = ['Finance', 'Implementation', 'Procurement'] as const
export const ReportsIcon = ClipboardListIcon
