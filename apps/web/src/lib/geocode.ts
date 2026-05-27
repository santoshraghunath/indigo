/**
 * Geocodes an address string using the Photon API (photon.komoot.io).
 * Free, open-source, no API key required. Based on OpenStreetMap data.
 *
 * Returns { lat, lng } on success, or null if geocoding fails / no result found.
 */
export async function geocodeAddress(
  address: string,
): Promise<{ lat: number; lng: number } | null> {
  if (!address.trim()) return null

  const url =
    `https://photon.komoot.io/api/` +
    `?q=${encodeURIComponent(address)}&limit=1&lang=en`

  type PhotonResponse = {
    features: Array<{
      geometry: { coordinates: [number, number] }
    }>
  }

  let data: PhotonResponse
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    data = (await res.json()) as PhotonResponse
  } catch {
    return null
  }

  const first = data.features?.[0]
  if (!first) return null

  const [lng, lat] = first.geometry.coordinates
  return { lat, lng }
}
