import { useState } from 'react'
import { useOutletContext, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ProjectRow, ProjectInspection, UpsertInspectionInput, InspectionResult } from '@indigo/shared'
import {
  formatMoney,
  updateJobPermit,
  updateProjectDetails,
  getProjectInspections,
  upsertInspection,
  deleteInspection,
} from '@indigo/shared'
import { useProjectPhases } from '../useProject'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/stores/toastStore'
import { Skeleton } from '@/components/ui/Skeleton'
import {
  MapPinIcon,
  CurrencyDollarIcon,
  CalendarIcon,
  BuildingOfficeIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
  XMarkIcon,
  CheckIcon,
} from '@/components/ui/Icons'

interface OutletCtx {
  project: ProjectRow | undefined
  isLoading: boolean
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtDate(s: string | null | undefined, style: 'short' | 'long' = 'short'): string {
  if (!s) return '—'
  const d = new Date(s + 'T00:00:00')
  return style === 'long'
    ? d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function daysRemaining(target: string | null): number | null {
  if (!target) return null
  const diff = new Date(target + 'T00:00:00').getTime() - Date.now()
  return Math.ceil(diff / 86_400_000)
}

// ── Common input styles ────────────────────────────────────────────────────

const inputCls =
  'h-9 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm text-gray-900 ' +
  'placeholder:text-gray-400 focus:bg-white focus:border-brand-400 focus:outline-none ' +
  'focus:ring-2 focus:ring-brand-100 transition-colors'

const selectCls =
  'h-9 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm text-gray-900 ' +
  'focus:bg-white focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 transition-colors'

// ── Stat card ──────────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: string
  sub?: string
  accent?: string
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-card">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className={`mt-1.5 text-xl font-semibold tabular-nums ${accent ?? 'text-gray-900'}`}>
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-gray-400">{sub}</p>}
    </div>
  )
}

// ── Detail row ─────────────────────────────────────────────────────────────

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value) return null
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-gray-100 last:border-0">
      <span className="w-36 shrink-0 text-xs font-medium text-gray-500">{label}</span>
      <span className="flex-1 text-sm text-gray-900">{value}</span>
    </div>
  )
}

// ── Phase progress bar ─────────────────────────────────────────────────────

const PHASE_STATUS_COLOR: Record<string, string> = {
  complete:     '#16a34a',
  approved:     '#16a34a',
  in_progress:  '#6366f1',
  not_started:  '#d1d5db',
  blocked:      '#ef4444',
}

function PhaseBar({ phase }: { phase: { name: string; status: string; color: string | null; milestones: Array<{ status: string }> } }) {
  const total     = phase.milestones.length
  const completed = phase.milestones.filter((m) => m.status === 'complete').length
  const pct       = total > 0 ? Math.round((completed / total) * 100) : 0
  const color     = phase.color ?? PHASE_STATUS_COLOR[phase.status] ?? '#d1d5db'

  return (
    <div className="py-2.5 border-b border-gray-100 last:border-0">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm font-medium text-gray-800">{phase.name}</span>
        <span className="text-xs text-gray-500">{total > 0 ? `${completed}/${total}` : '—'}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  )
}

// ── Modal shell ────────────────────────────────────────────────────────────

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center px-4 pb-4 sm:pb-0">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          >
            <XMarkIcon className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

// ── Permit edit modal ──────────────────────────────────────────────────────

