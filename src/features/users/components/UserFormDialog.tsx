import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2Icon } from 'lucide-react'
import { useEffect } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { FormField } from '@/components/common/FormField'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SelectNative } from '@/components/ui/select-native'
import { Switch } from '@/components/ui/switch'
import { useAuth } from '@/features/auth/auth-context'
import { ROLE_LABELS } from '@/features/auth/permissions'
import { newPasswordField } from '@/features/auth/schemas'
import { errorMessage } from '@/lib/supabase'
import type { AppRole } from '@/types/database'
import { useCreateUser, useUpdateUser, type UserChanges, type UserListItem } from '../api'
import type { TemporaryPasswordInfo } from './TemporaryPasswordDialog'

const schema = z
  .object({
    full_name: z.string().trim().min(2, 'Enter the full name').max(120),
    email: z.email('Enter a valid email address'),
    position: z.string().trim().max(120),
    office: z.string().trim().max(120),
    contact_no: z.string().trim().max(40),
    role: z.enum(['superadmin', 'program_admin', 'program_staff']),
    program_id: z.string(),
    program_ids: z.array(z.string()),
    can_edit_activities: z.boolean(),
    password_mode: z.enum(['generate', 'manual']),
    password: z.string(),
    send_reset_email: z.boolean(),
  })
  .refine((v) => v.role === 'superadmin' || v.program_id, {
    path: ['program_id'],
    message: 'Select a program',
  })
  .refine((v) => v.password_mode === 'generate' || newPasswordField.safeParse(v.password).success, {
    path: ['password'],
    message: 'At least 8 characters with uppercase, lowercase and a number',
  })

type Values = z.infer<typeof schema>

export interface UserFormPreset {
  role?: AppRole
  programId?: string
}

