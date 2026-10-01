import type { ColumnDef } from '@tanstack/react-table'
import {
  DownloadIcon,
  KeyRoundIcon,
  LogOutIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  UserCheckIcon,
  UserXIcon,
  UsersIcon,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ActiveBadge, ProgramChip, RoleBadge } from '@/components/common/Badges'
import { ConfirmDialog, type ConfirmOptions } from '@/components/common/ConfirmDialog'
import { DataTable } from '@/components/common/DataTable'
import { EmptyState } from '@/components/common/EmptyState'
import { ErrorState } from '@/components/common/ErrorState'
import { PageHeader } from '@/components/layout/PageHeader'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SelectNative } from '@/components/ui/select-native'
import { Switch } from '@/components/ui/switch'
import { useAuth } from '@/features/auth/auth-context'
import { ROLE_LABELS } from '@/features/auth/permissions'
import { exportCsv, timestampSlug } from '@/lib/export'
import { formatDateTime, formatRelative } from '@/lib/format'
import { errorMessage } from '@/lib/supabase'
import { initials } from '@/lib/utils'
import type { AppRole } from '@/types/database'
import { useForceLogout, useUpdateUser, useUsers, type UserListItem } from './api'
import { ResetPasswordDialog } from './components/ResetPasswordDialog'
import {
  TemporaryPasswordDialog,
  type TemporaryPasswordInfo,
} from './components/TemporaryPasswordDialog'
import { UserFormDialog, type UserFormPreset } from './components/UserFormDialog'

