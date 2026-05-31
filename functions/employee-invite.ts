/**
 * POST /.netlify/functions/employee-invite
 *
 * Invites a new employee (or re-invites an existing user) to the tenant.
 * Requires the caller to be an authenticated PM+ tenant member.
 *
 * Uses raw fetch against the Supabase REST + Auth APIs (no @supabase/supabase-js
 * import) so the function has zero npm dependencies — consistent with portal-invite.
 *
 * Body (JSON):
 *   tenantId    string  — tenants.id
 *   email       string  — the employee's email address
 *   firstName   string  — first name
 *   lastName    string  — last name
 *   role        string  — member_role value (see ALLOWED_ROLES below)
 *   title?      string  — optional job title
 *   phone?      string  — optional phone number
 *
 * Responses:
 *   200  { userId: string, alreadyExists: boolean }
 *   400  { error: string }
 *   401  { error: string }
 *   403  { error: string }
 *   409  { error: string }  — already a member of this tenant
 *   500  { error: string }
 */

import type { Handler } from '@netlify/functions'

const SUPABASE_URL         = process.env.SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const APP_URL              = (process.env.URL ?? process.env.VITE_APP_URL ?? 'http://localhost:5173').replace(/\/$/, '')

const PM_AND_ABOVE = new Set(['project_manager', 'admin', 'owner'])

// Roles that may be assigned to employees via this endpoint.
// Subcontractors are managed separately (SubcontractorsPage).
// Clients are portal-only (portal-invite endpoint).
const ALLOWED_ROLES = new Set([
  'owner', 'admin', 'project_manager',
  'field_super', 'field_associate', 'accountant', 'subcontractor',
])

function svcHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type':  'application/json',
    'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
    'apikey':        SUPABASE_SERVICE_KEY,
    ...extra,
  }
}

