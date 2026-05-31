/**
 * POST /.netlify/functions/portal-invite
 *
 * Adds a secondary portal contact for a customer and sends them a Supabase
 * invite email.  Requires the caller to be an authenticated PM+ tenant member.
 *
 * Body (JSON):
 *   customerId  string  — customers.id
 *   tenantId    string  — tenants.id
 *   email       string  — the secondary contact's email
 *   label?      string  — optional label, e.g. "Co-owner"
 *
 * Responses:
 *   200  { id: string, alreadyExists: boolean }
 *   400  { error: string }   bad input
 *   401  { error: string }   not authenticated
 *   403  { error: string }   not PM+ in tenant
 *   404  { error: string }   customer not found
 *   500  { error: string }   DB or invite error
 */

import type { Handler } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL           = process.env.SUPABASE_URL!
const SUPABASE_SERVICE_ROLE  = process.env.SUPABASE_SERVICE_ROLE_KEY!
const APP_URL                = (process.env.URL ?? process.env.VITE_APP_URL ?? 'http://localhost:5173').replace(/\/$/, '')

// Service-role client — used for admin operations only
const svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false },
})

const PM_AND_ABOVE = ['project_manager', 'admin', 'owner']

function json(statusCode: number, body: unknown) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' }

  // ── Authenticate caller ──────────────────────────────────────────────────
  const token = event.headers['authorization']?.replace(/^Bearer\s+/i, '')
  if (!token) return json(401, { error: 'Missing Authorization header' })

  const { data: { user }, error: authErr } = await svc.auth.getUser(token)
  if (authErr || !user) return json(401, { error: 'Invalid or expired token' })

  // ── Parse body ───────────────────────────────────────────────────────────
  let body: Record<string, unknown>
  try { body = JSON.parse(event.body ?? '{}') }
  catch { return json(400, { error: 'Invalid JSON body' }) }

  const customerId = typeof body.customerId === 'string' ? body.customerId.trim() : ''
  const tenantId   = typeof body.tenantId   === 'string' ? body.tenantId.trim()   : ''
  const email      = typeof body.email      === 'string' ? body.email.trim().toLowerCase() : ''
  const label      = typeof body.label      === 'string' ? body.label.trim() || null : null

  if (!customerId || !tenantId || !email) {
    return json(400, { error: 'customerId, tenantId, and email are required' })
  }

  // Basic email sanity check
  if (!email.includes('@')) return json(400, { error: 'Invalid email address' })

  // ── Verify caller is PM+ in the tenant ──────────────────────────────────
  const { data: membership } = await svc
    .from('tenant_members')
    .select('role')
    .eq('user_id', user.id)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (!membership || !PM_AND_ABOVE.includes(membership.role as string)) {
    return json(403, { error: 'You must be a Project Manager, Admin, or Owner to invite portal users' })
  }

  // ── Validate customer belongs to this tenant ─────────────────────────────
  const { data: customer } = await svc
    .from('customers')
    .select('id, email')
    .eq('id', customerId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (!customer) return json(404, { error: 'Customer not found in this tenant' })

  // Don't allow duplicating the primary contact email
  if ((customer.email as string).toLowerCase() === email) {
    return json(400, { error: 'That email is already the primary contact for this customer.' })
  }

  // ── Upsert the customer_portal_users row ─────────────────────────────────
  const { data: cpuRow, error: upsertErr } = await svc
    .from('customer_portal_users')
    .upsert(
      {
        customer_id: customerId,
        tenant_id:   tenantId,
        email,
        label,
        invited_at:  new Date().toISOString(),
      },
      { onConflict: 'customer_id,email' },
    )
    .select('id')
    .single()

  if (upsertErr || !cpuRow) {
    return json(500, { error: upsertErr?.message ?? 'Failed to save portal user record' })
  }

  // ── Send invite email ────────────────────────────────────────────────────
  // inviteUserByEmail creates an account and emails a signup link.
  // If the user already has an account it returns an error — that's fine;
  // they can just log in and portal_link_self() will wire them up.
  const { error: inviteErr } = await svc.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${APP_URL}/portal`,
    data: { customer_id: customerId, tenant_id: tenantId },
  })

  const alreadyExists =
    inviteErr?.message?.toLowerCase().includes('already registered') ||
    inviteErr?.message?.toLowerCase().includes('already been registered') ||
    inviteErr?.status === 422

  if (inviteErr && !alreadyExists) {
    // Row was saved; only the email failed — surface this clearly
    return json(500, { error: `Contact added but invite email failed: ${inviteErr.message}` })
  }

  return json(200, { id: cpuRow.id, alreadyExists: alreadyExists ?? false })
}
