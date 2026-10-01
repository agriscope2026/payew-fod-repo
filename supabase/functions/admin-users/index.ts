// POST /functions/v1/admin-users
// Actions that need the Supabase Auth admin API:
//   { action: "create", ... }          create an account (superadmin: any role; program admin: own staff)
//   { action: "reset_password", ... }  set a temporary password or email a reset link
// Profile edits, activation and force-logout use SQL RPCs (admin_update_user, admin_force_logout).
import { z } from 'npm:zod@4'
import { adminClient, anonClient, getCaller, type Caller } from '../_shared/clients.ts'
import { corsHeaders, HttpError, json } from '../_shared/cors.ts'

const uuid = z.uuid()

const createSchema = z.object({
  action: z.literal('create'),
  email: z.email().transform((e) => e.toLowerCase().trim()),
  full_name: z.string().trim().min(2).max(120),
  position: z.string().trim().max(120).optional(),
  office: z.string().trim().max(120).optional(),
  contact_no: z.string().trim().max(40).optional(),
  role: z.enum(['superadmin', 'program_admin', 'program_staff']),
  program_id: uuid.nullish(),
  /** Extra programs for a program admin (superadmin only). */
  program_ids: z.array(uuid).max(20).optional(),
  can_edit_activities: z.boolean().optional(),
  /** Leave empty to generate one. */
  password: z.string().min(8).max(72).optional(),
  send_reset_email: z.boolean().optional(),
  redirect_to: z.url().optional(),
})

const resetSchema = z.object({
  action: z.literal('reset_password'),
  user_id: uuid,
  mode: z.enum(['temporary', 'email']),
  password: z.string().min(8).max(72).optional(),
  redirect_to: z.url().optional(),
})

const bodySchema = z.discriminatedUnion('action', [createSchema, resetSchema])

/** 12+ chars with upper, lower, digit and symbol; avoids look-alike characters. */
function generatePassword(length = 12) {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnpqrstuvwxyz', '23456789', '@#$%&*?!']
  const all = sets.join('')
  const pick = (chars: string) =>
    chars[crypto.getRandomValues(new Uint32Array(1))[0] % chars.length]
  const out = sets.map(pick)
  while (out.length < length) out.push(pick(all))
  for (let i = out.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out.join('')
}

function assertStrong(password: string) {
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    throw new HttpError(422, 'Password needs uppercase, lowercase and a number')
  }
}

async function createUser(caller: Caller, input: z.infer<typeof createSchema>) {
  if (caller.role === 'program_staff') throw new HttpError(403, 'Not allowed')

  if (caller.role === 'program_admin') {
    if (input.role !== 'program_staff') {
      throw new HttpError(403, 'Program admins can only create program staff accounts')
    }
    if (input.program_ids?.length) throw new HttpError(403, 'Staff belong to a single program')
  }
  if (input.role !== 'superadmin' && !input.program_id) {
    throw new HttpError(422, 'Select a program for this account')
  }
  if (input.program_id && caller.role === 'program_admin') {
    const { data: ok, error } = await caller.db.rpc('is_program_admin', {
      p_program_id: input.program_id,
    })
    if (error) throw new HttpError(500, error.message)
    if (!ok) throw new HttpError(403, 'You can only add staff to your own program')
  }

  const password = input.password ?? generatePassword()
  assertStrong(password)

  const { data, error } = await adminClient.auth.admin.createUser({
    email: input.email,
    password,
    email_confirm: true,
    app_metadata: {
      app_role: input.role,
      program_id: input.role === 'superadmin' ? null : input.program_id,
      must_change_password: true,
      created_by: caller.id,
    },
    user_metadata: { full_name: input.full_name, position: input.position ?? null },
  })
  if (error) {
    if (/already (been )?registered|already exists/i.test(error.message)) {
      throw new HttpError(409, 'An account with this email already exists')
    }
    throw new HttpError(400, error.message)
  }
  const userId = data.user.id

  // handle_new_user created the profile and primary membership; add the rest.
  const { error: profileError } = await adminClient
    .from('profiles')
    .update({
      office: input.office || null,
      contact_no: input.contact_no || null,
      can_edit_activities:
        input.role === 'program_staff' ? (input.can_edit_activities ?? false) : false,
    })
    .eq('id', userId)
  if (profileError) throw new HttpError(500, profileError.message)

  if (input.role === 'program_admin' && input.program_ids?.length) {
    const rows = [...new Set(input.program_ids)]
      .filter((id) => id !== input.program_id)
      .map((program_id) => ({ program_id, user_id: userId, created_by: caller.id }))
    if (rows.length) {
      const { error: mError } = await adminClient.from('program_memberships').insert(rows)
      if (mError) throw new HttpError(500, mError.message)
    }
  }

  let emailSent = false
  if (input.send_reset_email) {
    const { error: mailError } = await anonClient.auth.resetPasswordForEmail(input.email, {
      redirectTo: input.redirect_to,
    })
    emailSent = !mailError
  }

  return { user_id: userId, temporary_password: password, email_sent: emailSent }
}

async function resetPassword(caller: Caller, input: z.infer<typeof resetSchema>) {
  const { data: allowed, error } = await caller.db.rpc('can_admin_user', {
    p_user_id: input.user_id,
  })
  if (error) throw new HttpError(500, error.message)
  if (!allowed) throw new HttpError(403, 'You are not allowed to manage this user')

  if (input.mode === 'email') {
    const { data: target, error: tError } = await adminClient.auth.admin.getUserById(input.user_id)
    if (tError || !target.user.email) throw new HttpError(404, 'User not found')
    const { error: mailError } = await anonClient.auth.resetPasswordForEmail(target.user.email, {
      redirectTo: input.redirect_to,
    })
    if (mailError) throw new HttpError(400, mailError.message)
    return { email_sent: true }
  }

  const password = input.password ?? generatePassword()
  assertStrong(password)
  const { error: pwError } = await adminClient.auth.admin.updateUserById(input.user_id, {
    password,
  })
  if (pwError) throw new HttpError(400, pwError.message)
  const { error: flagError } = await adminClient
    .from('profiles')
    .update({ must_change_password: true })
    .eq('id', input.user_id)
  if (flagError) throw new HttpError(500, flagError.message)
  return { temporary_password: password }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return json(req, { error: 'Method not allowed' }, 405)

  try {
    const caller = await getCaller(req)
    const parsed = bodySchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return json(req, { error: 'Invalid request', issues: parsed.error.issues }, 422)
    }
    const input = parsed.data
    const result =
      input.action === 'create'
        ? await createUser(caller, input)
        : await resetPassword(caller, input)
    return json(req, result)
  } catch (err) {
    if (err instanceof HttpError) return json(req, { error: err.message }, err.status)
    console.error(err)
    return json(req, { error: 'Unexpected server error' }, 500)
  }
})
