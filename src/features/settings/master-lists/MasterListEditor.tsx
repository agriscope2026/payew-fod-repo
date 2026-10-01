import type { ColumnDef } from '@tanstack/react-table'
import {
  DownloadIcon,
  ListIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog, type ConfirmOptions } from '@/components/common/ConfirmDialog'
import { DataTable } from '@/components/common/DataTable'
import { EmptyState } from '@/components/common/EmptyState'
import { ErrorState } from '@/components/common/ErrorState'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SelectNative } from '@/components/ui/select-native'
import { Switch } from '@/components/ui/switch'
import { exportCsv, timestampSlug } from '@/lib/export'
import { errorMessage } from '@/lib/supabase'
import {
  useDeleteMasterRow,
  useMasterList,
  useMasterLists,
  useSaveMasterRow,
  type MasterRow,
  type Scope,
} from './api'
import { MASTER_LIST_BY_KEY, type MasterListDef } from './config'
import { MasterRowDialog } from './MasterRowDialog'

/** Generic CRUD table for one master list. */
export function MasterListEditor({
  def,
  scope = {},
  readOnly = false,
}: {
  def: MasterListDef
  scope?: Scope
  readOnly?: boolean
}) {
  const { data = [], isPending, isError, refetch } = useMasterList(def.key, scope)
  const save = useSaveMasterRow(def.key, scope)
  const remove = useDeleteMasterRow(def.key)
  const [parentId, setParentId] = useState('')
  const [dialog, setDialog] = useState<{ row: MasterRow | null } | null>(null)
  const [confirm, setConfirm] = useState<ConfirmOptions | null>(null)

  // Option lists for select fields (and the parent filter), keyed by list.
  const selectFields = def.fields.filter((f) => f.type === 'select' && f.optionsFrom)
  const optionLists = useMasterLists(selectFields.map((f) => f.optionsFrom!))

  const rows = useMemo(
    () =>
      def.parentFilter && parentId
        ? data.filter((r) => r[def.parentFilter!.field] === parentId)
        : data,
    [data, def.parentFilter, parentId],
  )

  const labelFor = (fieldKey: string, value: unknown) => {
    const field = def.fields.find((f) => f.key === fieldKey)
    if (!field?.optionsFrom) return value
    const source = MASTER_LIST_BY_KEY[field.optionsFrom]
    const row = optionLists[field.optionsFrom]?.find((r) => r.id === value)
    return row ? String(row[source.labelKey]) : '—'
  }

  const toggleActive = (row: MasterRow, active: boolean) =>
    save.mutate(
      { id: row.id, values: { is_active: active } },
      { onError: (err) => toast.error(errorMessage(err)) },
    )

  const confirmDelete = (row: MasterRow) =>
    setConfirm({
      title: `Delete ${String(row[def.labelKey])}?`,
      description: `This removes the ${def.singular} permanently. If it is already used by other records, deactivate it instead.`,
      confirmLabel: 'Delete',
      destructive: true,
      onConfirm: async () => {
        try {
          await remove.mutateAsync(row.id)
          toast.success('Deleted')
        } catch (err) {
          const code = (err as { code?: string }).code
          toast.error(
            code === '23503'
              ? `This ${def.singular} is in use. Deactivate it instead so it stops appearing in dropdowns.`
              : errorMessage(err),
          )
        }
      },
    })

  const columns = useMemo<ColumnDef<MasterRow, unknown>[]>(
    () => [
      ...def.fields
        .filter((f) => !f.hideInTable)
        .map<ColumnDef<MasterRow, unknown>>((f) => ({
          id: f.key,
          header: f.label,
          accessorFn: (r) => (f.type === 'select' ? labelFor(f.key, r[f.key]) : r[f.key]),
          cell: ({ getValue }) => {
            const v = getValue()
            if (f.type === 'boolean')
              return v ? 'Yes' : <span className="text-muted-foreground">No</span>
            if (v === null || v === undefined || v === '')
              return <span className="text-muted-foreground">—</span>
            return f.type === 'textarea' ? (
              <span className="text-muted-foreground line-clamp-2 max-w-md">{String(v)}</span>
            ) : (
              String(v)
            )
          },
        })),
      {
        id: 'is_active',
        header: 'Active',
        accessorFn: (r) => r.is_active,
        cell: ({ row: { original: r } }) => (
          <Switch
            checked={r.is_active}
            disabled={readOnly}
            onCheckedChange={(c) => toggleActive(r, c)}
            aria-label={`${String(r[def.labelKey])} active`}
          />
        ),
      },
      ...(readOnly
        ? []
        : [
            {
              id: 'actions',
              header: '',
              size: 48,
              enableSorting: false,
              cell: ({ row: { original: r } }) => (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="size-8" aria-label="Row actions">
                      <MoreHorizontalIcon />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setDialog({ row: r })}>
                      <PencilIcon /> Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem variant="destructive" onSelect={() => confirmDelete(r)}>
                      <Trash2Icon /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ),
            } satisfies ColumnDef<MasterRow, unknown>,
          ]),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [def, optionLists, readOnly],
  )

  const exportRows = () => {
    const cols: { key: string; label: string }[] = def.fields.map((f) => ({
      key: f.key,
      label: f.label,
    }))
    exportCsv<Record<string, unknown>>(
      `payew-${def.key}-${timestampSlug()}.csv`,
      rows.map((r) => ({
        ...Object.fromEntries(def.fields.map((f) => [f.key, labelFor(f.key, r[f.key])])),
        is_active: r.is_active ? 'Yes' : 'No',
      })),
      [...cols, { key: 'is_active', label: 'Active' }],
    )
  }

  if (isError) return <ErrorState onRetry={() => void refetch()} />

  const parentOptions = def.parentFilter ? (optionLists[def.parentFilter.list] ?? []) : []
  const parentLabel = def.parentFilter ? MASTER_LIST_BY_KEY[def.parentFilter.list].labelKey : ''

  return (
    <>
      <DataTable
        data={rows}
        columns={columns}
        loading={isPending}
        getRowId={(r) => r.id}
        searchPlaceholder={`Search ${def.label.toLowerCase()}…`}
        rowClassName={(r) => (r.is_active ? undefined : 'opacity-60')}
        empty={<EmptyState icon={ListIcon} title={`No ${def.label.toLowerCase()} yet`} />}
        toolbar={
          <>
            {def.parentFilter && (
              <SelectNative
                aria-label={def.parentFilter.label}
                className="w-48"
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
              >
                <option value="">All {def.parentFilter.label.toLowerCase()}s</option>
                {parentOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {String(o[parentLabel])}
                  </option>
                ))}
              </SelectNative>
            )}
            <div className="ml-auto flex gap-2">
              <Button variant="outline" onClick={exportRows} disabled={!rows.length}>
                <DownloadIcon /> CSV
              </Button>
              {!readOnly && (
                <Button onClick={() => setDialog({ row: null })}>
                  <PlusIcon /> Add {def.singular}
                </Button>
              )}
            </div>
          </>
        }
      />
      <MasterRowDialog
        def={def}
        open={!!dialog}
        row={dialog?.row ?? null}
        defaults={def.parentFilter && parentId ? { [def.parentFilter.field]: parentId } : {}}
        optionLists={optionLists}
        onOpenChange={(o) => !o && setDialog(null)}
        onSave={(values) => save.mutateAsync({ id: dialog?.row?.id, values })}
      />
      <ConfirmDialog options={confirm} onClose={() => setConfirm(null)} />
    </>
  )
}
