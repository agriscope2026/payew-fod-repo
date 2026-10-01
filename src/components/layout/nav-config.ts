import {
  BellIcon,
  BookOpenIcon,
  CalendarDaysIcon,
  ClipboardCheckIcon,
  FileSpreadsheetIcon,
  FolderOpenIcon,
  HistoryIcon,
  InboxIcon,
  LayoutDashboardIcon,
  ListChecksIcon,
  MegaphoneIcon,
  PieChartIcon,
  ScrollTextIcon,
  SettingsIcon,
  SproutIcon,
  StoreIcon,
  Trash2Icon,
  UsersIcon,
  type LucideIcon,
} from 'lucide-react'
import type { AppRole } from '@/types/database'

export interface NavItem {
  label: string
  to: string
  icon: LucideIcon
  /** Omit = every role. */
  roles?: readonly AppRole[]
  /** Build phase that delivers the page (for placeholders). */
  phase: number
  description: string
  keywords?: string
}

export interface NavSection {
  title: string
  items: NavItem[]
}

const ADMINS = ['superadmin', 'program_admin'] as const
const SUPER = ['superadmin'] as const

export const NAV: NavSection[] = [
  {
    title: 'Overview',
    items: [
      {
        label: 'Dashboard',
        to: '/dashboard',
        icon: LayoutDashboardIcon,
        phase: 9,
        description: 'Budget, obligation, disbursement and activity status at a glance.',
      },
      {
        label: 'My Tasks',
        to: '/tasks',
        icon: InboxIcon,
        phase: 10,
        description:
          'Stage tasks, directives needing response and pending approvals assigned to you.',
        keywords: 'inbox assigned',
      },
      {
        label: 'Directives',
        to: '/directives',
        icon: ScrollTextIcon,
        phase: 6,
        description: 'Instructions and overdue notices to acknowledge and respond to.',
        keywords: 'overdue notice memo instruction response',
      },
      {
        label: 'Notifications',
        to: '/notifications',
        icon: BellIcon,
        phase: 1,
        description: 'Comments, mentions, directives, assignments, deadlines and escalations.',
      },
    ],
  },
  {
    title: 'Programs',
    items: [
      {
        label: 'Activities',
        to: '/activities',
        icon: ListChecksIcon,
        phase: 5,
        description: 'Activities, workflow stages, progress, issues and risks.',
        keywords: 'workflow kanban stages',
      },
      {
        label: 'Finance',
        to: '/finance',
        icon: FileSpreadsheetIcon,
        phase: 7,
        description:
          'PPMP, WFP, APP sheets, allotments, obligations (ORS), disbursements (DV), savings.',
        keywords: 'ppmp wfp app ors dv budget obligation disbursement',
      },
      {
        label: 'Beneficiaries',
        to: '/beneficiaries',
        icon: SproutIcon,
        phase: 4,
        description: "Farmers' associations, cooperatives and individual farmers served.",
        keywords: 'fa coop farmers associations',
      },
      {
        label: 'Suppliers',
        to: '/suppliers',
        icon: StoreIcon,
        phase: 6,
        description: 'Shared supplier list: PhilGEPS/permits, packages awarded, performance.',
        keywords: 'vendor contractor philgeps tin blacklist',
      },
      {
        label: 'Calendar',
        to: '/calendar',
        icon: CalendarDaysIcon,
        phase: 10,
        description: 'Implementation dates, due dates, deliveries and deadlines.',
      },
      {
        label: 'Approvals',
        to: '/approvals',
        icon: ClipboardCheckIcon,
        phase: 8,
        description: 'Extensions, realignments, stage skips, cancellations and workflow changes.',
        keywords: 'requests extension realignment',
      },
      {
        label: 'Reports',
        to: '/reports',
        icon: PieChartIcon,
        phase: 10,
        description:
          'BUR, physical & financial accomplishment, procurement, beneficiaries, compliance.',
        keywords: 'bur utilization accomplishment',
      },
      {
        label: 'Documents',
        to: '/repository',
        icon: FolderOpenIcon,
        phase: 3,
        description: 'Central file library: PPMP, WFP, APP, ORS, DV, contracts, reports, photos.',
        keywords: 'files repository attachments',
      },
      {
        label: 'Announcements',
        to: '/announcements',
        icon: MegaphoneIcon,
        phase: 11,
        description: 'Memos and reminders from the FOD.',
        keywords: 'bulletin memo',
      },
    ],
  },
  {
    title: 'Administration',
    items: [
      {
        label: 'Users',
        to: '/users',
        icon: UsersIcon,
        roles: ADMINS,
        phase: 2,
        description: 'Create accounts, reset passwords, activate or deactivate users.',
        keywords: 'accounts staff admins',
      },
      {
        label: 'Settings',
        to: '/settings',
        icon: SettingsIcon,
        roles: ADMINS,
        phase: 2,
        description:
          'Programs, fiscal years, master lists, workflow templates and system configuration.',
        keywords: 'programs fiscal years master lists workflow',
      },
      {
        label: 'Audit Log',
        to: '/audit-logs',
        icon: HistoryIcon,
        roles: SUPER,
        phase: 11,
        description: 'Who changed what and when.',
      },
      {
        label: 'Trash',
        to: '/trash',
        icon: Trash2Icon,
        roles: ADMINS,
        phase: 11,
        description: 'Restore deleted records and archived programs or fiscal years.',
        keywords: 'archive restore deleted',
      },
    ],
  },
  {
    title: 'Help',
    items: [
      {
        label: 'User Guide',
        to: '/guide',
        icon: BookOpenIcon,
        phase: 11,
        description: 'Tutorials, FAQs and the glossary (PPMP, WFP, APP, ORS, DV, UACS…).',
        keywords: 'help documentation glossary',
      },
    ],
  },
]

export const ALL_NAV_ITEMS = NAV.flatMap((s) => s.items)

export function navForRole(role: AppRole | null): NavSection[] {
  return NAV.map((section) => ({
    ...section,
    items: section.items.filter((i) => !i.roles || (role && i.roles.includes(role))),
  })).filter((s) => s.items.length > 0)
}
