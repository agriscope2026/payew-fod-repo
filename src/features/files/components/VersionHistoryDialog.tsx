import { DownloadIcon, EyeIcon, HistoryIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { useProfileNames } from '@/features/users/api'
import { formatBytes, formatDateTime } from '@/lib/format'
import { errorMessage } from '@/lib/supabase'
import type { AttachmentRow } from '@/types/database'
import { downloadAttachment, useVersions } from '../api'
import { isPreviewable } from '../utils'

export function VersionHistoryDialog({
  file,
  onClose,
  onPreview,
}: {
  file: AttachmentRow | null
  onClose: () => void
  onPreview: (version: AttachmentRow) => void
}) {
  const { data: versions, isPending } = useVersions(file?.version_group_id ?? null)
  const { data: names } = useProfileNames()

  return (
    <Dialog open={!!file} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HistoryIcon className="text-primary size-5" /> Version history
          </DialogTitle>
          <DialogDescription className="truncate">{file?.file_name}</DialogDescription>
        </DialogHeader>
        <ol className="max-h-[60vh] divide-y overflow-y-auto rounded-md border">
          {isPending
            ? Array.from({ length: 2 }, (_, i) => (
                <li key={i} className="p-3">
                  <Skeleton className="h-10" />
                </li>
              ))
            : versions?.map((v) => (
                <li key={v.id} className="flex items-center gap-3 p-3">
                  <Badge variant={v.is_latest ? 'default' : 'secondary'}>v{v.version}</Badge>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{v.file_name}</p>
                    <p className="text-muted-foreground text-xs">
                      {formatDateTime(v.created_at)} ·{' '}
                      {names?.get(v.uploaded_by ?? '') ?? 'Unknown'} · {formatBytes(v.size_bytes)}
                    </p>
                  </div>
                  {isPreviewable(v.file_name) && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      aria-label="Preview"
                      onClick={() => onPreview(v)}
                    >
                      <EyeIcon />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    aria-label={`Download version ${v.version}`}
                    onClick={() =>
                      downloadAttachment(v.id).catch((e) => toast.error(errorMessage(e)))
                    }
                  >
                    <DownloadIcon />
                  </Button>
                </li>
              ))}
        </ol>
      </DialogContent>
    </Dialog>
  )
}
