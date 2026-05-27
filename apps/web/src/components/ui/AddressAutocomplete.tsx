import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react'

// ── Types ──────────────────────────────────────────────────────────────────

export interface AddressResult {
  line1: string
  city:  string
  state: string
  zip:   string
  lat:   number
  lng:   number
}

interface PhotonFeature {
  geometry: { coordinates: [number, number] }
  properties: {
    name?:        string
    housenumber?: string
    street?:      string
    city?:        string
    county?:      string
    state?:       string
    postcode?:    string
    country?:     string
    type?:        string
  }
}

interface Props {
  value:        string
  onChange:     (value: string) => void
  onSelect:     (result: AddressResult) => void
  placeholder?: string
  className?:   string
  disabled?:    boolean
}

// ── US state name → abbreviation ───────────────────────────────────────────

const STATE_ABBR: Record<string, string> = {
  Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA',
  Colorado: 'CO', Connecticut: 'CT', Delaware: 'DE', Florida: 'FL', Georgia: 'GA',
  Hawaii: 'HI', Idaho: 'ID', Illinois: 'IL', Indiana: 'IN', Iowa: 'IA',
  Kansas: 'KS', Kentucky: 'KY', Louisiana: 'LA', Maine: 'ME', Maryland: 'MD',
  Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN', Mississippi: 'MS',
  Missouri: 'MO', Montana: 'MT', Nebraska: 'NE', Nevada: 'NV',
  'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
  'North Carolina': 'NC', 'North Dakota': 'ND', Ohio: 'OH', Oklahoma: 'OK',
  Oregon: 'OR', Pennsylvania: 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
  'South Dakota': 'SD', Tennessee: 'TN', Texas: 'TX', Utah: 'UT', Vermont: 'VT',
  Virginia: 'VA', Washington: 'WA', 'West Virginia': 'WV', Wisconsin: 'WI',
  Wyoming: 'WY', 'District of Columbia': 'DC',
}

// ── Photon helpers ─────────────────────────────────────────────────────────

/** Human-readable label shown in the dropdown for a Photon result. */
function featureLabel(f: PhotonFeature): string {
  const p = f.properties
  const street =
    p.housenumber && p.street
      ? `${p.housenumber} ${p.street}`
      : (p.street ?? p.name ?? '')
  const parts = [street, p.city ?? p.county, p.state, p.postcode]
    .map((s) => s?.trim())
    .filter(Boolean)
  return parts.join(', ')
}

/** Converts a selected Photon feature into the structured AddressResult. */
function featureToResult(f: PhotonFeature): AddressResult {
  const p   = f.properties
  const [lng, lat] = f.geometry.coordinates

  const line1 =
    p.housenumber && p.street
      ? `${p.housenumber} ${p.street}`
      : (p.street ?? p.name ?? '')

  const stateRaw = p.state ?? ''
  const state    = STATE_ABBR[stateRaw] ?? stateRaw.slice(0, 2).toUpperCase()

  return {
    line1,
    city:  p.city ?? p.county ?? '',
    state,
    zip:   p.postcode ?? '',
    lat,
    lng,
  }
}

// ── Debounce ───────────────────────────────────────────────────────────────

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])
  return debounced
}

// ── Component ──────────────────────────────────────────────────────────────

/**
 * Address autocomplete input backed by Photon (photon.komoot.io).
 * Free, open-source, no API key required.
 *
 * Shows a custom dropdown as the user types. On selection, `onSelect` fires
 * with structured address components (line1, city, state, zip) and lat/lng.
 */
export function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder,
  className,
  disabled,
}: Props) {
  const [suggestions,  setSuggestions]  = useState<PhotonFeature[]>([])
  const [open,         setOpen]         = useState(false)
  const [loading,      setLoading]      = useState(false)
  const [activeIndex,  setActiveIndex]  = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const ignoreNextFetchRef = useRef(false)

  const debouncedQuery = useDebounce(value, 300)

  // Fetch suggestions whenever the debounced query changes
  useEffect(() => {
    if (ignoreNextFetchRef.current) {
      ignoreNextFetchRef.current = false
      return
    }

    const q = debouncedQuery.trim()
    if (q.length < 4) {
      setSuggestions([])
      setOpen(false)
      return
    }

    let cancelled = false
    setLoading(true)

    fetch(
      `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=6&lang=en`,
    )
      .then((r) => r.json())
      .then((data: { features?: PhotonFeature[] }) => {
        if (cancelled) return
        const features = (data.features ?? []).filter(
          (f) => f.properties.country === 'United States of America',
        )
        setSuggestions(features)
        setOpen(features.length > 0)
        setActiveIndex(-1)
      })
      .catch(() => { /* silently ignore network errors */ })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [debouncedQuery])

  // Close dropdown on outside click
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [])

  function handleSelect(feature: PhotonFeature) {
    const result = featureToResult(feature)
    // Suppress the next fetch that would fire because onChange updates the input value
    ignoreNextFetchRef.current = true
    onChange(result.line1)
    onSelect(result)
    setSuggestions([])
    setOpen(false)
    setActiveIndex(-1)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault()
      handleSelect(suggestions[activeIndex])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => { if (suggestions.length > 0) setOpen(true) }}
        placeholder={placeholder ?? 'Start typing to search address…'}
        disabled={disabled}
        className={className}
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-haspopup="listbox"
      />

      {/* Loading spinner */}
      {loading && (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
          <svg className="h-4 w-4 animate-spin text-gray-400" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
        </span>
      )}

      {/* Dropdown */}
      {open && suggestions.length > 0 && (
        <ul
          role="listbox"
          className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg"
        >
          {suggestions.map((f, i) => (
            <li
              key={i}
              role="option"
              aria-selected={i === activeIndex}
              onPointerDown={(e) => {
                e.preventDefault() // prevent input blur before click fires
                handleSelect(f)
              }}
              className={`cursor-pointer px-3 py-2.5 text-sm transition-colors ${
                i === activeIndex
                  ? 'bg-brand-50 text-brand-800'
                  : 'text-gray-800 hover:bg-gray-50'
              }`}
            >
              {featureLabel(f)}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
