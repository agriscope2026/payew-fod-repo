import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2Icon } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Navigate, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { errorMessage, supabase } from '@/lib/supabase'
import { useAuth } from '../auth-context'
import { AuthLayout } from '../components/AuthLayout'
import { NewPasswordFields } from '../components/NewPasswordFields'
import { newPasswordSchema, type NewPasswordValues } from '../schemas'

/**
 * First-login screen for accounts created with a temporary password.
 * Voluntary changes live at /account/password (AccountPasswordPage).
 */
export default function ChangePasswordPage() {
  const { profile, refreshProfile, signOut } = useAuth()
  const navigate = useNavigate()
  const [completed, setCompleted] = useState(false)
  const form = useForm<NewPasswordValues>({
    resolver: zodResolver(newPasswordSchema),
    defaultValues: { password: '', confirm: '' },
  })

  if (!profile?.must_change_password && !completed)
    return <Navigate to="/account/password" replace />

  const onSubmit = form.handleSubmit(async ({ password }) => {
    const { error } = await supabase.auth.updateUser({ password })
    if (error) return void toast.error(errorMessage(error))
    const { error: rpcError } = await supabase.rpc('complete_password_change')
    if (rpcError) return void toast.error(errorMessage(rpcError))
    setCompleted(true)
    await refreshProfile()
    toast.success('Password set. Welcome!')
    navigate('/dashboard', { replace: true })
  })

  return (
    <AuthLayout
      title="Set your password"
      description="You signed in with a temporary password. Choose your own password to continue."
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <NewPasswordFields register={form.register} errors={form.formState.errors} />
        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Loader2Icon className="animate-spin" />}
          Save and continue
        </Button>
        <Button type="button" variant="ghost" className="w-full" onClick={() => void signOut()}>
          Sign out
        </Button>
      </form>
    </AuthLayout>
  )
}
