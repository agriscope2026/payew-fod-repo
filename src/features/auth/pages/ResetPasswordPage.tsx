import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2Icon } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { FullPageLoader } from '@/components/common/FullPageLoader'
import { Button } from '@/components/ui/button'
import { errorMessage, supabase } from '@/lib/supabase'
import { meQueryKey, useAuth } from '../auth-context'
import { AuthLayout } from '../components/AuthLayout'
import { NewPasswordFields } from '../components/NewPasswordFields'
import { newPasswordSchema, type NewPasswordValues } from '../schemas'

/** Landing page for the emailed recovery link; Supabase signs the user in from the URL. */
export default function ResetPasswordPage() {
  const { status, user } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const form = useForm<NewPasswordValues>({
    resolver: zodResolver(newPasswordSchema),
    defaultValues: { password: '', confirm: '' },
  })

  if (status === 'loading') return <FullPageLoader label="Verifying reset link…" />

  if (status === 'signed_out') {
    return (
      <AuthLayout title="Link expired" description="This reset link is invalid or has expired.">
        <Button asChild className="w-full">
          <Link to="/forgot-password">Request a new link</Link>
        </Button>
      </AuthLayout>
    )
  }

  const onSubmit = form.handleSubmit(async ({ password }) => {
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      toast.error(errorMessage(error))
      return
    }
    await supabase.rpc('complete_password_change')
    await queryClient.invalidateQueries({ queryKey: meQueryKey(user?.id) })
    toast.success('Password updated.')
    navigate('/dashboard', { replace: true })
  })

  return (
    <AuthLayout title="Choose a new password" description={user?.email}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <NewPasswordFields register={form.register} errors={form.formState.errors} />
        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Loader2Icon className="animate-spin" />}
          Update password
        </Button>
      </form>
    </AuthLayout>
  )
}
