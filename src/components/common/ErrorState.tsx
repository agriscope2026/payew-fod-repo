import { AlertTriangleIcon, RotateCwIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function ErrorState({
  title = "Couldn't load this data",
  description = 'Check your connection and try again.',
  onRetry,
}: {
  title?: string
  description?: string
  onRetry?: () => void
}) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center"
      role="alert"
    >
      <span className="bg-destructive/10 text-destructive flex size-12 items-center justify-center rounded-full">
        <AlertTriangleIcon className="size-6" />
      </span>
      <p className="font-medium">{title}</p>
      <p className="text-muted-foreground text-sm">{description}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
          <RotateCwIcon /> Retry
        </Button>
      )}
    </div>
  )
}
