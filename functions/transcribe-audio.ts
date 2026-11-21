/**
 * POST /.netlify/functions/transcribe-audio
 *
 * Transcribes a sales visit audio recording using OpenAI Whisper.
 * The client uploads the audio file directly to the `sales-audio`
 * Supabase storage bucket first (via uploadAudioForTranscription in
 * packages/shared), then passes the storage path here. This avoids
 * Netlify's 6 MB body limit — only a small JSON payload is sent.
 *
 * Body (JSON):
 *   tenantId     string  — tenants.id (for auth check)
 *   storagePath  string  — path inside the sales-audio bucket
 *                          (e.g. "{tenantId}/{uuid}.webm")
 *
 * Responses:
 *   200  { transcript: string }
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

async function deleteStorageFile(storagePath: string): Promise<void> {
  await fetch(
    `${SUPABASE_URL}/storage/v1/object/sales-audio/${storagePath}`,
    { method: 'DELETE', headers: svcHeaders() },
  ).catch(() => { /* best-effort cleanup */ })
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

  const tenantId    = typeof body.tenantId    === 'string' ? body.tenantId.trim()    : ''
  const storagePath = typeof body.storagePath === 'string' ? body.storagePath.trim() : ''

  if (!tenantId)    return json(400, { error: 'tenantId is required' })
  if (!storagePath) return json(400, { error: 'storagePath is required' })

  // Ensure the path is inside the caller's tenant folder
  if (!storagePath.startsWith(`${tenantId}/`)) {
    return json(403, { error: 'storagePath must be within your tenant folder' })
  }

  // ── Role check ────────────────────────────────────────────────────────────
  const memberRes = await fetch(
    `${SUPABASE_URL}/rest/v1/tenant_members?select=role&user_id=eq.${userId}&tenant_id=eq.${tenantId}&limit=1`,
    { headers: { ...svcHeaders(), Accept: 'application/json' } },
  )
  const members = await memberRes.json() as { role: string }[]
  if (!members[0] || !PM_AND_ABOVE.has(members[0].role)) {
    return json(403, { error: 'Project Manager, Admin, or Owner required' })
  }

  // ── Fetch audio from Supabase storage ────────────────────────────────────
  const storageRes = await fetch(
    `${SUPABASE_URL}/storage/v1/object/sales-audio/${storagePath}`,
    { headers: { Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, apikey: SUPABASE_SERVICE_KEY } },
  )

  if (!storageRes.ok) {
    return json(500, { error: `Could not retrieve audio file: ${storageRes.status}` })
  }

  const audioBuffer = Buffer.from(await storageRes.arrayBuffer())
  const mimeType    = storageRes.headers.get('content-type') ?? 'audio/webm'
  const filename    = storagePath.split('/').pop() ?? 'recording.webm'

  // ── Transcribe with OpenAI Whisper ────────────────────────────────────────
  const form = new FormData()
  form.append('file', new Blob([audioBuffer], { type: mimeType }), filename)
  form.append('model', 'whisper-1')
  form.append('language', 'en')

  const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method:  'POST',
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
    body:    form,
  })

  // Always delete the temp file, even on transcription failure
  await deleteStorageFile(storagePath)

  if (!whisperRes.ok) {
    const err = await whisperRes.text()
    return json(500, { error: `Transcription failed: ${err}` })
  }

  const whisperBody = await whisperRes.json() as { text?: string }
  const transcript  = whisperBody.text?.trim() ?? ''

  if (!transcript) return json(500, { error: 'Whisper returned an empty transcript' })

  return json(200, { transcript })
}
