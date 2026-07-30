/**
 * POST /.netlify/functions/notify-rfi
 *
 * Sends an email notification via Resend when an RFI is submitted or answered.
 * Called internally from the client after a successful Supabase mutation.
 * Must be called with a valid user token.
 *
 * Body (JSON):
 *   rfiId      string  — rfis.id
 *   tenantId   string  — tenants.id
 *   event      'submitted' | 'answered'  — which event triggered the notification
 *
 * Responses:
 *   200  { sent: number }
 *   400  { error: string }
 *   401  { error: string }
 *   500  { error: string }
 */

import type { Handler } from '@netlify/functions'

const SUPABASE_URL         = process.env.SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const RESEND_API_KEY       = process.env.RESEND_API_KEY
const RESEND_FROM          = process.env.RESEND_FROM_EMAIL ?? 'Indigo <no-reply@indigo.build>'
const APP_URL              = (process.env.URL ?? process.env.VITE_APP_URL ?? 'http://localhost:5173').replace(/\/$/, '')

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

function buildSubmittedEmail(opts: {
  rfiNumber: number
  subject: string
  question: string
  projectName: string
  submitterName: string
  appUrl: string
}) {
  const rfiLabel = `RFI-${String(opts.rfiNumber).padStart(3, '0')}`
  return {
    subject: `${rfiLabel}: ${opts.subject} — Indigo`,
    html: `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1c1d2e; max-width: 560px; margin: 0 auto; padding: 32px 16px;">
  <div style="margin-bottom: 24px;">
    <div style="display: inline-block; background: #6366f1; color: white; font-weight: 700; font-size: 18px; width: 40px; height: 40px; line-height: 40px; text-align: center; border-radius: 10px; margin-bottom: 16px;">I</div>
    <h1 style="font-size: 20px; font-weight: 700; margin: 0 0 4px;">New RFI Assigned</h1>
    <p style="color: #6b7280; margin: 0; font-size: 14px;">${opts.projectName}</p>
  </div>

  <div style="background: #f7f8fb; border: 1px solid #e2e4ef; border-radius: 10px; padding: 20px; margin-bottom: 24px;">
    <p style="font-size: 12px; font-weight: 600; color: #8b8da8; text-transform: uppercase; letter-spacing: 0.06em; margin: 0 0 8px;">${rfiLabel}</p>
    <h2 style="font-size: 17px; font-weight: 700; margin: 0 0 12px; color: #1c1d2e;">${opts.subject}</h2>
    <p style="font-size: 14px; color: #52546b; line-height: 1.6; margin: 0;">${opts.question.replace(/\n/g, '<br>')}</p>
  </div>

  <p style="font-size: 14px; color: #52546b; margin: 0 0 20px;">
    <strong>${opts.submitterName}</strong> has assigned this RFI to you. Please log in to review and respond.
  </p>

  <a href="${opts.appUrl}/projects" style="display: inline-block; background: #6366f1; color: white; font-weight: 600; font-size: 14px; padding: 10px 20px; border-radius: 8px; text-decoration: none;">
    View in Indigo →
  </a>

  <p style="font-size: 12px; color: #8b8da8; margin-top: 32px;">You received this email because an RFI was assigned to you on Indigo.</p>
</body>
</html>`,
  }
}