function json(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' }

  // ── Authenticate caller ──────────────────────────────────────────────────
  const token = event.headers['authorization']?.replace(/^Bearer\s+/i, '')
  if (!token) return json(401, { error: 'Missing Authorization header' })

  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_SERVICE_KEY },
  })
  if (!userRes.ok) return json(401, { error: 'Invalid or expired token' })

  const userBody = await userRes.json() as { id?: string }
  const callerId = userBody.id
  if (!callerId) return json(401, { error: 'Could not resolve user from token' })

  // ── Parse body ───────────────────────────────────────────────────────────
  let body: Record<string, unknown>
  try { body = JSON.parse(event.body ?? '{}') }
  catch { return json(400, { error: 'Invalid JSON body' }) }

  const tenantId  = typeof body.tenantId   === 'string' ? body.tenantId.trim()             : ''
  const email     = typeof body.email      === 'string' ? body.email.trim().toLowerCase()   : ''
  const firstName = typeof body.firstName  === 'string' ? body.firstName.trim()             : ''
  const lastName  = typeof body.lastName   === 'string' ? body.lastName.trim()              : ''
  const role      = typeof body.role       === 'string' ? body.role.trim()                  : ''
  const title     = typeof body.title      === 'string' ? body.title.trim() || null         : null
  const phone     = typeof body.phone      === 'string' ? body.phone.trim() || null         : null

  if (!tenantId || !email || !firstName || !lastName || !role) {
    return json(400, { error: 'tenantId, email, firstName, lastName, and role are required' })
  }
  if (!email.includes('@')) return json(400, { error: 'Invalid email address' })
  if (!ALLOWED_ROLES.has(role)) {
    return json(400, { error: `Invalid role. Allowed: ${[...ALLOWED_ROLES].join(', ')}` })
  }

  // ── Verify caller is PM+ in the tenant ──────────────────────────────────
  const memberRes = await fetch(
    `${SUPABASE_URL}/rest/v1/tenant_members?select=role&user_id=eq.${callerId}&tenant_id=eq.${tenantId}&is_active=eq.true&limit=1`,
    { headers: svcHeaders({ Accept: 'application/json' }) },
  )
  const members = await memberRes.json() as { role: string }[]
  if (!members[0] || !PM_AND_ABOVE.has(members[0].role)) {
    return json(403, { error: 'You must be a Project Manager, Admin, or Owner to invite employees' })
  }

  // ── Send Supabase invite ─────────────────────────────────────────────────
  // POST /auth/v1/invite creates an auth account and emails the invite link.
  // If the user already exists (422), fall through — we still need to ensure
  // they have a tenant_members row.
  const inviteRes = await fetch(`${SUPABASE_URL}/auth/v1/invite`, {
    method:  'POST',
    headers: svcHeaders(),
    body: JSON.stringify({
      email,
      data:        { tenant_id: tenantId, role, first_name: firstName, last_name: lastName },
      redirect_to: `${APP_URL}/`,
    }),
  })

  const alreadyExists = inviteRes.status === 422
  if (!inviteRes.ok && !alreadyExists) {
    const err = await inviteRes.text()
    return json(500, { error: `Invite email failed: ${err}` })
  }

  // On 422 the body may still contain user info or be an error — we need
  // to look up the existing user by email instead.
  let userId: string | null = null

  if (!alreadyExists) {
    const inviteBody = await inviteRes.json() as { id?: string }
    userId = inviteBody.id ?? null
  } else {
    // Look up existing auth user by email via admin endpoint
    const lookupRes = await fetch(
      `${SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(email)}&page=1&per_page=1`,
      { headers: svcHeaders() },
    )
    if (lookupRes.ok) {
      const lookupBody = await lookupRes.json() as { users?: { id: string }[] }
      userId = lookupBody.users?.[0]?.id ?? null
    }
  }

  if (!userId) {
    return json(500, { error: 'Could not determine invited user ID' })
  }

  // ── Upsert user_profiles ─────────────────────────────────────────────────
  // Creates the profile if new, leaves existing profile untouched if already set.
  const profileRes = await fetch(
    `${SUPABASE_URL}/rest/v1/user_profiles?on_conflict=id`,
    {
      method:  'POST',
      headers: svcHeaders({ Prefer: 'return=minimal,resolution=ignore-duplicates' }),
      body: JSON.stringify({
        id:         userId,
        first_name: firstName,
        last_name:  lastName,
        email:      email,
        phone:      phone,
        title:      title,
      }),
    },
  )
  if (!profileRes.ok && profileRes.status !== 409) {
    const err = await profileRes.text()
    return json(500, { error: `Failed to create user profile: ${err}` })
  }

  // ── Check for existing tenant membership ─────────────────────────────────
  const existingRes = await fetch(
    `${SUPABASE_URL}/rest/v1/tenant_members?select=id,is_active&user_id=eq.${userId}&tenant_id=eq.${tenantId}&limit=1`,
    { headers: svcHeaders({ Accept: 'application/json' }) },
  )
  const existing = await existingRes.json() as { id: string; is_active: boolean }[]

  if (existing[0]) {
    // If inactive, re-activate with new role
    if (!existing[0].is_active) {
      await fetch(
        `${SUPABASE_URL}/rest/v1/tenant_members?id=eq.${existing[0].id}`,
        {
          method:  'PATCH',
          headers: svcHeaders({ Prefer: 'return=minimal' }),
          body: JSON.stringify({ is_active: true, role, accepted_at: null, invited_at: new Date().toISOString(), invited_by: callerId }),
        },
      )
    }
    return json(200, { userId, alreadyExists: true })
  }

  // ── Create tenant_members row ────────────────────────────────────────────
  const tmRes = await fetch(
    `${SUPABASE_URL}/rest/v1/tenant_members`,
    {
      method:  'POST',
      headers: svcHeaders({ Prefer: 'return=minimal' }),
      body: JSON.stringify({
        tenant_id:   tenantId,
        user_id:     userId,
        role,
        is_active:   true,
        invited_by:  callerId,
        invited_at:  new Date().toISOString(),
      }),
    },
  )

  if (!tmRes.ok) {
    const err = await tmRes.text()
    return json(500, { error: `Failed to create tenant membership: ${err}` })
  }

  return json(200, { userId, alreadyExists })
}
