import { zodResolver } from '@hookform/resolvers/zod'
import { KeyRoundIcon, Loader2Icon } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { FormField } from '@/components/common/FormField'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { errorMessage, supabase } from '@/lib/supabase'
import { useAuth } from '../auth-context'
import { NewPasswordFields } from '../components/NewPasswordFields'
import { PasswordInput } from '../components/PasswordInput'
import { changePasswordSchema, type ChangePasswordValues } from '../schemas'

/** Voluntary password change from the user menu; re-verifies the current password. */
export default function AccountPasswordPage() {
  const { user } = useAuth()
  const form = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { current: '', password: '', confirm: '' },
  })

  const onSubmit = form.handleSubmit(async ({ current, password }) => {
    // Supabase's updateUser doesn't ask for the old password, so verify it first.
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: user!.email!,
      password: current,
    })
    if (verifyError) {
      form.setError('current', { message: 'Current password is incorrect' })
      return
    }
    const { error } = await supabase.auth.updateUser({ password })
    if (error) return void toast.error(errorMessage(error))
    form.reset()
    toast.success('Password changed.')
  })

  return (
    <div className="space-y-6">
      <PageHeader title="Account security" description="Manage your sign-in password." />
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRoundIcon className="text-primary size-5" /> Change password
          </CardTitle>
          <CardDescription>You'll stay signed in on this device.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <FormField
              id="current"
              label="Current password"
              error={form.formState.errors.current?.message}
            >
              <PasswordInput
                id="current"
                autoComplete="current-password"
                aria-invalid={!!form.formState.errors.current}
                {...form.register('current')}
              />
            </FormField>
            <NewPasswordFields register={form.register} errors={form.formState.errors} />
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Loader2Icon className="animate-spin" />}
              Change password
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
