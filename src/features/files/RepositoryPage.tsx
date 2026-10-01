import {
  ArchiveRestoreIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  EyeIcon,
  FilePlus2Icon,
  FolderOpenIcon,
  HistoryIcon,
  MoreHorizontalIcon,
  PencilIcon,
  SearchIcon,
  Trash2Icon,
  UploadIcon,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ProgramChip } from '@/components/common/Badges'
import { ConfirmDialog, type ConfirmOptions } from '@/components/common/ConfirmDialog'
import { EmptyState } from '@/components/common/EmptyState'
import { ErrorState } from '@/components/common/ErrorState'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { SelectNative } from '@/components/ui/select-native'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useAuth } from '@/features/auth/auth-context'
import { canManageProgram, canWriteProgram } from '@/features/auth/permissions'
import { useMasterList } from '@/features/settings/master-lists/api'
import { useProfileNames } from '@/features/users/api'
import { useWorkspace } from '@/features/workspace/workspace-context'
import { formatBytes, formatDateTime, formatRelative } from '@/lib/format'
import { useDebounced } from '@/hooks/use-debounced'
import { errorMessage } from '@/lib/supabase'
import type { AttachmentRow } from '@/types/database'
import {
  downloadAttachment,
  useFolders,
  useRepositoryFiles,
  useTrashAttachment,
  type RepositoryFilters,
} from './api'
import { EditFileDialog } from './components/EditFileDialog'
import { FilePreviewDialog } from './components/FilePreviewDialog'
import { FileTypeIcon } from './components/FileIcon'
import { isPreviewable } from './utils'
import { UploadDialog } from './components/UploadDialog'
import { VersionHistoryDialog } from './components/VersionHistoryDialog'

const PAGE_SIZE = 25

