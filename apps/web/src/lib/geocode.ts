/**
 * Geocodes an address string using the HERE Geocoding API.
 * Requires VITE_HERE_API_KEY to be set.
 *
 * Returns { lat, lng } on success, or null if geocoding fails.
 */
export async function geocodeAddress(
  address: string,
): Promise<{ lat: number; lng: number } | null> {
  const key = import.meta.env.VITE_HERE_API_KEY as string | undefined
  if (!key || !address.trim()) return null

  const url =
    `https://geocode.search.hereapi.com/v1/geocode` +
    `?q=${encodeURIComponent(address)}&in=countryCode:USA&apiKey=${key}`

  type HereResponse = {
    items: Array<{ position?: { lat: number; lng: number } }>
  }

  let data: HereResponse
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    data = (await res.json()) as HereResponse
  } catch {
    return null
  }

  const pos = data.items?.[0]?.position
  return pos ? { lat: pos.lat, lng: pos.lng } : null
}
