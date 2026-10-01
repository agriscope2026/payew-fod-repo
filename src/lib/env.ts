import { z } from 'zod'

const schema = z.object({
  VITE_APP_NAME: z.string().default('PAYEW'),
  VITE_APP_FULL_NAME: z.string().default('Program & Allotment Yearly Execution Watch'),
  VITE_SUPABASE_URL: z.url({ message: 'VITE_SUPABASE_URL must be a URL (see .env.example)' }),
  VITE_SUPABASE_ANON_KEY: z
    .string()
    .min(1, 'VITE_SUPABASE_ANON_KEY is required (see .env.example)'),
})

const parsed = schema.safeParse(import.meta.env)
if (!parsed.success) {
  throw new Error(
    `Invalid environment configuration:\n${parsed.error.issues.map((i) => `- ${i.message}`).join('\n')}`,
  )
}

export const env = parsed.data
export const APP_NAME = env.VITE_APP_NAME
export const APP_FULL_NAME = env.VITE_APP_FULL_NAME