export default function RepositoryPage() {
  const { profile, programs, isSuperadmin, user } = useAuth()
  const ws = useWorkspace()
  const { data: names } = useProfileNames()
  const { data: docTypes = [] } = useMasterList('document_types')
  const { data: folders = [] } = useFolders(ws.selectedProgramIds)
  const trash = useTrashAttachment()

  const [search, setSearch] = useState('')
  const [docTypeId, setDocTypeId] = useState('')
  const [folder, setFolder] = useState('')
  const [tag, setTag] = useState('')
  const [source, setSource] = useState<RepositoryFilters['source']>('all')
  const [allYears, setAllYears] = useState(false)
  const [includeShared, setIncludeShared] = useState(true)
  const [showTrash, setShowTrash] = useState(false)

  const [uploading, setUploading] = useState(false)
  const [newVersionOf, setNewVersionOf] = useState<AttachmentRow | null>(null)
  const [preview, setPreview] = useState<AttachmentRow | null>(null)
  const [history, setHistory] = useState<AttachmentRow | null>(null)
  const [editing, setEditing] = useState<AttachmentRow | null>(null)
  const [confirm, setConfirm] = useState<ConfirmOptions | null>(null)

  const debouncedSearch = useDebounced(search)
  const debouncedTag = useDebounced(tag)

  // Page is remembered per filter combination, so any filter change returns to page 1.
  const filterKey = JSON.stringify([
    ws.selectedProgramIds,
    includeShared,
    allYears,
    ws.fiscalYear?.id,
    docTypeId,
    folder,
    debouncedTag,
    debouncedSearch,
    source,
    showTrash,
  ])
  const [pageState, setPageState] = useState({ key: filterKey, page: 0 })
  const page = pageState.key === filterKey ? pageState.page : 0
  const setPage = (next: number) => setPageState({ key: filterKey, page: next })

  const filters: RepositoryFilters = {
    programIds: ws.selectedProgramIds,
    includeShared,
    fiscalYearId: allYears ? null : (ws.fiscalYear?.id ?? null),
    documentTypeId: docTypeId || undefined,
    folder: folder || undefined,
    tag: debouncedTag.trim() || undefined,
    search: debouncedSearch || undefined,
    source,
    trash: showTrash,
    page,
    pageSize: PAGE_SIZE,
  }

  const { data, isPending, isError, refetch, isFetching } = useRepositoryFiles(filters)
  const rows = data?.rows ?? []
  const total = data?.count ?? 0

  const programIds = programs.map((p) => p.id)
  const programById = useMemo(() => new Map(programs.map((p) => [p.id, p])), [programs])
  const docTypeById = useMemo(() => new Map(docTypes.map((t) => [t.id, t])), [docTypes])

  const canManage = (f: AttachmentRow) =>
    f.uploaded_by === user?.id ||
    (f.program_id ? canManageProgram(profile, programIds, f.program_id) : isSuperadmin)
  const canVersion = (f: AttachmentRow) =>
    f.program_id ? canWriteProgram(profile, programIds, f.program_id) : isSuperadmin
  const canUploadAnywhere =
    isSuperadmin ||
    programs.some((p) => !p.archived_at && canWriteProgram(profile, programIds, p.id))
  const canSeeTrash = isSuperadmin || profile?.role === 'program_admin'

  const toggleTrash = (f: AttachmentRow) => {
    const restore = !!f.deleted_at
    setConfirm({
      title: restore ? `Restore ${f.file_name}?` : `Move ${f.file_name} to Trash?`,
      description: restore
        ? 'The file and all its versions become visible again.'
        : 'All versions are hidden from staff. Admins can restore it from Trash.',
      confirmLabel: restore ? 'Restore' : 'Move to Trash',
      destructive: !restore,
      onConfirm: async () => {
        try {
          await trash.mutateAsync({ versionGroupId: f.version_group_id, restore })
          toast.success(restore ? 'File restored' : 'Moved to Trash')
        } catch (err) {
          toast.error(errorMessage(err))
        }
      },
    })
  }

  const download = (f: AttachmentRow) =>
    downloadAttachment(f.id).catch((e) => toast.error(errorMessage(e)))

  return (
    <div className="space-y-6">
      <PageHeader
        title={showTrash ? 'Documents · Trash' : 'Documents'}
        description="PPMP, WFP, APP, ORS, DV, contracts, reports and photos, including files attached anywhere in the system."
        actions={
          canUploadAnywhere &&
          !showTrash && (
            <Button onClick={() => setUploading(true)}>
              <UploadIcon /> Upload
            </Button>
          )
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search file name or description…"
            className="pl-8"
            aria-label="Search documents"
          />
        </div>
        <SelectNative
          aria-label="Document type"
          className="w-44"
          value={docTypeId}
          onChange={(e) => setDocTypeId(e.target.value)}
        >
          <option value="">All types</option>
          {docTypes.map((t) => (
            <option key={t.id} value={t.id}>
              {String(t.code)} · {String(t.name)}
            </option>
          ))}
        </SelectNative>
        <SelectNative
          aria-label="Folder"
          className="w-44"
          value={folder}
          onChange={(e) => setFolder(e.target.value)}
        >
          <option value="">All folders</option>
          {folders.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </SelectNative>
        <Input
          aria-label="Tag"
          placeholder="Tag"
          className="w-32"
          value={tag}
          onChange={(e) => setTag(e.target.value)}
        />
        <SelectNative
          aria-label="Source"
          className="w-48"
          value={source}
          onChange={(e) => setSource(e.target.value as RepositoryFilters['source'])}
        >
          <option value="all">All sources</option>
          <option value="repository">Uploaded to Documents</option>
          <option value="attached">Attached to records</option>
        </SelectNative>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <label className="flex items-center gap-2">
          <Checkbox checked={allYears} onCheckedChange={(c) => setAllYears(!!c)} />
          All fiscal years
          {!allYears && ws.fiscalYear && (
            <span className="text-muted-foreground">(showing {ws.fiscalYear.label})</span>
          )}
        </label>
        <label className="flex items-center gap-2">
          <Checkbox checked={includeShared} onCheckedChange={(c) => setIncludeShared(!!c)} />
          Include DA-wide documents
        </label>
        {canSeeTrash && (
          <label className="flex items-center gap-2">
            <Checkbox checked={showTrash} onCheckedChange={(c) => setShowTrash(!!c)} />
            Show Trash
          </label>
        )}
      </div>

      <Card className="gap-0 overflow-hidden py-0">
        {isError ? (
          <ErrorState onRetry={() => void refetch()} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>File</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Program</TableHead>
                <TableHead className="hidden lg:table-cell">Folder</TableHead>
                <TableHead className="hidden md:table-cell">Size</TableHead>
                <TableHead>{showTrash ? 'Deleted' : 'Uploaded'}</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isPending ? (
                Array.from({ length: 6 }, (_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={7}>
                      <Skeleton className="h-9" />
                    </TableCell>
                  </TableRow>
                ))
              ) : rows.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={7} className="p-0">
                    <EmptyState
                      icon={FolderOpenIcon}
                      title={showTrash ? 'Trash is empty' : 'No documents found'}
                      description={
                        showTrash
                          ? undefined
                          : 'Try other filters or “All fiscal years”, or upload the first document.'
                      }
                      action={
                        canUploadAnywhere &&
                        !showTrash && (
                          <Button variant="outline" onClick={() => setUploading(true)}>
                            <UploadIcon /> Upload
                          </Button>
                        )
                      }
                    />
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((f) => {
                  const type = f.document_type_id ? docTypeById.get(f.document_type_id) : undefined
                  const program = f.program_id ? programById.get(f.program_id) : undefined
                  return (
                    <TableRow key={f.id}>
                      <TableCell className="max-w-md">
                        <div className="flex items-center gap-3">
                          <FileTypeIcon fileName={f.file_name} />
                          <div className="min-w-0">
                            <button
                              type="button"
                              className="block max-w-full truncate text-left font-medium hover:underline"
                              onClick={() =>
                                isPreviewable(f.file_name) ? setPreview(f) : void download(f)
                              }
                            >
                              {f.file_name}
                            </button>
                            <div className="text-muted-foreground flex flex-wrap items-center gap-1 text-xs">
                              {f.version > 1 && <span>v{f.version}</span>}
                              {f.entity_type !== 'repository' && (
                                <Badge variant="outline" className="py-0 text-[10px]">
                                  {f.entity_type.replace(/_/g, ' ')}
                                </Badge>
                              )}
                              {f.tags.map((t) => (
                                <button
                                  key={t}
                                  type="button"
                                  onClick={() => setTag(t)}
                                  className="bg-muted hover:bg-accent rounded px-1.5"
                                >
                                  #{t}
                                </button>
                              ))}
                              {f.description && <span className="truncate">{f.description}</span>}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {type ? (
                          <Badge variant="secondary" title={String(type.name)}>
                            {String(type.code)}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {program ? (
                          <ProgramChip program={program} />
                        ) : (
                          <span className="text-muted-foreground text-xs">DA-wide</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden text-sm lg:table-cell">
                        {f.folder ?? '—'}
                      </TableCell>
                      <TableCell className="hidden text-sm whitespace-nowrap md:table-cell">
                        {formatBytes(f.size_bytes)}
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap">
                        <span title={formatDateTime(showTrash ? f.deleted_at : f.created_at)}>
                          {formatRelative(showTrash ? f.deleted_at : f.created_at)}
                        </span>
                        <span className="text-muted-foreground block text-xs">
                          {names?.get((showTrash ? f.deleted_by : f.uploaded_by) ?? '') ?? ''}
                        </span>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8"
                              aria-label={`Actions for ${f.file_name}`}
                            >
                              <MoreHorizontalIcon />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {isPreviewable(f.file_name) && (
                              <DropdownMenuItem onSelect={() => setPreview(f)}>
                                <EyeIcon /> Preview
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onSelect={() => void download(f)}>
                              <DownloadIcon /> Download
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => setHistory(f)}>
                              <HistoryIcon /> Version history
                            </DropdownMenuItem>
                            {!showTrash && canVersion(f) && (
                              <DropdownMenuItem onSelect={() => setNewVersionOf(f)}>
                                <FilePlus2Icon /> Upload new version
                              </DropdownMenuItem>
                            )}
                            {!showTrash && canManage(f) && (
                              <DropdownMenuItem onSelect={() => setEditing(f)}>
                                <PencilIcon /> Edit details
                              </DropdownMenuItem>
                            )}
                            {canManage(f) && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  variant={showTrash ? 'default' : 'destructive'}
                                  onSelect={() => toggleTrash(f)}
                                >
                                  {showTrash ? <ArchiveRestoreIcon /> : <Trash2Icon />}
                                  {showTrash ? 'Restore' : 'Move to Trash'}
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        )}
      </Card>

      {total > 0 && (
        <div className="text-muted-foreground flex items-center justify-between text-sm">
          <span>
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
            {isFetching && !isPending && ' · updating…'}
          </span>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              aria-label="Previous page"
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeftIcon />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              aria-label="Next page"
              disabled={(page + 1) * PAGE_SIZE >= total}
              onClick={() => setPage(page + 1)}
            >
              <ChevronRightIcon />
            </Button>
          </div>
        </div>
      )}

      <UploadDialog open={uploading} onOpenChange={setUploading} />
      <UploadDialog
        open={!!newVersionOf}
        onOpenChange={(o) => !o && setNewVersionOf(null)}
        replaces={newVersionOf}
      />
      <FilePreviewDialog file={preview} onClose={() => setPreview(null)} />
      <VersionHistoryDialog
        file={history}
        onClose={() => setHistory(null)}
        onPreview={setPreview}
      />
      <EditFileDialog file={editing} onClose={() => setEditing(null)} />
      <ConfirmDialog options={confirm} onClose={() => setConfirm(null)} />
    </div>
  )
}
