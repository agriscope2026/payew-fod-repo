import { CheckIcon, CopyIcon, KeyRoundIcon } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export interface TemporaryPasswordInfo {
  name: string
  email: string
  password: string
  emailSent?: boolean
}

/** Shows a generated password once. It is never stored or retrievable afterwards. */
export function TemporaryPasswordDialog({
  info,
  onClose,
}: {
  info: TemporaryPasswordInfo | null
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    if (!info) return
    try {
      await navigator.clipboard.writeText(
        `Email: ${info.email}\nTemporary password: ${info.password}`,
      )
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard blocked: the user can still select the text */
    }
  }

  return (
    <Dialog open={!!info} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRoundIcon className="text-primary size-5" /> Temporary password
          </DialogTitle>
          <DialogDescription>
            Share this with <strong>{info?.name}</strong> through a secure channel. It is shown only
            once. They will be asked to set their own password at first sign-in.
          </DialogDescription>
        </DialogHeader>
        <div className="bg-muted/50 space-y-2 rounded-lg border p-4 font-mono text-sm">
          <p>
            <span className="text-muted-foreground">Email: </span>
            {info?.email}
          </p>
          <p className="select-all">
            <span className="text-muted-foreground select-none">Password: </span>
            <strong className="tracking-wider">{info?.password}</strong>
          </p>
        </div>
        {info?.emailSent && (
          <p className="text-muted-foreground text-sm">
            A link to set their own password was also emailed to them.
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={copy}>
            {copied ? <CheckIcon /> : <CopyIcon />} {copied ? 'Copied' : 'Copy'}
          </Button>
          <Button onClick={onClose}>Done</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
