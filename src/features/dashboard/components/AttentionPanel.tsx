import {
  AlarmClockIcon,
  CheckCircle2Icon,
  ChevronRightIcon,
  ClipboardCheckIcon,
  FileWarningIcon,
  FlagIcon,
  GavelIcon,
  ListTodoIcon,
  PiggyBankIcon,
  ReceiptIcon,
  ScrollTextIcon,
  ShieldAlertIcon,
  type LucideIcon,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import type { DashboardSummary } from '@/types/database'
import { Panel } from './Panel'

type Key = keyof DashboardSummary['attention']

const ITEMS: {
  key: Key
  label: (n: number) => string
  icon: LucideIcon
  to?: string
  urgent?: boolean
}[] = [
  {
    key: 'my_directives',
    label: (n) => `Directive${n === 1 ? '' : 's'} waiting for your response`,
    icon: ScrollTextIcon,
    to: '/directives',
    urgent: true,
  },
  {
    key: 'approvals_to_decide',
    label: (n) => `Approval request${n === 1 ? '' : 's'} to decide`,
    icon: GavelIcon,
    to: '/approvals',
  },
  {
    key: 'my_overdue_stages',
    label: (n) => `Overdue workflow stage${n === 1 ? '' : 's'} assigned to you`,
    icon: AlarmClockIcon,
    to: '/activities',
    urgent: true,
  },
  {
    key: 'my_overdue_tasks',
    label: (n) => `Overdue checklist task${n === 1 ? '' : 's'} assigned to you`,
    icon: ListTodoIcon,
    to: '/activities',
  },
  {
    key: 'critical_issues',
    label: (n) => `Open high/critical issue${n === 1 ? '' : 's'} & risks`,
    icon: ShieldAlertIcon,
    urgent: true,
  },
  {
    key: 'overdue_issues',
    label: (n) => `Issue${n === 1 ? '' : 's'} past the target date`,
    icon: FlagIcon,
  },
  {
    key: 'old_payables',
    label: (n) => `Package${n === 1 ? '' : 's'} with accepted deliveries unpaid 7+ days`,
    icon: ReceiptIcon,
    to: '/finance?tab=payables',
  },
  {
    key: 'flagged_records',
    label: (n) => `Flagged finance record${n === 1 ? '' : 's'} (validation warnings)`,
    icon: FileWarningIcon,
    to: '/finance?tab=ors',
  },
  {
    key: 'plans_to_approve',
    label: (n) => `WFP/PPMP/APP plan${n === 1 ? '' : 's'} submitted for approval`,
    icon: ClipboardCheckIcon,
    to: '/finance?tab=plans',
  },
  {
    key: 'savings_to_confirm',
    label: (n) => `Procurement saving${n === 1 ? '' : 's'} to confirm`,
    icon: PiggyBankIcon,
    to: '/finance?tab=savings',
  },
  {
    key: 'supplier_docs',
    label: (n) => `Supplier${n === 1 ? '' : 's'} with open packages and expired/expiring papers`,
    icon: FileWarningIcon,
    to: '/suppliers',
  },
]

/** The caller's to-do counts; only non-zero items are listed. */
export function AttentionPanel({ attention }: { attention: DashboardSummary['attention'] }) {
  const items = ITEMS.filter((i) => Number(attention[i.key]) > 0)
  return (
    <Panel title="Needs attention" description="Items waiting on you or your programs.">
      {items.length === 0 ? (
        <p className="text-success flex items-center gap-2 text-sm">
          <CheckCircle2Icon className="size-4" /> All clear. Nothing needs your attention.
        </p>
      ) : (
        <ul className="-mx-2 divide-y">
          {items.map((i) => {
            const n = Number(attention[i.key])
            const body = (
              <>
                <span
                  className={cn(
                    'flex size-7 shrink-0 items-center justify-center rounded-md',
                    i.urgent ? 'bg-destructive/10 text-destructive' : 'bg-muted text-foreground',
                  )}
                >
                  <i.icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1 text-sm">{i.label(n)}</span>
                <strong className="tabular-nums">{n}</strong>
                {i.to && <ChevronRightIcon className="text-muted-foreground size-4" />}
              </>
            )
            return (
              <li key={i.key}>
                {i.to ? (
                  <Link
                    to={i.to}
                    className="hover:bg-muted/60 flex items-center gap-3 rounded-md px-2 py-2"
                  >
                    {body}
                  </Link>
                ) : (
                  <div className="flex items-center gap-3 px-2 py-2">{body}</div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}
