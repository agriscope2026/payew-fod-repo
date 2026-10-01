import { UploadCloudIcon } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import type { UploadPolicy } from '@shared/files-core'

export function FileDropzone({
  onFiles,
  policy,
  multiple = true,
  disabled,
  compact,
}: {
  onFiles: (files: File[]) => void
  policy: UploadPolicy
  multiple?: boolean
  disabled?: boolean
  compact?: boolean
}) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const accept = policy.allowed_extensions.map((e) => `.${e}`).join(',')

  const take = (list: FileList | null) => {
    if (!list?.length || disabled) return
    const files = Array.from(list)
    onFiles(multiple ? files : files.slice(0, 1))
  }

  return (
    <label
      htmlFor={inputId}
      onDragOver={(e) => {
        e.preventDefault()
        if (!disabled) setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        take(e.dataTransfer.files)
      }}
      className={cn(
        'flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed text-center transition-colors',
        compact ? 'px-4 py-4' : 'px-6 py-8',
        dragging
          ? 'border-primary bg-primary/5'
          : 'border-border hover:border-primary/50 hover:bg-accent/40',
        disabled && 'pointer-events-none opacity-50',
      )}
    >
      <UploadCloudIcon className={cn('text-primary', compact ? 'size-5' : 'size-8')} />
      <span className="text-sm font-medium">
        {dragging
          ? 'Drop to upload'
          : `Drag ${multiple ? 'files' : 'a file'} here or click to browse`}
      </span>
      <span className="text-muted-foreground text-xs">
        {policy.allowed_extensions.join(', ').toUpperCase()} · up to {Math.min(policy.max_mb, 25)}{' '}
        MB each
      </span>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        className="sr-only"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        onChange={(e) => {
          take(e.target.files)
          if (inputRef.current) inputRef.current.value = ''
        }}
      />
    </label>
  )
}
