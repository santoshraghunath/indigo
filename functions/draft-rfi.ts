/**
 * POST /.netlify/functions/draft-rfi
 *
 * Calls the Anthropic Messages API to draft a professional RFI question
 * using the RFI_DRAFTER_V1 system prompt. PM+ only.
 *
 * Body (JSON):
 *   tenantId   string  — tenants.id (for auth check)
 *   subject    string  — the RFI subject / one-line description of the issue
 *   context?   string  — optional additional context (drawing numbers, spec sections, etc.)
 *
 * Responses:
 *   200  { question: string }
 *   400  { error: string }
 *   401  { error: string }
 *   403  { error: string }
 *   500  { error: string }
 */

import type { Handler } from '@netlify/functions'

const SUPABASE_URL         = process.env.SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const ANTHROPIC_API_KEY    = process.env.ANTHROPIC_API_KEY!
const ANTHROPIC_MODEL      = 'claude-sonnet-4-6'

const PM_AND_ABOVE = new Set(['project_manager', 'admin', 'owner'])

const RFI_DRAFTER_SYSTEM = `You are a construction project manager for Good Guy Builders drafting a formal RFI (Request for Information).

Given a question or issue from the field, write a professional RFI that:
- Clearly states the issue or question
- References the relevant drawing/spec if mentioned
- Proposes 1-2 possible solutions when obvious
- Uses neutral, professional language appropriate for architects and engineers
- Is specific enough that the recipient can respond without a follow-up call

Keep it concise — RFIs should be readable in under 60 seconds.`

function svcHeaders(): Record<string, string> {
  return {
    'Content-Type':  'application/json',
    'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
    'apikey':        SUPABASE_SERVICE_KEY,
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

  // ── Auth ──────────────────────────────────────────────────────────────────
  const token = event.headers['authorization']?.replace(/^Bearer\s+/i, '')
  if (!token) return json(401, { error: 'Missing Authorization header' })

  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_SERVICE_KEY },
  })
  if (!userRes.ok) return json(401, { error: 'Invalid or expired token' })
  const userBody = await userRes.json() as { id?: string }
  const userId = userBody.id
  if (!userId) return json(401, { error: 'Could not resolve user' })

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: Record<string, unknown>
  try { body = JSON.parse(event.body ?? '{}') }
  catch { return json(400, { error: 'Invalid JSON body' }) }

  const tenantId = typeof body.tenantId === 'string' ? body.tenantId.trim() : ''
  const subject  = typeof body.subject  === 'string' ? body.subject.trim()  : ''
  const context  = typeof body.context  === 'string' ? body.context.trim()  : ''

  if (!tenantId) return json(400, { error: 'tenantId is required' })
  if (!subject)  return json(400, { error: 'subject is required' })

  // ── PM+ check ─────────────────────────────────────────────────────────────
  const memberRes = await fetch(
    `${SUPABASE_URL}/rest/v1/tenant_members?select=role&user_id=eq.${userId}&tenant_id=eq.${tenantId}&limit=1`,
    { headers: { ...svcHeaders(), Accept: 'application/json' } },
  )
  const members = await memberRes.json() as { role: string }[]
  if (!members[0] || !PM_AND_ABOVE.has(members[0].role)) {
    return json(403, { error: 'Project Manager, Admin, or Owner required' })
  }

  // ── Build user message ────────────────────────────────────────────────────
  const userMessage = context
    ? `Subject: ${subject}\n\nAdditional context: ${context}`
    : `Subject: ${subject}`

  // ── Call Anthropic ────────────────────────────────────────────────────────
  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      ANTHROPIC_MODEL,
      max_tokens: 512,
      system:     RFI_DRAFTER_SYSTEM,
      messages:   [{ role: 'user', content: userMessage }],
    }),
  })

  if (!anthropicRes.ok) {
    const err = await anthropicRes.text()
    return json(500, { error: `AI draft failed: ${err}` })
  }

  const aiBody = await anthropicRes.json() as {
    content?: Array<{ type: string; text?: string }>
  }
  const question = aiBody.content?.find((c) => c.type === 'text')?.text ?? ''

  return json(200, { question })
}
