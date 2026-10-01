import type { ColumnDef } from '@tanstack/react-table'
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  FolderKanbanIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  UserPlusIcon,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { ConfirmDialog, type ConfirmOptions } from '@/components/common/ConfirmDialog'
import { DataTable } from '@/components/common/DataTable'
import { EmptyState } from '@/components/common/EmptyState'
import { ErrorState } from '@/components/common/ErrorState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useUsers } from '@/features/users/api'
import { errorMessage } from '@/lib/supabase'
import type { ProgramRow } from '@/types/database'
import { usePrograms, useSetProgramState } from '../api'
import { ProgramFormDialog } from '../components/ProgramFormDialog'

export default function ProgramsSettings() {
  const navigate = useNavigate()
  const { data: programs = [], isPending, isError, refetch } = usePrograms()
  const { data: users = [] } = useUsers()
  const setState = useSetProgramState()
  const [dialog, setDialog] = useState<{ program: ProgramRow | null } | null>(null)
  const [confirm, setConfirm] = useState<ConfirmOptions | null>(null)

  const members = useMemo(() => {
    const map = new Map<string, { admins: string[]; staff: number }>()
    for (const u of users) {
      if (!u.is_active) continue
      for (const pid of u.program_ids) {
        const entry = map.get(pid) ?? { admins: [], staff: 0 }
        if (u.role === 'program_admin') entry.admins.push(u.full_name)
        else if (u.role === 'program_staff') entry.staff += 1
        map.set(pid, entry)
      }
    }
    return map
  }, [users])

  const addAdmin = (p: ProgramRow) => navigate(`/users?new=program_admin&program=${p.id}`)

  const run = (p: ProgramRow, action: 'archive' | 'unarchive' | 'delete') => {
    const copy = {
      archive: {
        title: `Archive ${p.code}?`,
        description:
          'Archived programs stay readable for reports and audits but are hidden from new-record forms.',
        label: 'Archive',
      },
      unarchive: {
        title: `Restore ${p.code}?`,
        description: 'The program becomes active again.',
        label: 'Restore',
      },
      delete: {
        title: `Delete ${p.code}?`,
        description:
          'The program moves to Trash and disappears for its members. A superadmin can restore it from Trash.',
        label: 'Delete',
      },
    }[action]
    setConfirm({
      title: copy.title,
      description: copy.description,
      confirmLabel: copy.label,
      destructive: action !== 'unarchive',
      onConfirm: async () => {
        try {
          await setState.mutateAsync({ id: p.id, action })
          toast.success(`${p.code} ${action === 'unarchive' ? 'restored' : action + 'd'}`)
        } catch (err) {
          toast.error(errorMessage(err))
        }
      },
    })
  }

  const columns = useMemo<ColumnDef<ProgramRow, unknown>[]>(
    () => [
      {
        accessorKey: 'code',
        header: 'Code',
        cell: ({ row: { original: p } }) => (
          <span className="inline-flex items-center gap-2 font-semibold">
            <span className="size-3 rounded-full" style={{ backgroundColor: p.color }} />
            {p.code}
          </span>
        ),
      },
      {
        accessorKey: 'name',
        header: 'Program',
        cell: ({ row: { original: p } }) => (
          <div className="max-w-md">
            <p className="font-medium">{p.name}</p>
            {p.description && (
              <p className="text-muted-foreground truncate text-xs">{p.description}</p>
            )}
          </div>
        ),
      },
      {
        id: 'admins',
        header: 'Program admin(s)',
        accessorFn: (p) => members.get(p.id)?.admins.join(', ') ?? '',
        cell: ({ row: { original: p } }) => {
          const admins = members.get(p.id)?.admins ?? []
          return admins.length ? (
            <span className="text-sm">{admins.join(', ')}</span>
          ) : (
            <Button variant="link" size="sm" className="h-auto p-0" onClick={() => addAdmin(p)}>
              <UserPlusIcon /> Assign admin
            </Button>
          )
        },
      },
      {
        id: 'staff',
        header: 'Staff',
        accessorFn: (p) => members.get(p.id)?.staff ?? 0,
      },
      {
        id: 'status',
        header: 'Status',
        accessorFn: (p) => (p.archived_at ? 'archived' : 'active'),
        cell: ({ row: { original: p } }) =>
          p.archived_at ? (
            <Badge variant="outline">Archived</Badge>
          ) : (
            <Badge variant="secondary">Active</Badge>
          ),
      },
      {
        id: 'actions',
        header: '',
        size: 48,
        enableSorting: false,
        cell: ({ row: { original: p } }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={`Actions for ${p.code}`}
              >
                <MoreHorizontalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setDialog({ program: p })}>
                <PencilIcon /> Edit
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => addAdmin(p)}>
                <UserPlusIcon /> Add program admin
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {p.archived_at ? (
                <DropdownMenuItem onSelect={() => run(p, 'unarchive')}>
                  <ArchiveRestoreIcon /> Restore
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onSelect={() => run(p, 'archive')}>
                  <ArchiveIcon /> Archive
                </DropdownMenuItem>
              )}
              <DropdownMenuItem variant="destructive" onSelect={() => run(p, 'delete')}>
                <Trash2Icon /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [members],
  )

  if (isError) return <ErrorState onRetry={() => void refetch()} />

  return (
    <div className="space-y-4">
      <DataTable
        data={programs}
        columns={columns}
        loading={isPending}
        getRowId={(p) => p.id}
        searchPlaceholder="Search programs…"
        rowClassName={(p) => (p.archived_at ? 'opacity-60' : undefined)}
        toolbar={
          <Button className="ml-auto" onClick={() => setDialog({ program: null })}>
            <PlusIcon /> New program
          </Button>
        }
        empty={<EmptyState icon={FolderKanbanIcon} title="No programs yet" />}
      />
      <ProgramFormDialog
        open={!!dialog}
        onOpenChange={(o) => !o && setDialog(null)}
        program={dialog?.program}
        onSaved={(p, created) => {
          if (created) {
            toast(`Next: create the ${p.code} program admin`, {
              action: { label: 'Create admin', onClick: () => addAdmin(p) },
              duration: 10_000,
            })
          }
        }}
      />
      <ConfirmDialog options={confirm} onClose={() => setConfirm(null)} />
    </div>
  )
}
