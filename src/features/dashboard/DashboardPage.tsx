import {
  ArrowRightIcon,
  BellIcon,
  CalendarRangeIcon,
  FolderKanbanIcon,
  ShieldCheckIcon,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/features/auth/auth-context'
import { ROLE_LABELS } from '@/features/auth/permissions'
import { useUnreadCount } from '@/features/notifications/api'
import { useWorkspace } from '@/features/workspace/workspace-context'
import { formatDate, formatDateTime } from '@/lib/format'

/**
 * Phase 1 dashboard: confirms identity, scope and filters. KPI cards and charts
 * (driven by SQL views/RPCs) replace the roadmap card in Phase 9.
 */
export default function DashboardPage() {
  const { profile, role } = useAuth()
  const { fiscalYear, programFilter, programs, selectedProgramIds } = useWorkspace()
  const { data: unread = 0 } = useUnreadCount()
  const scope = programs.filter((p) => selectedProgramIds.includes(p.id))
  const firstName = profile?.full_name.split(' ')[0]

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Magandang araw, ${firstName}!`}
        description={`${fiscalYear?.label ?? 'No fiscal year'} · ${
          programFilter === 'all' ? 'All programs' : scope.map((p) => p.code).join(', ')
        }`}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={ShieldCheckIcon} label="Your role" value={role ? ROLE_LABELS[role] : '—'} />
        <StatCard
          icon={FolderKanbanIcon}
          label="Programs in scope"
          value={String(scope.length)}
          hint={scope.map((p) => p.code).join(' · ')}
        />
        <StatCard
          icon={CalendarRangeIcon}
          label="Fiscal year"
          value={fiscalYear?.label ?? '—'}
          hint={
            fiscalYear
              ? `${formatDate(fiscalYear.start_date)} – ${formatDate(fiscalYear.end_date)} · ${fiscalYear.status}`
              : undefined
          }
        />
        <StatCard
          icon={BellIcon}
          label="Unread notifications"
          value={String(unread)}
          action={
            <Link to="/notifications" className="text-primary text-xs hover:underline">
              Open
            </Link>
          }
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Programs</CardTitle>
            <CardDescription>Programs you can access with your account.</CardDescription>
          </CardHeader>
          <CardContent className="divide-y">
            {scope.map((p) => (
              <div key={p.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <span
                  className="size-3 shrink-0 rounded-full"
                  style={{ backgroundColor: p.color }}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {p.code} <span className="text-muted-foreground font-normal">· {p.name}</span>
                  </p>
                  {p.description && (
                    <p className="text-muted-foreground truncate text-xs">{p.description}</p>
                  )}
                </div>
                {p.archived_at && <Badge variant="outline">Archived</Badge>}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
            <CardDescription>{profile?.email}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Position" value={profile?.position} />
            <Row label="Office" value={profile?.office} />
            <Row label="Last sign-in" value={formatDateTime(profile?.last_login_at)} />
            <Row
              label="Can edit activities"
              value={
                role === 'program_staff'
                  ? profile?.can_edit_activities
                    ? 'Yes'
                    : 'No (read-only)'
                  : 'Yes'
              }
            />
            <Button asChild variant="outline" size="sm" className="mt-3">
              <Link to="/account/password">
                Change password <ArrowRightIcon />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-muted/40 border-dashed">
        <CardContent className="text-muted-foreground text-sm">
          <strong className="text-foreground">Coming in Phase 9:</strong> KPI cards (allotment,
          obligated, disbursed, rates, savings), budget vs obligation vs disbursement charts,
          overdue activities with “Send Overdue Notice”, the Needs Attention panel, the compliance
          scorecard and obligation aging.
        </CardContent>
      </Card>
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  action,
}: {
  icon: typeof BellIcon
  label: string
  value: string
  hint?: string
  action?: React.ReactNode
}) {
  return (
    <Card className="gap-2">
      <CardContent className="flex items-start gap-3">
        <span className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-lg">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-muted-foreground text-xs">{label}</p>
          <p className="truncate text-lg font-semibold">{value}</p>
          {hint && <p className="text-muted-foreground truncate text-xs">{hint}</p>}
        </div>
        {action}
      </CardContent>
    </Card>
  )
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value || '—'}</span>
    </div>
  )
}
