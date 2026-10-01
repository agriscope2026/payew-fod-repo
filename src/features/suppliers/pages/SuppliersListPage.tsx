import type { ColumnDef } from '@tanstack/react-table'
import {
  ArchiveRestoreIcon,
  DownloadIcon,
  MoreHorizontalIcon,
  PlusIcon,
  StoreIcon,
  Trash2Icon,
  UploadIcon,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { DataTable } from '@/components/common/DataTable'
import { EmptyState } from '@/components/common/EmptyState'
import { ErrorState } from '@/components/common/ErrorState'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SelectNative } from '@/components/ui/select-native'
import { useLocationLookup } from '@/features/locations/api'
import { categoryIcon } from '@/features/packages/category-meta'
import { useProcurementLookups } from '@/features/packages/use-procurement-lookups'
import { formatPeso } from '@/lib/format'
import { errorMessage } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import type { SupplierStatus, SupplierView } from '@/types/database'
import { useCanManageSuppliers, useSuppliers, useTrashSupplier } from '../api'
import { ExpiryLabel, SupplierStatusBadge } from '../components/SupplierBadges'
import { ImportSuppliersDialog } from '../components/ImportSuppliersDialog'
import { SupplierFormDialog } from '../components/SupplierFormDialog'
import { exportSuppliers } from '../excel'

