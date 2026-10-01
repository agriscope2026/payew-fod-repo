import { Loader2Icon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { errorMessage } from '@/lib/supabase'
import { useResetPassword, type UserListItem } from '../api'
import type { TemporaryPasswordInfo } from './TemporaryPasswordDialog'

export function ResetPasswordDialog({
  user,
  onClose,
  onTemporaryPassword,
}: {
  user: UserListItem | null
  onClose: () => void
  onTemporaryPassword: (info: TemporaryPasswordInfo) => void
}) {
  const [mode, setMode] = useState<'temporary' | 'email'>('temporary')
  const reset = useResetPassword()

  const submit = async () => {
    if (!user) return
    try {
      const result = await reset.mutateAsync({ userId: user.id, mode })
      onClose()
      if (mode === 'email') {
        toast.success(`Reset link sent to ${user.email}`)
      } else if (result.temporary_password) {
        onTemporaryPassword({
          name: user.full_name,
          email: user.email,
          password: result.temporary_password,
        })
      }
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <Dialog open={!!user} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
          <DialogDescription>
            {user?.full_name} · {user?.email}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {(
            [
              [
                'temporary',
                'Generate a temporary password',
                'You share it with the user; they must change it at next sign-in.',
              ],
              [
                'email',
                'Email a reset link',
                'The user chooses a new password from the link (valid for 1 hour).',
              ],
            ] as const
          ).map(([value, label, hint]) => (
            <label
              key={value}
              className="has-checked:border-primary has-checked:bg-primary/5 flex cursor-pointer items-start gap-3 rounded-md border p-3"
            >
              <input
                type="radio"
                name="reset-mode"
                className="mt-1"
                checked={mode === value}
                onChange={() => setMode(value)}
              />
              <span>
                <span className="block text-sm font-medium">{label}</span>
                <span className="text-muted-foreground block text-xs">{hint}</span>
              </span>
            </label>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={reset.isPending}>
            {reset.isPending && <Loader2Icon className="animate-spin" />}
            Reset password
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
