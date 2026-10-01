import {
  FileIcon as GenericIcon,
  FileImageIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { extensionOf } from '@shared/files-core'

const KINDS: { exts: string[]; icon: LucideIcon; className: string }[] = [
  { exts: ['pdf'], icon: FileTextIcon, className: 'bg-red-500/10 text-red-600 dark:text-red-400' },
  {
    exts: ['xlsx', 'xls', 'csv'],
    icon: FileSpreadsheetIcon,
    className: 'bg-green-600/10 text-green-700 dark:text-green-400',
  },
  {
    exts: ['doc', 'docx', 'txt'],
    icon: FileTextIcon,
    className: 'bg-blue-600/10 text-blue-700 dark:text-blue-400',
  },
  {
    exts: ['jpg', 'jpeg', 'png', 'webp'],
    icon: FileImageIcon,
    className: 'bg-purple-600/10 text-purple-700 dark:text-purple-400',
  },
]

export function FileTypeIcon({ fileName, className }: { fileName: string; className?: string }) {
  const ext = extensionOf(fileName)
  const kind = KINDS.find((k) => k.exts.includes(ext))
  const Icon = kind?.icon ?? GenericIcon
  return (
    <span
      className={cn(
        'flex size-9 shrink-0 items-center justify-center rounded-md',
        kind?.className ?? 'bg-muted text-muted-foreground',
        className,
      )}
      aria-hidden="true"
    >
      <Icon className="size-4.5" />
    </span>
  )
}
