/**
 * POST /.netlify/functions/embed-proposal-lines
 *
 * Indexes a signed proposal's line items into proposal_line_embeddings
 * using OpenAI text-embedding-3-small. Only signed proposals are indexed
 * (they represent accepted, priced scopes — the gold standard for RAG).
 *
 * PM+ only. Can be called repeatedly — re-indexes the proposal by
 * deleting its existing embeddings and reinserting.
 *
 * Body (JSON):
 *   tenantId    string  — tenants.id
 *   proposalId  string  — proposals.id (must have status = 'signed')
 *
 * Responses:
 *   200  { indexed: number }
 *   400  { error: string }
 *   401  { error: string }
 *   403  { error: string }
 *   500  { error: string }
 */

import type { Handler } from '@netlify/functions'

const SUPABASE_URL         = process.env.SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const OPENAI_API_KEY       = process.env.OPENAI_API_KEY!

const PM_AND_ABOVE = new Set(['project_manager', 'admin', 'owner'])
const EMBED_MODEL  = 'text-embedding-3-small'

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

async function embedTexts(texts: string[]): Promise<number[][]> {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`OpenAI embeddings failed: ${err}`)
  }

  const body = await res.json() as { data: Array<{ embedding: number[] }> }
  return body.data.map((d) => d.embedding)
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
  const proposalId = typeof body.proposalId === 'string' ? body.proposalId.trim() : ''

  if (!tenantId)   return json(400, { error: 'tenantId is required' })
  if (!proposalId) return json(400, { error: 'proposalId is required' })

  // ── PM+ check ─────────────────────────────────────────────────────────────
  const memberRes = await fetch(
    `${SUPABASE_URL}/rest/v1/tenant_members?select=role&user_id=eq.${userId}&tenant_id=eq.${tenantId}&limit=1`,
    { headers: { ...svcHeaders(), Accept: 'application/json' } },
  )
  const members = await memberRes.json() as { role: string }[]
  if (!members[0] || !PM_AND_ABOVE.has(members[0].role)) {
    return json(403, { error: 'Project Manager, Admin, or Owner required' })
  }

  // ── Fetch proposal (must be signed) ───────────────────────────────────────
  const propRes = await fetch(
    `${SUPABASE_URL}/rest/v1/proposals?select=id,status,tenant_id&id=eq.${proposalId}&tenant_id=eq.${tenantId}&limit=1`,
    { headers: { ...svcHeaders(), Accept: 'application/json' } },
  )
  const proposals = await propRes.json() as { id: string; status: string; tenant_id: string }[]

  if (!proposals[0]) return json(404, { error: 'Proposal not found' })
  if (proposals[0].status !== 'signed') {
    return json(400, { error: 'Only signed (accepted) proposals can be indexed for pricing' })
  }

  // ── Fetch line items ───────────────────────────────────────────────────────
  const itemsRes = await fetch(
    `${SUPABASE_URL}/rest/v1/proposal_line_items?select=id,item_name,description,unit_price_cents,quantity&proposal_id=eq.${proposalId}&order=sort_order`,
    { headers: { ...svcHeaders(), Accept: 'application/json' } },
  )
  const items = await itemsRes.json() as Array<{
    id: string; item_name: string; description: string;
    unit_price_cents: number; quantity: number
  }>

  if (!items.length) return json(200, { indexed: 0 })

  // ── Build chunk texts and embed ───────────────────────────────────────────
  const chunkTexts = items.map((item) =>
    item.description
      ? `${item.item_name}: ${item.description}`
      : item.item_name,
  )

  const embeddings = await embedTexts(chunkTexts)

  // ── Delete existing embeddings for this proposal, then insert ─────────────
  await fetch(
    `${SUPABASE_URL}/rest/v1/proposal_line_embeddings?proposal_id=eq.${proposalId}`,
    { method: 'DELETE', headers: svcHeaders() },
  )

  const rows = items.map((item, i) => ({
    tenant_id:        tenantId,
    proposal_id:      proposalId,
    line_item_id:     item.id,
    item_name:        item.item_name,
    description:      item.description,
    unit_price_cents: item.unit_price_cents,
    quantity:         item.quantity,
    chunk_text:       chunkTexts[i],
    embedding:        embeddings[i],
    model:            EMBED_MODEL,
  }))

  const insertRes = await fetch(
    `${SUPABASE_URL}/rest/v1/proposal_line_embeddings`,
    {
      method:  'POST',
      headers: { ...svcHeaders(), Prefer: 'return=minimal' },
      body:    JSON.stringify(rows),
    },
  )

  if (!insertRes.ok) {
    const err = await insertRes.text()
    return json(500, { error: `Failed to store embeddings: ${err}` })
  }

  return json(200, { indexed: rows.length })
}
