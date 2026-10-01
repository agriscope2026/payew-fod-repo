import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { HttpError } from './cors.ts'

const url = Deno.env.get('SUPABASE_URL')!
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

/** Service-role client. Bypasses RLS: only use after authorizing the caller. */
export const adminClient = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

/** Anon client (no user) for flows like sending a password-reset email. */
export const anonClient = createClient(url, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

export interface Caller {
  id: string
  role: 'superadmin' | 'program_admin' | 'program_staff'
  /** Client acting as the caller: RLS and the SQL helper functions apply. */
  db: SupabaseClient
}

/** Resolves the caller from the Authorization header; rejects inactive/revoked users. */
export async function getCaller(req: Request): Promise<Caller> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) throw new HttpError(401, 'Missing bearer token')

  const db = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: userData, error: userError } = await db.auth.getUser(authHeader.slice(7))
  if (userError || !userData.user) throw new HttpError(401, 'Invalid or expired session')

  // current_user_role() returns null for inactive, deleted or force-logged-out users.
  const { data: role, error } = await db.rpc('current_user_role')
  if (error) throw new HttpError(500, error.message)
  if (!role) throw new HttpError(403, 'Your account is not active')

  return { id: userData.user.id, role, db }
}