export default function UsersPage() {
  const { isSuperadmin, programs, user: me } = useAuth()
  const { data = [], isPending, isError, refetch } = useUsers()
  const update = useUpdateUser()
  const forceLogout = useForceLogout()
  const [params, setParams] = useSearchParams()

  const [programFilter, setProgramFilter] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [editing, setEditing] = useState<UserListItem | null>(null)
  const [resetting, setResetting] = useState<UserListItem | null>(null)
  const [tempPassword, setTempPassword] = useState<TemporaryPasswordInfo | null>(null)
  const [confirm, setConfirm] = useState<ConfirmOptions | null>(null)

  // Deep link from Settings → Programs: /users?new=program_admin&program=<id>
  const newRole = params.get('new') as AppRole | null
  const [creating, setCreating] = useState(!!newRole)
  const preset: UserFormPreset = {
    role: newRole && newRole in ROLE_LABELS ? newRole : undefined,
    programId: params.get('program') ?? undefined,
  }
  const closeCreate = (open: boolean) => {
    setCreating(open)
    if (!open && params.has('new')) setParams({}, { replace: true })
  }

  const programById = useMemo(() => new Map(programs.map((p) => [p.id, p])), [programs])

  const rows = useMemo(
    () =>
      data.filter(
        (u) =>
          // Program admins manage their staff only.
          (isSuperadmin || u.role === 'program_staff') &&
          (!programFilter || u.program_ids.includes(programFilter)) &&
          (!roleFilter || u.role === roleFilter) &&
          (!statusFilter || String(u.is_active) === statusFilter),
      ),
    [data, isSuperadmin, programFilter, roleFilter, statusFilter],
  )

  const toggleActive = (u: UserListItem) =>
    setConfirm({
      title: u.is_active ? `Deactivate ${u.full_name}?` : `Reactivate ${u.full_name}?`,
      description: u.is_active
        ? 'They will be signed out everywhere and blocked from signing in. Their records and history are kept.'
        : 'They will be able to sign in again with their existing password.',
      confirmLabel: u.is_active ? 'Deactivate' : 'Reactivate',
      destructive: u.is_active,
      onConfirm: async () => {
        try {
          await update.mutateAsync({ userId: u.id, changes: { is_active: !u.is_active } })
          toast.success(u.is_active ? 'User deactivated' : 'User reactivated')
        } catch (err) {
          toast.error(errorMessage(err))
        }
      },
    })

  const confirmForceLogout = (u: UserListItem) =>
    setConfirm({
      title: `Sign out ${u.full_name} everywhere?`,
      description: 'All of their active sessions end immediately. They can sign in again.',
      confirmLabel: 'Force logout',
      destructive: true,
      onConfirm: async () => {
        try {
          await forceLogout.mutateAsync(u.id)
          toast.success('Sessions revoked')
        } catch (err) {
          toast.error(errorMessage(err))
        }
      },
    })

  const columns = useMemo<ColumnDef<UserListItem, unknown>[]>(
    () => [
      {
        id: 'user',
        header: 'User',
        accessorFn: (u) => `${u.full_name} ${u.email} ${u.position ?? ''}`,
        sortingFn: (a, b) => a.original.full_name.localeCompare(b.original.full_name),
        cell: ({ row: { original: u } }) => (
          <div className="flex items-center gap-3">
            <Avatar>
              <AvatarFallback>{initials(u.full_name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate font-medium">
                {u.full_name}
                {u.id === me?.id && (
                  <span className="text-muted-foreground ml-1 text-xs">(you)</span>
                )}
              </p>
              <p className="text-muted-foreground truncate text-xs">{u.email}</p>
            </div>
          </div>
        ),
      },
      {
        id: 'role',
        header: 'Role',
        accessorFn: (u) => ROLE_LABELS[u.role],
        cell: ({ row: { original: u } }) => <RoleBadge role={u.role} />,
      },
      {
        id: 'programs',
        header: 'Program',
        accessorFn: (u) => u.program_ids.map((id) => programById.get(id)?.code).join(' '),
        cell: ({ row: { original: u } }) =>
          u.role === 'superadmin' ? (
            <span className="text-muted-foreground text-xs">All programs</span>
          ) : (
            <div className="flex flex-wrap gap-1">
              {u.program_ids.map((id) => {
                const p = programById.get(id)
                return p ? <ProgramChip key={id} program={p} /> : null
              })}
            </div>
          ),
      },
      {
        accessorKey: 'position',
        header: 'Position',
        cell: ({ getValue }) =>
          (getValue() as string | null) ?? <span className="text-muted-foreground">—</span>,
      },
      {
        id: 'status',
        header: 'Status',
        accessorFn: (u) => (u.is_active ? 'active' : 'inactive'),
        cell: ({ row: { original: u } }) => (
          <div className="space-y-1">
            <ActiveBadge active={u.is_active} />
            {u.must_change_password && (
              <p className="text-muted-foreground text-[11px]">Pending password change</p>
            )}
          </div>
        ),
      },
      {
        id: 'can_edit',
        header: 'Can edit',
        enableSorting: false,
        cell: ({ row: { original: u } }) =>
          u.role === 'program_staff' ? (
            <Switch
              checked={u.can_edit_activities}
              aria-label={`Allow ${u.full_name} to edit activities`}
              onCheckedChange={(checked) =>
                update.mutate(
                  { userId: u.id, changes: { can_edit_activities: checked } },
                  { onError: (err) => toast.error(errorMessage(err)) },
                )
              }
            />
          ) : (
            <span className="text-muted-foreground text-xs">Yes</span>
          ),
      },
      {
        id: 'last_login',
        header: 'Last sign-in',
        accessorFn: (u) => u.last_login_at ?? '',
        cell: ({ row: { original: u } }) =>
          u.last_login_at ? (
            <span title={formatDateTime(u.last_login_at)} className="text-sm whitespace-nowrap">
              {formatRelative(u.last_login_at)}
            </span>
          ) : (
            <span className="text-muted-foreground text-xs">Never</span>
          ),
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        size: 48,
        cell: ({ row: { original: u } }) => {
          const self = u.id === me?.id
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  aria-label={`Actions for ${u.full_name}`}
                >
                  <MoreHorizontalIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setEditing(u)}>
                  <PencilIcon /> Edit
                </DropdownMenuItem>
                {!self && (
                  <>
                    <DropdownMenuItem onSelect={() => setResetting(u)}>
                      <KeyRoundIcon /> Reset password
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => confirmForceLogout(u)}>
                      <LogOutIcon /> Force logout
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant={u.is_active ? 'destructive' : 'default'}
                      onSelect={() => toggleActive(u)}
                    >
                      {u.is_active ? <UserXIcon /> : <UserCheckIcon />}
                      {u.is_active ? 'Deactivate' : 'Reactivate'}
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [programById, me?.id],
  )

  const exportRows = () =>
    exportCsv(
      `payew-users-${timestampSlug()}.csv`,
      rows.map((u) => ({
        name: u.full_name,
        email: u.email,
        role: ROLE_LABELS[u.role],
        programs: u.program_ids.map((id) => programById.get(id)?.code).join('; '),
        position: u.position,
        office: u.office,
        contact_no: u.contact_no,
        active: u.is_active ? 'Yes' : 'No',
        can_edit_activities:
          u.role === 'program_staff' ? (u.can_edit_activities ? 'Yes' : 'No') : 'Yes',
        last_login: formatDateTime(u.last_login_at),
      })),
      [
        { key: 'name', label: 'Name' },
        { key: 'email', label: 'Email' },
        { key: 'role', label: 'Role' },
        { key: 'programs', label: 'Programs' },
        { key: 'position', label: 'Position' },
        { key: 'office', label: 'Office' },
        { key: 'contact_no', label: 'Contact no.' },
        { key: 'active', label: 'Active' },
        { key: 'can_edit_activities', label: 'Can edit activities' },
        { key: 'last_login', label: 'Last sign-in' },
      ],
    )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        description={
          isSuperadmin
            ? 'All accounts across programs. Create program admins and staff, reset passwords, and control access.'
            : 'Staff accounts for your program. Staff are read-only unless you allow them to edit activities.'
        }
        actions={
          <>
            <Button variant="outline" onClick={exportRows} disabled={!rows.length}>
              <DownloadIcon /> Export CSV
            </Button>
            <Button onClick={() => setCreating(true)}>
              <PlusIcon /> {isSuperadmin ? 'New user' : 'New staff'}
            </Button>
          </>
        }
      />

      {isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : (
        <DataTable
          data={rows}
          columns={columns}
          loading={isPending}
          getRowId={(u) => u.id}
          searchPlaceholder="Search name, email, position…"
          rowClassName={(u) => (u.is_active ? undefined : 'opacity-60')}
          empty={
            <EmptyState
              icon={UsersIcon}
              title="No users found"
              description="Try different filters, or create a new account."
            />
          }
          toolbar={
            <>
              {programs.length > 1 && (
                <SelectNative
                  aria-label="Program"
                  className="w-40"
                  value={programFilter}
                  onChange={(e) => setProgramFilter(e.target.value)}
                >
                  <option value="">All programs</option>
                  {programs.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code}
                    </option>
                  ))}
                </SelectNative>
              )}
              {isSuperadmin && (
                <SelectNative
                  aria-label="Role"
                  className="w-40"
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                >
                  <option value="">All roles</option>
                  {Object.entries(ROLE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </SelectNative>
              )}
              <SelectNative
                aria-label="Status"
                className="w-36"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">Any status</option>
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </SelectNative>
            </>
          }
        />
      )}

      <UserFormDialog
        open={creating}
        onOpenChange={closeCreate}
        preset={preset}
        onCreated={setTempPassword}
      />
      <UserFormDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        user={editing}
      />
      <ResetPasswordDialog
        user={resetting}
        onClose={() => setResetting(null)}
        onTemporaryPassword={setTempPassword}
      />
      <TemporaryPasswordDialog info={tempPassword} onClose={() => setTempPassword(null)} />
      <ConfirmDialog options={confirm} onClose={() => setConfirm(null)} />
    </div>
  )
}
