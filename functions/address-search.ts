/**
 * Netlify function: address-search
 *
 * Proxies HERE Geocoding & Search API calls server-side so:
 *  - The HERE API key never reaches the browser
 *  - Domain / CORS restrictions on the key don't apply (server → server)
 *
 * Query params:
 *   ?mode=autocomplete  (default) — autocomplete suggestions (no lat/lng)
 *   ?mode=geocode       — convert an address string to lat/lng
 *   &q=<search term>
 */

const HERE_BASE: Record<string, string> = {
  autocomplete: 'https://autocomplete.search.hereapi.com/v1/autocomplete',
  geocode:      'https://geocode.search.hereapi.com/v1/geocode',
}

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type':                 'application/json',
}

export const handler = async (event: {
  httpMethod: string
  queryStringParameters?: Record<string, string> | null
}) => {
  // Pre-flight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' }
  }

  const params = event.queryStringParameters ?? {}
  const q    = params.q?.trim()
  const mode = params.mode === 'geocode' ? 'geocode' : 'autocomplete'

  if (!q) {
    return {
      statusCode: 400,
      headers:    CORS,
      body:       JSON.stringify({ error: 'q is required' }),
    }
  }

  const apiKey = process.env.HERE_API_KEY
  if (!apiKey) {
    return {
      statusCode: 503,
      headers:    CORS,
      body:       JSON.stringify({ error: 'HERE_API_KEY not configured on server' }),
    }
  }

  const hereParams = new URLSearchParams({
    q,
    in:     'countryCode:USA',
    limit:  mode === 'geocode' ? '1' : '6',
    apiKey,
    // types=houseNumber matches the working GGB Sales Tool implementation
    ...(mode === 'autocomplete' ? { types: 'houseNumber' } : {}),
  })

  try {
    const res  = await fetch(`${HERE_BASE[mode]}?${hereParams}`)
    const text = await res.text()
    return {
      statusCode: res.status,
      headers:    CORS,
      body:       text,
    }
  } catch (err) {
    return {
      statusCode: 502,
      headers:    CORS,
      body:       JSON.stringify({ error: String(err) }),
    }
  }
}
