import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  DownloadIcon,
  ExternalLinkIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  FileTypeIcon,
  FolderIcon,
  ImageIcon,
  InfoIcon,
  LinkIcon,
  Loader2Icon,
  PlusIcon,
  PresentationIcon,
  QrCodeIcon,
  SearchIcon,
  Trash2Icon,
  VideoIcon,
  type LucideIcon,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ProgramChip } from '@/components/common/Badges'
import { EmptyState } from '@/components/common/EmptyState'
import { ErrorState } from '@/components/common/ErrorState'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SelectNative } from '@/components/ui/select-native'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { useActivityLookups } from '@/features/activities/use-activity-lookups'
import { useAuth } from '@/features/auth/auth-context'
import { canManageProgram } from '@/features/auth/permissions'
import { useWorkspace } from '@/features/workspace/workspace-context'
import { formatDate } from '@/lib/format'
import { errorMessage, supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import type { LinkedFileKind, LinkedFileRow } from '@/types/database'
import { KIND_LABEL, parseLink } from './links'
import { downloadQr } from './qr'
import { QrCode } from './QrCode'

const KIND_ICON: Record<LinkedFileKind, LucideIcon> = {
  presentation: PresentationIcon,
  spreadsheet: FileSpreadsheetIcon,
  document: FileTextIcon,
  pdf: FileTypeIcon,
  image: ImageIcon,
  video: VideoIcon,
  folder: FolderIcon,
  link: LinkIcon,
}
const KINDS = Object.keys(KIND_LABEL) as LinkedFileKind[]
const key = ['linked_files'] as const

/** Files and Links: presentations, spreadsheets, documents, pictures and links, kept in Google Drive and shown here. */
export default function LibraryPage() {
  const { profile, programs } = useAuth()
  const ws = useWorkspace()
  const lookups = useActivityLookups()
  const queryClient = useQueryClient()
  const [kind, setKind] = useState<LinkedFileKind | ''>('')
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)
  const [viewing, setViewing] = useState<LinkedFileRow | null>(null)
  const [qrFor, setQrFor] = useState<LinkedFileRow | null>(null)

  const files = useQuery({
    queryKey: [...key, ws.selectedProgramIds],
    enabled: ws.selectedProgramIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('linked_files')
        .select('*')
        .in('program_id', ws.selectedProgramIds)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as LinkedFileRow[]
    },
  })
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('linked_files').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  })

  const all = useMemo(() => files.data ?? [], [files.data])
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return all.filter(
      (f) =>
        (!kind || f.kind === kind) &&
        (!q || `${f.title} ${f.description ?? ''}`.toLowerCase().includes(q)),
    )
  }, [all, kind, search])
  const programIds = programs.map((p) => p.id)
  const mine = programs.filter((p) => !p.archived_at && ws.selectedProgramIds.includes(p.id))
  const canRemove = (f: LinkedFileRow) =>
    f.created_by === profile?.id || canManageProgram(profile, programIds, f.program_id)

  return (
    <div className="space-y-5">
      <PageHeader
        title="Files and Links"
        description="Slides, spreadsheets, documents, pictures and links shared by the program, viewed without leaving PAYEW."
        actions={
          mine.length > 0 && (
            <Button onClick={() => setAdding(true)}>
              <PlusIcon /> Link a file
            </Button>
          )
        }
      />

      <div className="border-primary/30 bg-primary/5 flex items-start gap-2 rounded-md border px-3 py-2 text-sm">
        <InfoIcon className="text-primary mt-0.5 size-4 shrink-0" />
        <p>
          For now, files are <b>linked from Google Drive</b>, not uploaded. Share the file in Drive
          with “Anyone with the link can view”, then paste its link here. Uploading straight to
          PAYEW will be turned on once file storage is available.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by kind">
          {(['', ...KINDS] as const).map((k) => {
            const count = k ? all.filter((f) => f.kind === k).length : all.length
            if (k && !count) return null
            return (
              <button
                key={k || 'all'}
                type="button"
                aria-pressed={kind === k}
                onClick={() => setKind(k)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm',
                  kind === k
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'bg-card hover:bg-accent',
                )}
              >
                {k ? `${KIND_LABEL[k]}s` : 'All'}
                <span
                  className={cn(
                    'rounded-full px-1.5 text-xs tabular-nums',
                    kind === k ? 'bg-primary-foreground/20' : 'bg-muted',
                  )}
                >
                  {count}
                </span>
              </button>
            )
          })}
        </div>
        <div className="relative ml-auto w-full sm:w-64">
          <SearchIcon className="text-muted-foreground absolute top-2.5 left-2.5 size-4" />
          <Input
            aria-label="Search files"
            placeholder="Search…"
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {files.isError ? (
        <ErrorState onRetry={() => void files.refetch()} />
      ) : files.isPending && ws.selectedProgramIds.length > 0 ? (
        <Skeleton className="h-64" />
      ) : shown.length === 0 ? (
        <EmptyState
          icon={PresentationIcon}
          title={all.length ? 'Nothing matches' : 'No files linked yet'}
          description={
            all.length
              ? 'Change the filter or search.'
              : 'Link a presentation, spreadsheet, document, picture or folder from Google Drive.'
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {shown.map((f) => {
            const Icon = KIND_ICON[f.kind]
            const program = lookups.program.get(f.program_id)
            return (
              <article
                key={f.id}
                className="bg-card group hover:border-primary/60 relative flex flex-col rounded-lg border p-4 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <span className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-md">
                    <Icon className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="line-clamp-2 text-sm font-semibold">
                      <button
                        type="button"
                        className="text-left after:absolute after:inset-0"
                        onClick={() => setViewing(f)}
                      >
                        {f.title}
                      </button>
                    </h3>
                    <p className="text-muted-foreground text-xs">{KIND_LABEL[f.kind]}</p>
                  </div>
                  <button
                    type="button"
                    className="hover:border-primary focus-visible:ring-ring relative z-10 shrink-0 rounded border bg-white p-0.5 outline-none focus-visible:ring-2"
                    aria-label={`Show the QR code for ${f.title}`}
                    title="Scan to open on a phone. Click to enlarge."
                    onClick={() => setQrFor(f)}
                  >
                    <QrCode value={f.url} className="size-16" />
                  </button>
                </div>
                {f.description && (
                  <p className="text-muted-foreground mt-2 line-clamp-3 text-sm">{f.description}</p>
                )}
                <div className="text-muted-foreground mt-auto flex flex-wrap items-center gap-2 pt-3 text-xs">
                  {ws.selectedProgramIds.length > 1 && program && <ProgramChip program={program} />}
                  <span className="min-w-0 flex-1 truncate">
                    {lookups.name.person(f.created_by) || 'Someone'} · {formatDate(f.created_at)}
                  </span>
                  {canRemove(f) && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="relative z-10 size-7"
                      aria-label={`Remove ${f.title}`}
                      onClick={() => {
                        if (
                          !window.confirm(
                            `Remove the link to “${f.title}”? The file itself stays in Drive.`,
                          )
                        )
                          return
                        remove
                          .mutateAsync(f.id)
                          .then(() => toast.success('Link removed'))
                          .catch((e) => toast.error(errorMessage(e)))
                      }}
                    >
                      <Trash2Icon className="size-3.5" />
                    </Button>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}

      {adding && (
        <AddDialog
          programs={mine}
          fiscalYearId={ws.fiscalYear?.id ?? null}
          onClose={() => setAdding(false)}
        />
      )}
      {viewing && (
        <Viewer file={viewing} onClose={() => setViewing(null)} onQr={() => setQrFor(viewing)} />
      )}
      {qrFor && <QrDialog file={qrFor} onClose={() => setQrFor(null)} />}
    </div>
  )
}

function QrDialog({ file, onClose }: { file: LinkedFileRow; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="pr-8">{file.title}</DialogTitle>
          <DialogDescription>
            Scan with a phone camera to open this {KIND_LABEL[file.kind].toLowerCase()}.
          </DialogDescription>
        </DialogHeader>
        <QrCode value={file.url} className="mx-auto w-full max-w-72 rounded-md border" />
        <p className="text-muted-foreground text-center text-xs break-all">{file.url}</p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button onClick={() => downloadQr(file.url, file.title)}>
            <DownloadIcon /> Download PNG
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Viewer({
  file,
  onClose,
  onQr,
}: {
  file: LinkedFileRow
  onClose: () => void
  onQr: () => void
}) {
  const parsed = parseLink(file.url)
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex h-[92vh] flex-col sm:max-w-[min(96vw,1500px)]">
        <DialogHeader>
          <DialogTitle className="pr-8">{file.title}</DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-3">
            <span>{KIND_LABEL[file.kind]}</span>
            <a
              href={file.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary inline-flex items-center gap-1 font-medium hover:underline"
            >
              <ExternalLinkIcon className="size-3.5" /> Open in a new tab
            </a>
            <button
              type="button"
              className="text-primary inline-flex items-center gap-1 font-medium hover:underline"
              onClick={onQr}
            >
              <QrCodeIcon className="size-3.5" /> QR code
            </button>
          </DialogDescription>
        </DialogHeader>
        <div className="bg-muted min-h-0 flex-1 overflow-hidden rounded-md border">
          {parsed?.imageUrl ? (
            <div className="flex h-full items-center justify-center overflow-auto">
              <img
                src={parsed.imageUrl}
                alt={file.title}
                className="max-h-full max-w-full object-contain"
              />
            </div>
          ) : parsed?.embedUrl ? (
            <iframe
              title={file.title}
              src={parsed.embedUrl}
              className="size-full bg-white"
              allow="fullscreen"
              allowFullScreen
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm">
              <p>This link can’t be shown inside PAYEW.</p>
              <Button asChild>
                <a href={file.url} target="_blank" rel="noopener noreferrer">
                  <ExternalLinkIcon /> Open it in a new tab
                </a>
              </Button>
            </div>
          )}
        </div>
        {parsed?.embedUrl && parsed.google && (
          <p className="text-muted-foreground text-xs">
            If it asks you to sign in or says you need access, the file isn’t shared with “Anyone
            with the link can view”.
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}

function AddDialog({
  programs,
  fiscalYearId,
  onClose,
}: {
  programs: { id: string; code: string; name: string }[]
  fiscalYearId: string | null
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [programId, setProgramId] = useState(programs[0]?.id ?? '')
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [picked, setPicked] = useState<LinkedFileKind | ''>('')
  const [description, setDescription] = useState('')
  const parsed = url.trim() ? parseLink(url) : null
  const kind = picked || parsed?.kind || 'link'
  const invalid = url.trim() !== '' && !parsed
  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('linked_files').insert({
        program_id: programId,
        fiscal_year_id: fiscalYearId,
        title: title.trim(),
        url: url.trim(),
        kind,
        description: description.trim() || null,
      } as never)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  })
  const submit = () =>
    add
      .mutateAsync()
      .then(() => {
        toast.success('File linked')
        onClose()
      })
      .catch((e) => toast.error(errorMessage(e)))

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Link a file</DialogTitle>
          <DialogDescription>
            In Google Drive choose Share → “Anyone with the link” → Viewer, copy the link and paste
            it below.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="lf-url">Link</Label>
            <Input
              id="lf-url"
              placeholder="https://drive.google.com/…"
              value={url}
              aria-invalid={invalid}
              onChange={(e) => setUrl(e.target.value)}
            />
            {invalid ? (
              <p className="text-destructive text-xs">
                Paste a full link that starts with https://
              </p>
            ) : parsed ? (
              <p className="text-muted-foreground text-xs">
                {parsed.embedUrl || parsed.imageUrl
                  ? 'This can be viewed inside PAYEW.'
                  : 'This will open in a new tab; only Google Drive files, pictures and YouTube can be shown inside PAYEW.'}
              </p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lf-title">Name</Label>
            <Input
              id="lf-title"
              maxLength={200}
              placeholder="e.g. AMIA mid-year assessment slides"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="lf-kind">Kind</Label>
              <SelectNative
                id="lf-kind"
                value={kind}
                onChange={(e) => setPicked(e.target.value as LinkedFileKind)}
              >
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABEL[k]}
                  </option>
                ))}
              </SelectNative>
            </div>
            {programs.length > 1 && (
              <div className="space-y-1.5">
                <Label htmlFor="lf-program">Program</Label>
                <SelectNative
                  id="lf-program"
                  value={programId}
                  onChange={(e) => setProgramId(e.target.value)}
                >
                  {programs.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} — {p.name}
                    </option>
                  ))}
                </SelectNative>
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lf-desc">Description (optional)</Label>
            <Textarea
              id="lf-desc"
              rows={2}
              maxLength={1000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              disabled={!parsed || !title.trim() || !programId || add.isPending}
              onClick={() => void submit()}
            >
              {add.isPending && <Loader2Icon className="animate-spin" />} Link file
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
