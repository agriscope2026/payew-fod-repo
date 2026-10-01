import type { FieldErrors, UseFormRegister } from 'react-hook-form'
import { FormField } from '@/components/common/FormField'
import { PasswordInput } from './PasswordInput'

type Values = { password: string; confirm: string }

export function NewPasswordFields<T extends Values>({
  register,
  errors,
}: {
  register: UseFormRegister<T>
  errors: FieldErrors<T>
}) {
  const reg = register as unknown as UseFormRegister<Values>
  const errs = errors as FieldErrors<Values>
  return (
    <>
      <FormField
        id="password"
        label="New password"
        error={errs.password?.message}
        hint="At least 8 characters with uppercase, lowercase and a number."
      >
        <PasswordInput
          id="password"
          autoComplete="new-password"
          aria-invalid={!!errs.password}
          {...reg('password')}
        />
      </FormField>
      <FormField id="confirm" label="Confirm new password" error={errs.confirm?.message}>
        <PasswordInput
          id="confirm"
          autoComplete="new-password"
          aria-invalid={!!errs.confirm}
          {...reg('confirm')}
        />
      </FormField>
    </>
  )
}
