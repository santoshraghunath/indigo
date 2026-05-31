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
    ],

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
    ],

    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@indigo/db': path.resolve(__dirname, '../../packages/db/src/index.ts'),
        '@indigo/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
        '@indigo/ai': path.resolve(__dirname, '../../packages/ai/src/index.ts'),
      },
    },
    server: {
      port: 5173,
    },
  }
})
