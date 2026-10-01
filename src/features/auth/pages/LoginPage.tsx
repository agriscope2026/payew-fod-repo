import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { AlertCircleIcon, Loader2Icon } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, Navigate, useLocation, useNavigate, type Location } from 'react-router-dom'
import { FormField } from '@/components/common/FormField'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { errorMessage, supabase } from '@/lib/supabase'
import { meQueryKey, useAuth } from '../auth-context'
import { AuthLayout } from '../components/AuthLayout'
import { PasswordInput } from '../components/PasswordInput'
import { loginSchema, type LoginValues } from '../schemas'

function friendlyError(message: string) {
  if (/invalid login credentials/i.test(message)) return 'Incorrect email or password.'
  if (/email not confirmed/i.test(message)) return 'This email address has not been confirmed yet.'
  return message
}

export default function LoginPage() {
  const { status, profile } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const from = (location.state as { from?: Location } | null)?.from?.pathname ?? '/dashboard'

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  // Already signed in (e.g. returning visitor): skip the form.
  if (status === 'signed_in' && profile && !submitting) {
    return <Navigate to={profile.must_change_password ? '/change-password' : from} replace />
  }

  const onSubmit = form.handleSubmit(async (values) => {
    setSubmitting(true)
    setFormError(null)
    try {
      const { error } = await supabase.auth.signInWithPassword(values)
      if (error) throw error

      // Server-side check: rejects deactivated accounts and stamps last login.
      const { data: me, error: loginError } = await supabase.rpc('record_login')
      if (loginError) {
        await supabase.auth.signOut()
        throw loginError
      }
      await queryClient.invalidateQueries({ queryKey: meQueryKey(me.id) })
      navigate(me.must_change_password ? '/change-password' : from, { replace: true })
    } catch (err) {
      setFormError(friendlyError(errorMessage(err)))
      setSubmitting(false)
    }
  })

  return (
    <AuthLayout title="Sign in" description="Use the account issued by your program administrator.">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {formError && (
          <div
            role="alert"
            className="border-destructive/30 bg-destructive/10 text-destructive flex items-start gap-2 rounded-md border p-3 text-sm"
          >
            <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
            {formError}
          </div>
        )}
        <FormField id="email" label="Email" error={form.formState.errors.email?.message}>
          <Input
            id="email"
            type="email"
            autoComplete="username"
            autoFocus
            aria-invalid={!!form.formState.errors.email}
            {...form.register('email')}
          />
        </FormField>
        <FormField id="password" label="Password" error={form.formState.errors.password?.message}>
          <PasswordInput
            id="password"
            autoComplete="current-password"
            aria-invalid={!!form.formState.errors.password}
            {...form.register('password')}
          />
        </FormField>
        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-primary text-sm hover:underline">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting && <Loader2Icon className="animate-spin" />}
          Sign in
        </Button>
      </form>
      <p className="text-muted-foreground text-center text-xs">
        Accounts are created by the FOD superadmin or your program admin. There is no public
        sign-up.
      </p>
    </AuthLayout>
  )
}