function buildAnsweredEmail(opts: {
  rfiNumber: number
  subject: string
  answer: string
  projectName: string
  assigneeName: string
  appUrl: string
}) {
  const rfiLabel = `RFI-${String(opts.rfiNumber).padStart(3, '0')}`
  return {
    subject: `${rfiLabel} answered: ${opts.subject} — Indigo`,
    html: `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1c1d2e; max-width: 560px; margin: 0 auto; padding: 32px 16px;">
  <div style="margin-bottom: 24px;">
    <div style="display: inline-block; background: #6366f1; color: white; font-weight: 700; font-size: 18px; width: 40px; height: 40px; line-height: 40px; text-align: center; border-radius: 10px; margin-bottom: 16px;">I</div>
    <h1 style="font-size: 20px; font-weight: 700; margin: 0 0 4px;">RFI Answered</h1>
    <p style="color: #6b7280; margin: 0; font-size: 14px;">${opts.projectName}</p>
  </div>

  <div style="background: #ecfdf5; border: 1px solid #d1fae5; border-radius: 10px; padding: 20px; margin-bottom: 24px;">
    <p style="font-size: 12px; font-weight: 600; color: #059669; text-transform: uppercase; letter-spacing: 0.06em; margin: 0 0 8px;">${rfiLabel} · Answered</p>
    <h2 style="font-size: 17px; font-weight: 700; margin: 0 0 12px; color: #1c1d2e;">${opts.subject}</h2>
    <p style="font-size: 14px; color: #065f46; line-height: 1.6; margin: 0;">${opts.answer.replace(/\n/g, '<br>')}</p>
  </div>

  <p style="font-size: 14px; color: #52546b; margin: 0 0 20px;">
    <strong>${opts.assigneeName}</strong> has submitted their answer. Log in to review and close the RFI.
  </p>

  <a href="${opts.appUrl}/projects" style="display: inline-block; background: #6366f1; color: white; font-weight: 600; font-size: 14px; padding: 10px 20px; border-radius: 8px; text-decoration: none;">
    View in Indigo →
  </a>

  <p style="font-size: 12px; color: #8b8da8; margin-top: 32px;">You received this email because an RFI you submitted has been answered on Indigo.</p>
</body>
</html>`,
  }
}

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (!RESEND_API_KEY) return false
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({ from: RESEND_FROM, to: [to], subject, html }),
  })
  return res.ok
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

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: Record<string, unknown>
  try { body = JSON.parse(event.body ?? '{}') }
  catch { return json(400, { error: 'Invalid JSON body' }) }

  const rfiId    = typeof body.rfiId    === 'string' ? body.rfiId.trim()    : ''
  const tenantId = typeof body.tenantId === 'string' ? body.tenantId.trim() : ''
  const rfiEvent = typeof body.event    === 'string' ? body.event.trim()    : ''

  if (!rfiId || !tenantId || !rfiEvent) {
    return json(400, { error: 'rfiId, tenantId, and event are required' })
  }
  if (!['submitted', 'answered'].includes(rfiEvent)) {
    return json(400, { error: 'event must be "submitted" or "answered"' })
  }

  if (!RESEND_API_KEY) {
    console.warn('[notify-rfi] RESEND_API_KEY not set — skipping email send')
    return json(200, { sent: 0, reason: 'RESEND_API_KEY not configured' })
  }

  // ── Fetch RFI data ────────────────────────────────────────────────────────
  const rfiRes = await fetch(
    `${SUPABASE_URL}/rest/v1/rfis?select=number,subject,question,answer,assigned_to,submitted_by,project_id&id=eq.${rfiId}&tenant_id=eq.${tenantId}&limit=1`,
    { headers: { ...svcHeaders(), Accept: 'application/json' } },
  )
  const rfis = await rfiRes.json() as Array<{
    number: number
    subject: string
    question: string
    answer: string | null
    assigned_to: string | null
    submitted_by: string | null
    project_id: string
  }>
  if (!rfis[0]) return json(400, { error: 'RFI not found' })
  const rfi = rfis[0]

  // ── Fetch project name ────────────────────────────────────────────────────
  const projRes = await fetch(
    `${SUPABASE_URL}/rest/v1/projects?select=job_id&id=eq.${rfi.project_id}&limit=1`,
    { headers: { ...svcHeaders(), Accept: 'application/json' } },
  )
  const projs = await projRes.json() as Array<{ job_id: string }>
  const jobId = projs[0]?.job_id

  let projectName = 'your project'
  if (jobId) {
    const jobRes = await fetch(
      `${SUPABASE_URL}/rest/v1/jobs?select=job_name&id=eq.${jobId}&limit=1`,
      { headers: { ...svcHeaders(), Accept: 'application/json' } },
    )
    const jobs = await jobRes.json() as Array<{ job_name: string }>
    projectName = jobs[0]?.job_name ?? projectName
  }

  // ── Helper: get email from user_profiles or customers ────────────────────
  async function getEmailForUid(uid: string): Promise<{ email: string | null; name: string }> {
    const profileRes = await fetch(
      `${SUPABASE_URL}/rest/v1/user_profiles?select=email,first_name,last_name&id=eq.${uid}&limit=1`,
      { headers: { ...svcHeaders(), Accept: 'application/json' } },
    )
    const profiles = await profileRes.json() as Array<{ email: string | null; first_name: string | null; last_name: string | null }>
    if (profiles[0]?.email) {
      const p = profiles[0]
      return {
        email: p.email,
        name:  [p.first_name, p.last_name].filter(Boolean).join(' ') || 'User',
      }
    }
    // Fall back to customers table (portal users)
    const custRes = await fetch(
      `${SUPABASE_URL}/rest/v1/customers?select=email,customer_name&portal_user_id=eq.${uid}&limit=1`,
      { headers: { ...svcHeaders(), Accept: 'application/json' } },
    )
    const custs = await custRes.json() as Array<{ email: string | null; customer_name: string | null }>
    return {
      email: custs[0]?.email ?? null,
      name:  custs[0]?.customer_name ?? 'Client',
    }
  }

  let sent = 0

  if (rfiEvent === 'submitted' && rfi.assigned_to) {
    // Notify the assignee (designer or client)
    const submitter = rfi.submitted_by ? await getEmailForUid(rfi.submitted_by) : { name: 'Your PM', email: null }
    const assignee  = await getEmailForUid(rfi.assigned_to)
    if (assignee.email) {
      const { subject, html } = buildSubmittedEmail({
        rfiNumber:     rfi.number,
        subject:       rfi.subject,
        question:      rfi.question,
        projectName,
        submitterName: submitter.name,
        appUrl:        APP_URL,
      })
      const ok = await sendEmail(assignee.email, subject, html)
      if (ok) sent++
    }
  }

  if (rfiEvent === 'answered' && rfi.submitted_by && rfi.answer) {
    // Notify the PM who submitted the RFI
    const submitter = await getEmailForUid(rfi.submitted_by)
    const assignee  = rfi.assigned_to ? await getEmailForUid(rfi.assigned_to) : { name: 'The assignee', email: null }
    if (submitter.email) {
      const { subject, html } = buildAnsweredEmail({
        rfiNumber:    rfi.number,
        subject:      rfi.subject,
        answer:       rfi.answer,
        projectName,
        assigneeName: assignee.name,
        appUrl:       APP_URL,
      })
      const ok = await sendEmail(submitter.email, subject, html)
      if (ok) sent++
    }
  }

  return json(200, { sent })
}
