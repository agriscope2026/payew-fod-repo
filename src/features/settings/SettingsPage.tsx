import type { ReactNode } from 'react'
import {
  CalendarRangeIcon,
  DatabaseIcon,
  FolderKanbanIcon,
  GitBranchIcon,
  ListTreeIcon,
  SlidersHorizontalIcon,
  TagsIcon,
  type LucideIcon,
} from 'lucide-react'
import { Navigate, NavLink, Route, Routes } from 'react-router-dom'
import { PageHeader } from '@/components/layout/PageHeader'
import { useAuth } from '@/features/auth/auth-context'
import { cn } from '@/lib/utils'
import DataExportSettings from './pages/DataExportSettings'
import FiscalYearsSettings from './pages/FiscalYearsSettings'
import MasterListsSettings from './pages/MasterListsSettings'
import ProgramCategoriesSettings from './pages/ProgramCategoriesSettings'
import ProgramProfileSettings from './pages/ProgramProfileSettings'
import ProgramsSettings from './pages/ProgramsSettings'
import SystemSettings from './pages/SystemSettings'
import WorkflowSettings from './pages/WorkflowSettings'

interface Tab {
  path: string
  label: string
  icon: LucideIcon
  element: ReactNode
}

const SUPERADMIN_TABS: Tab[] = [
  { path: 'programs', label: 'Programs', icon: FolderKanbanIcon, element: <ProgramsSettings /> },
  {
    path: 'fiscal-years',
    label: 'Fiscal Years',
    icon: CalendarRangeIcon,
    element: <FiscalYearsSettings />,
  },
  {
    path: 'master-lists',
    label: 'Master Lists',
    icon: ListTreeIcon,
    element: <MasterListsSettings />,
  },
  {
    path: 'workflow',
    label: 'Workflow Template',
    icon: GitBranchIcon,
    element: <WorkflowSettings />,
  },
  { path: 'system', label: 'System', icon: SlidersHorizontalIcon, element: <SystemSettings /> },
  { path: 'data', label: 'Data Export', icon: DatabaseIcon, element: <DataExportSettings /> },
]

const PROGRAM_ADMIN_TABS: Tab[] = [
  {
    path: 'program',
    label: 'Program Profile',
    icon: FolderKanbanIcon,
    element: <ProgramProfileSettings />,
  },
  {
    path: 'categories',
    label: 'Activity Categories',
    icon: TagsIcon,
    element: <ProgramCategoriesSettings />,
  },
  { path: 'workflow', label: 'Workflow', icon: GitBranchIcon, element: <WorkflowSettings /> },
]

export default function SettingsPage() {
  const { isSuperadmin } = useAuth()
  const tabs = isSuperadmin ? SUPERADMIN_TABS : PROGRAM_ADMIN_TABS

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description={
          isSuperadmin
            ? 'Programs, fiscal years, master lists and system-wide configuration.'
            : 'Your program profile, categories and workflow.'
        }
      />
      <nav
        className="-mx-1 flex gap-1 overflow-x-auto border-b px-1"
        aria-label="Settings sections"
      >
        {tabs.map((t) => (
          <NavLink
            key={t.path}
            to={`/settings/${t.path}`}
            className={({ isActive }) =>
              cn(
                '-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-sm whitespace-nowrap transition-colors',
                isActive
                  ? 'border-primary text-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground border-transparent',
              )
            }
          >
            <t.icon className="size-4" />
            {t.label}
          </NavLink>
        ))}
      </nav>
      <Routes>
        <Route index element={<Navigate to={`/settings/${tabs[0].path}`} replace />} />
        {tabs.map((t) => (
          <Route key={t.path} path={`${t.path}/*`} element={t.element} />
        ))}
        <Route path="*" element={<Navigate to={`/settings/${tabs[0].path}`} replace />} />
      </Routes>
    </div>
  )
}
