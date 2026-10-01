import { useQuery } from '@tanstack/react-query'
import { DownloadIcon, FileWarningIcon, Loader2Icon } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatBytes, formatDateTime } from '@/lib/format'
import { errorMessage } from '@/lib/supabase'
import type { AttachmentRow } from '@/types/database'
import { extensionOf } from '@shared/files-core'
import { downloadAttachment, getFileUrl } from '../api'
import { isPreviewable } from '../utils'

export function FilePreviewDialog({
  file,
  onClose,
}: {
  file: AttachmentRow | null
  onClose: () => void
}) {
  const previewable = !!file && isPreviewable(file.file_name)
  const {
    data: url,
    isPending,
    error,
  } = useQuery({
    queryKey: ['file-url', file?.id],
    enabled: previewable,
    queryFn: () => getFileUrl(file!.id, 'inline'),
    staleTime: 5 * 60_000, // signed URLs last ≤ 10 minutes
    gcTime: 5 * 60_000,
  })
  const [downloading, setDownloading] = useState(false)
  const isPdf = file && extensionOf(file.file_name) === 'pdf'

  return (
    <Dialog open={!!file} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex h-[90dvh] max-w-[calc(100%-2rem)] flex-col gap-3 sm:max-w-5xl">
        <DialogHeader className="pr-8">
          <DialogTitle className="truncate">{file?.file_name}</DialogTitle>
          <DialogDescription>
            {file &&
              `Version ${file.version} · ${formatBytes(file.size_bytes)} · ${formatDateTime(file.created_at)}`}
          </DialogDescription>
        </DialogHeader>

        <div className="bg-muted/40 flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-md border">
          {!previewable ? (
            <div className="text-muted-foreground flex flex-col items-center gap-2 p-6 text-center text-sm">
              <FileWarningIcon className="size-8" />
              No in-browser preview for this file type. Download it to open.
            </div>
          ) : isPending ? (
            <Loader2Icon className="text-muted-foreground size-6 animate-spin" />
          ) : error ? (
            <p className="text-destructive p-6 text-sm">{errorMessage(error)}</p>
          ) : isPdf ? (
            <iframe title={file?.file_name} src={url} className="size-full" />
          ) : (
            <img
              src={url}
              alt={file?.description ?? file?.file_name}
              className="max-h-full max-w-full object-contain"
            />
          )}
        </div>

        <div className="flex justify-end">
          <Button
            disabled={downloading}
            onClick={async () => {
              if (!file) return
              setDownloading(true)
              try {
                await downloadAttachment(file.id)
              } finally {
                setDownloading(false)
              }
            }}
          >
            {downloading ? <Loader2Icon className="animate-spin" /> : <DownloadIcon />} Download
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
