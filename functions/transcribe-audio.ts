/**
 * POST /.netlify/functions/transcribe-audio
 *
 * Transcribes a sales visit audio recording using OpenAI Whisper.
 * Accepts a base64-encoded audio file in the JSON body. PM+ only.
 *
 * Body (JSON):
 *   tenantId  string  — tenants.id (for auth check)
 *   audio     string  — base64-encoded audio bytes
 *   filename  string  — original filename including extension (e.g. "recording.m4a")
 *   mimeType  string  — MIME type (e.g. "audio/mp4")
 *
 * Responses:
 *   200  { transcript: string }
 *   400  { error: string }
 *   401  { error: string }
 *   403  { error: string }
 *   413  { error: string }
 *   500  { error: string }
 */

import type { Handler } from '@netlify/functions'

const SUPABASE_URL         = process.env.SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const OPENAI_API_KEY       = process.env.OPENAI_API_KEY!

// Anyone who can create a proposal
const PM_AND_ABOVE = new Set(['project_manager', 'admin', 'owner'])

// 4.5 MB raw audio → ~6 MB base64-encoded body (Netlify limit)
const MAX_AUDIO_BYTES = 4.5 * 1024 * 1024

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
  const audio    = typeof body.audio    === 'string' ? body.audio            : ''
  const filename = typeof body.filename === 'string' ? body.filename.trim()  : 'recording.webm'
  const mimeType = typeof body.mimeType === 'string' ? body.mimeType.trim()  : 'audio/webm'

  if (!tenantId) return json(400, { error: 'tenantId is required' })
  if (!audio)    return json(400, { error: 'audio is required' })

  // ── Role check ────────────────────────────────────────────────────────────
  const memberRes = await fetch(
    `${SUPABASE_URL}/rest/v1/tenant_members?select=role&user_id=eq.${userId}&tenant_id=eq.${tenantId}&limit=1`,
    { headers: { ...svcHeaders(), Accept: 'application/json' } },
  )
  const members = await memberRes.json() as { role: string }[]
  if (!members[0] || !PM_AND_ABOVE.has(members[0].role)) {
    return json(403, { error: 'Project Manager, Admin, or Owner required' })
  }

  // ── Decode and size-check ─────────────────────────────────────────────────
  let audioBuffer: Buffer
  try {
    audioBuffer = Buffer.from(audio, 'base64')
  } catch {
    return json(400, { error: 'Invalid base64 audio data' })
  }

  if (audioBuffer.length > MAX_AUDIO_BYTES) {
    return json(413, {
      error: `Audio too large (${(audioBuffer.length / 1024 / 1024).toFixed(1)} MB). Maximum is 4.5 MB — keep recordings under about 7 minutes.`,
    })
  }

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

  if (!whisperRes.ok) {
    const err = await whisperRes.text()
    return json(500, { error: `Transcription failed: ${err}` })
  }

  const whisperBody = await whisperRes.json() as { text?: string }
  const transcript  = whisperBody.text?.trim() ?? ''

  if (!transcript) return json(500, { error: 'Whisper returned an empty transcript' })

  return json(200, { transcript })
}
