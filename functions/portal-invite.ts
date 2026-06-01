/**
 * POST /.netlify/functions/portal-invite
 *
 * Adds a secondary portal contact for a customer and sends them a Supabase
 * invite email.  Requires the caller to be an authenticated PM+ tenant member.
 *
 * Uses raw fetch against the Supabase REST + Auth APIs (no @supabase/supabase-js
 * import) so the function has zero npm dependencies — consistent with the
 * address-search function and compatible with the monorepo root package.json
 * which has no dependencies of its own.
 *
 * Body (JSON):
 *   customerId  string   — customers.id
 *   tenantId    string   — tenants.id
 *   email       string   — the contact's email
 *   label?      string   — optional label, e.g. "Co-owner" (secondary only)
 *   isPrimary?  boolean  — when true, skips the customer_portal_users DB write
 *                          and sends the invite email directly to the primary
 *                          contact (no secondary record is created)
 *
 * Responses:
 *   200  { id: string | null, alreadyExists: boolean }
 *   400  { error: string }
 *   401  { error: string }
 *   403  { error: string }
 *   404  { error: string }
 *   500  { error: string }
 */

import type { Handler } from '@netlify/functions'

const SUPABASE_URL          = process.env.SUPABASE_URL!
const SUPABASE_SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!
const APP_URL               = (process.env.URL ?? process.env.VITE_APP_URL ?? 'http://localhost:5173').replace(/\/$/, '')

const PM_AND_ABOVE = new Set(['project_manager', 'admin', 'owner'])

// Headers used for every service-role REST/Auth call
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

  // Verify the user JWT against Supabase Auth
  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_SERVICE_KEY },
  })
  if (!userRes.ok) return json(401, { error: 'Invalid or expired token' })

  const userBody = await userRes.json() as { id?: string }
  const userId = userBody.id
  if (!userId) return json(401, { error: 'Could not resolve user from token' })

  // ── Parse body ───────────────────────────────────────────────────────────
  let body: Record<string, unknown>
  try { body = JSON.parse(event.body ?? '{}') }
  catch { return json(400, { error: 'Invalid JSON body' }) }

  const customerId = typeof body.customerId === 'string' ? body.customerId.trim() : ''
  const tenantId   = typeof body.tenantId   === 'string' ? body.tenantId.trim()   : ''
  const email      = typeof body.email      === 'string' ? body.email.trim().toLowerCase() : ''
  const label      = typeof body.label      === 'string' ? body.label.trim() || null : null
  const isPrimary  = body.isPrimary === true

  if (!customerId || !tenantId || !email) {
    return json(400, { error: 'customerId, tenantId, and email are required' })
  }
  if (!email.includes('@')) return json(400, { error: 'Invalid email address' })

  // ── Verify caller is PM+ in the tenant ──────────────────────────────────
  const memberRes = await fetch(
    `${SUPABASE_URL}/rest/v1/tenant_members?select=role&user_id=eq.${userId}&tenant_id=eq.${tenantId}&limit=1`,
    { headers: svcHeaders({ Accept: 'application/json' }) },
  )
  const members = await memberRes.json() as { role: string }[]
  if (!members[0] || !PM_AND_ABOVE.has(members[0].role)) {
    return json(403, { error: 'You must be a Project Manager, Admin, or Owner to invite portal users' })
  }

  // ── Validate customer belongs to this tenant ─────────────────────────────
  const custRes = await fetch(
    `${SUPABASE_URL}/rest/v1/customers?select=id,email&id=eq.${customerId}&tenant_id=eq.${tenantId}&limit=1`,
    { headers: svcHeaders({ Accept: 'application/json' }) },
  )
  const customers = await custRes.json() as { id: string; email: string }[]
  if (!customers[0]) return json(404, { error: 'Customer not found in this tenant' })

  // For secondary invites only: block using the primary email as a secondary contact
  if (!isPrimary && customers[0].email.toLowerCase() === email) {
    return json(400, { error: 'That email is already the primary contact for this customer.' })
  }

  // ── Upsert the customer_portal_users row (secondary contacts only) ────────
  let id: string | null = null

  if (!isPrimary) {
    const upsertRes = await fetch(
      `${SUPABASE_URL}/rest/v1/customer_portal_users?on_conflict=customer_id%2Cemail`,
      {
        method:  'POST',
        headers: svcHeaders({ Prefer: 'return=representation,resolution=merge-duplicates' }),
        body: JSON.stringify({
          customer_id: customerId,
          tenant_id:   tenantId,
          email,
          label,
          invited_at:  new Date().toISOString(),
        }),
      },
    )

    if (!upsertRes.ok) {
      const err = await upsertRes.text()
      return json(500, { error: `Failed to save portal user record: ${err}` })
    }
    const rows = await upsertRes.json() as { id: string }[]
    id = rows[0]?.id ?? null
  }

  // ── Send invite email ────────────────────────────────────────────────────
  // POST /auth/v1/invite creates an account and emails a signup link.
  // 422 means the user already has an account — not a failure for our purposes;
  // they can log in and portal_link_self() will wire them up automatically.
  const inviteRes = await fetch(`${SUPABASE_URL}/auth/v1/invite`, {
    method:  'POST',
    headers: svcHeaders(),
    body: JSON.stringify({
      email,
      data:        { customer_id: customerId, tenant_id: tenantId },
      redirect_to: `${APP_URL}/portal`,
    }),
  })

  const alreadyExists = inviteRes.status === 422
  if (!inviteRes.ok && !alreadyExists) {
    const err = await inviteRes.text()
    return json(500, { error: `Contact added but invite email failed: ${err}` })
  }

  return json(200, { id, alreadyExists })
}
