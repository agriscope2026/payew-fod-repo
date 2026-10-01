import type { ColumnDef } from '@tanstack/react-table'
import {
  ArchiveRestoreIcon,
  DownloadIcon,
  FileUpIcon,
  ListIcon,
  MapIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  SproutIcon,
  Trash2Icon,
} from 'lucide-react'
import { lazy, Suspense, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { ProgramChip } from '@/components/common/Badges'
import { ConfirmDialog, type ConfirmOptions } from '@/components/common/ConfirmDialog'
import { DataTable } from '@/components/common/DataTable'
import { EmptyState } from '@/components/common/EmptyState'
import { ErrorState } from '@/components/common/ErrorState'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SelectNative } from '@/components/ui/select-native'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/features/auth/auth-context'
import { canManageProgram, canWriteProgram } from '@/features/auth/permissions'
import { errorMessage } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { useBeneficiaries, useTrashBeneficiary, type Beneficiary } from '../api'
import { BeneficiaryFormDialog } from '../components/BeneficiaryFormDialog'
import { BeneficiaryStats } from '../components/BeneficiaryStats'
import { ImportBeneficiariesDialog } from '../components/ImportBeneficiariesDialog'
import { StatusBadge } from '../components/StatusBadge'
import { exportBeneficiaries } from '../excel'
import { useBeneficiaryLookups } from '../use-lookups'

const BeneficiaryMap = lazy(() => import('../components/BeneficiaryMap'))

