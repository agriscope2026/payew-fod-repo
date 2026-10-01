import { CheckCircle2Icon, Loader2Icon, XCircleIcon } from 'lucide-react'
import { formatBytes } from '@/lib/format'
import { cn } from '@/lib/utils'
import { FileTypeIcon } from './FileIcon'

export interface QueueItem {
  key: string
  file: File
  status: 'queued' | 'uploading' | 'done' | 'error'
  progress: number
  error?: string
}

export function UploadQueue({ items }: { items: QueueItem[] }) {
  if (!items.length) return null
  return (
    <ul className="divide-y rounded-lg border" aria-label="Uploads">
      {items.map((item) => (
        <li key={item.key} className="flex items-center gap-3 px-3 py-2">
          <FileTypeIcon fileName={item.file.name} className="size-8" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{item.file.name}</p>
            {item.status === 'error' ? (
              <p className="text-destructive text-xs">{item.error}</p>
            ) : (
              <div className="mt-1 flex items-center gap-2">
                <div className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full">
                  <div
                    className={cn(
                      'h-full rounded-full transition-[width]',
                      item.status === 'done' ? 'bg-success' : 'bg-primary',
                    )}
                    style={{ width: `${Math.round(item.progress * 100)}%` }}
                  />
                </div>
                <span className="text-muted-foreground w-16 text-right text-xs">
                  {formatBytes(item.file.size)}
                </span>
              </div>
            )}
          </div>
          {item.status === 'uploading' && (
            <Loader2Icon className="text-primary size-4 animate-spin" />
          )}
          {item.status === 'done' && <CheckCircle2Icon className="text-success size-4" />}
          {item.status === 'error' && <XCircleIcon className="text-destructive size-4" />}
        </li>
      ))}
    </ul>
  )
}
