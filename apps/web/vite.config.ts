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
