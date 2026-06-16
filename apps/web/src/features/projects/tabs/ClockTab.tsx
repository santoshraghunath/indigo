import { useEffect, useRef, useState } from 'react'
import { useOutletContext, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  ProjectRow,
  WorkSession,
} from '@indigo/shared'
import {
  clockIn,
  clockOut,
  startBreak,
  endBreak,
  getActiveSession,
  getActiveSessions,
  getWorkSessions,
  getProjectLaborCost,
  setProjectLocation,
  getGeofenceViolations,
  upsertEmployeeWage,
  getEmployeeWages,
  setTenantGeofenceDefault,
  logSessionMileage,
  upsertWorkerDailyReport,
  uploadDailyLogPhoto,
  pmEditWorkSession,
  getProjects,
} from '@indigo/shared'
import type { EditSessionInput } from '@indigo/shared'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/stores/toastStore'
import { Skeleton } from '@/components/ui/Skeleton'
import {
  MapPinIcon,
  UsersIcon,
  ExclamationTriangleIcon,
  ExclamationCircleIcon,
  CurrencyDollarIcon,
} from '@/components/ui/Icons'
import { useGeolocation, haversineMeters } from '@/hooks/useGeolocation'
import { geocodeAddress } from '@/lib/geocode'

interface OutletCtx {
  project: ProjectRow | undefined
  isLoading: boolean
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatElapsed(startIso: string): string {
  const diffMs = Date.now() - new Date(startIso).getTime()
  const totalSec = Math.floor(diffMs / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  return h > 0
    ? `${h}h ${m.toString().padStart(2, '0')}m`
    : `${m}m ${s.toString().padStart(2, '0')}s`
}

function formatHours(h: number | null | undefined): string {
  if (h == null) return '—'
  return h.toFixed(2) + ' h'
}

function formatCents(cents: number | null | undefined): string {
  if (cents == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function toDatetimeLocal(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fromDatetimeLocal(val: string): string {
  return new Date(val).toISOString()
}

function isPmOrAbove(role: string | undefined): boolean {
  return ['owner', 'admin', 'project_manager'].includes(role ?? '')
}


// ── Elapsed timer component ────────────────────────────────────────────────

function ElapsedTimer({ startIso }: { startIso: string }) {
  const [display, setDisplay] = useState(() => formatElapsed(startIso))

  useEffect(() => {
    const id = setInterval(() => setDisplay(formatElapsed(startIso)), 1_000)
    return () => clearInterval(id)
  }, [startIso])

  return (
    <span className="text-5xl font-mono font-semibold tracking-tight text-gray-900 tabular-nums">
      {display}
    </span>
  )
}

// ── GPS Status chip ────────────────────────────────────────────────────────

function GpsChip({
  accuracy,
  error,
  isLoading,
}: {
  accuracy: number | null
  error: string | null
  isLoading: boolean
}) {
  if (isLoading) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
        Getting GPS…
      </span>
    )
  }
  if (error) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 ring-1 ring-red-200">
        <ExclamationCircleIcon className="h-3.5 w-3.5" />
        No GPS
      </span>
    )
  }
  const label = accuracy == null ? '?' : accuracy < 20 ? 'Excellent' : accuracy < 50 ? 'Good' : accuracy < 100 ? 'Fair' : 'Poor'
  const color = accuracy == null || accuracy >= 100
    ? 'bg-amber-50 text-amber-700 ring-amber-200'
    : accuracy < 50
      ? 'bg-green-50 text-green-700 ring-green-200'
      : 'bg-amber-50 text-amber-700 ring-amber-200'

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${color}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      GPS {label} {accuracy != null && `(±${Math.round(accuracy)} m)`}
    </span>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export function ClockTab() {
  const { id: projectId } = useParams<{ id: string }>()
  const { project, isLoading: projectLoading } = useOutletContext<OutletCtx>()
  const { user, profile, activeTenantId, tenantMemberships } = useAuth()
  const toast = useToast()
  const qc = useQueryClient()

  const tenantId = activeTenantId ?? project?.tenant_id ?? ''
  const userId = user?.id ?? ''
  const role = tenantMemberships.find((m) => m.tenant_id === tenantId)?.role

  // GPS
  const geo = useGeolocation()

  // Project site data (lat/lng/radius added in migration 017)
  const { data: siteData } = useQuery({
    queryKey: ['project-site', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('site_lat, site_lng, geofence_radius_meters')
        .eq('id', projectId!)
        .single()
      if (error) throw error
      return data as { site_lat: number | null; site_lng: number | null; geofence_radius_meters: number | null }
    },
    enabled: !!projectId,
    staleTime: 60_000,
  })

  // Tenant default geofence
  const { data: tenantData } = useQuery({
    queryKey: ['tenant-geofence', tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenants')
        .select('default_geofence_radius_meters')
        .eq('id', tenantId)
        .single()
      if (error) throw error
      return data as { default_geofence_radius_meters: number }
    },
    enabled: !!tenantId,
    staleTime: 300_000,
  })

  // Active session for current user
  const { data: mySession, isLoading: sessionLoading } = useQuery({
    queryKey: ['active-session', projectId, userId],
    queryFn: () => getActiveSession(supabase, projectId!, userId),
    enabled: !!projectId && !!userId,
    refetchInterval: 30_000,
  })

  // Who's on site
  const { data: activeSessions = [] } = useQuery({
    queryKey: ['active-sessions', projectId],
    queryFn: () => getActiveSessions(supabase, projectId!),
    enabled: !!projectId,
    refetchInterval: 60_000,
  })

  // Recent completed sessions (last 7 days)
  const { data: recentSessions = [] } = useQuery({
    queryKey: ['work-sessions', projectId],
    queryFn: () => {
      const from = new Date(Date.now() - 7 * 86_400_000).toISOString()
      return getWorkSessions(supabase, projectId!, { fromDate: from })
    },
    enabled: !!projectId,
    staleTime: 60_000,
  })

  // Labor cost summary (PM+)
  const { data: laborSummary } = useQuery({
    queryKey: ['project-labor', projectId],
    queryFn: () => getProjectLaborCost(supabase, projectId!),
    enabled: !!projectId && isPmOrAbove(role),
    staleTime: 60_000,
  })

  // Geofence violations (PM+)
  const { data: violations = [] } = useQuery({
    queryKey: ['geofence-violations', projectId],
    queryFn: () => getGeofenceViolations(supabase, projectId!),
    enabled: !!projectId && isPmOrAbove(role),
    staleTime: 60_000,
  })

  // My wages
  const { data: myWages = [] } = useQuery({
    queryKey: ['employee-wages', tenantId, userId],
    queryFn: () => getEmployeeWages(supabase, tenantId, userId),
    enabled: !!tenantId && !!userId,
    staleTime: 300_000,
  })

  // Job address (PM+ only) — used for "Use project address" geofence pinning
  const { data: jobAddress } = useQuery({
    queryKey: ['job-address', project?.job_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('jobs')
        .select('address_line1, city, state, zip')
        .eq('id', project!.job_id)
        .single()
      if (error) throw error
      return data as { address_line1: string | null; city: string | null; state: string | null; zip: string | null }
    },
    enabled: !!project?.job_id && isPmOrAbove(role),
    staleTime: 300_000,
  })

  // Geocoding state for "Use project address"
  const [geocoding,   setGeocoding]   = useState(false)
  const [geocodeErr,  setGeocodeErr]  = useState<string | null>(null)
  const geocodingRef = useRef(false)

  // ── Derived ──────────────────────────────────────────────────────────────

  const siteLat = siteData?.site_lat ?? null
  const siteLng = siteData?.site_lng ?? null
  const effectiveRadius =
    siteData?.geofence_radius_meters ??
    tenantData?.default_geofence_radius_meters ??
    300

  const distanceFromSite =
    geo.lat != null && geo.lng != null && siteLat != null && siteLng != null
      ? Math.round(haversineMeters(geo.lat, geo.lng, siteLat, siteLng))
      : null

  const isWithinFence =
    distanceFromSite != null
      ? distanceFromSite <= effectiveRadius
      : null // unknown (no GPS or no pin)

  const gpsLowAccuracy =
    geo.accuracyM != null && geo.accuracyM > effectiveRadius / 2

  // Can't clock in: outside fence with precise GPS
  const geofenceBlocked =
    isWithinFence === false && !gpsLowAccuracy && siteLat != null

  const isOnBreak = mySession?.status === 'on_break'
  const isActive = mySession?.status === 'active'
  const isClockedIn = isActive || isOnBreak

  // ── Off-site override state ────────────────────────────────────────────────

  const OFFSITE_REASONS = [
    'Picking up materials',
    'En route to job site',
    'Pre-job preparation',
    'Other',
  ] as const

  const [showOffsitePanel, setShowOffsitePanel] = useState(false)
  const [offsiteReason,    setOffsiteReason]    = useState<string>('')
  const [offsiteOther,     setOffsiteOther]      = useState('')
  const [pmApproved,       setPmApproved]        = useState(false)

  const resolvedReason = offsiteReason === 'Other' ? offsiteOther.trim() : offsiteReason
  const offsiteReady   = !!resolvedReason && pmApproved

  function resetOffsitePanel() {
    setShowOffsitePanel(false)
    setOffsiteReason('')
    setOffsiteOther('')
    setPmApproved(false)
  }

  // ── Mutations ──────────────────────────────────────────────────────────────

  const clockInMut = useMutation({
    mutationFn: (opts?: { offsiteReason?: string; pmPurchaseApproved?: boolean }) => {
      if (!geo.lat || !geo.lng) throw new Error('No GPS fix')
      return clockIn(supabase, projectId!, geo.lat, geo.lng, geo.accuracyM ?? 999,
        opts?.offsiteReason, opts?.pmPurchaseApproved)
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['active-session', projectId, userId] })
      qc.invalidateQueries({ queryKey: ['active-sessions', projectId] })
      qc.invalidateQueries({ queryKey: ['geofence-violations', projectId] })
      resetOffsitePanel()
      if (!result.geofence_ok) {
        toast.warning('Clocked in off-site — your location has been logged.')
      } else {
        toast.success('Clocked in successfully.')
      }
    },
    onError: (err: Error) => {
      const msg = err.message.includes('outside_geofence')
        ? 'You are outside the geofenced work area.'
        : err.message.includes('already_clocked_in')
          ? 'You already have an active session.'
          : 'Clock-in failed. Please try again.'
      toast.error(msg)
    },
  })

