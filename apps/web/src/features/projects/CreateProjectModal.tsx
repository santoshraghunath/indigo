import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createProject, getCustomers, setProjectLocation } from '@indigo/shared'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/stores/toastStore'
import { XMarkIcon } from '@/components/ui/Icons'
import { AddressAutocomplete, type AddressResult } from '@/components/ui/AddressAutocomplete'

// ── Constants ──────────────────────────────────────────────────────────────

const PROJECT_STATUSES = [
  { value: 'bidding',  label: 'Bidding' },
  { value: 'active',   label: 'Active' },
  { value: 'pending',  label: 'Pending' },
  { value: 'on_hold',  label: 'On Hold' },
]

const PROJECT_TYPES = [
  { value: 'custom',   label: 'Custom' },
  { value: 'express',  label: 'Express' },
  { value: 'service',  label: 'Service' },
  { value: 'warranty', label: 'Warranty' },
]

// ── Helpers ────────────────────────────────────────────────────────────────

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string
  required?: boolean
  error?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
        {required && <span className="ml-0.5 text-red-500"> *</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
}

const inputCls = (hasError?: boolean) =>
  `h-10 w-full rounded-lg border px-3 text-sm text-gray-900 placeholder:text-gray-400
   focus:outline-none focus:ring-2 focus:ring-brand-100 focus:border-brand-400 transition-colors
   ${hasError
     ? 'border-red-300 bg-red-50'
     : 'border-gray-200 bg-gray-50 focus:bg-white'
   }`

const selectCls = (hasError?: boolean) =>
  `h-10 w-full rounded-lg border px-3 text-sm text-gray-900
   focus:outline-none focus:ring-2 focus:ring-brand-100 focus:border-brand-400 transition-colors
   ${hasError
     ? 'border-red-300 bg-red-50'
     : 'border-gray-200 bg-gray-50 focus:bg-white'
   }`

// ── Component ──────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void
}

