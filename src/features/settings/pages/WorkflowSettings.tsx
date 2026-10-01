import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  CopyIcon,
  GitBranchIcon,
  Loader2Icon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  StarIcon,
} from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { EmptyState } from '@/components/common/EmptyState'
import { FormField } from '@/components/common/FormField'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { useAuth } from '@/features/auth/auth-context'
import { canManageProgram } from '@/features/auth/permissions'
import {
  useArchiveTemplate,
  useCreateTemplate,
  useSetDefaultTemplate,
  useTemplateStages,
  useWorkflowTemplates,
} from '@/features/workflows/api'
import { WorkflowEditor } from '@/features/workflows/components/WorkflowEditor'
import { errorMessage } from '@/lib/supabase'
import type { WorkflowTemplateRow } from '@/types/database'

const DA_WIDE = '__da__'

/**
 * Superadmin: the DA-wide default (and any program's workflows).
 * Program admin: their programs' workflows; the DA-wide default is read-only.
 */
export default function WorkflowSettings() {
  const { isSuperadmin, programs, profile } = useAuth()
  const { data: templates = [], isPending } = useWorkflowTemplates()
  const create = useCreateTemplate()
  const setDefault = useSetDefaultTemplate()
  const archive = useArchiveTemplate()

  const programIds = programs.map((p) => p.id)
  const scopes = [
    ...(isSuperadmin ? [{ id: DA_WIDE, label: 'DA-wide default' }] : []),
    ...programs
      .filter((p) => canManageProgram(profile, programIds, p.id))
      .map((p) => ({ id: p.id, label: `${p.code} · ${p.name}` })),
  ]
  const [scope, setScope] = useState(scopes[0]?.id ?? DA_WIDE)
  const programId = scope === DA_WIDE ? null : scope
  const [editingId, setEditingId] = useState<string | null>(null)
  const editing = templates.find((t) => t.id === editingId) ?? null
  const [creating, setCreating] = useState(false)

  const inScope = useMemo(
    () => templates.filter((t) => t.program_id === programId),
    [templates, programId],
  )
  const daWide = templates.filter((t) => t.program_id === null && t.is_active)
  const canManageScope =
    programId === null ? isSuperadmin : canManageProgram(profile, programIds, programId)

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn()
      toast.success(ok)
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-muted-foreground max-w-2xl text-sm">
          New activities start from their program's default workflow (or the DA-wide default).
          Editing a workflow never changes activities already created. Admins can switch an existing
          activity to an updated workflow from its page.
        </p>
        <div className="flex items-center gap-2">
          {scopes.length > 1 && (
            <SelectNative
              aria-label="Scope"
              className="w-64"
              value={scope}
              onChange={(e) => setScope(e.target.value)}
            >
              {scopes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </SelectNative>
          )}
          {canManageScope && (
            <Button onClick={() => setCreating(true)}>
              <PlusIcon /> New workflow
            </Button>
          )}
        </div>
      </div>

      {isPending ? (
        <Skeleton className="h-40" />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {programId !== null &&
            daWide.map((t) => (
              <TemplateCard
                key={t.id}
                template={t}
                note="DA-wide · used when the program has no default"
                readOnly
                onOpen={() => setEditingId(t.id)}
              />
            ))}
          {inScope.map((t) => (
            <TemplateCard
              key={t.id}
              template={t}
              readOnly={!canManageScope}
              onOpen={() => setEditingId(t.id)}
              menu={
                canManageScope && (
                  <>
                    <DropdownMenuItem onSelect={() => setEditingId(t.id)}>
                      <PencilIcon /> Edit stages
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() =>
                        void run(
                          () =>
                            create.mutateAsync({
                              programId,
                              name: `${t.name} (copy)`,
                              copyFrom: t.id,
                            }),
                          'Copy created',
                        )
                      }
                    >
                      <CopyIcon /> Duplicate
                    </DropdownMenuItem>
                    {t.is_active && !t.is_default && (
                      <DropdownMenuItem
                        onSelect={() =>
                          void run(
                            () => setDefault.mutateAsync(t.id),
                            `${t.name} is now the default`,
                          )
                        }
                      >
                        <StarIcon /> Set as default
                      </DropdownMenuItem>
                    )}
                    {!(t.program_id === null && t.is_default) && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant={t.is_active ? 'destructive' : 'default'}
                          onSelect={() =>
                            void run(
                              () => archive.mutateAsync({ id: t.id, active: !t.is_active }),
                              t.is_active ? 'Workflow archived' : 'Workflow restored',
                            )
                          }
                        >
                          {t.is_active ? <ArchiveIcon /> : <ArchiveRestoreIcon />}
                          {t.is_active ? 'Archive' : 'Restore'}
                        </DropdownMenuItem>
                      </>
                    )}
                  </>
                )
              }
            />
          ))}
          {inScope.length === 0 && programId !== null && (
            <Card className="md:col-span-1 xl:col-span-2">
              <CardContent>
                <EmptyState
                  icon={GitBranchIcon}
                  title="No program workflows yet"
                  description="This program uses the DA-wide default. Create a copy to customize stages for your program."
                />
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditingId(null)}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>{editing?.name}</DialogTitle>
            <DialogDescription>
              Expand a stage to set its description, responsible role, required documents and
              required fields. Required documents become checklist items on each activity.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <EditorLoader
              template={editing}
              readOnly={
                !(editing.program_id === null
                  ? isSuperadmin
                  : canManageProgram(profile, programIds, editing.program_id))
              }
              onDone={() => setEditingId(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <CreateDialog
        open={creating}
        onOpenChange={setCreating}
        sources={[...daWide, ...inScope.filter((t) => t.is_active && t.program_id !== null)]}
        onCreate={async (name, copyFrom) => {
          const id = await create.mutateAsync({ programId, name, copyFrom })
          toast.success('Workflow created')
          setCreating(false)
          setEditingId(id) // opens once the refreshed list contains it
        }}
      />
    </div>
  )
}

function EditorLoader({
  template,
  readOnly,
  onDone,
}: {
  template: WorkflowTemplateRow
  readOnly: boolean
  onDone: () => void
}) {
  const { data: stages, isPending } = useTemplateStages(template.id)
  if (isPending || !stages) return <Skeleton className="h-64" />
  return <WorkflowEditor template={template} stages={stages} readOnly={readOnly} onDone={onDone} />
}

function TemplateCard({
  template: t,
  note,
  readOnly,
  onOpen,
  menu,
}: {
  template: WorkflowTemplateRow
  note?: string
  readOnly?: boolean
  onOpen: () => void
  menu?: ReactNode
}) {
  return (
    <Card className={t.is_active ? 'gap-2 py-4' : 'gap-2 py-4 opacity-60'}>
      <CardContent className="space-y-2 px-4">
        <div className="flex items-start gap-2">
          <GitBranchIcon className="text-primary mt-0.5 size-4 shrink-0" />
          <button
            type="button"
            onClick={onOpen}
            className="min-w-0 flex-1 text-left font-medium hover:underline"
          >
            {t.name}
          </button>
          {menu && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  aria-label={`Actions for ${t.name}`}
                >
                  <MoreHorizontalIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">{menu}</DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {t.is_default && (
            <Badge className="gap-1">
              <StarIcon className="fill-current" /> Default
            </Badge>
          )}
          {!t.is_active && <Badge variant="outline">Archived</Badge>}
          {readOnly && <Badge variant="secondary">View only</Badge>}
        </div>
        <p className="text-muted-foreground line-clamp-2 text-xs">
          {note ?? t.description ?? 'No description'}
        </p>
      </CardContent>
    </Card>
  )
}

function CreateDialog({
  open,
  onOpenChange,
  sources,
  onCreate,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  sources: WorkflowTemplateRow[]
  onCreate: (name: string, copyFrom: string) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [copyFrom, setCopyFrom] = useState('')
  const [busy, setBusy] = useState(false)
  const source = copyFrom || sources[0]?.id || ''

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New workflow</DialogTitle>
          <DialogDescription>
            Start from a copy of an existing workflow, then edit its stages.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <FormField id="new-wf-name" label="Name">
            <Input
              id="new-wf-name"
              placeholder="e.g. Goods Procurement, Training"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </FormField>
          <FormField id="new-wf-src" label="Copy stages from">
            <SelectNative
              id="new-wf-src"
              value={source}
              onChange={(e) => setCopyFrom(e.target.value)}
            >
              {sources.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.program_id === null ? ' (DA-wide)' : ''}
                </option>
              ))}
            </SelectNative>
          </FormField>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={name.trim().length < 2 || !source || busy}
            onClick={async () => {
              setBusy(true)
              try {
                await onCreate(name.trim(), source)
                setName('')
              } catch (err) {
                toast.error(errorMessage(err))
              } finally {
                setBusy(false)
              }
            }}
          >
            {busy && <Loader2Icon className="animate-spin" />} Create
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
