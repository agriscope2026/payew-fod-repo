import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CornerDownRightIcon,
  Loader2Icon,
  PlusIcon,
  Trash2Icon,
} from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { FormField } from '@/components/common/FormField'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { SelectNative } from '@/components/ui/select-native'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { ROLE_LABELS } from '@/features/auth/permissions'
import { useMasterList } from '@/features/settings/master-lists/api'
import { errorMessage } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import type { WorkflowStageRow, WorkflowTemplateRow } from '@/types/database'
import { toDrafts, useSaveTemplate, type StageDraft } from '../api'
import { PHASES, REQUIRED_FIELD_OPTIONS } from '../constants'

const newStage = (phase: StageDraft['phase_key'] = 'other'): StageDraft => ({
  key: crypto.randomUUID(),
  name: '',
  description: '',
  phase_key: phase,
  responsible_role: '',
  expected_days: 5,
  required_documents: [],
  required_fields: [],
  skippable: false,
  substeps: [],
})

function move<T>(list: T[], from: number, to: number) {
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

/** Edits a template's name and its ordered stages (one level of sub-steps). */
export function WorkflowEditor({
  template,
  stages,
  readOnly,
  onDone,
}: {
  template: WorkflowTemplateRow
  stages: WorkflowStageRow[]
  readOnly: boolean
  onDone: () => void
}) {
  const save = useSaveTemplate()
  const [name, setName] = useState(template.name)
  const [description, setDescription] = useState(template.description ?? '')
  const [drafts, setDrafts] = useState<StageDraft[]>(() => toDrafts(stages))
  const [open, setOpen] = useState<string | null>(null)

  const totalDays = drafts.reduce((a, s) => a + (Number(s.expected_days) || 0), 0)
  const invalid =
    !name.trim() ||
    drafts.length === 0 ||
    drafts.some((s) => !s.name.trim() || s.substeps.some((c) => !c.name.trim()))

  const updateAt = (path: number[], patch: Partial<StageDraft>) =>
    setDrafts((list) =>
      list.map((s, i) =>
        i !== path[0]
          ? s
          : path.length === 1
            ? { ...s, ...patch }
            : {
                ...s,
                substeps: s.substeps.map((c, j) => (j === path[1] ? { ...c, ...patch } : c)),
              },
      ),
    )

  const submit = async () => {
    try {
      await save.mutateAsync({ id: template.id, name, description, stages: drafts })
      toast.success(
        'Workflow saved. New activities will use it; existing ones keep their current stages.',
      )
      onDone()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-[1fr_1.5fr]">
        <FormField id="wf-name" label="Workflow name">
          <Input
            id="wf-name"
            value={name}
            disabled={readOnly}
            onChange={(e) => setName(e.target.value)}
          />
        </FormField>
        <FormField id="wf-desc" label="Description">
          <Input
            id="wf-desc"
            value={description}
            disabled={readOnly}
            onChange={(e) => setDescription(e.target.value)}
          />
        </FormField>
      </div>

      <div className="flex items-center justify-between text-sm">
        <p className="font-medium">
          {drafts.length} stages · about {totalDays} days end to end
        </p>
        {!readOnly && (
          <Button variant="outline" size="sm" onClick={() => setDrafts([...drafts, newStage()])}>
            <PlusIcon /> Add stage
          </Button>
        )}
      </div>

      <ol className="space-y-2">
        {drafts.map((stage, i) => (
          <li key={stage.key} className="bg-card rounded-lg border">
            <StageRow
              stage={stage}
              index={i}
              count={drafts.length}
              readOnly={readOnly}
              expanded={open === stage.key}
              onToggle={() => setOpen(open === stage.key ? null : stage.key)}
              onChange={(patch) => updateAt([i], patch)}
              onMove={(to) => setDrafts(move(drafts, i, to))}
              onRemove={() => setDrafts(drafts.filter((_, j) => j !== i))}
            />
            {(stage.substeps.length > 0 || open === stage.key) && (
              <div className="bg-muted/30 space-y-2 border-t px-3 py-2">
                {stage.substeps.map((sub, j) => (
                  <div key={sub.key} className="flex items-start gap-2">
                    <CornerDownRightIcon className="text-muted-foreground mt-2.5 size-4 shrink-0" />
                    <div className="bg-card min-w-0 flex-1 rounded-md border">
                      <StageRow
                        stage={sub}
                        index={j}
                        count={stage.substeps.length}
                        readOnly={readOnly}
                        compact
                        expanded={open === sub.key}
                        onToggle={() => setOpen(open === sub.key ? null : sub.key)}
                        onChange={(patch) => updateAt([i, j], patch)}
                        onMove={(to) => updateAt([i], { substeps: move(stage.substeps, j, to) })}
                        onRemove={() =>
                          updateAt([i], { substeps: stage.substeps.filter((_, k) => k !== j) })
                        }
                      />
                    </div>
                  </div>
                ))}
                {!readOnly && open === stage.key && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      updateAt([i], { substeps: [...stage.substeps, newStage(stage.phase_key)] })
                    }
                  >
                    <PlusIcon /> Add sub-step
                  </Button>
                )}
              </div>
            )}
          </li>
        ))}
      </ol>

      {!readOnly && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {invalid && (
            <p className="text-destructive mr-auto text-sm">
              Every stage and sub-step needs a name.
            </p>
          )}
          <Button variant="outline" onClick={onDone}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={invalid || save.isPending}>
            {save.isPending && <Loader2Icon className="animate-spin" />}
            Save workflow
          </Button>
        </div>
      )}
    </div>
  )
}

