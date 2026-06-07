/**
 * POST /.netlify/functions/sub-invite
 *
 * Invites a sub_contacts contact to access the Indigo app as a subcontractor.
 * Requires the caller to be an authenticated PM+ tenant member.
 *
 * Body (JSON):
 *   contactId   string    — sub_contacts.id
 *   email       string    — contact's email
 *   tenantId    string    — tenants.id
 *   projectIds  string[]  — project IDs to add the sub to via project_members
 *
 * Responses:
 *   200  { userId: string, alreadyExists: boolean }
 *   400  { error: string }
 *   401  { error: string }
 *   403  { error: string }
 *   500  { error: string }
 */

import type { Handler } from '@netlify/functions'

const SUPABASE_URL         = process.env.SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const APP_URL              = (process.env.URL ?? process.env.VITE_APP_URL ?? 'http://localhost:5173').replace(/\/$/, '')
const PM_AND_ABOVE         = new Set(['project_manager', 'admin', 'owner'])

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

  const contactId  = typeof body.contactId === 'string' ? body.contactId.trim()           : ''
  const email      = typeof body.email     === 'string' ? body.email.trim().toLowerCase() : ''
  const tenantId   = typeof body.tenantId  === 'string' ? body.tenantId.trim()            : ''
  const projectIds = Array.isArray(body.projectIds)
    ? body.projectIds.filter((x): x is string => typeof x === 'string')
    : []

  if (!contactId || !email || !tenantId) {
    return json(400, { error: 'contactId, email, and tenantId are required' })
  }
  if (!email.includes('@')) return json(400, { error: 'Invalid email address' })

  // ── Verify caller is PM+ in tenant ──────────────────────────────────────
  const memberRes = await fetch(
    `${SUPABASE_URL}/rest/v1/tenant_members?select=role&user_id=eq.${callerId}&tenant_id=eq.${tenantId}&is_active=eq.true&limit=1`,
    { headers: svcHeaders({ Accept: 'application/json' }) },
  )
  const members = await memberRes.json() as { role: string }[]
  if (!members[0] || !PM_AND_ABOVE.has(members[0].role)) {
    return json(403, { error: 'You must be a Project Manager, Admin, or Owner to invite subcontractors' })
  }

  // ── Send Supabase invite (creates auth account + emails invite link) ─────
  const inviteRes = await fetch(`${SUPABASE_URL}/auth/v1/invite`, {
    method:  'POST',
    headers: svcHeaders(),
    body: JSON.stringify({
      email,
      data:        { tenant_id: tenantId, role: 'subcontractor' },
      redirect_to: APP_URL,
    }),
  })

  const alreadyExists = inviteRes.status === 422
  if (!inviteRes.ok && !alreadyExists) {
    const err = await inviteRes.text()
    return json(500, { error: `Invite email failed: ${err}` })
  }

  // ── Resolve userId ───────────────────────────────────────────────────────
  let userId: string | null = null

  if (!alreadyExists) {
    const inviteBody = await inviteRes.json() as { id?: string }
    userId = inviteBody.id ?? null
  } else {
    const lookupRes = await fetch(
      `${SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(email)}&page=1&per_page=1`,
      { headers: svcHeaders() },
    )
    if (lookupRes.ok) {
      const lookupBody = await lookupRes.json() as { users?: { id: string }[] }
      userId = lookupBody.users?.[0]?.id ?? null
    }
  }

  if (!userId) return json(500, { error: 'Could not determine invited user ID' })

  // ── Upsert user_profiles (pull name from sub_contacts) ───────────────────
  const contactRes = await fetch(
    `${SUPABASE_URL}/rest/v1/sub_contacts?id=eq.${contactId}&select=first_name,last_name&limit=1`,
    { headers: svcHeaders({ Accept: 'application/json' }) },
  )
  const contacts = await contactRes.json() as { first_name: string; last_name: string }[]
  const contact = contacts[0]

  await fetch(`${SUPABASE_URL}/rest/v1/user_profiles?on_conflict=id`, {
    method:  'POST',
    headers: svcHeaders({ Prefer: 'return=minimal,resolution=ignore-duplicates' }),
    body: JSON.stringify({
      id:         userId,
      first_name: contact?.first_name ?? '',
      last_name:  contact?.last_name  ?? '',
      email,
    }),
  })

  // ── Upsert tenant_members (subcontractor role) ───────────────────────────
  const existingMbrRes = await fetch(
    `${SUPABASE_URL}/rest/v1/tenant_members?select=id,is_active&user_id=eq.${userId}&tenant_id=eq.${tenantId}&limit=1`,
    { headers: svcHeaders({ Accept: 'application/json' }) },
  )
  const existingMbrs = await existingMbrRes.json() as { id: string; is_active: boolean }[]

  if (existingMbrs[0]) {
    if (!existingMbrs[0].is_active) {
      await fetch(`${SUPABASE_URL}/rest/v1/tenant_members?id=eq.${existingMbrs[0].id}`, {
        method:  'PATCH',
        headers: svcHeaders({ Prefer: 'return=minimal' }),
        body: JSON.stringify({
          is_active:  true,
          role:       'subcontractor',
          accepted_at: null,
          invited_at: new Date().toISOString(),
          invited_by: callerId,
        }),
      })
    }
    // Already active — no-op, just fall through to project assignment below
  } else {
    await fetch(`${SUPABASE_URL}/rest/v1/tenant_members`, {
      method:  'POST',
      headers: svcHeaders({ Prefer: 'return=minimal' }),
      body: JSON.stringify({
        tenant_id:  tenantId,
        user_id:    userId,
        role:       'subcontractor',
        is_active:  true,
        invited_by: callerId,
        invited_at: new Date().toISOString(),
      }),
    })
  }

  // ── Add to project_members for each specified project ────────────────────
  for (const projectId of projectIds) {
    const existingPmRes = await fetch(
      `${SUPABASE_URL}/rest/v1/project_members?select=id&project_id=eq.${projectId}&user_id=eq.${userId}&limit=1`,
      { headers: svcHeaders({ Accept: 'application/json' }) },
    )
    const existingPm = await existingPmRes.json() as { id: string }[]
    if (!existingPm[0]) {
      await fetch(`${SUPABASE_URL}/rest/v1/project_members`, {
        method:  'POST',
        headers: svcHeaders({ Prefer: 'return=minimal' }),
        body: JSON.stringify({
          project_id: projectId,
          tenant_id:  tenantId,
          user_id:    userId,
          role:       'subcontractor',
        }),
      })
    }
  }

  // ── Link sub_contacts.user_id ────────────────────────────────────────────
  await fetch(`${SUPABASE_URL}/rest/v1/sub_contacts?id=eq.${contactId}`, {
    method:  'PATCH',
    headers: svcHeaders({ Prefer: 'return=minimal' }),
    body: JSON.stringify({ user_id: userId }),
  })

  return json(200, { userId, alreadyExists })
}
