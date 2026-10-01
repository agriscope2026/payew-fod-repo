import { Loader2Icon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export interface ConfirmOptions {
  title: string
  description?: ReactNode
  confirmLabel?: string
  destructive?: boolean
  onConfirm: () => Promise<unknown> | unknown
}

/** Controlled confirm dialog: pass options to open it, null to close. */
export function ConfirmDialog({
  options,
  onClose,
}: {
  options: ConfirmOptions | null
  onClose: () => void
}) {
  const [busy, setBusy] = useState(false)

  return (
    <Dialog open={!!options} onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent showClose={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{options?.title}</DialogTitle>
          {options?.description && <DialogDescription>{options.description}</DialogDescription>}
        </DialogHeader>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={options?.destructive ? 'destructive' : 'default'}
            disabled={busy}
            onClick={async () => {
              if (!options) return
              setBusy(true)
              try {
                await options.onConfirm()
                onClose()
              } finally {
                setBusy(false)
              }
            }}
          >
            {busy && <Loader2Icon className="animate-spin" />}
            {options?.confirmLabel ?? 'Confirm'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