function StageRow({
  stage,
  index,
  count,
  readOnly,
  compact,
  expanded,
  onToggle,
  onChange,
  onMove,
  onRemove,
}: {
  stage: StageDraft
  index: number
  count: number
  readOnly: boolean
  compact?: boolean
  expanded: boolean
  onToggle: () => void
  onChange: (patch: Partial<StageDraft>) => void
  onMove: (to: number) => void
  onRemove: () => void
}) {
  const { data: docTypes = [] } = useMasterList('document_types', {}, { activeOnly: true })
  const toggleIn = (list: string[], v: string, on: boolean) =>
    on ? [...list, v] : list.filter((x) => x !== v)

  return (
    <div className="p-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onToggle}
          className="hover:bg-accent flex size-7 items-center justify-center rounded"
          aria-label={expanded ? 'Collapse stage' : 'Expand stage'}
          aria-expanded={expanded}
        >
          {expanded ? (
            <ChevronDownIcon className="size-4" />
          ) : (
            <ChevronRightIcon className="size-4" />
          )}
        </button>
        <span
          className={cn(
            'bg-primary/10 text-primary flex shrink-0 items-center justify-center rounded-full text-xs font-semibold',
            compact ? 'size-5' : 'size-6',
          )}
        >
          {index + 1}
        </span>
        <Input
          aria-label="Stage name"
          placeholder={compact ? 'Sub-step name' : 'Stage name'}
          value={stage.name}
          disabled={readOnly}
          onChange={(e) => onChange({ name: e.target.value })}
          className={cn('h-8 min-w-48 flex-1', !stage.name.trim() && 'border-destructive')}
        />
        <SelectNative
          aria-label="Phase"
          className="w-44"
          value={stage.phase_key}
          disabled={readOnly}
          onChange={(e) => onChange({ phase_key: e.target.value as StageDraft['phase_key'] })}
        >
          {PHASES.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </SelectNative>
        <label className="text-muted-foreground flex items-center gap-1 text-xs">
          <Input
            aria-label="Expected days"
            type="number"
            min={0}
            max={365}
            className="h-8 w-16"
            value={stage.expected_days}
            disabled={readOnly}
            onChange={(e) =>
              onChange({ expected_days: Math.max(0, Math.min(365, Number(e.target.value) || 0)) })
            }
          />
          days
        </label>
        {!readOnly && (
          <div className="flex">
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              disabled={index === 0}
              onClick={() => onMove(index - 1)}
              aria-label="Move up"
            >
              <ArrowUpIcon />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              disabled={index === count - 1}
              onClick={() => onMove(index + 1)}
              aria-label="Move down"
            >
              <ArrowDownIcon />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="text-destructive size-8"
              disabled={!compact && count === 1}
              onClick={onRemove}
              aria-label="Remove"
            >
              <Trash2Icon />
            </Button>
          </div>
        )}
      </div>

      {expanded && (
        <div className="mt-3 grid gap-4 pl-9 lg:grid-cols-2">
          <div className="space-y-3">
            <FormField id={`desc-${stage.key}`} label="Description">
              <Textarea
                id={`desc-${stage.key}`}
                rows={2}
                value={stage.description}
                disabled={readOnly}
                onChange={(e) => onChange({ description: e.target.value })}
              />
            </FormField>
            <div className="flex flex-wrap items-end gap-4">
              <FormField id={`role-${stage.key}`} label="Responsible role">
                <SelectNative
                  id={`role-${stage.key}`}
                  className="w-44"
                  value={stage.responsible_role}
                  disabled={readOnly}
                  onChange={(e) =>
                    onChange({ responsible_role: e.target.value as StageDraft['responsible_role'] })
                  }
                >
                  <option value="">Anyone</option>
                  {(['program_staff', 'program_admin', 'superadmin'] as const).map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </SelectNative>
              </FormField>
              <label className="flex items-center gap-2 pb-2 text-sm">
                <Switch
                  checked={stage.skippable}
                  disabled={readOnly}
                  onCheckedChange={(v) => onChange({ skippable: v })}
                />
                Can be skipped
              </label>
            </div>
          </div>
          <div className="space-y-3">
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium">Required documents</legend>
              <div className="flex flex-wrap gap-x-3 gap-y-1.5">
                {docTypes.map((d) => (
                  <label
                    key={d.id}
                    className="flex items-center gap-1.5 text-xs"
                    title={String(d.name)}
                  >
                    <Checkbox
                      checked={stage.required_documents.includes(String(d.code))}
                      disabled={readOnly}
                      onCheckedChange={(c) =>
                        onChange({
                          required_documents: toggleIn(
                            stage.required_documents,
                            String(d.code),
                            !!c,
                          ),
                        })
                      }
                    />
                    {String(d.code)}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium">Fields required to complete</legend>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                {REQUIRED_FIELD_OPTIONS.map((f) => (
                  <label key={f.key} className="flex items-center gap-1.5 text-xs">
                    <Checkbox
                      checked={stage.required_fields.includes(f.key)}
                      disabled={readOnly}
                      onCheckedChange={(c) =>
                        onChange({ required_fields: toggleIn(stage.required_fields, f.key, !!c) })
                      }
                    />
                    {f.label}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        </div>
      )}
    </div>
  )
}
