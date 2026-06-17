import { useRef, useState } from 'react'
import { useOutletContext, useParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type {
  ProjectRow,
  ProjectChangeOrder,
  ProjectDrawRequest,
  ProjectDrawSchedule,
  ProjectInvoice,
  InvoiceTriggerMilestone,
  CreateChangeOrderInput,
  UpdateChangeOrderInput,
  CreateDrawScheduleInput,
  CreateDrawRequestInput,
} from '@indigo/shared'
import {
  formatMoney,
  createChangeOrder,
  updateChangeOrder,
  pmApproveChangeOrder,
  withdrawChangeOrder,
  createDrawSchedule,
  createDrawRequest,
  updateMilestoneInvoiceAmount,
  linkMilestoneInvoice,
  getInvoiceTriggerState,
} from '@indigo/shared'
import {
  useProjectChangeOrders,
  useProjectDrawSchedule,
  useProjectInvoices,
  useInvoiceTriggerMilestones,
} from '../useProject'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/stores/toastStore'
import { notifyPortalClients } from '@/lib/notifyPortalClients'
import { Skeleton } from '@/components/ui/Skeleton'
import {
  CheckIcon,
  ExclamationTriangleIcon,
  PencilIcon,
  PlusIcon,
  XMarkIcon,
} from '@/components/ui/Icons'

interface OutletCtx {
  project: ProjectRow | undefined
  isLoading: boolean
}

// ── Shared form helpers ────────────────────────────────────────────────────

const inputCls =
  'h-9 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm text-gray-900 ' +
  'placeholder:text-gray-400 focus:bg-white focus:border-brand-400 focus:outline-none ' +
  'focus:ring-2 focus:ring-brand-100 transition-colors'

const selectCls =
  'h-9 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm text-gray-900 ' +
  'focus:bg-white focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 transition-colors'

function Field({
  label,
  required,
  error,
  hint,
  children,
}: {
  label: string
  required?: boolean
  error?: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">
        {label}
        {required && <span className="ml-0.5 text-red-500"> *</span>}
        {hint && <span className="ml-1 text-xs font-normal text-gray-400">({hint})</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
}

function ModalShell({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string
  subtitle?: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center px-4 pb-4 sm:pb-0">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-base font-semibold text-gray-900">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
            <XMarkIcon className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtDate(s: string | null | undefined): string {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function parseDollars(s: string): number {
  const n = parseFloat(s.replace(/,/g, ''))
  return isNaN(n) ? 0 : Math.round(n * 100)
}

// ── Status configs ─────────────────────────────────────────────────────────

const CO_STATUSES = [
  { value: 'draft',            label: 'Draft'            },
  { value: 'pending_approval', label: 'Pending Approval' },
  { value: 'approved',         label: 'Approved'         },
  { value: 'rejected',         label: 'Rejected'         },
]

const CO_STATUS: Record<string, { label: string; color: string; bg: string; ring: string }> = {
  draft:            { label: 'Draft',            color: 'text-gray-600',   bg: 'bg-gray-100',   ring: 'ring-gray-200'   },
  pending_approval: { label: 'Pending Approval', color: 'text-amber-700',  bg: 'bg-amber-50',   ring: 'ring-amber-200'  },
  approved:         { label: 'Approved',         color: 'text-green-700',  bg: 'bg-green-50',   ring: 'ring-green-200'  },
  rejected:         { label: 'Rejected',         color: 'text-red-700',    bg: 'bg-red-50',     ring: 'ring-red-200'    },
  void:             { label: 'Void',             color: 'text-gray-400',   bg: 'bg-gray-50',    ring: 'ring-gray-200'   },
}

const INVOICE_STATUS: Record<string, { label: string; color: string; bg: string; ring: string }> = {
  draft:    { label: 'Draft',    color: 'text-gray-600',  bg: 'bg-gray-100',  ring: 'ring-gray-200'  },
  sent:     { label: 'Sent',     color: 'text-brand-700', bg: 'bg-brand-50',  ring: 'ring-brand-200' },
  viewed:   { label: 'Viewed',   color: 'text-brand-700', bg: 'bg-brand-50',  ring: 'ring-brand-200' },
  partial:  { label: 'Partial',  color: 'text-amber-700', bg: 'bg-amber-50',  ring: 'ring-amber-200' },
  paid:     { label: 'Paid',     color: 'text-green-700', bg: 'bg-green-50',  ring: 'ring-green-200' },
  overdue:  { label: 'Overdue',  color: 'text-red-700',   bg: 'bg-red-50',    ring: 'ring-red-200'   },
  void:     { label: 'Void',     color: 'text-gray-400',  bg: 'bg-gray-50',   ring: 'ring-gray-200'  },
}

const DRAW_STATUS: Record<string, { label: string; color: string; bg: string; ring: string }> = {
  draft:            { label: 'Draft',            color: 'text-gray-600',   bg: 'bg-gray-100',   ring: 'ring-gray-200'   },
  submitted:        { label: 'Submitted',        color: 'text-brand-700',  bg: 'bg-brand-50',   ring: 'ring-brand-200'  },
  lender_reviewing: { label: 'Lender Reviewing', color: 'text-amber-700',  bg: 'bg-amber-50',   ring: 'ring-amber-200'  },
  approved:         { label: 'Approved',         color: 'text-green-700',  bg: 'bg-green-50',   ring: 'ring-green-200'  },
  funded:           { label: 'Funded',           color: 'text-green-700',  bg: 'bg-green-50',   ring: 'ring-green-200'  },
  rejected:         { label: 'Rejected',         color: 'text-red-700',    bg: 'bg-red-50',     ring: 'ring-red-200'    },
}

function StatusBadge({ status, map }: { status: string | null; map: typeof CO_STATUS }) {
  const cfg = (status ? map[status] : null) ?? { label: status ?? '—', color: 'text-gray-500', bg: 'bg-gray-100', ring: 'ring-gray-200' }
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${cfg.bg} ${cfg.color} ${cfg.ring}`}>
      {cfg.label}
    </span>
  )
}

// ── Create CO modal ────────────────────────────────────────────────────────

function CreateCOModal({
  tenantId,
  projectId,
  jobId,
  userId,
  nextCoNumber,
  onClose,
  onSaved,
}: {
  tenantId:  string
  projectId: string
  jobId:     string
  userId:    string
  nextCoNumber: string
  onClose: () => void
  onSaved: () => void
}) {
  const toast = useToast()

  const [coNumber,          setCoNumber]          = useState(nextCoNumber)
  const [title,             setTitle]             = useState('')
  const [amountStr,         setAmountStr]         = useState('')
  const [coStatus,          setCoStatus]          = useState('draft')
  const [description,       setDescription]       = useState('')
  const [reason,            setReason]            = useState('')
  const [dateSubmitted,     setDateSubmitted]     = useState('')
  const [scheduleImpact,    setScheduleImpact]    = useState('')
  const [notes,             setNotes]             = useState('')
  const [errors,            setErrors]            = useState<Record<string, string>>({})

  const mutation = useMutation({
    mutationFn: () => {
      const input: CreateChangeOrderInput = {
        co_number:             coNumber.trim(),
        title:                 title.trim() || null,
        description:           description.trim() || null,
        amount_cents:          parseDollars(amountStr),
        co_status:             coStatus,
        date_submitted:        dateSubmitted || null,
        schedule_impact_days:  scheduleImpact ? parseInt(scheduleImpact, 10) : null,
        reason:                reason.trim() || null,
        notes:                 notes.trim() || null,
      }
      return createChangeOrder(supabase, tenantId, jobId, userId, input)
    },
    onSuccess: () => {
      toast.success('Change order created')
      if (coStatus === 'pending_approval') {
        void notifyPortalClients({
          projectId,
          tenantId,
          type:  'change_order',
          title: [coNumber.trim(), title.trim()].filter(Boolean).join(' — '),
        })
      }
      onSaved()
      onClose()
    },
    onError: (err) => {
      toast.error('Failed to create change order', err instanceof Error ? err.message : 'Try again.')
    },
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const e2: Record<string, string> = {}
    if (!coNumber.trim()) e2.coNumber = 'CO number is required'
    setErrors(e2)
    if (Object.keys(e2).length > 0) return
    mutation.mutate()
  }

  return (
    <ModalShell title="New Change Order" subtitle="Creates a CO against this job" onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          <div className="grid grid-cols-2 gap-3">
            <Field label="CO Number" required error={errors.coNumber}>
              <input type="text" value={coNumber} onChange={(e) => setCoNumber(e.target.value)}
                placeholder="CO-001" className={`${inputCls} font-mono ${errors.coNumber ? 'border-red-300 bg-red-50' : ''}`} autoFocus />
            </Field>
            <Field label="Status">
              <select value={coStatus} onChange={(e) => setCoStatus(e.target.value)} className={selectCls}>
                {CO_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Title" hint="optional">
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="Brief description" className={inputCls} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount" hint="negative for deductive">
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
                <input type="number" step="0.01" value={amountStr} onChange={(e) => setAmountStr(e.target.value)}
                  placeholder="0.00" className={`${inputCls} pl-7`} />
              </div>
            </Field>
            <Field label="Schedule Impact" hint="days, negative ok">
              <input type="number" value={scheduleImpact} onChange={(e) => setScheduleImpact(e.target.value)}
                placeholder="0" className={inputCls} />
            </Field>
          </div>

          <Field label="Date Submitted" hint="optional">
            <input type="date" value={dateSubmitted} onChange={(e) => setDateSubmitted(e.target.value)} className={inputCls} />
          </Field>

          <Field label="Description" hint="optional">
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
              placeholder="Scope of work change…"
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:bg-white focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 transition-colors resize-none" />
          </Field>

          <Field label="Reason" hint="optional">
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
              placeholder="Why this change is needed…"
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:bg-white focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 transition-colors resize-none" />
          </Field>

          <Field label="Internal Notes" hint="optional">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
              placeholder="Notes for your team…"
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:bg-white focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 transition-colors resize-none" />
          </Field>
        </div>

        <div className="flex items-center justify-end gap-3 rounded-b-2xl border-t border-gray-200 bg-gray-50 px-5 py-3">
          <button type="button" onClick={onClose} disabled={mutation.isPending}
            className="h-8 rounded-lg px-3.5 text-sm font-medium text-gray-700 hover:bg-gray-200 transition-colors disabled:opacity-50">
            Cancel
          </button>
          <button type="submit" disabled={mutation.isPending}
            className="inline-flex h-8 items-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:opacity-60">
            {mutation.isPending ? 'Creating…' : 'Create CO'}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

// ── Edit CO modal ──────────────────────────────────────────────────────────

function EditCOModal({
  co,
  tenantId,
  projectId,
  onClose,
  onSaved,
}: {
  co:        ProjectChangeOrder
  tenantId:  string
  projectId: string
  onClose:   () => void
  onSaved:   () => void
}) {
  const toast = useToast()

  const [coNumber,       setCoNumber]       = useState(co.co_number)
  const [title,          setTitle]          = useState(co.title ?? '')
  const [amountStr,      setAmountStr]      = useState(String(co.amount_cents / 100))
  const [coStatus,       setCoStatus]       = useState(co.co_status ?? 'draft')
  const [description,    setDescription]    = useState(co.description ?? '')
  const [reason,         setReason]         = useState(co.reason ?? '')
  const [dateSubmitted,  setDateSubmitted]  = useState(co.date_submitted ?? '')
  const [scheduleImpact, setScheduleImpact] = useState(co.schedule_impact_days != null ? String(co.schedule_impact_days) : '')
  const [notes,          setNotes]          = useState(co.notes ?? '')
  const [errors,         setErrors]         = useState<Record<string, string>>({})

  const mutation = useMutation({
    mutationFn: async () => {
      const isApproving = coStatus === 'approved' && co.co_status !== 'approved'

      // Save all editable fields. When approving, keep the pre-approval status
      // here so the RPC below is the single source that stamps approved_at,
      // approved_by_user_id, and writes to audit_log.
      const input: UpdateChangeOrderInput = {
        co_number:            coNumber.trim(),
        title:                title.trim() || null,
        description:          description.trim() || null,
        amount_cents:         parseDollars(amountStr),
        co_status:            isApproving ? (co.co_status ?? 'draft') : coStatus,
        date_submitted:       dateSubmitted || null,
        schedule_impact_days: scheduleImpact ? parseInt(scheduleImpact, 10) : null,
        reason:               reason.trim() || null,
        notes:                notes.trim() || null,
      }
      await updateChangeOrder(supabase, co.id, input)

      if (isApproving) {
        await pmApproveChangeOrder(supabase, co.id)
      }
    },
    onSuccess: () => {
      toast.success('Change order updated')
      if (coStatus === 'pending_approval' && co.co_status !== 'pending_approval') {
        // Only notify when status is newly moved to pending_approval
        void notifyPortalClients({
          projectId,
          tenantId,
          type:  'change_order',
          title: [coNumber.trim(), title.trim()].filter(Boolean).join(' — '),
        })
      }
      onSaved()
      onClose()
    },
    onError: (err) => {
      toast.error('Failed to update change order', err instanceof Error ? err.message : 'Try again.')
    },
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const e2: Record<string, string> = {}
    if (!coNumber.trim()) e2.coNumber = 'CO number is required'
    setErrors(e2)
    if (Object.keys(e2).length > 0) return
    mutation.mutate()
  }

  return (
    <ModalShell title={`Edit ${co.co_number}`} subtitle="Update this change order" onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          <div className="grid grid-cols-2 gap-3">
            <Field label="CO Number" required error={errors.coNumber}>
              <input type="text" value={coNumber} onChange={(e) => setCoNumber(e.target.value)}
                placeholder="CO-001" className={`${inputCls} font-mono ${errors.coNumber ? 'border-red-300 bg-red-50' : ''}`} autoFocus />
            </Field>
            <Field label="Status">
              <select value={coStatus} onChange={(e) => setCoStatus(e.target.value)} className={selectCls}>
                {CO_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Title" hint="optional">
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="Brief description" className={inputCls} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount" hint="negative for deductive">
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
                <input type="number" step="0.01" value={amountStr} onChange={(e) => setAmountStr(e.target.value)}
                  placeholder="0.00" className={`${inputCls} pl-7`} />
              </div>
            </Field>
            <Field label="Schedule Impact" hint="days, negative ok">
              <input type="number" value={scheduleImpact} onChange={(e) => setScheduleImpact(e.target.value)}
                placeholder="0" className={inputCls} />
            </Field>
          </div>

          <Field label="Date Submitted" hint="optional">
            <input type="date" value={dateSubmitted} onChange={(e) => setDateSubmitted(e.target.value)} className={inputCls} />
          </Field>

          <Field label="Description" hint="optional">
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
              placeholder="Scope of work change…"
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:bg-white focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 transition-colors resize-none" />
          </Field>

          <Field label="Reason" hint="optional">
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
              placeholder="Why this change is needed…"
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:bg-white focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 transition-colors resize-none" />
          </Field>

          <Field label="Internal Notes" hint="optional">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
              placeholder="Notes for your team…"
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:bg-white focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 transition-colors resize-none" />
          </Field>
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

// ── Create draw schedule modal ─────────────────────────────────────────────

function CreateDrawScheduleModal({
  tenantId,
  jobId,
  onClose,
  onSaved,
}: {
  tenantId: string
  jobId: string
  onClose: () => void
  onSaved: () => void
}) {
  const toast = useToast()

  const [lenderName,    setLenderName]    = useState('')
  const [lenderContact, setLenderContact] = useState('')
  const [lenderEmail,   setLenderEmail]   = useState('')
  const [loanAmtStr,    setLoanAmtStr]    = useState('')
  const [holdbackPct,   setHoldbackPct]   = useState('10')

  const mutation = useMutation({
    mutationFn: () => {
      const input: CreateDrawScheduleInput = {
        lender_name:       lenderName.trim()    || null,
        lender_contact:    lenderContact.trim() || null,
        lender_email:      lenderEmail.trim()   || null,
        loan_amount_cents: loanAmtStr ? parseDollars(loanAmtStr) : null,
        holdback_pct:      parseFloat(holdbackPct) || 10,
      }
      return createDrawSchedule(supabase, tenantId, jobId, input)
    },
    onSuccess: () => {
      toast.success('Draw schedule created')
      onSaved()
      onClose()
    },
    onError: (err) => {
      toast.error('Failed to create draw schedule', err instanceof Error ? err.message : 'Try again.')
    },
  })

  return (
    <ModalShell title="Set Up Draw Schedule" subtitle="Records lender details for construction loan draw tracking" onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); mutation.mutate() }} className="flex flex-col flex-1 min-h-0">
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          <Field label="Lender Name" hint="optional">
            <input type="text" value={lenderName} onChange={(e) => setLenderName(e.target.value)}
              placeholder="First National Bank" className={inputCls} autoFocus />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Contact Name" hint="optional">
              <input type="text" value={lenderContact} onChange={(e) => setLenderContact(e.target.value)}
                placeholder="Jane Smith" className={inputCls} />
            </Field>
            <Field label="Contact Email" hint="optional">
              <input type="email" value={lenderEmail} onChange={(e) => setLenderEmail(e.target.value)}
                placeholder="jane@bank.com" className={inputCls} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Loan Amount" hint="optional">
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
                <input type="number" min="0" step="0.01" value={loanAmtStr} onChange={(e) => setLoanAmtStr(e.target.value)}
                  placeholder="0.00" className={`${inputCls} pl-7`} />
              </div>
            </Field>
            <Field label="Holdback %" hint="default 10%">
              <div className="relative">
                <input type="number" min="0" max="100" step="0.5" value={holdbackPct}
                  onChange={(e) => setHoldbackPct(e.target.value)} className={`${inputCls} pr-7`} />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">%</span>
              </div>
            </Field>
          </div>

          <p className="rounded-lg bg-brand-50 px-4 py-3 text-xs text-brand-700">
            After setting up the schedule you can submit individual draw requests against it.
          </p>
        </div>

        <div className="flex items-center justify-end gap-3 rounded-b-2xl border-t border-gray-200 bg-gray-50 px-5 py-3">
          <button type="button" onClick={onClose} disabled={mutation.isPending}
            className="h-8 rounded-lg px-3.5 text-sm font-medium text-gray-700 hover:bg-gray-200 transition-colors disabled:opacity-50">
            Cancel
          </button>
          <button type="submit" disabled={mutation.isPending}
            className="inline-flex h-8 items-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:opacity-60">
            {mutation.isPending ? 'Creating…' : 'Create Schedule'}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

// ── Submit draw request modal ──────────────────────────────────────────────

function SubmitDrawModal({
  tenantId,
  jobId,
  userId,
  scheduleId,
  nextDrawNumber,
  onClose,
  onSaved,
}: {
  tenantId: string
  jobId: string
  userId: string
  scheduleId: string
  nextDrawNumber: number
  onClose: () => void
  onSaved: () => void
}) {
  const toast = useToast()

  const [amountStr,    setAmountStr]    = useState('')
  const [pctComplete,  setPctComplete]  = useState('')
  const [notes,        setNotes]        = useState('')
  const [submitNow,    setSubmitNow]    = useState(true)
  const [amountError,  setAmountError]  = useState('')

  const mutation = useMutation({
    mutationFn: () => {
      const input: CreateDrawRequestInput = {
        number:                   nextDrawNumber,
        amount_requested_cents:   parseDollars(amountStr),
        percent_complete_at_draw: pctComplete ? parseInt(pctComplete, 10) : null,
        notes:                    notes.trim() || null,
        submit_now:               submitNow,
      }
      return createDrawRequest(supabase, tenantId, jobId, scheduleId, userId, input)
    },
    onSuccess: () => {
      toast.success(submitNow ? 'Draw request submitted' : 'Draw request saved as draft')
      onSaved()
      onClose()
    },
    onError: (err) => {
      toast.error('Failed to submit draw', err instanceof Error ? err.message : 'Try again.')
    },
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!amountStr || parseDollars(amountStr) <= 0) {
      setAmountError('Amount is required')
      return
    }
    setAmountError('')
    mutation.mutate()
  }

  return (
    <ModalShell
      title={`Draw #${nextDrawNumber}`}
      subtitle="Submit a draw request against the construction loan"
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          <Field label="Amount Requested" required error={amountError}>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
              <input type="number" min="0" step="0.01" value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                placeholder="0.00" className={`${inputCls} pl-7 ${amountError ? 'border-red-300 bg-red-50' : ''}`}
                autoFocus />
            </div>
          </Field>

          <Field label="% Complete at Draw" hint="optional">
            <div className="relative">
              <input type="number" min="0" max="100" value={pctComplete}
                onChange={(e) => setPctComplete(e.target.value)}
                placeholder="e.g. 45" className={`${inputCls} pr-7`} />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">%</span>
            </div>
          </Field>

          <Field label="Notes" hint="optional">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
              placeholder="Work completed since last draw…"
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:bg-white focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 transition-colors resize-none" />
          </Field>

          {/* Submit vs draft toggle */}
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-gray-800">Submit to lender now</p>
              <p className="text-xs text-gray-500">Sets status to Submitted and records submission timestamp</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={submitNow}
              onClick={() => setSubmitNow(!submitNow)}
              className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${submitNow ? 'bg-brand-600' : 'bg-gray-300'}`}
            >
              <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${submitNow ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </button>
          </label>
        </div>

        <div className="flex items-center justify-end gap-3 rounded-b-2xl border-t border-gray-200 bg-gray-50 px-5 py-3">
          <button type="button" onClick={onClose} disabled={mutation.isPending}
            className="h-8 rounded-lg px-3.5 text-sm font-medium text-gray-700 hover:bg-gray-200 transition-colors disabled:opacity-50">
            Cancel
          </button>
          <button type="submit" disabled={mutation.isPending}
            className="inline-flex h-8 items-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:opacity-60">
            {mutation.isPending
              ? 'Saving…'
              : submitNow ? 'Submit Draw' : 'Save as Draft'}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

// ── Contract Summary ───────────────────────────────────────────────────────

function ContractSummary({
  job,
  changeOrders,
  invoices,
}: {
  job: ProjectRow['job']
  changeOrders: ProjectChangeOrder[]
  invoices: ProjectInvoice[]
}) {
  const original = job?.contract_value_cents ?? job?.contract_amount_cents ?? null

  const approvedCOs = changeOrders
    .filter((co) => co.co_status === 'approved')
    .reduce((sum, co) => sum + co.amount_cents, 0)

  // Current contract = original + all approved COs (not the stale DB cache column)
  const current = original != null ? original + approvedCOs : null

  const totalBilled = invoices.reduce((s, i) => s + i.total_cents, 0)
  const billedPct   = current && current > 0 ? Math.round((totalBilled / current) * 100) : 0

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-card">
      <div className="border-b border-gray-100 px-5 py-4">
        <h2 className="text-sm font-semibold text-gray-900">Contract Summary</h2>
      </div>

      <div className="grid grid-cols-2 gap-px bg-gray-100 lg:grid-cols-4">
        {[
          { label: 'Original Contract', value: original != null ? formatMoney(original) : '—' },
          { label: 'Approved COs',      value: approvedCOs !== 0 ? `${approvedCOs >= 0 ? '+' : ''}${formatMoney(approvedCOs)}` : '—', highlight: approvedCOs > 0 },
          { label: 'Current Contract',  value: current != null ? formatMoney(current) : '—', primary: true },
          { label: 'Billed to Date',    value: totalBilled > 0 ? formatMoney(totalBilled) : '—' },
        ].map((item) => (
          <div key={item.label} className="bg-white px-5 py-4">
            <p className="text-xs font-medium text-gray-500">{item.label}</p>
            <p className={`mt-1 text-xl font-semibold tabular-nums ${
              item.primary   ? 'text-gray-900' :
              item.highlight ? 'text-green-700' :
                               'text-gray-700'
            }`}>
              {item.value}
            </p>
          </div>
        ))}
      </div>

      {current && current > 0 && (
        <div className="border-t border-gray-100 px-5 py-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs text-gray-500">Billed progress</span>
            <span className="text-xs font-medium text-gray-700">{billedPct}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
            <div className="h-full rounded-full bg-brand-500 transition-all duration-500" style={{ width: `${billedPct}%` }} />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Change Orders ──────────────────────────────────────────────────────────

const CO_EDITABLE = new Set(['draft', 'pending_approval'])

function ChangeOrdersSection({
  changeOrders,
  onAdd,
  onEdit,
  onWithdraw,
  withdrawingId,
}: {
  changeOrders: ProjectChangeOrder[]
  onAdd: () => void
  onEdit: (co: ProjectChangeOrder) => void
  onWithdraw: (co: ProjectChangeOrder) => void
  withdrawingId: string | null
}) {
  const total = changeOrders.reduce((sum, co) => sum + co.amount_cents, 0)

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-card">
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-gray-900">Change Orders</h2>
          {changeOrders.length > 0 && (
            <span className="text-xs text-gray-500">
              {changeOrders.length} CO{changeOrders.length !== 1 ? 's' : ''}
              {total !== 0 && (
                <span className={`ml-1 font-medium ${total >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  · {total >= 0 ? '+' : ''}{formatMoney(total)}
                </span>
              )}
            </span>
          )}
        </div>
        <button
          onClick={onAdd}
          className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 shadow-sm hover:bg-gray-50 hover:border-brand-300 hover:text-brand-700 transition-colors"
        >
          <PlusIcon className="h-3 w-3" strokeWidth={2.5} />
          New CO
        </button>
      </div>

      {changeOrders.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <p className="text-sm text-gray-400">No change orders on this project.</p>
          <button onClick={onAdd}
            className="mt-3 text-xs font-medium text-brand-600 hover:text-brand-700 transition-colors">
            + Create the first change order
          </button>
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {changeOrders.map((co) => {
            const isEditable   = CO_EDITABLE.has(co.co_status ?? '')
            const isPending    = co.co_status === 'pending_approval'
            const isWithdrawing = withdrawingId === co.id

            return (
              <div key={co.id} className="flex items-start gap-4 px-5 py-4 group">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-gray-500">{co.co_number}</span>
                    <span className="text-sm font-medium text-gray-900 truncate">
                      {co.title ?? co.description ?? '—'}
                    </span>
                    <StatusBadge status={co.co_status} map={CO_STATUS} />
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-3">
                    {co.schedule_impact_days != null && co.schedule_impact_days !== 0 && (
                      <p className="text-xs text-gray-400">
                        {co.schedule_impact_days > 0 ? '+' : ''}{co.schedule_impact_days} day schedule impact
                      </p>
                    )}
                    {co.approved_at && (
                      <p className="text-xs text-gray-400">Approved {fmtDate(co.approved_at)}</p>
                    )}
                    {/* Withdraw button — only for pending_approval */}
                    {isPending && (
                      <button
                        onClick={() => onWithdraw(co)}
                        disabled={isWithdrawing}
                        className="text-xs font-medium text-amber-600 hover:text-amber-700 transition-colors disabled:opacity-50"
                      >
                        {isWithdrawing ? 'Withdrawing…' : 'Withdraw to draft'}
                      </button>
                    )}
                  </div>
                </div>

                <div className="shrink-0 flex items-start gap-2">
                  {/* Edit button — draft and pending_approval */}
                  {isEditable && (
                    <button
                      onClick={() => onEdit(co)}
                      className="rounded p-1 text-gray-300 opacity-0 group-hover:opacity-100 hover:bg-gray-100 hover:text-gray-600 transition-all"
                      title="Edit change order"
                    >
                      <PencilIcon className="h-3.5 w-3.5" strokeWidth={2} />
                    </button>
                  )}
                  <div className="text-right">
                    <p className={`text-sm font-semibold tabular-nums ${
                      co.amount_cents >= 0 ? 'text-gray-900' : 'text-red-700'
                    }`}>
                      {co.amount_cents >= 0 ? '+' : ''}{formatMoney(co.amount_cents)}
                    </p>
                    {co.date_submitted && (
                      <p className="text-xs text-gray-400">{fmtDate(co.date_submitted)}</p>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Draw Schedule ──────────────────────────────────────────────────────────

function DrawScheduleSection({
  schedule,
  jobHasLoan,
  onSetUpSchedule,
  onSubmitDraw,
}: {
  schedule: ProjectDrawSchedule | null
  jobHasLoan: boolean
  onSetUpSchedule: () => void
  onSubmitDraw: () => void
}) {
  // Only show this section if job is flagged for construction loan OR a schedule already exists
  if (!jobHasLoan && !schedule) return null

  const draws      = schedule ? [...schedule.draw_requests].sort((a, b) => a.number - b.number) : []
  const totalFunded = draws.reduce((s, d) => s + d.amount_funded_cents, 0)
  const loanAmt    = schedule?.loan_amount_cents ?? null
  const holdbackPct = schedule?.holdback_pct ?? 10
  const holdbackAmt = loanAmt != null ? Math.round(loanAmt * holdbackPct / 100) : null
  const netLoan    = loanAmt != null && holdbackAmt != null ? loanAmt - holdbackAmt : null
  const fundedPct  = netLoan && netLoan > 0 ? Math.round((totalFunded / netLoan) * 100) : 0

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-card">
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
        <h2 className="text-sm font-semibold text-gray-900">Construction Loan &amp; Draws</h2>
        {schedule ? (
          <button
            onClick={onSubmitDraw}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 shadow-sm hover:bg-gray-50 hover:border-brand-300 hover:text-brand-700 transition-colors"
          >
            <PlusIcon className="h-3 w-3" strokeWidth={2.5} />
            Submit Draw
          </button>
        ) : (
          <button
            onClick={onSetUpSchedule}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 shadow-sm hover:bg-gray-50 hover:border-brand-300 hover:text-brand-700 transition-colors"
          >
            <PlusIcon className="h-3 w-3" strokeWidth={2.5} />
            Set Up Schedule
          </button>
        )}
      </div>

      {/* Lender info */}
      {schedule && (
        <div className="grid grid-cols-2 gap-px bg-gray-100 border-b border-gray-100 lg:grid-cols-4">
          {[
            { label: 'Lender',      value: schedule.lender_name    ?? '—' },
            { label: 'Contact',     value: schedule.lender_contact ?? '—' },
            { label: 'Loan Amount', value: loanAmt != null ? formatMoney(loanAmt) : '—' },
            { label: `Holdback (${holdbackPct}%)`, value: holdbackAmt != null ? formatMoney(holdbackAmt) : '—' },
          ].map((item) => (
            <div key={item.label} className="bg-white px-5 py-3">
              <p className="text-xs font-medium text-gray-500">{item.label}</p>
              <p className="mt-0.5 text-sm font-semibold text-gray-800 truncate">{item.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Funded progress */}
      {netLoan && netLoan > 0 && (
        <div className="border-b border-gray-100 px-5 py-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs text-gray-500">
              Funded: {formatMoney(totalFunded)} of {formatMoney(netLoan)} net loan
            </span>
            <span className="text-xs font-medium text-gray-700">{fundedPct}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
            <div className="h-full rounded-full bg-green-500 transition-all duration-500" style={{ width: `${fundedPct}%` }} />
          </div>
        </div>
      )}

      {/* Draw requests */}
      {!schedule ? (
        <div className="px-5 py-10 text-center">
          <p className="text-sm text-gray-400">No draw schedule set up yet.</p>
          <button onClick={onSetUpSchedule}
            className="mt-3 text-xs font-medium text-brand-600 hover:text-brand-700 transition-colors">
            + Set up draw schedule
          </button>
        </div>
      ) : draws.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <p className="text-sm text-gray-400">No draw requests submitted yet.</p>
          <button onClick={onSubmitDraw}
            className="mt-3 text-xs font-medium text-brand-600 hover:text-brand-700 transition-colors">
            + Submit first draw
          </button>
        </div>
      ) : (
        <>
          <div className="hidden grid-cols-5 gap-4 border-b border-gray-100 px-5 py-2 lg:grid">
            {['Draw #', 'Requested', 'Approved', 'Funded', 'Status'].map((h) => (
              <p key={h} className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{h}</p>
            ))}
          </div>
          <div className="divide-y divide-gray-100">
            {draws.map((draw) => <DrawRow key={draw.id} draw={draw} />)}
          </div>
        </>
      )}
    </div>
  )
}

function DrawRow({ draw }: { draw: ProjectDrawRequest }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1 px-5 py-3 lg:grid-cols-5 lg:items-center">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-gray-700">Draw #{draw.number}</span>
      </div>
      <div className="text-right lg:text-left">
        <StatusBadge status={draw.status} map={DRAW_STATUS} />
      </div>
      <div className="col-span-2 mt-1 grid grid-cols-3 gap-2 lg:col-span-3 lg:mt-0 lg:grid-cols-3">
        {[
          { label: 'Requested', value: formatMoney(draw.amount_requested_cents) },
          { label: 'Approved',  value: draw.amount_approved_cents > 0 ? formatMoney(draw.amount_approved_cents) : '—' },
          { label: 'Funded',    value: draw.amount_funded_cents  > 0 ? formatMoney(draw.amount_funded_cents)  : '—' },
        ].map((item) => (
          <div key={item.label}>
            <p className="text-[10px] text-gray-400 lg:hidden">{item.label}</p>
            <p className="text-sm font-medium tabular-nums text-gray-800">{item.value}</p>
          </div>
        ))}
      </div>
      {draw.funded_at && (
        <p className="col-span-2 text-xs text-gray-400 lg:col-span-5">
          Funded {fmtDate(draw.funded_at)}
          {draw.percent_complete_at_draw != null && ` · ${draw.percent_complete_at_draw}% complete at draw`}
        </p>
      )}
      {draw.notes && (
        <p className="col-span-2 text-xs text-gray-500 lg:col-span-5 italic">{draw.notes}</p>
      )}
    </div>
  )
}

// ── Invoices ───────────────────────────────────────────────────────────────

// ── Invoice milestones section ─────────────────────────────────────────────

const TRIGGER_STATE_CFG = {
  pending:  { label: 'Pending',           cls: 'bg-gray-100 text-gray-500'  },
  ready:    { label: 'Ready to Invoice',  cls: 'bg-amber-50 text-amber-700' },
  invoiced: { label: 'Invoiced',          cls: 'bg-green-50 text-green-700' },
}

/** Inline-editable dollar amount cell. Shows formatted value; pencil opens an input. */
function AmountCell({
  milestoneId,
  tenantId,
  amountCents,
  canEdit,
  onSaved,
}: {
  milestoneId: string
  tenantId:    string
  amountCents: number | null
  canEdit:     boolean
  onSaved:     () => void
}) {
  const toast       = useToast()
  const [editing, setEditing] = useState(false)
  const [draft,   setDraft]   = useState('')
  const inputRef  = useRef<HTMLInputElement>(null)

  const mutation = useMutation({
    mutationFn: (cents: number | null) =>
      updateMilestoneInvoiceAmount(supabase, milestoneId, tenantId, cents),
    onSuccess: () => { onSaved(); setEditing(false) },
    onError: (err) => {
      toast.error('Failed to save amount', err instanceof Error ? err.message : 'Try again.')
    },
  })

  function startEdit() {
    setDraft(amountCents != null ? (amountCents / 100).toFixed(2) : '')
    setEditing(true)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  function commit() {
    if (draft.trim() === '') {
      mutation.mutate(null)
    } else {
      const n = parseFloat(draft.replace(/,/g, ''))
      if (isNaN(n) || n < 0) { setEditing(false); return }
      mutation.mutate(Math.round(n * 100))
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter')  { e.preventDefault(); commit() }
    if (e.key === 'Escape') { setEditing(false) }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <span className="text-gray-400 text-sm">$</span>
        <input
          ref={inputRef}
          type="number"
          step="0.01"
          min="0"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={handleKeyDown}
          disabled={mutation.isPending}
          className="w-24 rounded-lg border border-brand-400 bg-white px-2 py-1 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-100 tabular-nums"
          placeholder="0.00"
        />
      </div>
    )
  }

  return (
    <div className="group/amt flex items-center gap-1.5">
      <span className={`text-sm tabular-nums font-medium ${amountCents != null ? 'text-gray-900' : 'text-gray-400'}`}>
        {amountCents != null ? formatMoney(amountCents) : '—'}
      </span>
      {canEdit && (
        <button
          type="button"
          onClick={startEdit}
          className="opacity-0 group-hover/amt:opacity-100 rounded p-0.5 text-gray-400 hover:text-brand-600 transition-opacity"
          title="Edit amount"
        >
          <PencilIcon className="h-3 w-3" strokeWidth={2} />
        </button>
      )}
    </div>
  )
}

// ── Link Invoice Modal ─────────────────────────────────────────────────────
// Lets PM select which BB invoice corresponds to a ready milestone.

function LinkInvoiceModal({
  milestone,
  tenantId,
  invoices,
  onClose,
  onLinked,
}: {
  milestone: InvoiceTriggerMilestone
  tenantId:  string
  invoices:  ProjectInvoice[]
  onClose:   () => void
  onLinked:  () => void
}) {
  const toast    = useToast()
  const [selected, setSelected] = useState<string>('')

  const mutation = useMutation({
    mutationFn: () => linkMilestoneInvoice(supabase, milestone.id, tenantId, selected || null),
    onSuccess: () => {
      toast.success('Invoice linked.')
      onLinked()
      onClose()
    },
    onError: (err) => {
      toast.error('Failed to link invoice', err instanceof Error ? err.message : 'Try again.')
    },
  })

  // Unlink (clear) mutation
  const unlinkMut = useMutation({
    mutationFn: () => linkMilestoneInvoice(supabase, milestone.id, tenantId, null),
    onSuccess: () => {
      toast.success('Invoice unlinked.')
      onLinked()
      onClose()
    },
    onError: (err) => {
      toast.error('Failed to unlink', err instanceof Error ? err.message : 'Try again.')
    },
  })

  const isLinked = !!milestone.linked_invoice_id

  return (
    <ModalShell
      title={isLinked ? 'Change Invoice Link' : 'Link Invoice'}
      subtitle={milestone.name}
      onClose={onClose}
    >
      <div className="flex flex-col flex-1 min-h-0">
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <p className="text-sm text-gray-500">
            Select the BB invoice that was raised for this milestone.
            Indigo uses this link to mark the milestone as <strong>Invoiced</strong>.
          </p>

          {invoices.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-200 py-8 text-center">
              <p className="text-sm text-gray-400">No invoices found for this job yet.</p>
              <p className="mt-1 text-xs text-gray-400">Create the invoice in BB first, then come back here.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {invoices.map((inv) => {
                const invStatusCfg = INVOICE_STATUS[inv.invoice_status ?? '']
                const isChecked = selected === inv.id
                return (
                  <label
                    key={inv.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-colors ${
                      isChecked
                        ? 'border-brand-400 bg-brand-50 ring-1 ring-brand-200'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="invoice"
                      value={inv.id}
                      checked={isChecked}
                      onChange={() => setSelected(inv.id)}
                      className="accent-brand-600"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-gray-900">{inv.invoice_number}</span>
                        {invStatusCfg && (
                          <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${invStatusCfg.bg} ${invStatusCfg.color}`}>
                            {invStatusCfg.label}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500">
                        {fmtDate(inv.invoice_date)} · {formatMoney(inv.total_cents)}
                        {inv.balance_due_cents > 0 && ` · ${formatMoney(inv.balance_due_cents)} balance`}
                      </p>
                    </div>
                    {isChecked && <CheckIcon className="h-4 w-4 text-brand-600 shrink-0" strokeWidth={2.5} />}
                  </label>
                )
              })}
            </div>
          )}

          {isLinked && (
            <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3 text-xs text-gray-500">
              Currently linked to: <strong>{milestone.invoice_number}</strong>
              <button
                type="button"
                onClick={() => unlinkMut.mutate()}
                disabled={unlinkMut.isPending}
                className="ml-3 text-red-500 hover:text-red-600 font-medium disabled:opacity-50"
              >
                {unlinkMut.isPending ? 'Removing…' : 'Remove link'}
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 rounded-b-2xl border-t border-gray-200 bg-gray-50 px-5 py-3">
          <button type="button" onClick={onClose} disabled={mutation.isPending}
            className="h-8 rounded-lg px-3.5 text-sm font-medium text-gray-700 hover:bg-gray-200 transition-colors disabled:opacity-50">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={!selected || mutation.isPending}
            className="inline-flex h-8 items-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:opacity-60"
          >
            {mutation.isPending ? 'Linking…' : 'Link Invoice'}
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

function InvoiceMilestonesSection({
  milestones,
  invoices,
  tenantId,
  canEdit,
  onRefresh,
}: {
  milestones: InvoiceTriggerMilestone[]
  invoices:   ProjectInvoice[]
  tenantId:   string
  canEdit:    boolean
  onRefresh:  () => void
}) {
  const [linkingMilestone, setLinkingMilestone] = useState<InvoiceTriggerMilestone | null>(null)

  const totalConfigured = milestones.reduce((s, m) => s + (m.invoice_amount_cents ?? 0), 0)
  const readyMilestones = milestones.filter((m) => getInvoiceTriggerState(m) === 'ready')
  const readyAmount     = readyMilestones.reduce((s, m) => s + (m.invoice_amount_cents ?? 0), 0)
  const invoicedAmount  = milestones
    .filter((m) => getInvoiceTriggerState(m) === 'invoiced')
    .reduce((s, m) => s + (m.invoice_amount_cents ?? 0), 0)

  const missingAmount   = milestones.some((m) => m.invoice_amount_cents == null)

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Invoice Milestones</h2>
          <p className="mt-0.5 text-xs text-gray-400">
            {milestones.length} milestone{milestones.length !== 1 ? 's' : ''} flagged to trigger invoicing
          </p>
        </div>
        {readyMilestones.length > 0 && (
          <div className="flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5">
            <ExclamationTriangleIcon className="h-3.5 w-3.5 text-amber-500" strokeWidth={2} />
            <span className="text-xs font-medium text-amber-700">
              {readyMilestones.length} ready to invoice
            </span>
          </div>
        )}
      </div>

      {/* Summary strip */}
      {milestones.length > 0 && (
        <div className="grid grid-cols-3 divide-x divide-gray-100 border-b border-gray-100">
          {[
            { label: 'Configured',        value: totalConfigured, warn: missingAmount },
            { label: 'Ready to Invoice',  value: readyAmount,     highlight: readyMilestones.length > 0 },
            { label: 'Already Invoiced',  value: invoicedAmount   },
          ].map(({ label, value, warn, highlight }) => (
            <div key={label} className="px-5 py-3 text-center">
              <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400">{label}</p>
              <p className={`mt-1 text-base font-semibold tabular-nums ${
                highlight ? 'text-amber-700' : 'text-gray-900'
              }`}>
                {formatMoney(value)}
              </p>
              {warn && (
                <p className="mt-0.5 text-[10px] text-amber-600">some amounts not set</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Milestone rows */}
      {milestones.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <p className="text-sm text-gray-400">
            No milestones are flagged to trigger invoicing.
          </p>
          <p className="mt-1 text-xs text-gray-400">
            Set "Triggers invoice" on a milestone in the Schedule tab.
          </p>
        </div>
      ) : (
        <>
          {/* Column headers */}
          <div className="hidden grid-cols-12 gap-4 border-b border-gray-100 px-5 py-2 lg:grid">
            {['Milestone', 'Due', 'Status', 'Amount', 'Invoice'].map((h) => (
              <p key={h} className={`text-[11px] font-semibold uppercase tracking-wider text-gray-400 ${
                h === 'Milestone' ? 'col-span-4' :
                h === 'Amount'   ? 'col-span-2' :
                h === 'Invoice'  ? 'col-span-2' :
                                   'col-span-2'
              }`}>{h}</p>
            ))}
          </div>

          <div className="divide-y divide-gray-100">
            {milestones.map((m) => {
              const state    = getInvoiceTriggerState(m)
              const stateCfg = TRIGGER_STATE_CFG[state]
              const isReady  = state === 'ready'

              return (
                <div
                  key={m.id}
                  className={`grid grid-cols-2 gap-x-4 gap-y-1.5 px-5 py-3.5 lg:grid-cols-12 lg:items-center ${
                    isReady ? 'border-l-2 border-amber-400 bg-amber-50/30' : ''
                  }`}
                >
                  {/* Name */}
                  <div className="col-span-2 lg:col-span-4">
                    <p className="text-sm font-medium text-gray-900 truncate">{m.name}</p>
                    {m.due_date && (
                      <p className="text-xs text-gray-400 lg:hidden">
                        Due {new Date(m.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </p>
                    )}
                  </div>

                  {/* Due date (desktop) */}
                  <div className="hidden lg:col-span-2 lg:block">
                    <p className="text-sm text-gray-500">
                      {m.due_date
                        ? new Date(m.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
                        : '—'}
                    </p>
                  </div>

                  {/* Milestone status */}
                  <div className="lg:col-span-2">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${stateCfg.cls}`}>
                      {state === 'invoiced' && <CheckIcon className="mr-1 h-2.5 w-2.5" strokeWidth={2.5} />}
                      {stateCfg.label}
                    </span>
                  </div>

                  {/* Amount */}
                  <div className="lg:col-span-2">
                    <AmountCell
                      milestoneId={m.id}
                      tenantId={tenantId}
                      amountCents={m.invoice_amount_cents}
                      canEdit={canEdit && state !== 'invoiced'}
                      onSaved={onRefresh}
                    />
                  </div>

                  {/* Invoice link */}
                  <div className="col-span-2 lg:col-span-2">
                    {m.invoice_number ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium text-gray-700">{m.invoice_number}</span>
                        <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                          INVOICE_STATUS[m.invoice_status ?? '']?.bg ?? 'bg-gray-100'
                        } ${INVOICE_STATUS[m.invoice_status ?? '']?.color ?? 'text-gray-500'}`}>
                          {INVOICE_STATUS[m.invoice_status ?? '']?.label ?? m.invoice_status}
                        </span>
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => setLinkingMilestone(m)}
                            className="ml-1 rounded p-0.5 text-gray-300 hover:text-brand-500 transition-colors"
                            title="Change linked invoice"
                          >
                            <PencilIcon className="h-3 w-3" strokeWidth={2} />
                          </button>
                        )}
                      </div>
                    ) : isReady && canEdit ? (
                      <button
                        type="button"
                        onClick={() => setLinkingMilestone(m)}
                        className="rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 transition-colors"
                      >
                        Link Invoice
                      </button>
                    ) : isReady ? (
                      <span className="text-xs font-medium text-amber-600">Awaiting invoice</span>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {canEdit && (
            <div className="border-t border-gray-100 bg-gray-50 px-5 py-2.5">
              <p className="text-xs text-gray-400">
                Click an amount to edit. Use <strong>Link Invoice</strong> on ready milestones to mark them as invoiced once BB raises the invoice.
              </p>
            </div>
          )}
        </>
      )}

      {/* Link invoice modal */}
      {linkingMilestone && (
        <LinkInvoiceModal
          milestone={linkingMilestone}
          tenantId={tenantId}
          invoices={invoices}
          onClose={() => setLinkingMilestone(null)}
          onLinked={onRefresh}
        />
      )}
    </div>
  )
}

function InvoicesSection({ invoices }: { invoices: ProjectInvoice[] }) {
  const totalBilled  = invoices.reduce((s, i) => s + i.total_cents, 0)
  const totalPaid    = invoices.reduce((s, i) => s + i.amount_paid_cents, 0)
  const totalBalance = invoices.reduce((s, i) => s + i.balance_due_cents, 0)
  const overdueCount = invoices.filter((i) => i.invoice_status === 'overdue').length

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-card">
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
        <h2 className="text-sm font-semibold text-gray-900">Invoices</h2>
        {overdueCount > 0 && (
          <div className="flex items-center gap-1.5 rounded-lg bg-red-50 px-2.5 py-1.5">
            <ExclamationTriangleIcon className="h-3.5 w-3.5 text-red-500" strokeWidth={2} />
            <span className="text-xs font-medium text-red-700">{overdueCount} overdue</span>
          </div>
        )}
      </div>

      {invoices.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <p className="text-sm text-gray-400">No invoices on this project yet.</p>
        </div>
      ) : (
        <>
          <div className="hidden grid-cols-5 gap-4 border-b border-gray-100 px-5 py-2 lg:grid">
            {['Invoice', 'Date', 'Total', 'Paid', 'Balance'].map((h) => (
              <p key={h} className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{h}</p>
            ))}
          </div>

          <div className="divide-y divide-gray-100">
            {invoices.map((inv) => (
              // Desktop: 5 explicit cols → INVOICE | DATE | TOTAL | PAID | BALANCE
              // Mobile:  2 cols — invoice+date on top row, money summary below
              <div key={inv.id} className="grid grid-cols-2 gap-x-4 gap-y-1 px-5 py-3 lg:grid-cols-5 lg:items-center">

                {/* Col 1 — INVOICE: number + status badge */}
                <div>
                  <p className="text-sm font-semibold text-gray-800">{inv.invoice_number}</p>
                  <div className="mt-0.5">
                    <StatusBadge status={inv.invoice_status} map={INVOICE_STATUS} />
                  </div>
                </div>

                {/* Col 2 — DATE */}
                <div className="text-right lg:text-left">
                  <p className="text-sm text-gray-700">{fmtDate(inv.invoice_date)}</p>
                  {inv.due_date && (
                    <p className="text-[10px] text-gray-400">Due {fmtDate(inv.due_date)}</p>
                  )}
                </div>

                {/* Cols 3-5 — TOTAL / PAID / BALANCE — one col each on desktop, hidden on mobile */}
                <div className="hidden lg:block">
                  <p className="text-sm font-semibold tabular-nums text-gray-900">
                    {formatMoney(inv.total_cents)}
                  </p>
                </div>
                <div className="hidden lg:block">
                  <p className="text-sm tabular-nums text-gray-700">
                    {formatMoney(inv.amount_paid_cents)}
                  </p>
                </div>
                <div className="hidden lg:block">
                  <p className={`text-sm tabular-nums ${
                    inv.balance_due_cents > 0 && inv.invoice_status === 'overdue'
                      ? 'font-semibold text-red-700'
                      : 'text-gray-700'
                  }`}>
                    {formatMoney(inv.balance_due_cents)}
                  </p>
                </div>

                {/* Mobile-only: show money values in a sub-row spanning both cols */}
                <div className="col-span-2 mt-1 grid grid-cols-3 gap-2 lg:hidden">
                  {[
                    { label: 'Total',   value: formatMoney(inv.total_cents),        bold: true,  warn: false },
                    { label: 'Paid',    value: formatMoney(inv.amount_paid_cents),   bold: false, warn: false },
                    { label: 'Balance', value: formatMoney(inv.balance_due_cents),   bold: false,
                      warn: inv.balance_due_cents > 0 && inv.invoice_status === 'overdue' },
                  ].map((item) => (
                    <div key={item.label}>
                      <p className="text-[10px] text-gray-400">{item.label}</p>
                      <p className={`text-sm tabular-nums ${
                        item.warn ? 'font-semibold text-red-700' :
                        item.bold ? 'font-semibold text-gray-900' :
                                    'text-gray-700'
                      }`}>
                        {item.value}
                      </p>
                    </div>
                  ))}
                </div>

              </div>
            ))}
          </div>

          <div className="grid grid-cols-5 gap-4 border-t border-gray-200 bg-gray-50 px-5 py-3">
            <div className="col-span-2">
              <p className="text-xs font-semibold text-gray-600">Totals</p>
            </div>
            {[
              { value: formatMoney(totalBilled),  warn: false },
              { value: formatMoney(totalPaid),    warn: false },
              { value: formatMoney(totalBalance), warn: totalBalance > 0 },
            ].map((item, i) => (
              <p key={i} className={`text-sm font-semibold tabular-nums ${item.warn ? 'text-amber-700' : 'text-gray-800'}`}>
                {item.value}
              </p>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── Loading skeleton ───────────────────────────────────────────────────────

function FinancialsSkeleton() {
  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
        <div className="border-b border-gray-100 px-5 py-4">
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="grid grid-cols-2 gap-px bg-gray-100 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white px-5 py-4 space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-6 w-28" />
            </div>
          ))}
        </div>
      </div>
      {[1, 2].map((i) => (
        <div key={i} className="overflow-hidden rounded-xl border border-gray-200 bg-white p-5 shadow-card space-y-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-px w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ))}
    </div>
  )
}

// ── Modal state ────────────────────────────────────────────────────────────

type FinancialModal =
  | { type: 'none' }
  | { type: 'create-co' }
  | { type: 'edit-co'; co: ProjectChangeOrder }
  | { type: 'create-draw-schedule' }
  | { type: 'submit-draw' }

// ── Main component ─────────────────────────────────────────────────────────

export function FinancialsTab() {
  const { project, isLoading: projectLoading } = useOutletContext<OutletCtx>()
  const { id: projectId } = useParams<{ id: string }>()
  const { activeTenantId, user, tenantMemberships } = useAuth()
  const queryClient = useQueryClient()
  const toast = useToast()

  const jobId      = project?.job?.id
  const tenantId   = activeTenantId ?? ''
  const userId     = user?.id ?? ''
  const jobHasLoan = project?.job?.has_construction_loan ?? false

  const { data: changeOrders,       isLoading: cosLoading  } = useProjectChangeOrders(jobId)
  const { data: drawSchedule,       isLoading: drawLoading } = useProjectDrawSchedule(jobId)
  const { data: invoices,           isLoading: invLoading  } = useProjectInvoices(jobId)
  const { data: invoiceMilestones,  isLoading: imLoading   } = useInvoiceTriggerMilestones(projectId)

  const [modal, setModal] = useState<FinancialModal>({ type: 'none' })

  const isLoading = projectLoading || cosLoading || drawLoading || invLoading || imLoading

  // PM+ can set invoice amounts
  const canEditInvoiceAmounts = (() => {
    const m = tenantMemberships.find((m) => m.tenant_id === tenantId)
    return ['owner', 'admin', 'project_manager'].includes(m?.role ?? '')
  })()

  const withdrawMut = useMutation({
    mutationFn: (co: ProjectChangeOrder) => withdrawChangeOrder(supabase, co.id),
    onSuccess:  () => {
      void queryClient.invalidateQueries({ queryKey: ['project-change-orders', jobId] })
      toast.success('Change order withdrawn to draft')
    },
    onError: (err) => {
      toast.error('Failed to withdraw change order', err instanceof Error ? err.message : 'Try again.')
    },
  })

  if (isLoading) {
    return <div className="px-5 py-6 lg:px-8"><FinancialsSkeleton /></div>
  }

  const cos       = changeOrders ?? []
  const draws     = drawSchedule?.draw_requests ?? []
  const invs      = invoices ?? []

  // Auto-suggest next CO number: CO-001, CO-002 …
  const nextCoNumber = `CO-${String(cos.length + 1).padStart(3, '0')}`
  const nextDrawNum  = draws.length + 1

  function refreshCOs()    { void queryClient.invalidateQueries({ queryKey: ['project-change-orders', jobId] }) }
  function refreshDraws()  { void queryClient.invalidateQueries({ queryKey: ['project-draw-schedule',  jobId] }) }
  function refreshInvoiceMilestones() {
    void queryClient.invalidateQueries({ queryKey: ['invoice-trigger-milestones', projectId] })
  }

  return (
    <div className="space-y-4 px-5 py-6 lg:px-8">
      <ContractSummary
        job={project?.job ?? null}
        changeOrders={cos}
        invoices={invs}
      />

      <ChangeOrdersSection
        changeOrders={cos}
        onAdd={() => setModal({ type: 'create-co' })}
        onEdit={(co) => setModal({ type: 'edit-co', co })}
        onWithdraw={(co) => withdrawMut.mutate(co)}
        withdrawingId={withdrawMut.isPending ? (withdrawMut.variables?.id ?? null) : null}
      />

      <DrawScheduleSection
        schedule={drawSchedule ?? null}
        jobHasLoan={jobHasLoan}
        onSetUpSchedule={() => setModal({ type: 'create-draw-schedule' })}
        onSubmitDraw={() => setModal({ type: 'submit-draw' })}
      />

      <InvoiceMilestonesSection
        milestones={invoiceMilestones ?? []}
        invoices={invs}
        tenantId={tenantId}
        canEdit={canEditInvoiceAmounts}
        onRefresh={refreshInvoiceMilestones}
      />

      <InvoicesSection invoices={invs} />

      {/* ── Modals ──────────────────────────────────────────────────────── */}

      {modal.type === 'create-co' && jobId && projectId && (
        <CreateCOModal
          projectId={projectId}
          tenantId={tenantId}
          jobId={jobId}
          userId={userId}
          nextCoNumber={nextCoNumber}
          onClose={() => setModal({ type: 'none' })}
          onSaved={refreshCOs}
        />
      )}

      {modal.type === 'edit-co' && projectId && (
        <EditCOModal
          projectId={projectId}
          tenantId={tenantId}
          co={modal.co}
          onClose={() => setModal({ type: 'none' })}
          onSaved={refreshCOs}
        />
      )}

      {modal.type === 'create-draw-schedule' && jobId && (
        <CreateDrawScheduleModal
          tenantId={tenantId}
          jobId={jobId}
          onClose={() => setModal({ type: 'none' })}
          onSaved={refreshDraws}
        />
      )}

      {modal.type === 'submit-draw' && jobId && drawSchedule && (
        <SubmitDrawModal
          tenantId={tenantId}
          jobId={jobId}
          userId={userId}
          scheduleId={drawSchedule.id}
          nextDrawNumber={nextDrawNum}
          onClose={() => setModal({ type: 'none' })}
          onSaved={refreshDraws}
        />
      )}
    </div>
  )
}
