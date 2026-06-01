/**
 * POST /.netlify/functions/draft-daily-summary
 *
 * Calls the Anthropic Messages API to draft a client-friendly daily-log summary
 * from the internal worker reports for a given day.  PM+ only.
 *
 * Body (JSON):
 *   reports     Array<{ authorName: string; logType: string; workPerformed: string }>
 *   projectName string
 *
 * Responses:
 *   200  { draft: string }
 *   400  { error: string }
 *   401  { error: string }
 *   403  { error: string }
 *   500  { error: string }
 */

import type { Handler } from '@netlify/functions'

const SUPABASE_URL         = process.env.SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const DEEPSEEK_API_KEY     = process.env.DEEPSEEK_API_KEY!
const DEEPSEEK_MODEL       = 'deepseek-chat'   // resolves to latest DeepSeek generation

const PM_AND_ABOVE = new Set(['project_manager', 'admin', 'owner'])

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

  // ── Auth ─────────────────────────────────────────────────────────────────
  const token = event.headers['authorization']?.replace(/^Bearer\s+/i, '')
  if (!token) return json(401, { error: 'Missing Authorization header' })

  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_SERVICE_KEY },
  })
  if (!userRes.ok) return json(401, { error: 'Invalid or expired token' })
  const userBody = await userRes.json() as { id?: string }
  const userId = userBody.id
  if (!userId) return json(401, { error: 'Could not resolve user' })

  // ── Parse body ───────────────────────────────────────────────────────────
  let body: Record<string, unknown>
  try { body = JSON.parse(event.body ?? '{}') }
  catch { return json(400, { error: 'Invalid JSON body' }) }

  const tenantId   = typeof body.tenantId   === 'string' ? body.tenantId.trim()   : ''
  const projectName = typeof body.projectName === 'string' ? body.projectName.trim() : 'this project'
  const reports    = Array.isArray(body.reports) ? body.reports as Array<{
    authorName: string; logType: string; workPerformed: string
  }> : []

  if (!tenantId) return json(400, { error: 'tenantId is required' })
  if (reports.length === 0) return json(400, { error: 'No reports provided' })

  // ── PM+ check ────────────────────────────────────────────────────────────
  const memberRes = await fetch(
    `${SUPABASE_URL}/rest/v1/tenant_members?select=role&user_id=eq.${userId}&tenant_id=eq.${tenantId}&limit=1`,
    { headers: { ...svcHeaders(), Accept: 'application/json' } },
  )
  const members = await memberRes.json() as { role: string }[]
  if (!members[0] || !PM_AND_ABOVE.has(members[0].role)) {
    return json(403, { error: 'Project Manager, Admin, or Owner required' })
  }

  // ── Build prompt ─────────────────────────────────────────────────────────
  const reportsText = reports
    .map((r) => {
      const typeLabel = r.logType === 'subcontractor' ? 'Subcontractor' : 'Field Associate'
      return `${typeLabel} — ${r.authorName}:\n${r.workPerformed}`
    })
    .join('\n\n')

  const prompt = `You are writing a brief, professional daily construction log entry for the CLIENT of ${projectName}.

The following are INTERNAL notes submitted by field workers today:

${reportsText}

Write a single cohesive paragraph (4–6 sentences) summarizing today's progress in client-friendly language. Avoid internal jargon, worker names, or role titles. Focus on what was accomplished — what was built, installed, or completed. Keep a positive, forward-looking tone. Do not include a subject line or heading — just the paragraph.`

  // ── Call DeepSeek (OpenAI-compatible chat completions API) ───────────────
  const deepseekRes = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model:       DEEPSEEK_MODEL,
      max_tokens:  512,
      messages:    [{ role: 'user', content: prompt }],
    }),
  })

  if (!deepseekRes.ok) {
    const err = await deepseekRes.text()
    return json(500, { error: `AI draft failed: ${err}` })
  }

  const aiBody = await deepseekRes.json() as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const draft = aiBody.choices?.[0]?.message?.content ?? ''

  return json(200, { draft })
}