export function CreateProjectModal({ onClose }: Props) {
  const navigate      = useNavigate()
  const queryClient   = useQueryClient()
  const { activeTenantId, user } = useAuth()
  const toast         = useToast()

  // ── Form state ───────────────────────────────────────────────────────────
  const [jobName,           setJobName]           = useState('')
  const [jobNumber,         setJobNumber]         = useState('')
  const [customerId,        setCustomerId]        = useState('')
  const [projectStatus,     setProjectStatus]     = useState('bidding')
  const [projectType,       setProjectType]       = useState('')
  const [addressLine1,      setAddressLine1]      = useState('')
  const [city,              setCity]              = useState('')
  const [state,             setState]             = useState('CA')
  const [zip,               setZip]               = useState('')
  // Lat/lng captured from Google Places autocomplete — used to auto-pin geofence
  const [siteLat,           setSiteLat]           = useState<number | null>(null)
  const [siteLng,           setSiteLng]           = useState<number | null>(null)
  const [startDate,         setStartDate]         = useState('')
  const [targetCompletion,  setTargetCompletion]  = useState('')
  const [contractValueStr,  setContractValueStr]  = useState('')
  const [errors,            setErrors]            = useState<Record<string, string>>({})

  // ── Customer list ────────────────────────────────────────────────────────
  const { data: customers, isLoading: customersLoading } = useQuery({
    queryKey:  ['customers', activeTenantId],
    queryFn:   () => getCustomers(supabase, activeTenantId!),
    enabled:   !!activeTenantId,
    staleTime: 60_000,
  })

  // ── Mutation ─────────────────────────────────────────────────────────────
  const mutation = useMutation({
    mutationFn: async () => {
      const result = await createProject(supabase, activeTenantId!, user!.id, {
        job_name:              jobName.trim(),
        job_number:            jobNumber.trim(),
        customer_id:           customerId,
        project_status:        projectStatus || 'bidding',
        project_type:          projectType   || undefined,
        address_line1:         addressLine1.trim() || undefined,
        city:                  city.trim()         || undefined,
        state:                 state.trim()        || undefined,
        zip:                   zip.trim()          || undefined,
        start_date:            startDate           || undefined,
        target_completion:     targetCompletion    || undefined,
        contract_value_cents:  contractValueStr
          ? Math.round(parseFloat(contractValueStr) * 100)
          : undefined,
      })
      // Auto-pin geofence when lat/lng was captured from address autocomplete
      if (siteLat !== null && siteLng !== null) {
        await setProjectLocation(supabase, result.projectId, siteLat, siteLng, null)
      }
      return result
    },
    onSuccess: ({ projectId }) => {
      void queryClient.invalidateQueries({ queryKey: ['projects', activeTenantId] })
      toast.success('Project created', `${jobName.trim()} is ready.`)
      navigate(`/projects/${projectId}`)
      onClose()
    },
    onError: (err) => {
      toast.error(
        'Failed to create project',
        err instanceof Error ? err.message : 'Please try again.',
      )
    },
  })

  // ── Validation ────────────────────────────────────────────────────────────
  function validate(): boolean {
    const e: Record<string, string> = {}
    if (!jobName.trim())   e.jobName    = 'Job name is required'
    if (!jobNumber.trim()) e.jobNumber  = 'Job number is required'
    if (!customerId)       e.customerId = 'Customer is required'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    mutation.mutate()
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center px-4 pb-4 sm:pb-0">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">New Project</h2>
            <p className="text-sm text-gray-500">Creates a job and project record</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          >
            <XMarkIcon className="h-5 w-5" strokeWidth={2} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-7">

            {/* ── Project Details ────────────────────────────── */}
            <section>
              <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-gray-400">
                Project Details
              </p>
              <div className="space-y-4">
                <Field label="Job Name" required error={errors.jobName}>
                  <input
                    type="text"
                    value={jobName}
                    onChange={(e) => setJobName(e.target.value)}
                    placeholder="e.g. Smith Kitchen Remodel"
                    className={inputCls(!!errors.jobName)}
                    autoFocus
                  />
                </Field>

                <div className="grid grid-cols-2 gap-4">
                  <Field label="Job Number" required error={errors.jobNumber}>
                    <input
                      type="text"
                      value={jobNumber}
                      onChange={(e) => setJobNumber(e.target.value)}
                      placeholder="e.g. J-001"
                      className={`${inputCls(!!errors.jobNumber)} font-mono`}
                    />
                  </Field>

                  <Field label="Customer" required error={errors.customerId}>
                    <select
                      value={customerId}
                      onChange={(e) => setCustomerId(e.target.value)}
                      disabled={customersLoading}
                      className={selectCls(!!errors.customerId)}
                    >
                      <option value="">
                        {customersLoading ? 'Loading…' : 'Select customer'}
                      </option>
                      {customers?.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.customer_name}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
              </div>
            </section>

            {/* ── Status & Type ──────────────────────────────── */}
            <section>
              <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-gray-400">
                Status & Type
              </p>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Project Status">
                  <select
                    value={projectStatus}
                    onChange={(e) => setProjectStatus(e.target.value)}
                    className={selectCls()}
                  >
                    {PROJECT_STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </Field>

                <Field label="Project Type">
                  <select
                    value={projectType}
                    onChange={(e) => setProjectType(e.target.value)}
                    className={selectCls()}
                  >
                    <option value="">Select type (optional)</option>
                    {PROJECT_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </Field>
              </div>
            </section>

            {/* ── Location ───────────────────────────────────── */}
            <section>
              <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-gray-400">
                Location{' '}
                <span className="ml-1 font-normal normal-case tracking-normal text-gray-300">
                  optional
                </span>
              </p>
              <div className="space-y-4">
                <Field label="Address">
                  <div className="relative">
                    <AddressAutocomplete
                      value={addressLine1}
                      onChange={(v) => {
                        setAddressLine1(v)
                        // Clear coords when the user edits the field manually
                        setSiteLat(null)
                        setSiteLng(null)
                      }}
                      onSelect={(r: AddressResult) => {
                        setAddressLine1(r.line1)
                        if (r.city)  setCity(r.city)
                        if (r.state) setState(r.state)
                        if (r.zip)   setZip(r.zip)
                        setSiteLat(r.lat)
                        setSiteLng(r.lng)
                      }}
                      placeholder="Start typing to search address…"
                      className={inputCls()}
                    />
                    {siteLat !== null && (
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-green-600 font-medium">
                        📍 pinned
                      </span>
                    )}
                  </div>
                </Field>

                <div className="grid grid-cols-6 gap-3">
                  <div className="col-span-3">
                    <Field label="City">
                      <input
                        type="text"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        placeholder="City"
                        className={inputCls()}
                      />
                    </Field>
                  </div>
                  <div className="col-span-1">
                    <Field label="State">
                      <input
                        type="text"
                        value={state}
                        onChange={(e) => setState(e.target.value.toUpperCase())}
                        placeholder="CA"
                        maxLength={2}
                        className={inputCls()}
                      />
                    </Field>
                  </div>
                  <div className="col-span-2">
                    <Field label="Zip">
                      <input
                        type="text"
                        value={zip}
                        onChange={(e) => setZip(e.target.value)}
                        placeholder="90210"
                        className={inputCls()}
                      />
                    </Field>
                  </div>
                </div>

                {siteLat !== null && (
                  <p className="text-xs text-green-700 bg-green-50 rounded-lg px-3 py-2">
                    ✓ Geofence will be pinned to this address automatically when the project is created.
                  </p>
                )}
              </div>
            </section>

            {/* ── Timeline & Financials ──────────────────────── */}
            <section>
              <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-gray-400">
                Timeline & Financials{' '}
                <span className="ml-1 font-normal normal-case tracking-normal text-gray-300">
                  optional
                </span>
              </p>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Start Date">
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className={inputCls()}
                  />
                </Field>

                <Field label="Target Completion">
                  <input
                    type="date"
                    value={targetCompletion}
                    onChange={(e) => setTargetCompletion(e.target.value)}
                    className={inputCls()}
                  />
                </Field>

                <Field label="Contract Value">
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                      $
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={contractValueStr}
                      onChange={(e) => setContractValueStr(e.target.value)}
                      placeholder="0.00"
                      className={`${inputCls()} pl-7`}
                    />
                  </div>
                </Field>
              </div>
            </section>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 rounded-b-2xl border-t border-gray-200 bg-gray-50 px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              disabled={mutation.isPending}
              className="h-9 rounded-lg px-4 text-sm font-medium text-gray-700 hover:bg-gray-200 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={mutation.isPending || customersLoading}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-600 px-5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-700 disabled:opacity-60"
            >
              {mutation.isPending ? 'Creating…' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
