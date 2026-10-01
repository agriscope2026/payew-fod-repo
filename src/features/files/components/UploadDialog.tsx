import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { FormField } from '@/components/common/FormField'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { SelectNative } from '@/components/ui/select-native'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/features/auth/auth-context'
import { canWriteProgram } from '@/features/auth/permissions'
import { useMasterList } from '@/features/settings/master-lists/api'
import { useWorkspace } from '@/features/workspace/workspace-context'
import type { AttachmentRow } from '@/types/database'
import { useFolders, useUploadPolicy } from '../api'
import { useUploadQueue } from '../use-upload-queue'
import { parseTags } from '../utils'
import { FileDropzone } from './FileDropzone'
import { UploadQueue } from './UploadQueue'

const SHARED = '__shared__'

interface UploadDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Present = upload a new version of this file (metadata is inherited). */
  replaces?: AttachmentRow | null
}

/** Repository upload: pick where the files belong, then drop files. Also used for new versions. */
export function UploadDialog(props: UploadDialogProps) {
  // Mounting the body per opening gives every session fresh form state.
  return props.open ? <UploadDialogBody key={props.replaces?.id ?? 'new'} {...props} /> : null
}

function UploadDialogBody({ onOpenChange, replaces }: UploadDialogProps) {
  const { profile, programs, isSuperadmin } = useAuth()
  const ws = useWorkspace()
  const { data: policy } = useUploadPolicy()
  const { data: docTypes = [] } = useMasterList('document_types', {}, { activeOnly: true })
  const { data: folders = [] } = useFolders(ws.selectedProgramIds)

  const programIds = programs.map((p) => p.id)
  const writable = useMemo(
    () => programs.filter((p) => !p.archived_at && canWriteProgram(profile, programIds, p.id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [programs, profile],
  )

  const defaultProgram =
    ws.programFilter !== 'all' && writable.some((p) => p.id === ws.programFilter)
      ? ws.programFilter
      : (writable[0]?.id ?? (isSuperadmin ? SHARED : ''))

  const [programId, setProgramId] = useState(defaultProgram)
  const [fiscalYearId, setFiscalYearId] = useState(ws.fiscalYear?.id ?? '')
  const [docTypeId, setDocTypeId] = useState(replaces?.document_type_id ?? '')
  const [folder, setFolder] = useState(replaces?.folder ?? '')
  const [tags, setTags] = useState(replaces?.tags.join(', ') ?? '')
  const [description, setDescription] = useState(replaces?.description ?? '')
  const queue = useUploadQueue(
    policy ?? { max_mb: 25, allowed_extensions: [], presign_ttl_seconds: 600 },
  )

  const ready = !!policy && (replaces || programId)

  const onFiles = async (files: File[]) => {
    const result = await queue.run(
      files,
      replaces
        ? {
            program_id: replaces.program_id,
            replaces_id: replaces.id,
            document_type_id: docTypeId || null,
            folder: folder.trim() || null,
            tags: parseTags(tags),
            description: description.trim() || null,
          }
        : {
            program_id: programId === SHARED ? null : programId,
            fiscal_year_id: fiscalYearId || null,
            entity_type: 'repository',
            document_type_id: docTypeId || null,
            folder: folder.trim() || null,
            tags: parseTags(tags),
            description: description.trim() || null,
          },
    )
    if (result.succeeded) {
      toast.success(
        replaces
          ? `Version ${replaces.version + 1} uploaded`
          : `${result.succeeded} file${result.succeeded > 1 ? 's' : ''} uploaded`,
      )
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o && queue.running) return // keep open while uploading
        onOpenChange(o)
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{replaces ? 'Upload new version' : 'Upload documents'}</DialogTitle>
          <DialogDescription>
            {replaces
              ? `Replaces ${replaces.file_name} (v${replaces.version}). Earlier versions stay in the history.`
              : 'Set where the files belong, then drop them below. Files go straight to secure storage.'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          {!replaces && (
            <>
              <FormField id="up-program" label="Program">
                <SelectNative
                  id="up-program"
                  value={programId}
                  onChange={(e) => setProgramId(e.target.value)}
                  disabled={queue.running}
                >
                  {writable.length === 0 && !isSuperadmin && (
                    <option value="">No program you can upload to</option>
                  )}
                  {writable.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} · {p.name}
                    </option>
                  ))}
                  {isSuperadmin && <option value={SHARED}>DA-wide (all programs)</option>}
                </SelectNative>
              </FormField>
              <FormField id="up-fy" label="Fiscal year">
                <SelectNative
                  id="up-fy"
                  value={fiscalYearId}
                  onChange={(e) => setFiscalYearId(e.target.value)}
                  disabled={queue.running}
                >
                  <option value="">Not year-specific</option>
                  {ws.fiscalYears
                    .filter((f) => f.status !== 'locked')
                    .map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.label}
                      </option>
                    ))}
                </SelectNative>
              </FormField>
            </>
          )}
          <FormField id="up-type" label="Document type">
            <SelectNative
              id="up-type"
              value={docTypeId}
              onChange={(e) => setDocTypeId(e.target.value)}
              disabled={queue.running}
            >
              <option value="">Unclassified</option>
              {docTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {String(t.code)} · {String(t.name)}
                </option>
              ))}
            </SelectNative>
          </FormField>
          <FormField id="up-folder" label="Folder" hint="Optional, e.g. Procurement/Q3">
            <Input
              id="up-folder"
              list="up-folder-options"
              value={folder}
              maxLength={200}
              onChange={(e) => setFolder(e.target.value)}
              disabled={queue.running}
            />
            <datalist id="up-folder-options">
              {folders.map((f) => (
                <option key={f} value={f} />
              ))}
            </datalist>
          </FormField>
          <FormField id="up-tags" label="Tags" hint="Comma-separated, e.g. benguet, coffee">
            <Input
              id="up-tags"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              disabled={queue.running}
            />
          </FormField>
          <div className="sm:col-span-2">
            <FormField id="up-desc" label="Description">
              <Textarea
                id="up-desc"
                rows={2}
                maxLength={2000}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={queue.running}
              />
            </FormField>
          </div>
        </div>

        {policy && (
          <FileDropzone
            policy={policy}
            multiple={!replaces}
            disabled={!ready || queue.running}
            onFiles={(files) => void onFiles(files)}
          />
        )}
        <UploadQueue items={queue.items} />

        <div className="flex justify-end gap-2">
          {queue.running ? (
            <Button variant="outline" onClick={queue.cancel}>
              Cancel remaining
            </Button>
          ) : (
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
