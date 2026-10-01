import { createClient, FunctionsHttpError } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { env } from './env'

// Browser client: anon key only. Privileged operations go through Edge Functions.
export const supabase = createClient<Database>(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

const PG_MESSAGES: Record<string, string> = {
  '23505': 'A record with the same value already exists.',
  '23503': 'This record is still referenced by other data and cannot be removed.',
  '42501': 'You do not have permission to do this.',
}

/** Turns a Supabase/PostgREST error into a user-facing message. */
export function errorMessage(error: unknown, fallback = 'Something went wrong. Please try again.') {
  if (!error) return fallback
  if (typeof error === 'string') return error
  if (typeof error === 'object') {
    const e = error as { code?: string; message?: string }
    // RLS violations have a technical message; custom RAISEs (42501) carry a readable one.
    if (e.code === '42501' && e.message && /row-level security/i.test(e.message)) {
      return PG_MESSAGES['42501']
    }
    if (e.code && e.code in PG_MESSAGES && e.code !== '42501') return PG_MESSAGES[e.code]
    if (e.message) return e.message
  }
  return fallback
}

/**
 * Calls an Edge Function and unwraps `{ error }` bodies into thrown Errors
 * with the server's message.
 */
export async function invokeFunction<T>(name: string, body: unknown): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(name, { body: body as object })
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = (await error.context.json().catch(() => null)) as { error?: string } | null
      throw new Error(payload?.error ?? error.message)
    }
    throw error
  }
  return data as T
}
