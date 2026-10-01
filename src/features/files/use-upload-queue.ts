import { useCallback, useRef, useState } from 'react'
import { errorMessage } from '@/lib/supabase'
import type { UploadPolicy } from '@shared/files-core'
import { checkFile, uploadFile, useInvalidateAttachments, type UploadMeta } from './api'
import type { QueueItem } from './components/UploadQueue'

/** Uploads files one at a time with per-file progress; invalid files fail fast. */
export function useUploadQueue(policy: UploadPolicy) {
  const [items, setItems] = useState<QueueItem[]>([])
  const [running, setRunning] = useState(false)
  const abort = useRef<AbortController | null>(null)
  const invalidate = useInvalidateAttachments()

  const patch = (key: string, p: Partial<QueueItem>) =>
    setItems((list) => list.map((i) => (i.key === key ? { ...i, ...p } : i)))

  const run = useCallback(
    async (files: File[], meta: UploadMeta) => {
      const batch: QueueItem[] = files.map((file) => {
        const check = checkFile(policy, file)
        return {
          key: `${file.name}-${file.size}-${crypto.randomUUID()}`,
          file,
          progress: 0,
          status: check.ok ? 'queued' : 'error',
          error: check.ok ? undefined : check.error,
        }
      })
      setItems((list) => [...list, ...batch])
      setRunning(true)
      abort.current = new AbortController()
      let succeeded = 0
      for (const item of batch.filter((i) => i.status === 'queued')) {
        if (abort.current.signal.aborted) break
        patch(item.key, { status: 'uploading' })
        try {
          await uploadFile(item.file, meta, {
            signal: abort.current.signal,
            onProgress: (p) => patch(item.key, { progress: p * 0.95 }),
          })
          patch(item.key, { status: 'done', progress: 1 })
          succeeded++
        } catch (err) {
          patch(item.key, { status: 'error', error: errorMessage(err) })
        }
      }
      setRunning(false)
      if (succeeded) await invalidate()
      return { succeeded, failed: batch.length - succeeded }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [policy],
  )

  return {
    items,
    running,
    run,
    cancel: () => abort.current?.abort(),
    reset: () => setItems([]),
  }
}
