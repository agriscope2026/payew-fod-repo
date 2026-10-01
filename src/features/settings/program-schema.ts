import { z } from 'zod'
import type { ProgramRow } from '@/types/database'

export const programSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9_-]{2,20}$/, '2–20 letters, digits, - or _ (e.g. AMIA)'),
  name: z.string().trim().min(3, 'Enter the program name').max(160),
  description: z.string().trim().max(1000),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Pick a color'),
})
export type ProgramValues = z.infer<typeof programSchema>

export function programDefaults(program?: ProgramRow | null): ProgramValues {
  return {
    code: program?.code ?? '',
    name: program?.name ?? '',
    description: program?.description ?? '',
    color: program?.color ?? '#15803d',
  }
}