export default function BeneficiariesListPage() {
  const { profile, programs, isSuperadmin } = useAuth()
  const { lookups, names, programById, commodityOptions } = useBeneficiaryLookups()
  const [showTrash, setShowTrash] = useState(false)
  const { data = [], isPending, isError, refetch } = useBeneficiaries({ trash: showTrash })
  const trash = useTrashBeneficiary()

  const [view, setView] = useState<'table' | 'map'>('table')
  const [typeId, setTypeId] = useState('')
  const [provinceId, setProvinceId] = useState('')
  const [municipalityId, setMunicipalityId] = useState('')
  const [commodityId, setCommodityId] = useState('')
  const [status, setStatus] = useState('')
  const [programFilter, setProgramFilter] = useState('')
  const [editing, setEditing] = useState<{ row: Beneficiary | null } | null>(null)
  const [importing, setImporting] = useState(false)
  const [confirm, setConfirm] = useState<ConfirmOptions | null>(null)

  const programIds = programs.map((p) => p.id)
  const canEdit = (b: Beneficiary) =>
    b.registered_by_program_id
      ? canWriteProgram(profile, programIds, b.registered_by_program_id)
      : isSuperadmin
  const canTrash = (b: Beneficiary) =>
    b.registered_by_program_id
      ? canManageProgram(profile, programIds, b.registered_by_program_id)
      : isSuperadmin
  const canCreate =
    isSuperadmin ||
    programs.some((p) => !p.archived_at && canWriteProgram(profile, programIds, p.id))
  const canSeeTrash = isSuperadmin || profile?.role === 'program_admin'

  const rows = useMemo(
    () =>
      data.filter(
        (b) =>
          (!typeId || b.type_id === typeId) &&
          (!provinceId || b.province_id === provinceId) &&
          (!municipalityId || b.municipality_id === municipalityId) &&
          (!commodityId || b.commodity_ids.includes(commodityId)) &&
          (!status || b.status === status) &&
          (!programFilter ||
            (programFilter === 'fod'
              ? !b.registered_by_program_id
              : b.registered_by_program_id === programFilter)),
      ),
    [data, typeId, provinceId, municipalityId, commodityId, status, programFilter],
  )

  const location = (b: Beneficiary) =>
    [names.municipality(b.municipality_id), names.province(b.province_id)]
      .filter(Boolean)
      .filter((x, i, a) => a.indexOf(x) === i)
      .join(', ')

  const toggleTrash = (b: Beneficiary) => {
    const restore = !!b.deleted_at
    setConfirm({
      title: restore ? `Restore ${b.name}?` : `Move ${b.name} to Trash?`,
      description: restore
        ? 'It will appear in the registry and dropdowns again.'
        : 'It disappears from the registry and activity forms. Its history is kept and admins can restore it.',
      confirmLabel: restore ? 'Restore' : 'Move to Trash',
      destructive: !restore,
      onConfirm: async () => {
        try {
          await trash.mutateAsync({ id: b.id, restore })
          toast.success(restore ? 'Restored' : 'Moved to Trash')
        } catch (err) {
          toast.error(errorMessage(err))
        }
      },
    })
  }

  const columns = useMemo<ColumnDef<Beneficiary, unknown>[]>(
    () => [
      {
        id: 'name',
        header: 'Name',
        accessorFn: (b) => `${b.name} ${b.registration_no ?? ''} ${b.contact_person ?? ''}`,
        sortingFn: (a, b) => a.original.name.localeCompare(b.original.name),
        cell: ({ row: { original: b } }) => (
          <div className="max-w-sm">
            <Link to={`/beneficiaries/${b.id}`} className="font-medium hover:underline">
              {b.name}
            </Link>
            <p className="text-muted-foreground text-xs">
              {names.typeCode(b.type_id)}
              {b.registration_no && ` · ${b.registration_no}`}
            </p>
          </div>
        ),
      },
      {
        id: 'location',
        header: 'Location',
        accessorFn: (b) => location(b),
        cell: ({ getValue }) => <span className="text-sm">{getValue() as string}</span>,
      },
      {
        id: 'members',
        header: 'Members',
        accessorFn: (b) => b.members_total,
        cell: ({ row: { original: b } }) => (
          <div className="text-sm tabular-nums">
            {b.members_total.toLocaleString()}
            <span className="text-muted-foreground block text-xs">
              {b.members_male} M · {b.members_female} F
            </span>
          </div>
        ),
      },
      {
        id: 'commodities',
        header: 'Commodities',
        enableSorting: false,
        accessorFn: (b) => b.commodity_ids.map(names.commodity).join(' '),
        cell: ({ row: { original: b } }) => (
          <div className="flex max-w-56 flex-wrap gap-1">
            {b.commodity_ids.slice(0, 2).map((id) => (
              <Badge key={id} variant="secondary" className="font-normal">
                {names.commodity(id)}
              </Badge>
            ))}
            {b.commodity_ids.length > 2 && (
              <Badge variant="outline" className="font-normal">
                +{b.commodity_ids.length - 2}
              </Badge>
            )}
          </div>
        ),
      },
      {
        id: 'program',
        header: 'Registered by',
        accessorFn: (b) => names.program(b.registered_by_program_id),
        cell: ({ row: { original: b } }) => {
          const p = b.registered_by_program_id ? programById.get(b.registered_by_program_id) : null
          return p ? (
            <ProgramChip program={p} />
          ) : (
            <span className="text-muted-foreground text-xs">
              {names.program(b.registered_by_program_id) || '—'}
            </span>
          )
        },
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row: { original: b } }) => <StatusBadge status={b.status} />,
      },
      {
        id: 'actions',
        header: '',
        size: 48,
        enableSorting: false,
        cell: ({ row: { original: b } }) =>
          canEdit(b) || canTrash(b) ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  aria-label={`Actions for ${b.name}`}
                >
                  <MoreHorizontalIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {!b.deleted_at && canEdit(b) && (
                  <DropdownMenuItem onSelect={() => setEditing({ row: b })}>
                    <PencilIcon /> Edit
                  </DropdownMenuItem>
                )}
                {canTrash(b) && (
                  <>
                    {!b.deleted_at && <DropdownMenuSeparator />}
                    <DropdownMenuItem
                      variant={b.deleted_at ? 'default' : 'destructive'}
                      onSelect={() => toggleTrash(b)}
                    >
                      {b.deleted_at ? <ArchiveRestoreIcon /> : <Trash2Icon />}
                      {b.deleted_at ? 'Restore' : 'Move to Trash'}
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [names, programById, profile, programs],
  )

  const municipalities = lookups.municipalities.filter((m) => m.province_id === provinceId)

  return (
    <div className="space-y-6">
      <PageHeader
        title={showTrash ? 'Beneficiaries · Trash' : 'Beneficiaries'}
        description="Farmers' associations, cooperatives, IP organizations, LGUs and individual farmers served by FOD programs."
        actions={
          <>
            <Button
              variant="outline"
              disabled={!rows.length}
              onClick={() =>
                exportBeneficiaries(rows, names).catch((e) => toast.error(errorMessage(e)))
              }
            >
              <DownloadIcon /> Export Excel
            </Button>
            {canCreate && !showTrash && (
              <>
                <Button variant="outline" onClick={() => setImporting(true)}>
                  <FileUpIcon /> Import
                </Button>
                <Button onClick={() => setEditing({ row: null })}>
                  <PlusIcon /> New beneficiary
                </Button>
              </>
            )}
          </>
        }
      />

      {isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : (
        <>
          {isPending ? (
            <Skeleton className="h-32" />
          ) : (
            <BeneficiaryStats rows={rows} provinces={lookups.provinces} />
          )}

          <div className="flex flex-wrap items-center gap-2">
            <SelectNative
              aria-label="Type"
              className="w-40"
              value={typeId}
              onChange={(e) => setTypeId(e.target.value)}
            >
              <option value="">All types</option>
              {lookups.types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </SelectNative>
            <SelectNative
              aria-label="Province"
              className="w-40"
              value={provinceId}
              onChange={(e) => {
                setProvinceId(e.target.value)
                setMunicipalityId('')
              }}
            >
              <option value="">All provinces</option>
              {lookups.provinces.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </SelectNative>
            <SelectNative
              aria-label="Municipality"
              className="w-44"
              value={municipalityId}
              disabled={!provinceId}
              onChange={(e) => setMunicipalityId(e.target.value)}
            >
              <option value="">All municipalities</option>
              {municipalities.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </SelectNative>
            <SelectNative
              aria-label="Commodity"
              className="w-44"
              value={commodityId}
              onChange={(e) => setCommodityId(e.target.value)}
            >
              <option value="">All commodities</option>
              {commodityOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </SelectNative>
            <SelectNative
              aria-label="Registered by"
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
              <option value="fod">FOD</option>
            </SelectNative>
            <SelectNative
              aria-label="Status"
              className="w-36"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">Any status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="dissolved">Dissolved</option>
            </SelectNative>
            {canSeeTrash && (
              <label className="flex items-center gap-2 px-1 text-sm">
                <Checkbox checked={showTrash} onCheckedChange={(c) => setShowTrash(!!c)} /> Trash
              </label>
            )}
            <div
              className="bg-card ml-auto inline-flex rounded-md border p-0.5"
              role="group"
              aria-label="View"
            >
              {(
                [
                  ['table', ListIcon, 'Table'],
                  ['map', MapIcon, 'Map'],
                ] as const
              ).map(([v, Icon, label]) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={view === v}
                  onClick={() => setView(v)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded px-3 py-1 text-sm',
                    view === v ? 'bg-primary text-primary-foreground' : 'hover:bg-accent',
                  )}
                >
                  <Icon className="size-4" /> {label}
                </button>
              ))}
            </div>
          </div>

          {view === 'map' ? (
            <Suspense fallback={<Skeleton className="h-[28rem]" />}>
              <BeneficiaryMap
                rows={rows}
                describe={(b) =>
                  `${names.type(b.type_id)} · ${location(b)} · ${b.members_total} members`
                }
              />
            </Suspense>
          ) : (
            <DataTable
              data={rows}
              columns={columns}
              loading={isPending}
              getRowId={(b) => b.id}
              searchPlaceholder="Search name, registration no., contact…"
              rowClassName={(b) => (b.status === 'active' ? undefined : 'opacity-70')}
              empty={
                <EmptyState
                  icon={SproutIcon}
                  title={showTrash ? 'Trash is empty' : 'No beneficiaries found'}
                  description={
                    showTrash
                      ? undefined
                      : 'Change the filters, add a beneficiary, or import from Excel.'
                  }
                />
              }
            />
          )}
        </>
      )}

      <BeneficiaryFormDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        beneficiary={editing?.row}
      />
      <ImportBeneficiariesDialog open={importing} onOpenChange={setImporting} />
      <ConfirmDialog options={confirm} onClose={() => setConfirm(null)} />
    </div>
  )
}