export function UserFormDialog({
  open,
  onOpenChange,
  user,
  preset,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Present = edit mode. */
  user?: UserListItem | null
  preset?: UserFormPreset
  onCreated?: (info: TemporaryPasswordInfo) => void
}) {
  const { isSuperadmin, programs, user: me } = useAuth()
  const create = useCreateUser()
  const update = useUpdateUser()
  const editing = !!user
  const isSelf = user?.id === me?.id

  // Program admins pick among their own programs; superadmins among all active ones.
  const programOptions = programs.filter((p) => !p.archived_at)

  const defaults = (): Values => ({
    full_name: user?.full_name ?? '',
    email: user?.email ?? '',
    position: user?.position ?? '',
    office: user?.office ?? '',
    contact_no: user?.contact_no ?? '',
    role: user?.role ?? preset?.role ?? 'program_staff',
    program_id:
      user?.program_id ??
      preset?.programId ??
      (programOptions.length === 1 ? programOptions[0].id : ''),
    program_ids: user?.program_ids.filter((id) => id !== user.program_id) ?? [],
    can_edit_activities: user?.can_edit_activities ?? false,
    password_mode: 'generate',
    password: '',
    send_reset_email: false,
  })

  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults() })
  const role = useWatch({ control: form.control, name: 'role' })
  const programId = useWatch({ control: form.control, name: 'program_id' })
  const passwordMode = useWatch({ control: form.control, name: 'password_mode' })

  useEffect(() => {
    if (open) form.reset(defaults())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user?.id])

  const onSubmit = form.handleSubmit(async (v) => {
    try {
      if (!editing) {
        const result = await create.mutateAsync({
          email: v.email,
          full_name: v.full_name,
          position: v.position || undefined,
          office: v.office || undefined,
          contact_no: v.contact_no || undefined,
          role: v.role,
          program_id: v.role === 'superadmin' ? null : v.program_id,
          program_ids: v.role === 'program_admin' ? v.program_ids : undefined,
          can_edit_activities: v.role === 'program_staff' ? v.can_edit_activities : undefined,
          password: v.password_mode === 'manual' ? v.password : undefined,
          send_reset_email: v.send_reset_email,
        })
        toast.success(`Account created for ${v.full_name}`)
        onOpenChange(false)
        onCreated?.({
          name: v.full_name,
          email: v.email,
          password: result.temporary_password,
          emailSent: result.email_sent,
        })
        return
      }

      const changes: UserChanges = {
        full_name: v.full_name,
        position: v.position,
        office: v.office,
        contact_no: v.contact_no,
      }
      if (v.role === 'program_staff') changes.can_edit_activities = v.can_edit_activities
      if (isSuperadmin && !isSelf) {
        changes.role = v.role
        if (v.role !== 'superadmin') changes.program_id = v.program_id
        if (v.role === 'program_admin') changes.program_ids = v.program_ids
      }
      await update.mutateAsync({ userId: user.id, changes })
      toast.success('User updated')
      onOpenChange(false)
    } catch (err) {
      toast.error(errorMessage(err))
    }
  })

  const errors = form.formState.errors
  const roleOptions: AppRole[] = isSuperadmin
    ? ['program_staff', 'program_admin', 'superadmin']
    : ['program_staff']
  const canChangeRole = isSuperadmin && !isSelf
  const canChangeProgram = isSuperadmin || !editing

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit user' : 'New user'}</DialogTitle>
          <DialogDescription>
            {editing
              ? user.email
              : 'The account is created with a temporary password that must be changed at first sign-in.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2" noValidate>
          <FormField id="full_name" label="Full name" error={errors.full_name?.message}>
            <Input
              id="full_name"
              aria-invalid={!!errors.full_name}
              {...form.register('full_name')}
            />
          </FormField>
          <FormField id="email" label="Email" error={errors.email?.message}>
            <Input
              id="email"
              type="email"
              disabled={editing}
              aria-invalid={!!errors.email}
              {...form.register('email')}
            />
          </FormField>
          <FormField id="position" label="Position">
            <Input
              id="position"
              placeholder="e.g. Agriculturist II"
              {...form.register('position')}
            />
          </FormField>
          <FormField id="office" label="Office / Unit">
            <Input id="office" {...form.register('office')} />
          </FormField>
          <FormField id="contact_no" label="Contact no.">
            <Input id="contact_no" {...form.register('contact_no')} />
          </FormField>

          <FormField id="role" label="Role">
            <SelectNative id="role" disabled={!canChangeRole && editing} {...form.register('role')}>
              {(editing && !canChangeRole ? [user.role] : roleOptions).map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </SelectNative>
          </FormField>

          {role !== 'superadmin' && (
            <FormField
              id="program_id"
              label={role === 'program_admin' ? 'Primary program' : 'Program'}
              error={errors.program_id?.message}
            >
              <SelectNative
                id="program_id"
                disabled={!canChangeProgram}
                aria-invalid={!!errors.program_id}
                {...form.register('program_id')}
              >
                <option value="">Select a program…</option>
                {programOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} · {p.name}
                  </option>
                ))}
              </SelectNative>
            </FormField>
          )}

          {role === 'program_admin' && isSuperadmin && (
            <div className="grid gap-2 sm:col-span-2">
              <Label>Additional programs</Label>
              <Controller
                control={form.control}
                name="program_ids"
                render={({ field }) => (
                  <div className="flex flex-wrap gap-x-4 gap-y-2">
                    {programOptions
                      .filter((p) => p.id !== programId)
                      .map((p) => (
                        <label key={p.id} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={field.value.includes(p.id)}
                            onCheckedChange={(checked) =>
                              field.onChange(
                                checked
                                  ? [...field.value, p.id]
                                  : field.value.filter((id) => id !== p.id),
                              )
                            }
                          />
                          {p.code}
                        </label>
                      ))}
                  </div>
                )}
              />
            </div>
          )}

          {role === 'program_staff' && (
            <Controller
              control={form.control}
              name="can_edit_activities"
              render={({ field }) => (
                <label className="flex items-start gap-3 rounded-md border p-3 sm:col-span-2">
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="block text-sm font-medium">Can edit activities</span>
                    <span className="text-muted-foreground block text-xs">
                      Staff are read-only by default. Turn this on to let them update activities and
                      post progress.
                    </span>
                  </span>
                </label>
              )}
            />
          )}

          {!editing && (
            <fieldset className="grid gap-3 rounded-md border p-3 sm:col-span-2">
              <legend className="px-1 text-sm font-medium">Initial password</legend>
              <div className="flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input type="radio" value="generate" {...form.register('password_mode')} />
                  Generate a temporary password
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" value="manual" {...form.register('password_mode')} />
                  Set one myself
                </label>
              </div>
              {passwordMode === 'manual' && (
                <FormField
                  id="password"
                  label="Temporary password"
                  error={errors.password?.message}
                >
                  <Input
                    id="password"
                    autoComplete="new-password"
                    aria-invalid={!!errors.password}
                    {...form.register('password')}
                  />
                </FormField>
              )}
              <Controller
                control={form.control}
                name="send_reset_email"
                render={({ field }) => (
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={field.value} onCheckedChange={(c) => field.onChange(!!c)} />
                    Also email the user a link to set their own password
                  </label>
                )}
              />
            </fieldset>
          )}

          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Loader2Icon className="animate-spin" />}
              {editing ? 'Save changes' : 'Create account'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
