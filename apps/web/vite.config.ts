import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const HERE_BASE: Record<string, string> = {
  autocomplete: 'https://autocomplete.search.hereapi.com/v1/autocomplete',
  geocode:      'https://geocode.search.hereapi.com/v1/geocode',
}

export default defineConfig(({ mode }) => {
  // loadEnv with '' prefix loads ALL vars (not just VITE_) so we can read HERE_API_KEY
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [
      react(),

      // ── Dev proxy for Netlify function ────────────────────────────────────
      // Intercepts /.netlify/functions/address-search so `pnpm dev` works
      // without needing `netlify dev`. Mirrors functions/address-search.mts.
      {
        name: 'netlify-address-search-dev',
        configureServer(server) {
          server.middlewares.use(
            '/.netlify/functions/address-search',
            async (req, res) => {
              const apiKey = env.HERE_API_KEY
              if (!apiKey) {
                res.writeHead(503, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ error: 'HERE_API_KEY not set in .env.local' }))
                return
              }

              const url    = new URL(req.url ?? '/', 'http://localhost')
              const q      = url.searchParams.get('q')?.trim()
              const mode   = url.searchParams.get('mode') === 'geocode' ? 'geocode' : 'autocomplete'

              if (!q) {
                res.writeHead(400, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ error: 'q is required' }))
                return
              }

              const params = new URLSearchParams({
                q,
                in:    'countryCode:USA',
                limit: mode === 'geocode' ? '1' : '6',
                apiKey,
                ...(mode === 'autocomplete' ? { types: 'houseNumber' } : {}),
              })

              try {
                const r    = await fetch(`${HERE_BASE[mode]}?${params}`)
                const text = await r.text()
                res.writeHead(r.status, { 'Content-Type': 'application/json' })
                res.end(text)
              } catch (err) {
                res.writeHead(502, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ error: String(err) }))
              }
            },
          )
        },
      },

      // ── Dev proxy for portal-invite Netlify function ──────────────────────
      // Mirrors functions/portal-invite.ts for local dev without netlify dev.
      // Auth verification is skipped in dev — the real function checks it.
      {
        name: 'netlify-portal-invite-dev',
        configureServer(server) {
          server.middlewares.use(
            '/.netlify/functions/portal-invite',
            async (req, res) => {
              if (req.method !== 'POST') {
                res.writeHead(405)
                res.end('Method Not Allowed')
                return
              }

              const supabaseUrl  = env.SUPABASE_URL
              const serviceKey   = env.SUPABASE_SERVICE_ROLE_KEY
              const appUrl       = (env.VITE_APP_URL ?? 'http://localhost:5173').replace(/\/$/, '')

              if (!supabaseUrl || !serviceKey) {
                res.writeHead(503, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ error: 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set in .env.local' }))
                return
              }

              // Read POST body
              let raw = ''
              for await (const chunk of req) raw += chunk

              let body: Record<string, unknown>
              try { body = JSON.parse(raw) }
              catch { res.writeHead(400); res.end('Bad Request'); return }

              const customerId = typeof body.customerId === 'string' ? body.customerId.trim() : ''
              const tenantId   = typeof body.tenantId   === 'string' ? body.tenantId.trim()   : ''
              const email      = typeof body.email      === 'string' ? body.email.trim().toLowerCase() : ''
              const label      = typeof body.label      === 'string' ? body.label.trim() || null : null

              if (!customerId || !tenantId || !email) {
                res.writeHead(400, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ error: 'customerId, tenantId, and email are required' }))
                return
              }

              const headers = {
                'Content-Type':  'application/json',
                'Authorization': `Bearer ${serviceKey}`,
                'apikey':        serviceKey,
              }

              try {
                // 1. Upsert customer_portal_users row
                const upsertRes = await fetch(
                  `${supabaseUrl}/rest/v1/customer_portal_users?on_conflict=customer_id%2Cemail`,
                  {
                    method:  'POST',
                    headers: { ...headers, 'Prefer': 'return=representation,resolution=merge-duplicates' },
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
                  res.writeHead(500, { 'Content-Type': 'application/json' })
                  res.end(JSON.stringify({ error: err }))
                  return
                }

                const rows = await upsertRes.json() as { id: string }[]
                const id   = rows[0]?.id

                // 2. Send Supabase invite
                const inviteRes = await fetch(`${supabaseUrl}/auth/v1/invite`, {
                  method:  'POST',
                  headers: { ...headers },
                  body: JSON.stringify({
                    email,
                    data:        { customer_id: customerId, tenant_id: tenantId },
                    redirect_to: `${appUrl}/portal`,
                  }),
                })

                // 422 = user already exists — not an error for our purposes
                const alreadyExists = inviteRes.status === 422
                if (!inviteRes.ok && !alreadyExists) {
                  const err = await inviteRes.text()
                  res.writeHead(500, { 'Content-Type': 'application/json' })
                  res.end(JSON.stringify({ error: `Contact added but invite failed: ${err}` }))
                  return
                }

                res.writeHead(200, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ id, alreadyExists }))
              } catch (err) {
                res.writeHead(502, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ error: String(err) }))
              }
            },
          )
        },
      },

      // ── Dev proxy for employee-invite Netlify function ───────────────────
      // Mirrors functions/employee-invite.ts for local dev without netlify dev.
      // Auth verification is skipped in dev — the real function checks it.
      {
        name: 'netlify-employee-invite-dev',
        configureServer(server) {
          server.middlewares.use(
            '/.netlify/functions/employee-invite',
            async (req, res) => {
              if (req.method !== 'POST') {
                res.writeHead(405)
                res.end('Method Not Allowed')
                return
              }

              const supabaseUrl = env.SUPABASE_URL
              const serviceKey  = env.SUPABASE_SERVICE_ROLE_KEY
              const appUrl      = (env.VITE_APP_URL ?? 'http://localhost:5173').replace(/\/$/, '')

              if (!supabaseUrl || !serviceKey) {
                res.writeHead(503, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ error: 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set in .env.local' }))
                return
              }

              let raw = ''
              for await (const chunk of req) raw += chunk

              let body: Record<string, unknown>
              try { body = JSON.parse(raw) }
              catch { res.writeHead(400); res.end('Bad Request'); return }

              const tenantId  = typeof body.tenantId   === 'string' ? body.tenantId.trim()            : ''
              const email     = typeof body.email      === 'string' ? body.email.trim().toLowerCase()  : ''
              const firstName = typeof body.firstName  === 'string' ? body.firstName.trim()            : ''
              const lastName  = typeof body.lastName   === 'string' ? body.lastName.trim()             : ''
              const role      = typeof body.role       === 'string' ? body.role.trim()                 : ''
              const title     = typeof body.title      === 'string' ? body.title.trim() || null        : null
              const phone     = typeof body.phone      === 'string' ? body.phone.trim() || null        : null

              if (!tenantId || !email || !firstName || !lastName || !role) {
                res.writeHead(400, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ error: 'tenantId, email, firstName, lastName, and role are required' }))
                return
              }

              const headers = {
                'Content-Type':  'application/json',
                'Authorization': `Bearer ${serviceKey}`,
                'apikey':        serviceKey,
              }

              try {
                // 1. Send invite
                const inviteRes = await fetch(`${supabaseUrl}/auth/v1/invite`, {
                  method:  'POST',
                  headers: { ...headers },
                  body: JSON.stringify({
                    email,
                    data:        { tenant_id: tenantId, role, first_name: firstName, last_name: lastName },
                    redirect_to: `${appUrl}/`,
                  }),
                })

                const alreadyExists = inviteRes.status === 422
                if (!inviteRes.ok && !alreadyExists) {
                  const err = await inviteRes.text()
                  res.writeHead(500, { 'Content-Type': 'application/json' })
                  res.end(JSON.stringify({ error: `Invite email failed: ${err}` }))
                  return
                }

                let userId: string | null = null
                if (!alreadyExists) {
                  const ib = await inviteRes.json() as { id?: string }
                  userId = ib.id ?? null
                } else {
                  const lr = await fetch(
                    `${supabaseUrl}/auth/v1/admin/users?email=${encodeURIComponent(email)}&page=1&per_page=1`,
                    { headers },
                  )
                  if (lr.ok) {
                    const lb = await lr.json() as { users?: { id: string }[] }
                    userId = lb.users?.[0]?.id ?? null
                  }
                }

                if (!userId) {
                  res.writeHead(500, { 'Content-Type': 'application/json' })
                  res.end(JSON.stringify({ error: 'Could not determine invited user ID' }))
                  return
                }

                // 2. Upsert user_profiles
                await fetch(
                  `${supabaseUrl}/rest/v1/user_profiles?on_conflict=id`,
                  {
                    method:  'POST',
                    headers: { ...headers, Prefer: 'return=minimal,resolution=ignore-duplicates' },
                    body: JSON.stringify({ id: userId, first_name: firstName, last_name: lastName, email, phone, title }),
                  },
                )

                // 3. Check for existing tenant membership
                const existingRes = await fetch(
                  `${supabaseUrl}/rest/v1/tenant_members?select=id,is_active&user_id=eq.${userId}&tenant_id=eq.${tenantId}&limit=1`,
                  { headers: { ...headers, Accept: 'application/json' } },
                )
                const existing = await existingRes.json() as { id: string; is_active: boolean }[]

                if (existing[0]) {
                  if (!existing[0].is_active) {
                    await fetch(
                      `${supabaseUrl}/rest/v1/tenant_members?id=eq.${existing[0].id}`,
                      {
                        method:  'PATCH',
                        headers: { ...headers, Prefer: 'return=minimal' },
                        body: JSON.stringify({ is_active: true, role }),
                      },
                    )
                  }
                  res.writeHead(200, { 'Content-Type': 'application/json' })
                  res.end(JSON.stringify({ userId, alreadyExists: true }))
                  return
                }

                // 4. Create tenant_members row
                const tmRes = await fetch(
                  `${supabaseUrl}/rest/v1/tenant_members`,
                  {
                    method:  'POST',
                    headers: { ...headers, Prefer: 'return=minimal' },
                    body: JSON.stringify({ tenant_id: tenantId, user_id: userId, role, is_active: true, invited_at: new Date().toISOString() }),
                  },
                )

                if (!tmRes.ok) {
                  const err = await tmRes.text()
                  res.writeHead(500, { 'Content-Type': 'application/json' })
                  res.end(JSON.stringify({ error: `Failed to create tenant membership: ${err}` }))
                  return
                }

                res.writeHead(200, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ userId, alreadyExists }))
              } catch (err) {
                res.writeHead(502, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ error: String(err) }))
              }
            },
          )
        },
      },

      // ── Dev proxy for transcribe-audio Netlify function ─────────────────
      // Downloads audio from Supabase storage, calls OpenAI Whisper directly.
      // Auth is skipped in dev — the real function checks it.
      {
        name: 'netlify-transcribe-audio-dev',
        configureServer(server) {
          server.middlewares.use(
            '/.netlify/functions/transcribe-audio',
            async (req, res) => {
              if (req.method !== 'POST') {
                res.writeHead(405)
                res.end('Method Not Allowed')
                return
              }

              const supabaseUrl  = env.SUPABASE_URL
              const serviceKey   = env.SUPABASE_SERVICE_ROLE_KEY
              const openaiApiKey = env.OPENAI_API_KEY

              if (!supabaseUrl || !serviceKey || !openaiApiKey) {
                res.writeHead(503, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ error: 'SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or OPENAI_API_KEY not set in .env.local' }))
                return
              }

              let raw = ''
              for await (const chunk of req) raw += chunk

              let body: Record<string, unknown>
              try { body = JSON.parse(raw) }
              catch { res.writeHead(400); res.end('Bad Request'); return }

              const storagePath = typeof body.storagePath === 'string' ? body.storagePath : ''

              if (!storagePath) {
                res.writeHead(400, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ error: 'storagePath is required' }))
                return
              }

              try {
                // Fetch audio from Supabase storage
                const storageRes = await fetch(
                  `${supabaseUrl}/storage/v1/object/sales-audio/${storagePath}`,
                  { headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey } },
                )

                if (!storageRes.ok) {
                  res.writeHead(500, { 'Content-Type': 'application/json' })
                  res.end(JSON.stringify({ error: `Storage fetch failed: ${storageRes.status}` }))
                  return
                }

                const audioBuffer = Buffer.from(await storageRes.arrayBuffer())
                const mimeType    = storageRes.headers.get('content-type') ?? 'audio/webm'
                const filename    = storagePath.split('/').pop() ?? 'recording.webm'

                // Delete temp file (best-effort)
                fetch(`${supabaseUrl}/storage/v1/object/sales-audio/${storagePath}`, {
                  method: 'DELETE',
                  headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
                }).catch(() => {})

                // Transcribe
                const form = new FormData()
                form.append('file', new Blob([audioBuffer], { type: mimeType }), filename)
                form.append('model', 'whisper-1')
                form.append('language', 'en')

                const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
                  method:  'POST',
                  headers: { Authorization: `Bearer ${openaiApiKey}` },
                  body:    form,
                })

                if (!r.ok) {
                  const err = await r.text()
                  res.writeHead(500, { 'Content-Type': 'application/json' })
                  res.end(JSON.stringify({ error: `Transcription failed: ${err}` }))
                  return
                }

                const data = await r.json() as { text?: string }
                res.writeHead(200, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ transcript: data.text?.trim() ?? '' }))
              } catch (err) {
                res.writeHead(502, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ error: String(err) }))
              }
            },
          )
        },
      },

      // ── Dev proxy for draft-proposal Netlify function ────────────────────
      // Calls Anthropic directly so `pnpm dev` works without netlify dev.
      // Auth is skipped in dev — the real function checks it.
      {
        name: 'netlify-draft-proposal-dev',
        configureServer(server) {
          server.middlewares.use(
            '/.netlify/functions/draft-proposal',
            async (req, res) => {
              if (req.method !== 'POST') {
                res.writeHead(405)
                res.end('Method Not Allowed')
                return
              }

              const anthropicApiKey = env.ANTHROPIC_API_KEY
              if (!anthropicApiKey) {
                res.writeHead(503, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ error: 'ANTHROPIC_API_KEY not set in .env.local' }))
                return
              }

              let raw = ''
              for await (const chunk of req) raw += chunk

              let body: Record<string, unknown>
              try { body = JSON.parse(raw) }
              catch { res.writeHead(400); res.end('Bad Request'); return }

              const transcript = typeof body.transcript === 'string' ? body.transcript.trim() : ''
              const jobType    = typeof body.jobType    === 'string' ? body.jobType.trim()    : undefined
              const address    = typeof body.address    === 'string' ? body.address.trim()    : undefined

              if (!transcript) {
                res.writeHead(400, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ error: 'transcript is required' }))
                return
              }

              try {
                const parts: string[] = []
                if (jobType) parts.push(`Job type: ${jobType}`)
                if (address) parts.push(`Address: ${address}`)
                parts.push(`\nTranscript:\n${transcript}`)

                const r = await fetch('https://api.anthropic.com/v1/messages', {
                  method: 'POST',
                  headers: {
                    'Content-Type':      'application/json',
                    'x-api-key':         anthropicApiKey,
                    'anthropic-version': '2023-06-01',
                  },
                  body: JSON.stringify({
                    model:      'claude-sonnet-4-6',
                    max_tokens: 4096,
                    system: `You are a senior estimator and sales writer for Good Guy Builders, a Bay Area home renovation company.

Your job is to turn a transcript of a sales visit into a polished, editable proposal draft.

Output ONLY valid JSON — no markdown, no code fences, no explanation — in this exact shape:
{
  "title": string,
  "intro_text": string,
  "line_items": [
    {
      "item_name": string,
      "description": string,
      "unit_price_cents": integer,
      "quantity": number
    }
  ]
}

Pricing guidelines (Bay Area 2024-2025, all-in with 15% OH&P):
- Kitchen remodel (full gut): $80k–$150k
- Bathroom remodel (full): $25k–$55k
- Flooring per sq ft installed: $12–$22
- Interior paint per room: $1,200–$2,500
- Window replacement each: $1,500–$3,500
- ADU (detached): $200k–$400k
- Room addition per sq ft: $400–$650

Rules: Break into trade groups, use lump-sum pricing, include Permit & Fees and Project Management lines. Voice: warm and professional, active voice.`,
                    messages: [{ role: 'user', content: parts.join('\n') }],
                  }),
                })

                if (!r.ok) {
                  const err = await r.text()
                  res.writeHead(500, { 'Content-Type': 'application/json' })
                  res.end(JSON.stringify({ error: `AI draft failed: ${err}` }))
                  return
                }

                const aiBody = await r.json() as { content?: Array<{ type: string; text?: string }> }
                const rawText = aiBody.content?.find((c: { type: string }) => c.type === 'text')?.text ?? ''
                const cleaned = rawText.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim()
                const draft = JSON.parse(cleaned)

                res.writeHead(200, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify(draft))
              } catch (err) {
                res.writeHead(502, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ error: String(err) }))
              }
            },
          )
        },
      },

    ],    // end plugins

    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@indigo/db': path.resolve(__dirname, '../../packages/db/src/index.ts'),
        '@indigo/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
        '@indigo/ai': path.resolve(__dirname, '../../packages/ai/src/index.ts'),
      },
    },
    optimizeDeps: {
      exclude: ['@react-pdf/renderer'],
    },
    server: {
      port: 5173,
    },
  }
})
