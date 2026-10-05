import { z } from 'zod'

export const loginSchema = z.object({
  email: z.email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
})
export type LoginValues = z.infer<typeof loginSchema>

export const forgotPasswordSchema = z.object({
  email: z.email('Enter a valid email address'),
})
export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>

// Mirrors supabase/config.toml: minimum 8, lower + upper + digit.
export const newPasswordField = z
  .string()
  .min(8, 'Use at least 8 characters')
  .regex(/[a-z]/, 'Include a lowercase letter')
  .regex(/[A-Z]/, 'Include an uppercase letter')
  .regex(/\d/, 'Include a number')

export const newPasswordSchema = z
  .object({
    password: newPasswordField,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' })
export type NewPasswordValues = z.infer<typeof newPasswordSchema>

export const changePasswordSchema = z
  .object({
    current: z.string().min(1, 'Enter your current password'),
    password: newPasswordField,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' })
  .refine((v) => v.password !== v.current, {
    path: ['password'],
    message: 'New password must be different from the current one',
  })
export type ChangePasswordValues = z.infer<typeof changePasswordSchema>