function PermitModal({
  jobId,
  initialPermitNumber,
  initialIssuedDate,
  initialExpiryDate,
  onClose,
  onSaved,
}: {
  jobId: string
  initialPermitNumber: string | null
  initialIssuedDate: string | null
  initialExpiryDate: string | null
  onClose: () => void
  onSaved: () => void
}) {
  const toast = useToast()
  const [permitNumber, setPermitNumber] = useState(initialPermitNumber ?? '')
  const [issuedDate,   setIssuedDate]   = useState(initialIssuedDate   ?? '')
  const [expiryDate,   setExpiryDate]   = useState(initialExpiryDate   ?? '')

  const mutation = useMutation({
    mutationFn: () =>
      updateJobPermit(supabase, jobId, {
        permit_number:      permitNumber.trim() || null,
        permit_issued_date: issuedDate  || null,
        permit_expiry_date: expiryDate  || null,
      }),
    onSuccess: () => {
      toast.success('Permit updated')
      onSaved()
      onClose()
    },
    onError: (err) => {
      toast.error('Failed to update permit', err instanceof Error ? err.message : 'Try again.')
    },
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    mutation.mutate()
  }

  return (
    <ModalShell title="Edit Permit" onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Permit Number</label>
            <input
              type="text"
              value={permitNumber}
              onChange={(e) => setPermitNumber(e.target.value)}
              placeholder="e.g. B-2024-001234"
              className={inputCls}
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Issued Date</label>
              <input type="date" value={issuedDate} onChange={(e) => setIssuedDate(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Expiry Date</label>
              <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} className={inputCls} />
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 rounded-b-2xl border-t border-gray-200 bg-gray-50 px-5 py-3">
          <button type="button" onClick={onClose} disabled={mutation.isPending}
            className="h-8 rounded-lg px-3.5 text-sm font-medium text-gray-700 hover:bg-gray-200 transition-colors disabled:opacity-50">
            Cancel
          </button>
          <button type="submit" disabled={mutation.isPending}
            className="inline-flex h-8 items-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:opacity-60">
            {mutation.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

// ── Inspection result badge ────────────────────────────────────────────────

const RESULT_CFG: Record<InspectionResult, { label: string; cls: string }> = {
  pending:   { label: 'Pending',   cls: 'bg-gray-100 text-gray-600' },
  passed:    { label: 'Passed',    cls: 'bg-green-50 text-green-700' },
  failed:    { label: 'Failed',    cls: 'bg-red-50 text-red-700' },
  cancelled: { label: 'Cancelled', cls: 'bg-gray-100 text-gray-400' },
}

function ResultBadge({ result }: { result: InspectionResult }) {
  const cfg = RESULT_CFG[result] ?? RESULT_CFG.pending
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${cfg.cls}`}>
      {cfg.label}
    </span>
  )
}

// ── Inspection modal ───────────────────────────────────────────────────────

const INSPECTION_TYPES = [
  'Foundation',
  'Framing',
  'Rough Electrical',
  'Rough Plumbing',
  'Rough Mechanical',
  'Insulation',
  'Drywall',
  'Final Electrical',
  'Final Plumbing',
  'Final Mechanical',
  'Final',
  'Other',
]

const RESULTS: { value: InspectionResult; label: string }[] = [
  { value: 'pending',   label: 'Pending' },
  { value: 'passed',    label: 'Passed' },
  { value: 'failed',    label: 'Failed' },
  { value: 'cancelled', label: 'Cancelled' },
]

function InspectionModal({
  projectId,
  tenantId,
  userId,
  inspection,
  onClose,
  onSaved,
}: {
  projectId: string
  tenantId: string
  userId: string
  inspection?: ProjectInspection
  onClose: () => void
  onSaved: () => void
}) {
  const toast  = useToast()
  const isEdit = !!inspection

  const [inspectionType,     setInspectionType]     = useState(inspection?.inspection_type     ?? '')
  const [customType,         setCustomType]          = useState('')
  const [scheduledDate,      setScheduledDate]       = useState(inspection?.scheduled_date      ?? '')
  const [completedDate,      setCompletedDate]       = useState(inspection?.completed_date      ?? '')
  const [result,             setResult]              = useState<InspectionResult>(inspection?.result ?? 'pending')
  const [inspectorName,      setInspectorName]       = useState(inspection?.inspector_name      ?? '')
  const [certificateNumber,  setCertificateNumber]   = useState(inspection?.certificate_number  ?? '')
  const [correctionRequired, setCorrectionRequired]  = useState(inspection?.correction_required ?? false)
  const [correctionResolved, setCorrectionResolved]  = useState(inspection?.correction_resolved ?? false)
  const [notes,              setNotes]               = useState(inspection?.notes               ?? '')
  const [typeError,          setTypeError]           = useState('')

  const showCertificate = result === 'passed'
  const showResolved    = correctionRequired

  const mutation = useMutation({
    mutationFn: () => {
      const finalType = inspectionType === 'Other' ? customType.trim() : inspectionType
      if (!finalType) { setTypeError('Inspection type is required'); throw new Error('type required') }
      const input: UpsertInspectionInput = {
        id:                  inspection?.id,
        inspection_type:     finalType,
        scheduled_date:      scheduledDate     || null,
        completed_date:      completedDate     || null,
        result,
        inspector_name:      inspectorName.trim()     || null,
        certificate_number:  showCertificate ? (certificateNumber.trim() || null) : null,
        correction_required: correctionRequired,
        correction_resolved: showResolved ? correctionResolved : false,
        notes:               notes.trim() || null,
      }
      return upsertInspection(supabase, tenantId, projectId, input, userId)
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Inspection updated' : 'Inspection added')
      onSaved()
      onClose()
    },
    onError: (err) => {
      if (err.message !== 'type required') {
        toast.error('Failed to save inspection', err instanceof Error ? err.message : 'Try again.')
      }
    },
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setTypeError('')
    mutation.mutate()
  }

  return (
    <ModalShell title={isEdit ? 'Edit Inspection' : 'Add Inspection'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {/* Type */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Inspection Type <span className="text-red-500">*</span>
            </label>
            <select
              value={inspectionType}
              onChange={(e) => { setInspectionType(e.target.value); setTypeError('') }}
              className={`${selectCls} ${typeError ? 'border-red-300 bg-red-50' : ''}`}
            >
              <option value="">Select type…</option>
              {INSPECTION_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            {inspectionType === 'Other' && (
              <input
                type="text"
                value={customType}
                onChange={(e) => setCustomType(e.target.value)}
                placeholder="Describe the inspection type"
                className={`${inputCls} mt-2`}
                autoFocus
              />
            )}
            {typeError && <p className="mt-1 text-xs text-red-600">{typeError}</p>}
          </div>

          {/* Result + Inspector */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Result</label>
              <select value={result} onChange={(e) => setResult(e.target.value as InspectionResult)} className={selectCls}>
                {RESULTS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Inspector Name</label>
              <input
                type="text"
                value={inspectorName}
                onChange={(e) => setInspectorName(e.target.value)}
                placeholder="Inspector"
                className={inputCls}
              />
            </div>
          </div>

          {/* Scheduled + Completed dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Scheduled Date</label>
              <input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Completed Date</label>
              <input type="date" value={completedDate} onChange={(e) => setCompletedDate(e.target.value)} className={inputCls} />
            </div>
          </div>

          {/* Certificate (shown when passed) */}
          {showCertificate && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Certificate Number</label>
              <input
                type="text"
                value={certificateNumber}
                onChange={(e) => setCertificateNumber(e.target.value)}
                placeholder="e.g. CERT-2024-0042"
                className={inputCls}
              />
            </div>
          )}

          {/* Correction flags */}
          <div className="space-y-2.5 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
            <label className="flex cursor-pointer items-center justify-between gap-3">
              <span className="text-sm text-gray-700">Correction / re-inspection required</span>
              <button
                type="button"
                role="switch"
                aria-checked={correctionRequired}
                onClick={() => setCorrectionRequired(!correctionRequired)}
                className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${correctionRequired ? 'bg-brand-600' : 'bg-gray-300'}`}
              >
                <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${correctionRequired ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </button>
            </label>
            {showResolved && (
              <label className="flex cursor-pointer items-center justify-between gap-3">
                <span className="text-sm text-gray-700">Correction resolved</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={correctionResolved}
                  onClick={() => setCorrectionResolved(!correctionResolved)}
                  className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${correctionResolved ? 'bg-brand-600' : 'bg-gray-300'}`}
                >
                  <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${correctionResolved ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </button>
              </label>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Notes <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Inspector comments, corrections needed, etc."
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:bg-white focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 transition-colors resize-none"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 rounded-b-2xl border-t border-gray-200 bg-gray-50 px-5 py-3">
          <button type="button" onClick={onClose} disabled={mutation.isPending}
            className="h-8 rounded-lg px-3.5 text-sm font-medium text-gray-700 hover:bg-gray-200 transition-colors disabled:opacity-50">
            Cancel
          </button>
          <button type="submit" disabled={mutation.isPending}
            className="inline-flex h-8 items-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:opacity-60">
            {mutation.isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Inspection'}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

// ── Delete confirm ─────────────────────────────────────────────────────────

function DeleteConfirmModal({
  label,
  onConfirm,
  onClose,
  isPending,
}: {
  label: string
  onConfirm: () => void
  onClose: () => void
  isPending: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <p className="text-sm font-semibold text-gray-900">Delete {label}?</p>
        <p className="mt-1 text-sm text-gray-500">This cannot be undone.</p>
        <div className="mt-5 flex justify-end gap-3">
          <button onClick={onClose} disabled={isPending}
            className="h-8 rounded-lg px-3.5 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={isPending}
            className="inline-flex h-8 items-center rounded-lg bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60">
            {isPending ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Inspection row ─────────────────────────────────────────────────────────

function InspectionRow({
  inspection,
  onEdit,
  onDelete,
}: {
  inspection: ProjectInspection
  onEdit: (i: ProjectInspection) => void
  onDelete: (i: ProjectInspection) => void
}) {
  return (
    <div className="group flex items-start gap-3 py-3 border-b border-gray-100 last:border-0">
      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100">
        {inspection.result === 'passed' ? (
          <CheckIcon className="h-3.5 w-3.5 text-green-600" strokeWidth={2.5} />
        ) : inspection.result === 'failed' ? (
          <XMarkIcon className="h-3.5 w-3.5 text-red-500" strokeWidth={2.5} />
        ) : (
          <CalendarIcon className="h-3.5 w-3.5 text-gray-400" strokeWidth={1.75} />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-gray-900">{inspection.inspection_type}</span>
            <ResultBadge result={inspection.result} />
            {inspection.correction_required && !inspection.correction_resolved && (
              <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                CORRECTION
              </span>
            )}
            {inspection.correction_required && inspection.correction_resolved && (
              <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-semibold text-green-700">
                RESOLVED
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {inspection.completed_date
              ? <span className="text-xs text-gray-500">{fmtDate(inspection.completed_date)}</span>
              : inspection.scheduled_date
              ? <span className="text-xs text-gray-400">Sched. {fmtDate(inspection.scheduled_date)}</span>
              : null}

            <div className="ml-1 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={() => onEdit(inspection)}
                className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-brand-600 transition-colors"
                title="Edit"
              >
                <PencilIcon className="h-3.5 w-3.5" strokeWidth={2} />
              </button>
              <button
                type="button"
                onClick={() => onDelete(inspection)}
                className="rounded p-0.5 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                title="Delete"
              >
                <TrashIcon className="h-3.5 w-3.5" strokeWidth={2} />
              </button>
            </div>
          </div>
        </div>

        {inspection.inspector_name && (
          <p className="mt-0.5 text-xs text-gray-400">Inspector: {inspection.inspector_name}</p>
        )}
        {inspection.certificate_number && (
          <p className="mt-0.5 text-xs text-gray-500">Cert # {inspection.certificate_number}</p>
        )}
        {inspection.notes && (
          <p className="mt-0.5 text-xs text-gray-400 leading-relaxed">{inspection.notes}</p>
        )}
      </div>
    </div>
  )
}

// ── Project details edit modal ─────────────────────────────────────────────

function ProjectDetailsModal({
  projectId,
  jobId,
  job,
  onClose,
  onSaved,
}: {
  projectId: string
  jobId: string
  job: NonNullable<ProjectRow['job']>
  onClose: () => void
  onSaved: () => void
}) {
  const toast = useToast()

  // Address
  const [addressLine1,  setAddressLine1]  = useState(job.address_line1  ?? '')
  const [addressLine2,  setAddressLine2]  = useState(job.address_line2  ?? '')
  const [city,          setCity]          = useState(job.city            ?? '')
  const [state,         setState]         = useState(job.state           ?? '')
  const [zip,           setZip]           = useState(job.zip             ?? '')
  // Dates
  const [startDate,     setStartDate]     = useState(job.start_date         ?? '')
  const [targetDate,    setTargetDate]    = useState(job.target_completion   ?? '')
  // Text
  const [description,   setDescription]   = useState(job.description  ?? '')
  const [notes,         setNotes]         = useState(job.notes         ?? '')
  // Contract — current_contract_cents is Indigo-managed; fall back to BB value for display only
  const displayCents = job.current_contract_cents ?? job.contract_amount_cents ?? job.contract_value_cents
  const [contractAmt, setContractAmt]    = useState(
    displayCents != null ? (displayCents / 100).toFixed(2) : '',
  )

  const mutation = useMutation({
    mutationFn: () => {
      const cents = contractAmt.trim()
        ? Math.round(parseFloat(contractAmt.replace(/,/g, '')) * 100)
        : null

      return updateProjectDetails(supabase, projectId, jobId, {
        jobs: {
          address_line1:         addressLine1.trim()  || null,
          address_line2:         addressLine2.trim()  || null,
          city:                  city.trim()          || null,
          state:                 state.trim()         || null,
          zip:                   zip.trim()           || null,
          start_date:            startDate            || null,
          target_completion:     targetDate           || null,
          description:           description.trim()   || '',   // NOT NULL in jobs
          notes:                 notes.trim()         || '',   // NOT NULL in jobs
          current_contract_cents: cents,
        },
      })
    },
    onSuccess: () => {
      toast.success('Project details updated.')
      onSaved()
      onClose()
    },
    onError: (err) => {
      toast.error('Failed to save', err instanceof Error ? err.message : 'Try again.')
    },
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    mutation.mutate()
  }

  return (
    <ModalShell title="Edit Project Details" onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {/* Contract amount */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Contract Amount</label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
              <input
                type="number"
                value={contractAmt}
                onChange={(e) => setContractAmt(e.target.value)}
                placeholder="0.00"
                min="0"
                step="0.01"
                className={`${inputCls} pl-7`}
                autoFocus
              />
            </div>
            <p className="mt-1 text-xs text-gray-400">Sets the Indigo contract value. Does not affect BuildersBooks.</p>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Start Date</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Target Completion</label>
              <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} className={inputCls} />
            </div>
          </div>

          {/* Address */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">Site Address</label>
            <input
              type="text"
              value={addressLine1}
              onChange={(e) => setAddressLine1(e.target.value)}
              placeholder="Street address"
              className={inputCls}
            />
            <input
              type="text"
              value={addressLine2}
              onChange={(e) => setAddressLine2(e.target.value)}
              placeholder="Suite, unit, apt (optional)"
              className={inputCls}
            />
            <div className="grid grid-cols-6 gap-2">
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="City"
                className={`${inputCls} col-span-3`}
              />
              <input
                type="text"
                value={state}
                onChange={(e) => setState(e.target.value)}
                placeholder="State"
                maxLength={2}
                className={`${inputCls} col-span-1 uppercase`}
              />
              <input
                type="text"
                value={zip}
                onChange={(e) => setZip(e.target.value)}
                placeholder="ZIP"
                maxLength={10}
                className={`${inputCls} col-span-2`}
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Description <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Scope of work, project overview…"
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:bg-white focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 transition-colors resize-none"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Notes <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Internal notes…"
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:bg-white focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 transition-colors resize-none"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 rounded-b-2xl border-t border-gray-200 bg-gray-50 px-5 py-3">
          <button type="button" onClick={onClose} disabled={mutation.isPending}
            className="h-8 rounded-lg px-3.5 text-sm font-medium text-gray-700 hover:bg-gray-200 transition-colors disabled:opacity-50">
            Cancel
          </button>
          <button type="submit" disabled={mutation.isPending}
            className="inline-flex h-8 items-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:opacity-60">
            {mutation.isPending ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

// ── Modal state ────────────────────────────────────────────────────────────

type ModalState =
  | { type: 'none' }
  | { type: 'edit-details' }
  | { type: 'permit' }
  | { type: 'add-inspection' }
  | { type: 'edit-inspection'; inspection: ProjectInspection }
  | { type: 'delete-inspection'; inspection: ProjectInspection }

// ── Main component ─────────────────────────────────────────────────────────

export function OverviewTab() {
  const { id } = useParams<{ id: string }>()
  const { project, isLoading } = useOutletContext<OutletCtx>()
  const { data: phases, isLoading: phasesLoading } = useProjectPhases(id)
  const { activeTenantId, user, tenantMemberships } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [modal, setModal] = useState<ModalState>({ type: 'none' })

  const job      = project?.job
  const tenantId = activeTenantId ?? ''
  const userId   = user?.id ?? ''

  // ── Inspections query ────────────────────────────────────────────────────
  const { data: inspections = [] } = useQuery({
    queryKey: ['project-inspections', id],
    queryFn:  () => getProjectInspections(supabase, id!),
    enabled:  !!id,
  })

  // ── Delete inspection mutation ────────────────────────────────────────────
  const deleteInspectionMut = useMutation({
    mutationFn: (inspectionId: string) => deleteInspection(supabase, inspectionId, tenantId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['project-inspections', id] })
      setModal({ type: 'none' })
    },
    onError: (err) => {
      toast.error('Failed to delete inspection', err instanceof Error ? err.message : 'Try again.')
    },
  })

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ['project-inspections', id] })
    // Refresh project to pick up permit changes
    void queryClient.invalidateQueries({ queryKey: ['project', id] })
  }

  // ── Role check (PM / field_super / owner / admin can edit) ───────────────
  const canEdit = (() => {
    const membership = tenantMemberships.find((m) => m.tenant_id === tenantId)
    const role = membership?.role ?? ''
    return ['owner', 'admin', 'project_manager', 'field_super'].includes(role)
  })()

  if (isLoading) {
    return (
      <div className="px-5 py-6 lg:px-8">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 mb-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-gray-200 bg-white p-4">
              <Skeleton className="mb-2 h-3 w-24" />
              <Skeleton className="h-6 w-32" />
            </div>
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <Skeleton className="mb-4 h-4 w-24" />
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="mb-3 h-4 w-full" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (!job) return null

  // Contract values — prefer current > original > legacy
  const contractValue = job.current_contract_cents ?? job.contract_amount_cents ?? job.contract_value_cents
  const originalValue = job.contract_amount_cents ?? job.contract_value_cents

  // Days remaining
  const daysLeft = daysRemaining(job.target_completion)
  const daysLeftLabel = daysLeft === null
    ? '—'
    : daysLeft < 0
    ? `${Math.abs(daysLeft)}d overdue`
    : `${daysLeft}d left`
  const daysLeftAccent = daysLeft !== null && daysLeft < 0 ? 'text-red-600' : undefined

  // Full address
  const fullAddress = [job.address_line1, job.address_line2, job.city, job.state, job.zip]
    .filter(Boolean)
    .join(', ') || job.job_address || null

  return (
    <div className="px-5 py-6 lg:px-8">
      {/* ── Metric cards ──────────────────────────────────────────── */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard
          label="Current Contract"
          value={contractValue != null ? formatMoney(contractValue) : '—'}
          sub={
            contractValue != null && originalValue != null && contractValue !== originalValue
              ? `Original: ${formatMoney(originalValue)}`
              : undefined
          }
        />
        <MetricCard label="Start Date"          value={fmtDate(job.start_date)} />
        <MetricCard label="Target Completion"   value={fmtDate(job.target_completion)} />
        <MetricCard label="Days Remaining"      value={daysLeftLabel} accent={daysLeftAccent} />
      </div>

      {/* ── Two-column detail ──────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Job details */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
              <BuildingOfficeIcon className="h-4 w-4 text-gray-400" strokeWidth={1.75} />
              Job Details
            </h2>
            {canEdit && (
              <button
                type="button"
                onClick={() => setModal({ type: 'edit-details' })}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-brand-700 transition-colors"
              >
                <PencilIcon className="h-3 w-3" strokeWidth={2} />
                Edit
              </button>
            )}
          </div>
          <div>
            <DetailRow label="Address" value={
              fullAddress
                ? <span className="flex items-start gap-1">
                    <MapPinIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" strokeWidth={1.5} />
                    {fullAddress}
                  </span>
                : null
            } />
            <DetailRow label="Package"     value={job.package_name ?? null} />
            <DetailRow label="Tags"        value={
              job.tags?.length
                ? <span className="flex flex-wrap gap-1">
                    {job.tags.map((t) => (
                      <span key={t} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{t}</span>
                    ))}
                  </span>
                : null
            } />
            <DetailRow label="Description" value={job.description?.trim() ? job.description : null} />
            <DetailRow label="Notes"       value={job.notes?.trim() ? job.notes : null} />
          </div>
        </div>

        {/* Permit + loan + inspections */}
        <div className="space-y-4">
          {/* Permit card */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-card">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                <CalendarIcon className="h-4 w-4 text-gray-400" strokeWidth={1.75} />
                Permit
              </h2>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => setModal({ type: 'permit' })}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-brand-700 transition-colors"
                >
                  <PencilIcon className="h-3 w-3" strokeWidth={2} />
                  Edit
                </button>
              )}
            </div>
            {job.permit_number ? (
              <div>
                <DetailRow label="Permit #" value={job.permit_number} />
                <DetailRow label="Issued"   value={fmtDate(job.permit_issued_date, 'long')} />
                <DetailRow label="Expires"  value={fmtDate(job.permit_expiry_date, 'long')} />
              </div>
            ) : (
              <p className="text-sm text-gray-400">
                No permit on file.
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => setModal({ type: 'permit' })}
                    className="ml-1 text-brand-600 hover:underline"
                  >
                    Add permit info
                  </button>
                )}
              </p>
            )}
          </div>

          {/* Construction loan */}
          {job.has_construction_loan && (
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-card">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
                <CurrencyDollarIcon className="h-4 w-4 text-gray-400" strokeWidth={1.75} />
                Construction Loan
              </h2>
              <div>
                <DetailRow label="Lender"       value={job.lender_name} />
                <DetailRow label="Loan Amount"  value={
                  job.loan_amount_cents != null ? formatMoney(job.loan_amount_cents) : null
                } />
              </div>
            </div>
          )}

          {/* Inspections */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-card">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                <CheckIcon className="h-4 w-4 text-gray-400" strokeWidth={1.75} />
                Inspections
              </h2>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => setModal({ type: 'add-inspection' })}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-brand-700 transition-colors"
                >
                  <PlusIcon className="h-3 w-3" strokeWidth={2.5} />
                  Add
                </button>
              )}
            </div>

            {inspections.length > 0 ? (
              <div>
                {inspections.map((insp) => (
                  <InspectionRow
                    key={insp.id}
                    inspection={insp}
                    onEdit={(i) => setModal({ type: 'edit-inspection', inspection: i })}
                    onDelete={(i) => setModal({ type: 'delete-inspection', inspection: i })}
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">
                No inspections recorded.
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => setModal({ type: 'add-inspection' })}
                    className="ml-1 text-brand-600 hover:underline"
                  >
                    Add first inspection
                  </button>
                )}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── Phases ──────────────────────────────────────────────────── */}
      {!phasesLoading && phases && phases.length > 0 && (
        <div className="mt-4 rounded-xl border border-gray-200 bg-white p-5 shadow-card">
          <h2 className="mb-4 text-sm font-semibold text-gray-900">Phase Progress</h2>
          <div>
            {phases.map((phase) => (
              <PhaseBar key={phase.id} phase={phase} />
            ))}
          </div>
        </div>
      )}

      {!phasesLoading && phases && phases.length === 0 && (
        <div className="mt-4 rounded-xl border border-dashed border-gray-200 bg-white p-6 text-center">
          <p className="text-sm font-medium text-gray-700">No phases defined</p>
          <p className="mt-1 text-xs text-gray-400">
            Go to the Schedule tab to add phases and milestones.
          </p>
        </div>
      )}

      {/* ── Modals ──────────────────────────────────────────────────── */}

      {modal.type === 'edit-details' && (
        <ProjectDetailsModal
          projectId={id!}
          jobId={job.id}
          job={job}
          onClose={() => setModal({ type: 'none' })}
          onSaved={refresh}
        />
      )}

      {modal.type === 'permit' && (
        <PermitModal
          jobId={job.id}
          initialPermitNumber={job.permit_number}
          initialIssuedDate={job.permit_issued_date}
          initialExpiryDate={job.permit_expiry_date}
          onClose={() => setModal({ type: 'none' })}
          onSaved={refresh}
        />
      )}

      {(modal.type === 'add-inspection' || modal.type === 'edit-inspection') && (
        <InspectionModal
          projectId={id!}
          tenantId={tenantId}
          userId={userId}
          inspection={modal.type === 'edit-inspection' ? modal.inspection : undefined}
          onClose={() => setModal({ type: 'none' })}
          onSaved={refresh}
        />
      )}

      {modal.type === 'delete-inspection' && (
        <DeleteConfirmModal
          label={`"${modal.inspection.inspection_type}" inspection`}
          onConfirm={() => deleteInspectionMut.mutate(modal.inspection.id)}
          onClose={() => setModal({ type: 'none' })}
          isPending={deleteInspectionMut.isPending}
        />
      )}
    </div>
  )
}
