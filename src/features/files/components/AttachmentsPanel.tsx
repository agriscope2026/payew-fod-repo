import { DownloadIcon, EyeIcon, PaperclipIcon, Trash2Icon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog, type ConfirmOptions } from '@/components/common/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { SelectNative } from '@/components/ui/select-native'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/features/auth/auth-context'
import { canManageProgram } from '@/features/auth/permissions'
import { useMasterList } from '@/features/settings/master-lists/api'
import { formatBytes, formatRelative } from '@/lib/format'
import { errorMessage } from '@/lib/supabase'
import type { AttachmentRow } from '@/types/database'
import {
  downloadAttachment,
  useEntityAttachments,
  useTrashAttachment,
  useUploadPolicy,
} from '../api'
import { useUploadQueue } from '../use-upload-queue'
import { FileDropzone } from './FileDropzone'
import { FilePreviewDialog } from './FilePreviewDialog'
import { isPreviewable } from '../utils'
import { FileTypeIcon } from './FileIcon'
import { UploadQueue } from './UploadQueue'

/**
 * Drop-in attachments for any record:
 *   <AttachmentsPanel entityType="activity" entityId={id} programId={programId} canUpload />
 * Files also appear in the Document Repository ("Attached to records").
 */
export function AttachmentsPanel({
  entityType,
  entityId,
  programId,
  fiscalYearId,
  canUpload,
  documentTypePicker = false,
}: {
  entityType: string
  entityId: string
  programId: string | null
  fiscalYearId?: string | null
  canUpload: boolean
  /** Show a "document type" select; required-document checklist items tick automatically. */
  documentTypePicker?: boolean
}) {
  const { profile, programs, user } = useAuth()
  const { data: files, isPending } = useEntityAttachments(entityType, entityId)
  const { data: policy } = useUploadPolicy()
  const queue = useUploadQueue(
    policy ?? { max_mb: 25, allowed_extensions: [], presign_ttl_seconds: 600 },
  )
  const trash = useTrashAttachment()
  const [preview, setPreview] = useState<AttachmentRow | null>(null)
  const [confirm, setConfirm] = useState<ConfirmOptions | null>(null)
  const [docTypeId, setDocTypeId] = useState('')
  const { data: docTypes = [] } = useMasterList('document_types', {}, { activeOnly: true })
  const docTypeById = new Map(docTypes.map((d) => [d.id, d]))

  const programIds = programs.map((p) => p.id)
  const canRemove = (f: AttachmentRow) =>
    f.uploaded_by === user?.id ||
    (f.program_id
      ? canManageProgram(profile, programIds, f.program_id)
      : profile?.role === 'superadmin')

  return (
    <div className="space-y-3">
      {isPending ? (
        <Skeleton className="h-14" />
      ) : files?.length ? (
        <ul className="divide-y rounded-lg border">
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-3 px-3 py-2">
              <FileTypeIcon fileName={f.file_name} className="size-8" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{f.file_name}</p>
                <p className="text-muted-foreground text-xs">
                  {formatBytes(f.size_bytes)} · {formatRelative(f.created_at)}
                  {f.version > 1 && ` · v${f.version}`}
                  {f.document_type_id &&
                    docTypeById.has(f.document_type_id) &&
                    ` · ${String(docTypeById.get(f.document_type_id)!.code)}`}
                </p>
              </div>
              {isPreviewable(f.file_name) && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  aria-label="Preview"
                  onClick={() => setPreview(f)}
                >
                  <EyeIcon />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label="Download"
                onClick={() => downloadAttachment(f.id).catch((e) => toast.error(errorMessage(e)))}
              >
                <DownloadIcon />
              </Button>
              {canRemove(f) && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive size-8"
                  aria-label="Move to Trash"
                  onClick={() =>
                    setConfirm({
                      title: `Move ${f.file_name} to Trash?`,
                      description: 'Admins can restore it from the Document Repository Trash.',
                      confirmLabel: 'Move to Trash',
                      destructive: true,
                      onConfirm: () =>
                        trash
                          .mutateAsync({ versionGroupId: f.version_group_id })
                          .catch((e) => toast.error(errorMessage(e))),
                    })
                  }
                >
                  <Trash2Icon />
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <PaperclipIcon className="size-4" /> No attachments yet.
        </p>
      )}

      {canUpload && policy && (
        <>
          {documentTypePicker && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <label htmlFor={`doc-type-${entityId}`} className="text-muted-foreground">
                Document type for the next upload
              </label>
              <SelectNative
                id={`doc-type-${entityId}`}
                className="w-64"
                value={docTypeId}
                onChange={(e) => setDocTypeId(e.target.value)}
              >
                <option value="">Unclassified</option>
                {docTypes.map((d) => (
                  <option key={d.id} value={d.id}>
                    {String(d.code)} · {String(d.name)}
                  </option>
                ))}
              </SelectNative>
            </div>
          )}
          <FileDropzone
            compact
            policy={policy}
            disabled={queue.running}
            onFiles={(list) =>
              void queue.run(list, {
                program_id: programId,
                fiscal_year_id: fiscalYearId ?? null,
                entity_type: entityType,
                entity_id: entityId,
                document_type_id: docTypeId || null,
              })
            }
          />
          <UploadQueue items={queue.items.filter((i) => i.status !== 'done')} />
        </>
      )}

      <FilePreviewDialog file={preview} onClose={() => setPreview(null)} />
      <ConfirmDialog options={confirm} onClose={() => setConfirm(null)} />
    </div>
  )
}