  const clockOutMut = useMutation({
    mutationFn: async ({ miles }: { miles: number | null }) => {
      if (!mySession) throw new Error('No active session')
      const sessionId = mySession.id

      // Submit internal daily report first (field workers only)
      if (isFieldWorker && workReportText.trim()) {
        const logType = role === 'subcontractor' ? 'subcontractor' : 'field_associate'
        const today   = new Date().toISOString().slice(0, 10)
        const { id: logId } = await upsertWorkerDailyReport(
          supabase, tenantId, projectId!, userId, logType, today, workReportText.trim(),
        )
        // Upload photos — best-effort (don't block clock-out on photo failure)
        for (const photo of workReportPhotos) {
          await uploadDailyLogPhoto(supabase, tenantId, projectId!, logId, userId, photo)
            .catch(() => null)
        }
      }

      const result = await clockOut(
        supabase,
        sessionId,
        geo.lat ?? 0,
        geo.lng ?? 0,
        geo.accuracyM ?? 999,
      )
      if (miles != null && miles > 0) {
        await logSessionMileage(supabase, sessionId, miles)
      }
      return result
    },
    onSuccess: (result) => {
      setShowWorkReportStep(false)
      setShowMileageStep(false)
      setWorkReportText('')
      workReportPreviews.forEach((url) => URL.revokeObjectURL(url))
      setWorkReportPhotos([])
      setWorkReportPreviews([])
      setMileageInput('')
      qc.invalidateQueries({ queryKey: ['active-session', projectId, userId] })
      qc.invalidateQueries({ queryKey: ['active-sessions', projectId] })
      qc.invalidateQueries({ queryKey: ['work-sessions', projectId] })
      qc.invalidateQueries({ queryKey: ['project-labor', projectId] })
      qc.invalidateQueries({ queryKey: ['project-field', projectId] })
      const hrs = result.net_hours?.toFixed(2) ?? '0'
      toast.success(`Clocked out — ${hrs} h logged.`)
    },
    onError: () => toast.error('Clock-out failed. Please try again.'),
  })

