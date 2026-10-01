import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArchiveRestoreIcon, Loader2Icon, LockOpenIcon, SearchIcon, Trash2Icon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { ProgramChip } from '@/components/common/Badges'
import { ConfirmDialog, type ConfirmOptions } from '@/components/common/ConfirmDialog'
import { EmptyState } from '@/components/common/EmptyState'
import { ErrorState } from '@/components/common/ErrorState'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/features/auth/auth-context'
import { useSetFiscalYearStatus } from '@/features/settings/api'
import { useWorkspace } from '@/features/workspace/workspace-context'
import { formatDateTime, formatRelative } from '@/lib/format'
import { errorMessage, supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import type { TrashItem } from '@/types/database'

const MASTER_LABEL: Record<string, string> = {
  fund_sources: 'Fund source',
  expense_classes: 'Expense class',
  uacs_codes: 'UACS code',
  commodities: 'Commodity',
  units: 'Unit',
  activity_categories: 'Activity category',
  beneficiary_types: 'Beneficiary type',
  document_types: 'Document type',
  procurement_categories: 'Procurement category',
  procurement_modes: 'Procurement mode',
}

const KIND_LABEL: Record<string, string> = {
  activity: 'Activity',
  package: 'Package',
  beneficiary: 'Beneficiary',
  supplier: 'Supplier',
  file: 'File',
  allotment: 'Allotment',
  announcement: 'Announcement',
  program: 'Program (deleted)',
  program_archived: 'Program (archived)',
}

const GROUP_LABEL: Record<string, string> = {
  activity: 'Activities',
  package: 'Packages',
  beneficiary: 'Beneficiaries',
  supplier: 'Suppliers',
  file: 'Files',
  allotment: 'Allotments',
  announcement: 'Announcements',
  program: 'Programs',
  master: 'Master lists',
}

const kindLabel = (k: string) =>
  k.startsWith('master:')
    ? `Master list · ${MASTER_LABEL[k.slice(7)] ?? k.slice(7)}`
    : (KIND_LABEL[k] ?? k)
const groupOf = (k: string) =>
  k.startsWith('master:') ? 'master' : k.startsWith('program') ? 'program' : k

function useTrash() {
  return useQuery({
    queryKey: ['trash'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('trash_items')
      if (error) throw error
      return data.sort((a, b) => b.deleted_at.localeCompare(a.deleted_at))
    },
  })
}

function useRestore() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (i: TrashItem) => {
      const { error } = await supabase.rpc('restore_trash_item', {
        p_kind: i.kind,
        p_id: i.item_id,
      })
      if (error) throw error
    },
    // Restoring touches many lists; refresh everything.
    onSuccess: () => queryClient.invalidateQueries(),
  })
}

/** /trash — restore soft-deleted records, archived programs and closed fiscal years. */
export default function TrashPage() {
  const { isSuperadmin } = useAuth()
  const { programs, fiscalYears } = useWorkspace()
  const { data, isPending, isError, refetch } = useTrash()
  const restore = useRestore()
  const setFyStatus = useSetFiscalYearStatus()
  const [group, setGroup] = useState<string>('all')
  const [q, setQ] = useState('')
  const [confirm, setConfirm] = useState<ConfirmOptions | null>(null)
  const programById = new Map(programs.map((p) => [p.id, p]))

  const items = data ?? []
  const groups = [...new Set(items.map((i) => groupOf(i.kind)))]
  const needle = q.trim().toLowerCase()
  const shown = items.filter(
    (i) =>
      (group === 'all' || groupOf(i.kind) === group) &&
      (!needle ||
        `${i.title} ${i.detail ?? ''} ${kindLabel(i.kind)}`.toLowerCase().includes(needle)),
  )
  const closedYears = fiscalYears.filter((y) => y.status === 'closed' || y.status === 'locked')

  const doRestore = async (i: TrashItem) => {
    try {
      await restore.mutateAsync(i)
      toast.success(`${kindLabel(i.kind)} restored`)
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Trash"
        description="Deleted records you manage. Restoring brings a record back exactly as it was."
      />

      {isError ? (
        <Card>
          <ErrorState onRetry={() => void refetch()} />
        </Card>
      ) : isPending ? (
        <Skeleton className="h-64" />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full max-w-xs">
              <SearchIcon className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
              <Input
                className="pl-8"
                placeholder="Search Trash…"
                aria-label="Search Trash"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Type">
              {['all', ...groups].map((g) => (
                <Button
                  key={g}
                  size="sm"
                  variant={group === g ? 'default' : 'outline'}
                  aria-pressed={group === g}
                  onClick={() => setGroup(g)}
                >
                  {g === 'all'
                    ? `All · ${items.length}`
                    : `${GROUP_LABEL[g] ?? g} · ${
                        items.filter((i) => groupOf(i.kind) === g).length
                      }`}
                </Button>
              ))}
            </div>
          </div>

          {shown.length === 0 ? (
            <Card>
              <EmptyState
                icon={Trash2Icon}
                title={items.length ? 'Nothing matches' : 'Trash is empty'}
                description="Deleted activities, packages, beneficiaries, suppliers, files, allotments, announcements and master-list entries appear here."
              />
            </Card>
          ) : (
            <Card className="py-0">
              <ul className="divide-y">
                {shown.map((i) => {
                  const program = i.program_id ? programById.get(i.program_id) : undefined
                  return (
                    <li
                      key={`${i.kind}-${i.item_id}`}
                      className="flex flex-wrap items-center gap-3 px-4 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{i.title}</span>
                          <Badge variant="outline" className="text-[11px]">
                            {kindLabel(i.kind)}
                          </Badge>
                          {program && !i.kind.startsWith('program') && (
                            <ProgramChip program={program} />
                          )}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {i.detail && <span className="font-mono">{i.detail} · </span>}
                          {i.kind === 'program_archived' ? 'Archived' : 'Deleted'}{' '}
                          <span title={formatDateTime(i.deleted_at)}>
                            {formatRelative(i.deleted_at)}
                          </span>
                          {i.deleted_by && ` by ${i.deleted_by}`}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={restore.isPending}
                        onClick={() => void doRestore(i)}
                      >
                        {restore.isPending && restore.variables?.item_id === i.item_id ? (
                          <Loader2Icon className="animate-spin" />
                        ) : (
                          <ArchiveRestoreIcon />
                        )}
                        {i.kind === 'program_archived' ? 'Unarchive' : 'Restore'}
                      </Button>
                    </li>
                  )
                })}
              </ul>
            </Card>
          )}
        </>
      )}

      {closedYears.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Closed and locked fiscal years</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {closedYears.map((y) => (
                <li key={y.id} className="flex items-center gap-3 py-2">
                  <span className="flex-1 font-medium">{y.label}</span>
                  <Badge
                    variant="outline"
                    className={cn(
                      'capitalize',
                      y.status === 'locked' && 'border-destructive/40 text-destructive',
                    )}
                  >
                    {y.status}
                  </Badge>
                  {isSuperadmin && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setConfirm({
                          title: `Reopen ${y.label}?`,
                          description:
                            'Staff and admins will be able to add and change records in this fiscal year again.',
                          confirmLabel: 'Reopen',
                          onConfirm: async () => {
                            try {
                              await setFyStatus.mutateAsync({ id: y.id, status: 'open' })
                              toast.success(`${y.label} reopened`)
                            } catch (err) {
                              toast.error(errorMessage(err))
                            }
                          },
                        })
                      }
                    >
                      <LockOpenIcon /> Reopen
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <ConfirmDialog options={confirm} onClose={() => setConfirm(null)} />
    </div>
  )
}
