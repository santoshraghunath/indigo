/**
 * POST /.netlify/functions/draft-proposal
 *
 * Converts a sales-visit transcript into a structured proposal draft
 * using the PROPOSAL_DRAFTER_V1 system prompt. Available to any active
 * tenant member who can create proposals.
 *
 * Body (JSON):
 *   tenantId    string   — tenants.id (for auth + RLS check)
 *   transcript  string   — Whisper transcript text
 *   leadId?     string   — optional leads.id to associate the draft
 *   jobType?    string   — optional hint, e.g. "kitchen remodel"
 *   address?    string   — optional job address hint
 *
 * Responses:
 *   200  {
 *          title:      string,
 *          intro_text: string,
 *          line_items: Array<{
 *            item_name:        string,
 *            description:      string,
 *            unit_price_cents: number,
 *            quantity:         number,
 *          }>
 *        }
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

const PROPOSAL_DRAFTER_SYSTEM = `You are a senior estimator and sales writer for Good Guy Builders, a Bay Area home renovation company.

Your job is to turn a transcript of a sales visit into a polished, editable proposal draft.

Output ONLY valid JSON — no markdown, no code fences, no explanation — in this exact shape:
{
  "title": string,          // 4-10 words: scope + location, e.g. "Kitchen Remodel — 142 Oak Ave"
  "intro_text": string,     // 2-4 warm sentences. Thank the client, recap what you heard, set expectations.
  "line_items": [
    {
      "item_name": string,         // short label, e.g. "Demo & Rough Carpentry"
      "description": string,       // 1-2 sentences the client reads: what's included
      "unit_price_cents": integer, // Bay Area all-in price (labor + materials + 15% OH&P), in cents
      "quantity": number           // almost always 1 for lump-sum scopes; use >1 for unit pricing
    }
  ]
}

Pricing guidelines (Bay Area 2024-2025, all-in with 15% OH&P):
- Kitchen remodel (full gut): $80k–$150k depending on size/finishes
- Bathroom remodel (full): $25k–$55k
- Flooring (LVP/hardwood) per sq ft installed: $12–$22
- Interior paint per room: $1,200–$2,500
- Window replacement each: $1,500–$3,500
- Roof replacement per sq: $1,800–$3,500
- ADU (detached, 400–800 sf): $200k–$400k
- Room addition per sq ft: $400–$650
- Deck/patio per sq ft: $60–$130

Rules:
- Break scope into logical trade groups (demo, framing, electrical, plumbing, finishes, etc.)
- If the transcript mentions a specific product, brand, or finish, name it in the description
- If a scope item is vague, describe the mid-range assumption you priced at
- Always include a "Permit & Fees" line item when permits are likely required
- Always include a "Project Management & Supervision" line at ~8% of subtotal
- Use lump-sum (quantity: 1) for most items; use unit pricing only when the transcript gives measurements
- If something in the transcript is unclear, include the item with a note in the description: "(confirm scope with client)"
- Do not include a "total" or markup line — the app calculates totals automatically

Voice:
- Professional but warm — talking to a homeowner, not a contractor
- Active voice: "We'll…" not "Work shall be performed to…"
- Mention specific rooms, materials, or details the client said to build trust`

interface ProposalLineItem {
  item_name:        string
  description:      string
  unit_price_cents: number
  quantity:         number
}

interface ProposalDraft {
  title:      string
  intro_text: string
  line_items: ProposalLineItem[]
}

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

function buildUserMessage(transcript: string, jobType?: string, address?: string): string {
  const parts: string[] = []
  if (jobType) parts.push(`Job type: ${jobType}`)
  if (address) parts.push(`Address: ${address}`)
  parts.push(`\nTranscript:\n${transcript}`)
  return parts.join('\n')
}

function logDraftBestEffort(
  tenantId: string,
  userId: string,
  leadId: string | undefined,
  draft: ProposalDraft,
): void {
  fetch(`${SUPABASE_URL}/rest/v1/ai_generated_content`, {
    method: 'POST',
    headers: { ...svcHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify({
      tenant_id:     tenantId,
      user_id:       userId,
      content_type:  'proposal_draft',
      prompt_version: 'PROPOSAL_DRAFTER_V1',
      source_record_id: leadId ?? null,
      ai_draft:      JSON.stringify(draft),
    }),
  }).catch(() => { /* audit log — never block the response */ })
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

  const tenantId   = typeof body.tenantId   === 'string' ? body.tenantId.trim()   : ''
  const transcript = typeof body.transcript === 'string' ? body.transcript.trim() : ''
  const leadId     = typeof body.leadId     === 'string' ? body.leadId.trim()     : undefined
  const jobType    = typeof body.jobType    === 'string' ? body.jobType.trim()    : undefined
  const address    = typeof body.address    === 'string' ? body.address.trim()    : undefined

  if (!tenantId)   return json(400, { error: 'tenantId is required' })
  if (!transcript) return json(400, { error: 'transcript is required' })
  if (transcript.length < 50) return json(400, { error: 'Transcript is too short to draft a proposal' })

  // ── Tenant membership check (any active member can create proposals) ──────
  const memberRes = await fetch(
    `${SUPABASE_URL}/rest/v1/tenant_members?select=role&user_id=eq.${userId}&tenant_id=eq.${tenantId}&is_active=eq.true&limit=1`,
    { headers: { ...svcHeaders(), Accept: 'application/json' } },
  )
  const members = await memberRes.json() as { role: string }[]
  if (!members[0]) return json(403, { error: 'You are not a member of this tenant' })

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
      max_tokens: 4096,
      system:     PROPOSAL_DRAFTER_SYSTEM,
      messages:   [{ role: 'user', content: buildUserMessage(transcript, jobType, address) }],
    }),
  })

  if (!anthropicRes.ok) {
    const err = await anthropicRes.text()
    return json(500, { error: `AI draft failed: ${err}` })
  }

  const aiBody = await anthropicRes.json() as {
    content?: Array<{ type: string; text?: string }>
  }
  const rawText = aiBody.content?.find((c) => c.type === 'text')?.text ?? ''

  // ── Parse JSON response ───────────────────────────────────────────────────
  let draft: ProposalDraft
  try {
    // Strip any accidental markdown fences before parsing
    const cleaned = rawText.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim()
    draft = JSON.parse(cleaned) as ProposalDraft
  } catch {
    return json(500, { error: 'AI returned malformed JSON — please try again' })
  }

  // Basic shape validation
  if (!draft.title || !draft.intro_text || !Array.isArray(draft.line_items)) {
    return json(500, { error: 'AI response missing required fields — please try again' })
  }

  // Sanitize line items: ensure numeric types are numbers
  draft.line_items = draft.line_items.map((item, i) => ({
    item_name:        String(item.item_name ?? ''),
    description:      String(item.description ?? ''),
    unit_price_cents: Math.round(Number(item.unit_price_cents ?? 0)),
    quantity:         Number(item.quantity ?? 1),
    sort_order:       i,
  })) as unknown as ProposalLineItem[]

  // ── Audit log (best-effort, non-blocking) ─────────────────────────────────
  logDraftBestEffort(tenantId, userId, leadId, draft)

  return json(200, draft)
}