  const startBreakMut = useMutation({
    mutationFn: () => {
      if (!mySession) throw new Error('No active session')
      return startBreak(supabase, mySession.id)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['active-session', projectId, userId] })
      toast.success('Break started.')
    },
    onError: () => toast.error('Failed to start break.'),
  })

  const endBreakMut = useMutation({
    mutationFn: () => {
      if (!mySession) throw new Error('No active session')
      return endBreak(supabase, mySession.id)
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['active-session', projectId, userId] })
      toast.success(`Break ended — ${result.duration_minutes} min.`)
    },
    onError: () => toast.error('Failed to end break.'),
  })

  // ── PM: Set location ──────────────────────────────────────────────────────

  const setLocationMut = useMutation({
    mutationFn: ({ lat, lng, radius }: { lat: number; lng: number; radius: number | null }) =>
      setProjectLocation(supabase, projectId!, lat, lng, radius),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project-site', projectId] })
      toast.success('Site location saved.')
    },
    onError: () => toast.error('Failed to save location.'),
  })

  // Handler: geocode the project's stored address and pin it as the geofence
  async function handleUseProjectAddress() {
    const parts = [
      jobAddress?.address_line1,
      jobAddress?.city,
      jobAddress?.state,
      jobAddress?.zip,
    ].filter(Boolean)

    if (parts.length === 0) {
      toast.error('No address on file', 'Add an address to the project first.')
      return
    }

    if (geocodingRef.current) return
    geocodingRef.current = true
    setGeocoding(true)
    setGeocodeErr(null)

    try {
      const coords = await geocodeAddress(parts.join(', '))
      if (!coords) {
        setGeocodeErr('Address not found — try entering a more specific address, or use GPS.')
        return
      }
      setLocationMut.mutate({
        lat:    coords.lat,
        lng:    coords.lng,
        radius: siteData?.geofence_radius_meters ?? null,
      })
    } catch (err) {
      setGeocodeErr(err instanceof Error ? err.message : 'Geocoding failed. Try again.')
    } finally {
      geocodingRef.current = false
      setGeocoding(false)
    }
  }

  // ── PM: Radius override ───────────────────────────────────────────────────
  const [radiusInput, setRadiusInput] = useState<string>('')
  const [showRadiusEdit, setShowRadiusEdit] = useState(false)
  const setRadiusMut = useMutation({
    mutationFn: async () => {
      const r = parseInt(radiusInput, 10)
      if (isNaN(r) || r < 50) throw new Error('Minimum radius is 50 m')
      // Null means "use site pin with current radius" — just update the column
      const { error } = await supabase
        .from('projects')
        .update({ geofence_radius_meters: r } as unknown as never)
        .eq('id', projectId!)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project-site', projectId] })
      setShowRadiusEdit(false)
      toast.success('Geofence radius updated.')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  // ── PM: Tenant default radius ─────────────────────────────────────────────
  const [tenantRadiusInput, setTenantRadiusInput] = useState<string>('')
  const [showTenantEdit, setShowTenantEdit] = useState(false)
  const setTenantRadiusMut = useMutation({
    mutationFn: async () => {
      const r = parseInt(tenantRadiusInput, 10)
      if (isNaN(r) || r < 50) throw new Error('Minimum radius is 50 m')
      return setTenantGeofenceDefault(supabase, tenantId, r)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenant-geofence', tenantId] })
      setShowTenantEdit(false)
      toast.success('Default radius updated.')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  // ── PM: Wage entry ────────────────────────────────────────────────────────
  const [wageRate, setWageRate] = useState<string>('')
  const [wageDate, setWageDate] = useState<string>(new Date().toISOString().slice(0, 10))
  const upsertWageMut = useMutation({
    mutationFn: async () => {
      const rateVal = parseFloat(wageRate)
      if (isNaN(rateVal) || rateVal <= 0) throw new Error('Enter a valid hourly rate')
      const cents = Math.round(rateVal * 100)
      return upsertEmployeeWage(supabase, tenantId, userId, wageDate, cents, userId)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employee-wages', tenantId, userId] })
      setWageRate('')
      toast.success('Wage saved.')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  // ── Work report step (field workers only, shown before mileage) ──────────
  // Roles that must submit a daily report at clock-out
  const isFieldWorker = ['field_associate', 'field_super', 'subcontractor'].includes(role ?? '')
  const [showWorkReportStep, setShowWorkReportStep]       = useState(false)
  const [workReportText,     setWorkReportText]           = useState('')
  const [workReportPhotos,   setWorkReportPhotos]         = useState<File[]>([])
  const [workReportPreviews, setWorkReportPreviews]       = useState<string[]>([])
  const workReportFileRef = useRef<HTMLInputElement>(null)

  function addWorkReportFiles(files: FileList | null) {
    if (!files) return
    const valid = Array.from(files).filter(
      (f) => f.type.startsWith('image/') && f.size <= 20 * 1024 * 1024,
    )
    if (!valid.length) return
    setWorkReportPhotos((p) => [...p, ...valid])
    setWorkReportPreviews((p) => [...p, ...valid.map((f) => URL.createObjectURL(f))])
    if (workReportFileRef.current) workReportFileRef.current.value = ''
  }

  function removeWorkReportPhoto(idx: number) {
    URL.revokeObjectURL(workReportPreviews[idx])
    setWorkReportPhotos((p) => p.filter((_, i) => i !== idx))
    setWorkReportPreviews((p) => p.filter((_, i) => i !== idx))
  }

  // ── Mileage step (shown between "Clock Out" click and actual clock-out) ──
  const [showMileageStep, setShowMileageStep] = useState(false)
  const [mileageInput,    setMileageInput]    = useState('')

  // ── Loading state ─────────────────────────────────────────────────────────

  if (projectLoading || sessionLoading) {
    return (
      <div className="px-5 py-6 lg:px-8 space-y-4">
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-28 w-full rounded-2xl" />
      </div>
    )
  }

  const isEmployee = role !== 'client'

  return (
    <div className="px-5 py-6 lg:px-8 space-y-6 max-w-2xl">

      {/* ── GPS + distance row ─────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <GpsChip accuracy={geo.accuracyM} error={geo.error} isLoading={geo.isLoading} />

        {distanceFromSite != null && siteLat != null && (
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${
            isWithinFence
              ? 'bg-green-50 text-green-700 ring-green-200'
              : 'bg-red-50 text-red-700 ring-red-200'
          }`}>
            <MapPinIcon className="h-3.5 w-3.5" />
            {distanceFromSite} m from site · {effectiveRadius} m fence
            {isWithinFence ? ' ✓' : ' ✗'}
          </span>
        )}

        {siteLat == null && (
          <span className="text-xs text-gray-400">
            No site pin set — geofencing disabled
          </span>
        )}

        {geo.error && (
          <button
            onClick={geo.retry}
            className="text-xs text-brand-600 underline hover:text-brand-700"
          >
            Retry GPS
          </button>
        )}
      </div>

      {/* ── Geofence warning + off-site override panel ─────────────── */}
      {geofenceBlocked && (
        <div className="space-y-3">
          {/* Red warning banner */}
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-start gap-3">
            <ExclamationTriangleIcon className="h-5 w-5 shrink-0 text-red-500 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-red-800">Outside work area</p>
              <p className="text-xs text-red-600 mt-0.5">
                You are {distanceFromSite} m from the site (fence: {effectiveRadius} m).
                Move closer, or use the off-site override below if authorized.
              </p>
            </div>
          </div>

          {/* Off-site override panel */}
          {!showOffsitePanel ? (
            <button
              type="button"
              onClick={() => setShowOffsitePanel(true)}
              className="w-full rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800 hover:bg-amber-100 transition-colors text-left flex items-center justify-between"
            >
              <span>Clock in off-site (PM authorized)</span>
              <span className="text-amber-500 text-xs">▸</span>
            </button>
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 space-y-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">
                Off-site clock-in
              </p>

              {/* Reason picker */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-amber-800">
                  Reason <span className="text-red-500">*</span>
                </label>
                <div className="space-y-1.5">
                  {OFFSITE_REASONS.map((r) => (
                    <label key={r} className="flex cursor-pointer items-center gap-2 text-sm text-amber-900">
                      <input
                        type="radio"
                        name="offsite-reason"
                        value={r}
                        checked={offsiteReason === r}
                        onChange={() => { setOffsiteReason(r); setOffsiteOther('') }}
                        className="h-4 w-4 text-amber-600 focus:ring-amber-500"
                      />
                      {r}
                    </label>
                  ))}
                </div>
                {offsiteReason === 'Other' && (
                  <input
                    type="text"
                    value={offsiteOther}
                    onChange={(e) => setOffsiteOther(e.target.value)}
                    placeholder="Describe the reason…"
                    autoFocus
                    className="mt-2 w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-200"
                  />
                )}
              </div>

              {/* PM authorization attestation */}
              <label className="flex cursor-pointer items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={pmApproved}
                  onChange={(e) => setPmApproved(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-amber-400 text-amber-600 focus:ring-amber-500"
                />
                <span className="text-sm text-amber-900 leading-snug">
                  I confirm this off-site activity has been specifically authorized
                  by my Project Manager.
                </span>
              </label>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={resetOffsitePanel}
                  disabled={clockInMut.isPending}
                  className="h-8 rounded-lg px-3.5 text-sm font-medium text-amber-700 hover:bg-amber-100 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!offsiteReady || clockInMut.isPending}
                  onClick={() => clockInMut.mutate({ offsiteReason: resolvedReason, pmPurchaseApproved: pmApproved })}
                  className="inline-flex h-8 items-center rounded-lg bg-amber-600 px-4 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {clockInMut.isPending ? 'Clocking in…' : 'Clock In Off-Site'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Main clock card ────────────────────────────────────────── */}
      {isEmployee && (
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="px-6 py-5">

            {!isClockedIn ? (
              /* ── Not clocked in ──────────────────────────────────── */
              <div className="flex flex-col items-center gap-6 py-4">
                <div className="text-center">
                  <p className="text-base font-semibold text-gray-900">
                    {profile?.first_name
                      ? `Ready to clock in, ${profile.first_name}?`
                      : 'Ready to clock in?'}
                  </p>
                  {siteLat != null && distanceFromSite != null && (
                    <p className="mt-1 text-sm text-gray-500">
                      You are {distanceFromSite} m from the site.
                    </p>
                  )}
                  {myWages.length > 0 && (
                    <p className="mt-1 text-xs text-gray-400">
                      Current rate: {formatCents(myWages[0].hourly_rate_cents)}/h
                    </p>
                  )}
                </div>

                <button
                  onClick={() => clockInMut.mutate({})}
                  disabled={
                    clockInMut.isPending ||
                    geo.isLoading ||
                    !!geo.error ||
                    geofenceBlocked
                  }
                  className="inline-flex items-center gap-2 rounded-2xl bg-brand-600 px-10 py-4 text-lg font-semibold text-white shadow-md hover:bg-brand-700 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {clockInMut.isPending ? 'Clocking in…' : 'Clock In'}
                </button>

                {gpsLowAccuracy && !geofenceBlocked && siteLat != null && (
                  <p className="text-xs text-amber-600 text-center max-w-xs">
                    GPS accuracy is low (±{Math.round(geo.accuracyM ?? 0)} m). Clock-in allowed
                    but your location will be flagged.
                  </p>
                )}
              </div>

            ) : (
              /* ── Clocked in ──────────────────────────────────────── */
              <div className="space-y-5">
                {/* Timer */}
                <div className="flex flex-col items-center gap-1 py-2">
                  <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
                    Time on site
                  </p>
                  <ElapsedTimer startIso={mySession!.clocked_in_at} />
                  <p className="text-xs text-gray-400 mt-1">
                    Clocked in at {fmtTime(mySession!.clocked_in_at)}
                    {mySession!.total_break_minutes > 0 &&
                      ` · ${mySession!.total_break_minutes} min break`}
                  </p>
                </div>

                {/* Break status */}
                {isOnBreak && (
                  <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 flex items-center gap-3">
                    <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                    <span className="text-sm font-medium text-amber-800">On break</span>
                  </div>
                )}

                {/* ── Work report step (field workers only) ─────────── */}
                {showWorkReportStep && !showMileageStep ? (
                  <div className="rounded-xl border border-brand-200 bg-brand-50/40 px-4 py-4 space-y-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">Daily Work Report</p>
                      <p className="text-xs text-gray-500 mt-0.5">Required before clocking out. Not shared with the client.</p>
                    </div>

                    {/* Work summary */}
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-700">
                        What did you work on today? <span className="text-red-500">*</span>
                      </label>
                      <textarea
                        value={workReportText}
                        onChange={(e) => setWorkReportText(e.target.value)}
                        placeholder="Describe the work you performed…"
                        rows={3}
                        autoFocus
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-200 resize-none"
                      />
                    </div>

                    {/* Photo picker */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-medium text-gray-700">
                          Site photos <span className="text-red-500">*</span>
                          <span className="ml-1 font-normal text-gray-400">(at least 1)</span>
                        </label>
                        <button
                          type="button"
                          onClick={() => workReportFileRef.current?.click()}
                          className="text-xs font-medium text-brand-600 hover:text-brand-700"
                        >
                          + Add photos
                        </button>
                      </div>
                      <input
                        ref={workReportFileRef}
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(e) => addWorkReportFiles(e.target.files)}
                      />
                      {workReportPreviews.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {workReportPreviews.map((url, i) => (
                            <div key={i} className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-gray-200">
                              <img src={url} alt="" className="h-full w-full object-cover"/>
                              <button
                                type="button"
                                onClick={() => removeWorkReportPhoto(i)}
                                className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
                              >
                                <span className="text-[10px] leading-none">✕</span>
                              </button>
                            </div>
                          ))}
                          <button
                            type="button"
                            onClick={() => workReportFileRef.current?.click()}
                            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border-2 border-dashed border-gray-300 text-gray-400 hover:border-brand-300 hover:text-brand-500"
                          >
                            <span className="text-xl leading-none">+</span>
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => workReportFileRef.current?.click()}
                          className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 py-4 text-sm text-gray-400 hover:border-brand-300 hover:text-brand-500"
                        >
                          Tap to add site photos
                        </button>
                      )}
                    </div>

                    <button
                      onClick={() => setShowMileageStep(true)}
                      disabled={!workReportText.trim() || workReportPhotos.length === 0}
                      className="w-full rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Continue
                    </button>
                  </div>

                ) : showMileageStep ? (
                  /* ── Mileage step ──────────────────────────────────── */
                  <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-4 space-y-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900">Miles driven today?</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Enter round-trip mileage for reimbursement tracking. Leave blank to skip.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={mileageInput}
                        onChange={(e) => setMileageInput(e.target.value)}
                        placeholder="0.0"
                        min="0"
                        step="0.1"
                        autoFocus
                        className="w-28 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-200"
                      />
                      <span className="text-sm text-gray-500">miles</span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => clockOutMut.mutate({ miles: null })}
                        disabled={clockOutMut.isPending}
                        className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 active:scale-[0.98] transition-all disabled:opacity-50"
                      >
                        Skip
                      </button>
                      <button
                        onClick={() => {
                          const miles = parseFloat(mileageInput)
                          clockOutMut.mutate({ miles: !isNaN(miles) && miles > 0 ? miles : null })
                        }}
                        disabled={clockOutMut.isPending}
                        className="flex-1 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 active:scale-[0.98] transition-all disabled:opacity-50"
                      >
                        {clockOutMut.isPending ? 'Clocking out…' : 'Clock Out'}
                      </button>
                    </div>
                  </div>

                ) : (
                  /* ── Normal action buttons ─────────────────────────── */
                  <div className="flex gap-3">
                    {/* Break toggle */}
                    {isOnBreak ? (
                      <button
                        onClick={() => endBreakMut.mutate()}
                        disabled={endBreakMut.isPending}
                        className="flex-1 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800 hover:bg-amber-100 active:scale-[0.98] transition-all disabled:opacity-50"
                      >
                        {endBreakMut.isPending ? 'Ending…' : 'End Break'}
                      </button>
                    ) : (
                      <button
                        onClick={() => startBreakMut.mutate()}
                        disabled={startBreakMut.isPending}
                        className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-100 active:scale-[0.98] transition-all disabled:opacity-50"
                      >
                        {startBreakMut.isPending ? 'Starting…' : 'Start Break'}
                      </button>
                    )}

                    {/* Clock out — opens work report step (field workers) or mileage step (PM+) */}
                    <button
                      onClick={() => isFieldWorker ? setShowWorkReportStep(true) : setShowMileageStep(true)}
                      className="flex-1 rounded-xl bg-red-600 px-4 py-3 text-sm font-semibold text-white hover:bg-red-700 active:scale-[0.98] transition-all"
                    >
                      Clock Out
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Who's on site ──────────────────────────────────────────── */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-gray-700 flex items-center gap-2">
          <UsersIcon className="h-4 w-4 text-gray-400" />
          On Site Now
          {activeSessions.length > 0 && (
            <span className="ml-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-green-100 px-1.5 text-xs font-semibold text-green-700">
              {activeSessions.length}
            </span>
          )}
        </h2>

        {activeSessions.length === 0 ? (
          <p className="text-sm text-gray-400 italic">Nobody clocked in right now.</p>
        ) : (
          <div className="space-y-2">
            {activeSessions.map((s) => (
              <OnSiteRow key={s.id} session={s} />
            ))}
          </div>
        )}
      </section>

      {/* ── Recent sessions (my own) ───────────────────────────────── */}
      {recentSessions.filter((s) => s.user_id === userId).length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-gray-700">My Recent Sessions</h2>
          <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 overflow-hidden">
            {recentSessions
              .filter((s) => s.user_id === userId)
              .slice(0, 7)
              .map((s) => (
                <SessionHistoryRow key={s.id} session={s} showCost={isPmOrAbove(role)} />
              ))}
          </div>
        </section>
      )}

      {/* ── PM Controls ────────────────────────────────────────────── */}
      {isPmOrAbove(role) && (
        <section className="space-y-5">
          <h2 className="text-sm font-semibold text-gray-700 border-t border-gray-100 pt-5">
            Manager Controls
          </h2>

          {/* Labor cost summary */}
          {laborSummary && (
            <div className="rounded-2xl border border-gray-200 bg-white p-5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-4 flex items-center gap-2">
                <CurrencyDollarIcon className="h-4 w-4" />
                Project Labor Cost
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <LaborStat label="Total Hours" value={formatHours(laborSummary.total_net_hours)} />
                <LaborStat label="Regular" value={formatHours(laborSummary.total_regular_hours)} />
                <LaborStat label="OT 1.5×" value={formatHours(laborSummary.total_ot_1_5_hours)} />
                <LaborStat label="OT 2×" value={formatHours(laborSummary.total_ot_2_0_hours)} />
                <LaborStat label="Labor Cost" value={formatCents(laborSummary.total_labor_cost_cents)} highlight />
                <LaborStat
                  label="Active Now"
                  value={laborSummary.active_session_count > 0
                    ? `${laborSummary.active_session_count} clocked in`
                    : 'None'}
                />
              </div>
            </div>
          )}

          {/* Site pin + geofence */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Geofence Settings
            </h3>

            {/* Current pin status */}
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900">Site Pin</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {siteLat != null
                    ? `${siteLat.toFixed(5)}, ${siteLng?.toFixed(5)}`
                    : 'Not set — geofencing disabled'}
                </p>
                {geocodeErr && (
                  <p className="mt-1 text-xs text-red-600">{geocodeErr}</p>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                {/* Use GPS location */}
                <button
                  onClick={() => {
                    if (!geo.lat || !geo.lng) { toast.error('No GPS fix yet.'); return }
                    setLocationMut.mutate({
                      lat:    geo.lat,
                      lng:    geo.lng,
                      radius: siteData?.geofence_radius_meters ?? null,
                    })
                  }}
                  disabled={setLocationMut.isPending || geocoding || !geo.lat}
                  className="rounded-lg border border-brand-300 bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-100 disabled:opacity-40 transition-colors"
                >
                  {setLocationMut.isPending && !geocoding
                    ? 'Saving…'
                    : siteLat != null
                      ? 'Update to my location'
                      : 'Set to my location'}
                </button>
                {/* Use project address (geocode) */}
                {jobAddress && (
                  <button
                    onClick={() => void handleUseProjectAddress()}
                    disabled={setLocationMut.isPending || geocoding}
                    className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 transition-colors"
                  >
                    {geocoding ? 'Locating…' : 'Use project address'}
                  </button>
                )}
              </div>
            </div>

            {/* Per-project radius */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">Project Fence Radius</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {siteData?.geofence_radius_meters != null
                    ? `${siteData.geofence_radius_meters} m (project override)`
                    : `${tenantData?.default_geofence_radius_meters ?? 300} m (tenant default)`}
                </p>
              </div>
              {!showRadiusEdit ? (
                <button
                  onClick={() => {
                    setRadiusInput(String(siteData?.geofence_radius_meters ?? tenantData?.default_geofence_radius_meters ?? 300))
                    setShowRadiusEdit(true)
                  }}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Override
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={radiusInput}
                    onChange={(e) => setRadiusInput(e.target.value)}
                    placeholder="metres"
                    className="w-24 rounded-lg border border-gray-300 px-2 py-1 text-xs focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-200"
                  />
                  <button
                    onClick={() => setRadiusMut.mutate()}
                    disabled={setRadiusMut.isPending}
                    className="rounded-lg bg-brand-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setShowRadiusEdit(false)}
                    className="text-xs text-gray-400 hover:text-gray-600"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>

            {/* Tenant default radius */}
            <div className="flex items-center justify-between border-t border-gray-100 pt-3">
              <div>
                <p className="text-sm font-medium text-gray-900">Tenant Default Radius</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Applies to all projects without a project-level override.
                  Currently {tenantData?.default_geofence_radius_meters ?? 300} m.
                </p>
              </div>
              {!showTenantEdit ? (
                <button
                  onClick={() => {
                    setTenantRadiusInput(String(tenantData?.default_geofence_radius_meters ?? 300))
                    setShowTenantEdit(true)
                  }}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Edit
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={tenantRadiusInput}
                    onChange={(e) => setTenantRadiusInput(e.target.value)}
                    placeholder="metres"
                    className="w-24 rounded-lg border border-gray-300 px-2 py-1 text-xs focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-200"
                  />
                  <button
                    onClick={() => setTenantRadiusMut.mutate()}
                    disabled={setTenantRadiusMut.isPending}
                    className="rounded-lg bg-brand-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setShowTenantEdit(false)}
                    className="text-xs text-gray-400 hover:text-gray-600"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Geofence violations */}
          {violations.length > 0 && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-700 mb-3 flex items-center gap-2">
                <ExclamationTriangleIcon className="h-4 w-4" />
                Recent Geofence Exceptions ({violations.length})
              </h3>
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {violations.slice(0, 20).map((v) => (
                  <div key={v.id} className="text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-amber-800">
                        {v.attempt_type === 'clock_in' ? 'Clock-in' : 'Clock-out'} —{' '}
                        {Math.round(v.distance_from_site_m)} m from site
                        {v.was_rejected ? (
                          <span className="ml-1 inline-flex items-center rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                            REJECTED
                          </span>
                        ) : v.offsite_reason ? (
                          <span className="ml-1 inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                            OFF-SITE
                          </span>
                        ) : null}
                      </span>
                      <span className="text-amber-600 whitespace-nowrap ml-4">
                        {fmtDate(v.attempted_at)} {fmtTime(v.attempted_at)}
                      </span>
                    </div>
                    {v.offsite_reason && (
                      <div className="mt-1 pl-0 space-y-0.5">
                        <p className="text-amber-700">
                          <span className="font-medium">Reason:</span> {v.offsite_reason}
                        </p>
                        <p className={v.pm_purchase_approved ? 'text-green-700' : 'text-red-600'}>
                          <span className="font-medium">PM authorized:</span>{' '}
                          {v.pm_purchase_approved ? '✓ Yes' : '✗ No'}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* All active sessions detail */}
          {activeSessions.length > 0 && (
            <div className="rounded-2xl border border-gray-200 bg-white p-5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
                All Active Sessions
              </h3>
              <div className="space-y-2">
                {activeSessions.map((s) => (
                  <div key={s.id} className="flex items-center justify-between text-sm">
                    <span className="font-medium text-gray-900">
                      {(s.user as WorkSession['user'])?.first_name ?? '—'}{' '}
                      {(s.user as WorkSession['user'])?.last_name ?? ''}
                    </span>
                    <span className="text-gray-500 text-xs">
                      In at {fmtTime(s.clocked_in_at)} · {s.status === 'on_break' ? '🟡 On break' : '🟢 Working'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* All recent sessions — editable by PM+ */}
          {recentSessions.length > 0 && (
            <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                  Recent Sessions
                </h3>
              </div>
              <div className="divide-y divide-gray-100">
                {recentSessions.slice(0, 20).map((s) => (
                  <PmSessionRow
                    key={s.id}
                    session={s}
                    tenantId={tenantId}
                    onSaved={() => {
                      qc.invalidateQueries({ queryKey: ['work-sessions', projectId] })
                      qc.invalidateQueries({ queryKey: ['project-labor', projectId] })
                    }}
                  />
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* ── My wages ───────────────────────────────────────────────── */}
      {isEmployee && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-gray-700">My Pay Rates</h2>

          {myWages.length > 0 && (
            <div className="mb-3 divide-y divide-gray-100 rounded-xl border border-gray-200 overflow-hidden">
              {myWages.slice(0, 3).map((w) => (
                <div key={w.id} className="flex items-center justify-between px-4 py-3 text-sm">
                  <span className="text-gray-900 font-medium">{formatCents(w.hourly_rate_cents)}/h</span>
                  <span className="text-gray-400 text-xs">Effective {w.effective_date}</span>
                </div>
              ))}
            </div>
          )}

          {/* Allow any employee to enter their own wage (PM can override in admin) */}
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 space-y-3">
            <p className="text-xs text-gray-500">Add / update your hourly rate for accurate cost tracking.</p>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input
                  type="number"
                  value={wageRate}
                  onChange={(e) => setWageRate(e.target.value)}
                  placeholder="0.00"
                  step="0.25"
                  className="w-full rounded-lg border border-gray-300 pl-7 pr-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-200"
                />
              </div>
              <input
                type="date"
                value={wageDate}
                onChange={(e) => setWageDate(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-200"
              />
              <button
                onClick={() => upsertWageMut.mutate()}
                disabled={upsertWageMut.isPending || !wageRate}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-40"
              >
                {upsertWageMut.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────

function OnSiteRow({ session }: { session: WorkSession }) {
  const [elapsed, setElapsed] = useState(() => formatElapsed(session.clocked_in_at))
  useEffect(() => {
    const id = setInterval(() => setElapsed(formatElapsed(session.clocked_in_at)), 5_000)
    return () => clearInterval(id)
  }, [session.clocked_in_at])

  const name = session.user
    ? `${session.user.first_name} ${session.user.last_name}`
    : 'Team member'

  return (
    <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="relative">
          {session.user?.avatar_url ? (
            <img
              src={session.user.avatar_url}
              alt={name}
              className="h-9 w-9 rounded-full object-cover"
            />
          ) : (
            <div className="h-9 w-9 rounded-full bg-brand-100 flex items-center justify-center text-sm font-semibold text-brand-700">
              {session.user?.first_name?.[0] ?? '?'}
            </div>
          )}
          <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white ${
            session.status === 'on_break' ? 'bg-amber-400' : 'bg-green-400'
          }`} />
        </div>
        <div>
          <p className="text-sm font-medium text-gray-900">{name}</p>
          <p className="text-xs text-gray-400">
            In at {fmtTime(session.clocked_in_at)}
            {session.status === 'on_break' && ' · On break'}
          </p>
        </div>
      </div>
      <span className="font-mono text-sm font-medium text-gray-700 tabular-nums">{elapsed}</span>
    </div>
  )
}

function SessionHistoryRow({ session, showCost }: { session: WorkSession; showCost?: boolean }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 bg-white text-sm">
      <div>
        <p className="font-medium text-gray-900">
          {fmtDate(session.clocked_in_at)}
        </p>
        <p className="text-xs text-gray-400 mt-0.5">
          {fmtTime(session.clocked_in_at)} – {session.clocked_out_at ? fmtTime(session.clocked_out_at) : '—'}
          {session.auto_break_deducted && ' · 30 min lunch deducted'}
          {session.status === 'auto_closed' && ' · Auto closed'}
        </p>
      </div>
      <div className="text-right">
        <p className="font-semibold text-gray-900">{formatHours(session.net_hours)}</p>
        {session.ot_1_5_hours != null && session.ot_1_5_hours > 0 && (
          <p className="text-xs text-amber-600 mt-0.5">
            +{formatHours(session.ot_1_5_hours)} OT
          </p>
        )}
        {session.mileage_miles != null && (
          <p className="text-xs text-blue-600 mt-0.5">
            {session.mileage_miles} mi
          </p>
        )}
        {showCost && session.labor_cost_cents != null && (
          <p className="text-xs text-gray-400">{formatCents(session.labor_cost_cents)}</p>
        )}
      </div>
    </div>
  )
}

function PmSessionRow({ session, tenantId, onSaved }: { session: WorkSession; tenantId: string; onSaved: () => void }) {
  const toast = useToast()
  const [open, setOpen] = useState(false)

  const [projectId, setProjectId] = useState(session.project_id)
  const [inVal,     setInVal]     = useState('')
  const [outVal,    setOutVal]    = useState('')
  const [breakMin,  setBreakMin]  = useState('')
  const [notes,     setNotes]     = useState('')
  const [mileage,   setMileage]   = useState('')

  const { data: projects = [] } = useQuery({
    queryKey: ['projects', tenantId],
    queryFn: () => getProjects(supabase, tenantId),
    staleTime: 300_000,
    enabled: open,
  })

  function openEdit() {
    setProjectId(session.project_id)
    setInVal(toDatetimeLocal(session.clocked_in_at))
    setOutVal(session.clocked_out_at ? toDatetimeLocal(session.clocked_out_at) : '')
    setBreakMin(String(session.total_break_minutes ?? 0))
    setNotes(session.notes ?? '')
    setMileage(session.mileage_miles != null ? String(session.mileage_miles) : '')
    setOpen(true)
  }

  const saveMut = useMutation({
    mutationFn: () => {
      if (!outVal) throw new Error('Clock-out time is required')
      const input: EditSessionInput = {
        projectId,
        clockedInAt:  fromDatetimeLocal(inVal),
        clockedOutAt: fromDatetimeLocal(outVal),
        breakMinutes: parseInt(breakMin, 10) || 0,
        notes:        notes.trim() || null,
        mileageMiles: mileage !== '' ? parseFloat(mileage) : null,
      }
      return pmEditWorkSession(supabase, session.id, input)
    },
    onSuccess: () => {
      setOpen(false)
      toast.success('Session updated.')
      onSaved()
    },
    onError: (err: Error) => {
      const msg = err.message.includes('clock_out_before_clock_in')
        ? 'Clock-out must be after clock-in.'
        : err.message.includes('unauthorized')
          ? 'You do not have permission to edit sessions.'
          : 'Failed to save. Please try again.'
      toast.error(msg)
    },
  })

  const workerName = session.user
    ? `${session.user.first_name} ${session.user.last_name}`
    : 'Team member'

  return (
    <div>
      {/* Row */}
      <div className="flex items-center justify-between px-4 py-3 text-sm">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-gray-900 truncate">{workerName}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {fmtDate(session.clocked_in_at)}
            {' · '}
            {fmtTime(session.clocked_in_at)} – {session.clocked_out_at ? fmtTime(session.clocked_out_at) : '—'}
            {session.auto_break_deducted && ' · 30 min lunch'}
            {session.status === 'auto_closed' && ' · Auto closed'}
          </p>
        </div>
        <div className="flex items-center gap-3 ml-3 shrink-0">
          <div className="text-right">
            <p className="font-semibold text-gray-900 tabular-nums">{formatHours(session.net_hours)}</p>
            {session.labor_cost_cents != null && (
              <p className="text-xs text-gray-400">{formatCents(session.labor_cost_cents)}</p>
            )}
          </div>
          <button
            onClick={open ? () => setOpen(false) : openEdit}
            className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            {open ? 'Cancel' : 'Edit'}
          </button>
        </div>
      </div>

      {/* Inline edit form */}
      {open && (
        <div className="border-t border-brand-100 bg-brand-50/30 px-4 py-4 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Project</label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-200 bg-white"
            >
              {projects.map((p) => {
                const job = p.job as { job_number?: string | null; job_name?: string | null } | null
                const label = job?.job_number ? `${job.job_number} — ${job.job_name}` : (job?.job_name ?? p.id)
                return <option key={p.id} value={p.id}>{label}</option>
              })}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Clock In</label>
              <input
                type="datetime-local"
                value={inVal}
                onChange={(e) => setInVal(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-200"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Clock Out</label>
              <input
                type="datetime-local"
                value={outVal}
                onChange={(e) => setOutVal(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-200"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Break (min)</label>
              <input
                type="number"
                value={breakMin}
                onChange={(e) => setBreakMin(e.target.value)}
                min="0"
                step="5"
                className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-200"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Mileage (mi)</label>
              <input
                type="number"
                value={mileage}
                onChange={(e) => setMileage(e.target.value)}
                min="0"
                step="0.1"
                placeholder="—"
                className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-200"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Notes</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional note about this correction…"
              className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-200"
            />
          </div>

          <div className="flex justify-end">
            <button
              onClick={() => saveMut.mutate()}
              disabled={saveMut.isPending || !inVal || !outVal}
              className="rounded-lg bg-brand-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {saveMut.isPending ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function LaborStat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className={`text-sm font-semibold mt-0.5 ${highlight ? 'text-brand-700' : 'text-gray-900'}`}>
        {value}
      </p>
    </div>
  )
}
