import { lazy, type ReactNode } from 'react'
import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { NAV } from '@/components/layout/nav-config'
import { RequireAuth, RequireRole } from '@/features/auth/guards'
import AccountPasswordPage from '@/features/auth/pages/AccountPasswordPage'
import ChangePasswordPage from '@/features/auth/pages/ChangePasswordPage'
import ForgotPasswordPage from '@/features/auth/pages/ForgotPasswordPage'
import LoginPage from '@/features/auth/pages/LoginPage'
import ResetPasswordPage from '@/features/auth/pages/ResetPasswordPage'
import ComingSoonPage from '@/features/placeholders/ComingSoonPage'
import { WorkspaceProvider } from '@/features/workspace/WorkspaceProvider'
import NotFoundPage from '@/pages/NotFoundPage'

// Module pages are code-split; AppShell wraps the outlet in <Suspense>.
const DashboardPage = lazy(() => import('@/features/dashboard/DashboardPage'))
const NotificationsPage = lazy(() => import('@/features/notifications/pages/NotificationsPage'))
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage'))
const UsersPage = lazy(() => import('@/features/users/UsersPage'))
const RepositoryPage = lazy(() => import('@/features/files/RepositoryPage'))
const BeneficiariesModule = lazy(() => import('@/features/beneficiaries/BeneficiariesModule'))
const ActivitiesModule = lazy(() => import('@/features/activities/ActivitiesModule'))
const DirectivesModule = lazy(() => import('@/features/directives/DirectivesModule'))
const SuppliersModule = lazy(() => import('@/features/suppliers/SuppliersModule'))
const FinancePage = lazy(() => import('@/features/finance/FinancePage'))
const ApprovalsModule = lazy(() => import('@/features/approvals/ApprovalsModule'))
const TasksPage = lazy(() => import('@/features/tasks/TasksPage'))
const CalendarPage = lazy(() => import('@/features/calendar/CalendarPage'))
const ReportsModule = lazy(() => import('@/features/reports/ReportsModule'))
const AnnouncementsModule = lazy(() => import('@/features/announcements/AnnouncementsModule'))
const AuditLogPage = lazy(() => import('@/features/audit/AuditLogPage'))
const TrashPage = lazy(() => import('@/features/trash/TrashPage'))
const GuidePage = lazy(() => import('@/features/guide/GuidePage'))
const ProfilePage = lazy(() => import('@/features/profile/ProfilePage'))

const BUILT: Record<string, ReactNode> = {
  '/dashboard': <DashboardPage />,
  '/notifications': <NotificationsPage />,
  '/settings': <SettingsPage />,
  '/users': <UsersPage />,
  '/repository': <RepositoryPage />,
  '/beneficiaries': <BeneficiariesModule />,
  '/activities': <ActivitiesModule />,
  '/directives': <DirectivesModule />,
  '/suppliers': <SuppliersModule />,
  '/finance': <FinancePage />,
  '/approvals': <ApprovalsModule />,
  '/tasks': <TasksPage />,
  '/calendar': <CalendarPage />,
  '/reports': <ReportsModule />,
  '/announcements': <AnnouncementsModule />,
  '/audit-logs': <AuditLogPage />,
  '/trash': <TrashPage />,
  '/guide': <GuidePage />,
}

// Every nav item gets a route now; unbuilt modules render a placeholder.
// Role restrictions from nav-config are enforced on the route as well as hidden in the menu.
const moduleRoutes = NAV.flatMap((s) => s.items).map((item) => {
  const element = BUILT[item.to] ?? <ComingSoonPage />
  return {
    path: `${item.to.slice(1)}/*`,
    element: item.roles ? <RequireRole roles={item.roles}>{element}</RequireRole> : element,
  }
})

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/reset-password', element: <ResetPasswordPage /> },
  {
    element: <RequireAuth />,
    children: [
      { path: '/change-password', element: <ChangePasswordPage /> },
      {
        element: (
          <WorkspaceProvider>
            <Outlet />
          </WorkspaceProvider>
        ),
        children: [
          {
            element: <AppShell />,
            children: [
              { index: true, element: <Navigate to="/dashboard" replace /> },
              ...moduleRoutes,
              { path: 'account/password', element: <AccountPasswordPage /> },
              { path: 'profile', element: <ProfilePage /> },
              { path: '*', element: <NotFoundPage /> },
            ],
          },
        ],
      },
    ],
  },
])