export default function SuppliersListPage() {
  const navigate = useNavigate()
  const canManage = useCanManageSuppliers()
  const [trash, setTrash] = useState(false)
  const { data = [], isPending, isError, refetch } = useSuppliers({ trash })
  const location = useLocationLookup()
  const lookups = useProcurementLookups()
  const trashMut = useTrashSupplier()
  const [status, setStatus] = useState<SupplierStatus | ''>('')
  const [category, setCategory] = useState('')
  const [papers, setPapers] = useState<'' | 'expired' | 'expiring'>('')
  const [creating, setCreating] = useState(false)
  const [importing, setImporting] = useState(false)

  const rows = data.filter(
    (s) =>
      (!status || s.status === status) &&
      (!category || s.categories.includes(category)) &&
      (!papers || (papers === 'expired' ? s.expired_docs > 0 : s.expiring_docs > 0)),
  )
  const categoryName = (code: string) => lookups.categoryByCode(code)?.name ?? code

  const columns = useMemo<ColumnDef<SupplierView, unknown>[]>(
    () => [
      {
        accessorKey: 'business_name',
        header: 'Supplier',
        cell: ({ row: { original: s } }) => (
          <div className="min-w-0">
            <Link to={`/suppliers/${s.id}`} className="font-medium hover:underline">
              {s.business_name}
            </Link>
            <p className="text-muted-foreground truncate text-xs">
              {[s.trade_name, s.tin && `TIN ${s.tin}`].filter(Boolean).join(' · ') || '—'}
            </p>
          </div>
        ),
      },
      {
        id: 'categories',
        header: 'Supplies',
        accessorFn: (s) => s.categories.map(categoryName).join(' '),
        cell: ({ row: { original: s } }) => (
          <div className="flex flex-wrap gap-1">
            {s.categories.map((code) => {
              const Icon = categoryIcon(code)
              return (
                <span
                  key={code}
                  className="bg-muted inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px]"
                >
                  <Icon className="size-3" /> {categoryName(code)}
                </span>
              )
            })}
          </div>
        ),
      },
      {
        id: 'location',
        header: 'Location',
        accessorFn: (s) => location.format(s, { short: true }),
        cell: ({ getValue }) => <span className="text-sm">{getValue() as string}</span>,
      },
      {
        id: 'papers',
        header: 'PhilGEPS / Permit',
        accessorFn: (s) => s.next_expiry ?? '',
        cell: ({ row: { original: s } }) => (
          <div className="flex flex-col gap-0.5">
            <ExpiryLabel date={s.philgeps_expiry} compact />
            <ExpiryLabel date={s.permit_expiry} compact />
          </div>
        ),
      },
      {
        accessorKey: 'packages_count',
        header: 'Packages',
        cell: ({ row: { original: s } }) => (
          <span className="text-sm tabular-nums">
            {s.packages_count}
            {s.open_packages > 0 && (
              <span className="text-muted-foreground text-xs"> ({s.open_packages} open)</span>
            )}
          </span>
        ),
      },
      {
        accessorKey: 'awarded_total',
        header: 'Awarded',
        cell: ({ getValue }) => (
          <span className="text-sm tabular-nums">{formatPeso(Number(getValue() ?? 0))}</span>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row: { original: s } }) => <SupplierStatusBadge status={s.status} />,
      },
      ...(canManage
        ? [
            {
              id: 'actions',
              enableSorting: false,
              cell: ({ row: { original: s } }) => (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="size-8" aria-label="Actions">
                      <MoreHorizontalIcon />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      variant={s.deleted_at ? 'default' : 'destructive'}
                      onSelect={() =>
                        trashMut
                          .mutateAsync({ id: s.id, restore: !!s.deleted_at })
                          .then(() => toast.success(s.deleted_at ? 'Restored' : 'Moved to Trash'))
                          .catch((e) => toast.error(errorMessage(e)))
                      }
                    >
                      {s.deleted_at ? <ArchiveRestoreIcon /> : <Trash2Icon />}
                      {s.deleted_at ? 'Restore' : 'Move to Trash'}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ),
            } satisfies ColumnDef<SupplierView, unknown>,
          ]
        : []),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [location, lookups, canManage],
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Suppliers"
        description="Shared list of suppliers and service providers used by every program."
        actions={
          <>
            <Button
              variant="outline"
              disabled={!rows.length}
              onClick={() =>
                void exportSuppliers(rows, (s) => location.format(s), categoryName).catch((e) =>
                  toast.error(errorMessage(e)),
                )
              }
            >
              <DownloadIcon /> Export
            </Button>
            {canManage && (
              <>
                <Button variant="outline" onClick={() => setImporting(true)}>
                  <UploadIcon /> Import
                </Button>
                <Button onClick={() => setCreating(true)}>
                  <PlusIcon /> New supplier
                </Button>
              </>
            )}
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
          getRowId={(s) => s.id}
          searchPlaceholder="Search name, TIN, contact…"
          rowClassName={(s) => cn(s.status === 'blacklisted' && 'opacity-60')}
          toolbar={
            <>
              <SelectNative
                aria-label="Status"
                className="w-36"
                value={status}
                onChange={(e) => setStatus(e.target.value as SupplierStatus | '')}
              >
                <option value="">Any status</option>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
                <option value="blacklisted">Blacklisted</option>
              </SelectNative>
              <SelectNative
                aria-label="Category"
                className="w-48"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="">All categories</option>
                {lookups.categories.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </SelectNative>
              <SelectNative
                aria-label="Papers"
                className="w-44"
                value={papers}
                onChange={(e) => setPapers(e.target.value as '' | 'expired' | 'expiring')}
              >
                <option value="">Any papers</option>
                <option value="expired">Expired papers</option>
                <option value="expiring">Expiring in 30 days</option>
              </SelectNative>
              {canManage && (
                <Button
                  variant={trash ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setTrash(!trash)}
                >
                  <Trash2Icon /> {trash ? 'Showing Trash' : 'Trash'}
                </Button>
              )}
            </>
          }
          empty={
            <EmptyState
              icon={StoreIcon}
              title={trash ? 'Trash is empty' : 'No suppliers found'}
              description={
                trash ? undefined : 'Change the filters, add a supplier or import from Excel.'
              }
            />
          }
        />
      )}

      {creating && (
        <SupplierFormDialog
          onClose={() => setCreating(false)}
          onSaved={(id) => navigate(`/suppliers/${id}`)}
        />
      )}
      {importing && <ImportSuppliersDialog onClose={() => setImporting(false)} />}
    </div>
  )
}
