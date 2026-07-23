import { useState, useRef, useEffect } from 'react'
import { useOutletContext, useParams } from 'react-router-dom'
import { pdf, Document, Page, View, Text, Svg, Rect, Line, Path } from '@react-pdf/renderer'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ProjectRow, ProjectPhase, ProjectMilestone, MilestoneCascadeChange } from '@indigo/shared'
import {
  upsertPhase,
  upsertMilestone,
  deletePhase,
  deleteMilestone,
  setMilestonePredecessor,
  computeMilestoneCascade,
} from '@indigo/shared'
import type { UpsertPhaseInput, UpsertMilestoneInput } from '@indigo/shared'
import { useProjectPhases } from '../useProject'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/stores/toastStore'
import { Skeleton } from '@/components/ui/Skeleton'
import {
  CalendarIcon,
  EyeIcon,
  UserCheckIcon,
  ExclamationTriangleIcon,
  PlusIcon,
  PencilIcon,
  TrashIcon,
  XMarkIcon,
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  DocumentIcon,
  TableCellsIcon,
  ChevronDownIcon,
} from '@/components/ui/Icons'

interface OutletCtx {
  project: ProjectRow | undefined
  isLoading: boolean
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtDate(s: string | null | undefined): string {
  if (!s) return '—'
  return new Date(s + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

function fmtDateShort(s: string | null | undefined): string {
  if (!s) return '—'
  return new Date(s + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric',
  })
}

function fmtMonthYear(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}

function isOverdue(dueDate: string | null, completedDate: string | null): boolean {
  if (completedDate || !dueDate) return false
  return new Date(dueDate + 'T00:00:00') < new Date()
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

// ── Status configs ─────────────────────────────────────────────────────────

const PHASE_STATUSES = [
  { value: 'not_started', label: 'Not Started' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'complete',    label: 'Complete'    },
  { value: 'approved',    label: 'Approved'    },
  { value: 'blocked',     label: 'Blocked'     },
]

const PHASE_STATUS: Record<string, { label: string; color: string; bg: string; ring: string }> = {
  complete:    { label: 'Complete',    color: 'text-green-700',  bg: 'bg-green-50',  ring: 'ring-green-200' },
  approved:    { label: 'Approved',    color: 'text-green-700',  bg: 'bg-green-50',  ring: 'ring-green-200' },
  in_progress: { label: 'In Progress', color: 'text-brand-700',  bg: 'bg-brand-50',  ring: 'ring-brand-200' },
  not_started: { label: 'Not Started', color: 'text-gray-500',   bg: 'bg-gray-100',  ring: 'ring-gray-200'  },
  blocked:     { label: 'Blocked',     color: 'text-red-700',    bg: 'bg-red-50',    ring: 'ring-red-200'   },
}

const MILESTONE_STATUS: Record<string, { dot: string }> = {
  complete:    { dot: 'bg-green-500'  },
  approved:    { dot: 'bg-green-500'  },
  in_progress: { dot: 'bg-brand-500'  },
  not_started: { dot: 'bg-gray-300'   },
  blocked:     { dot: 'bg-red-500'    },
}

const PHASE_ACCENT: Record<string, string> = {
  complete:    '#16a34a',
  approved:    '#16a34a',
  in_progress: '#6366f1',
  not_started: '#d1d5db',
  blocked:     '#ef4444',
}

const PHASE_COLORS = [
  '#6366f1', '#3b82f6', '#8b5cf6', '#ec4899',
  '#10b981', '#f59e0b', '#ef4444', '#6b7280',
]

// ── Shared form helpers ────────────────────────────────────────────────────

const inputCls =
  'h-9 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm text-gray-900 ' +
  'placeholder:text-gray-400 focus:bg-white focus:border-brand-400 focus:outline-none ' +
  'focus:ring-2 focus:ring-brand-100 transition-colors'

const selectCls =
  'h-9 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm text-gray-900 ' +
  'focus:bg-white focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 transition-colors'

// ── Modal wrapper ──────────────────────────────────────────────────────────

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
            {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
          </div>
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

// ── Phase modal ────────────────────────────────────────────────────────────

function PhaseModal({
  projectId,
  tenantId,
  phase,
  nextSequence,
  onClose,
  onSaved,
}: {
  projectId: string
  tenantId: string
  phase?: ProjectPhase
  nextSequence: number
  onClose: () => void
  onSaved: () => void
}) {
  const toast = useToast()
  const isEdit = !!phase

  const [name,        setName]        = useState(phase?.name        ?? '')
  const [status,      setStatus]      = useState(phase?.status      ?? 'not_started')
  const [startDate,   setStartDate]   = useState(phase?.start_date  ?? '')
  const [endDate,     setEndDate]     = useState(phase?.end_date    ?? '')
  const [color,       setColor]       = useState(phase?.color       ?? PHASE_COLORS[0])
  const [description, setDescription] = useState(phase?.description ?? '')
  const [nameError,   setNameError]   = useState('')

  const mutation = useMutation({
    mutationFn: () => {
      const input: UpsertPhaseInput = {
        id:          phase?.id,
        name:        name.trim(),
        status,
        start_date:  startDate  || null,
        end_date:    endDate    || null,
        color,
        description: description.trim() || null,
        sequence:    phase?.sequence ?? nextSequence,
      }
      return upsertPhase(supabase, tenantId, projectId, input)
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Phase updated' : 'Phase added')
      onSaved()
      onClose()
    },
    onError: (err) => {
      toast.error('Failed to save phase', err instanceof Error ? err.message : 'Try again.')
    },
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setNameError('Phase name is required'); return }
    setNameError('')
    mutation.mutate()
  }

  return (
    <ModalShell
      title={isEdit ? 'Edit Phase' : 'Add Phase'}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {/* Name */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Phase Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Foundation"
              className={`${inputCls} ${nameError ? 'border-red-300 bg-red-50' : ''}`}
              autoFocus
            />
            {nameError && <p className="mt-1 text-xs text-red-600">{nameError}</p>}
          </div>

          {/* Status */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={selectCls}>
              {PHASE_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Start Date</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">End Date</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputCls} />
            </div>
          </div>

          {/* Color */}
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Color</label>
            <div className="flex items-center gap-2">
              {PHASE_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`h-7 w-7 rounded-full transition-transform ${color === c ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : 'hover:scale-105'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Description <span className="text-gray-400 font-normal">(optional)</span></label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Brief notes about this phase"
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
            className="inline-flex h-8 items-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-700 disabled:opacity-60">
            {mutation.isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Phase'}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

// ── Milestone modal ────────────────────────────────────────────────────────

function MilestoneModal({
  projectId,
  tenantId,
  phases,
  milestone,
  defaultPhaseId,
  nextSequence,
  onClose,
  onSaved,
  onCascadeNeeded,
}: {
  projectId: string
  tenantId: string
  phases: ProjectPhase[]
  milestone?: ProjectMilestone
  defaultPhaseId?: string
  nextSequence: number
  onClose: () => void
  onSaved: () => void
  onCascadeNeeded?: (changes: MilestoneCascadeChange[]) => void
}) {
  const toast  = useToast()
  const isEdit = !!milestone

  const [name,                  setName]                  = useState(milestone?.name                   ?? '')
  const [phaseId,               setPhaseId]               = useState(milestone?.phase_id               ?? defaultPhaseId ?? '')
  const [status,                setStatus]                = useState(milestone?.status                  ?? 'not_started')
  const [dueDate,               setDueDate]               = useState(milestone?.due_date                ?? '')
  const [completedDate,         setCompletedDate]         = useState(milestone?.completed_date          ?? '')
  const [description,           setDescription]           = useState(milestone?.description             ?? '')
  const [isClientVisible,       setIsClientVisible]       = useState(milestone?.is_client_visible       ?? true)
  const [requiresApproval,      setRequiresApproval]      = useState(milestone?.requires_client_approval ?? false)
  const [triggersDraw,          setTriggersDraw]          = useState(milestone?.triggers_draw_request   ?? false)
  const [triggersInvoice,       setTriggersInvoice]       = useState(milestone?.triggers_invoice        ?? false)
  const [invoiceAmount,         setInvoiceAmount]         = useState(
    milestone?.invoice_amount_cents != null
      ? (milestone.invoice_amount_cents / 100).toFixed(2)
      : '',
  )
  const [nameError,             setNameError]             = useState('')
  const [predecessorId,         setPredecessorId]         = useState(milestone?.predecessor_id         ?? '')
  const [lagDays,               setLagDays]               = useState(milestone?.lag_days               ?? 0)

  const allMilestones   = phases.flatMap((p) => p.milestones.map((m) => ({ ...m, phaseName: p.name })))
  const predecessor     = allMilestones.find((m) => m.id === predecessorId)
  const computedDueDate = predecessor?.due_date ? addDays(predecessor.due_date, lagDays) : null

  const showCompletedDate = status === 'complete' || status === 'approved'

  const mutation = useMutation({
    mutationFn: () => {
      const input: UpsertMilestoneInput = {
        id:                       milestone?.id,
        phase_id:                 phaseId  || null,
        name:                     name.trim(),
        description:              description.trim() || null,
        due_date:                 computedDueDate ?? (dueDate || null),
        completed_date:           showCompletedDate ? (completedDate || null) : null,
        status,
        sequence:                 milestone?.sequence ?? nextSequence,
        is_client_visible:        isClientVisible,
        requires_client_approval: requiresApproval,
        triggers_draw_request:    triggersDraw,
        triggers_invoice:         triggersInvoice,
        invoice_amount_cents:     triggersInvoice && invoiceAmount.trim()
          ? Math.round(parseFloat(invoiceAmount.replace(/,/g, '')) * 100)
          : triggersInvoice ? null : undefined,
        predecessor_id: predecessorId || null,
        lag_days:       lagDays,
      }
      return upsertMilestone(supabase, tenantId, projectId, input)
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Milestone updated' : 'Milestone added')
      onSaved()
      if (isEdit && milestone?.id) {
        const savedDate = computedDueDate ?? dueDate
        if (savedDate) {
          const changes = computeMilestoneCascade(phases, milestone.id, savedDate)
          if (changes.length > 0) {
            onCascadeNeeded?.(changes)
            return
          }
        }
      }
      onClose()
    },
    onError: (err) => {
      toast.error('Failed to save milestone', err instanceof Error ? err.message : 'Try again.')
    },
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setNameError('Milestone name is required'); return }
    setNameError('')
    mutation.mutate()
  }

  return (
    <ModalShell
      title={isEdit ? 'Edit Milestone' : 'Add Milestone'}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {/* Name */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Milestone Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Framing complete"
              className={`${inputCls} ${nameError ? 'border-red-300 bg-red-50' : ''}`}
              autoFocus
            />
            {nameError && <p className="mt-1 text-xs text-red-600">{nameError}</p>}
          </div>

          {/* Phase + Status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Phase</label>
              <select value={phaseId} onChange={(e) => setPhaseId(e.target.value)} className={selectCls}>
                <option value="">No phase</option>
                {phases.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)} className={selectCls}>
                {PHASE_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Due date + completed date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Due Date</label>
              {computedDueDate ? (
                <>
                  <input type="date" value={computedDueDate} readOnly
                    className={`${inputCls} cursor-not-allowed bg-gray-100 text-gray-500`} />
                  <p className="mt-0.5 text-[11px] text-gray-400">
                    Calculated: {predecessor!.name} + {lagDays}d
                  </p>
                </>
              ) : (
                <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputCls} />
              )}
            </div>
            {showCompletedDate && (
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Completed Date</label>
                <input type="date" value={completedDate} onChange={(e) => setCompletedDate(e.target.value)} className={inputCls} />
              </div>
            )}
          </div>

          {/* Dependency */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Depends On</label>
              <select value={predecessorId} onChange={(e) => setPredecessorId(e.target.value)} className={selectCls}>
                <option value="">No dependency</option>
                {phases.map((p) => (
                  <optgroup key={p.id} label={p.name}>
                    {p.milestones
                      .filter((m) => m.id !== milestone?.id)
                      .map((m) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                  </optgroup>
                ))}
              </select>
            </div>
            {predecessorId && (
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Lag Days</label>
                <input
                  type="number"
                  value={lagDays}
                  onChange={(e) => setLagDays(parseInt(e.target.value, 10) || 0)}
                  min={-999}
                  max={999}
                  className={inputCls}
                />
              </div>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Description <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Additional notes"
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:bg-white focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 transition-colors resize-none"
            />
          </div>

          {/* Toggles */}
          <div className="space-y-2.5 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Options</p>
            {([
              ['Client visible',        isClientVisible,  setIsClientVisible],
              ['Requires client approval', requiresApproval, setRequiresApproval],
              ['Triggers draw request', triggersDraw,     setTriggersDraw],
              ['Triggers invoice',      triggersInvoice,  setTriggersInvoice],
            ] as [string, boolean, (v: boolean) => void][]).map(([label, val, setter]) => (
              <label key={label} className="flex cursor-pointer items-center justify-between gap-3">
                <span className="text-sm text-gray-700">{label}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={val}
                  onClick={() => setter(!val)}
                  className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${val ? 'bg-brand-600' : 'bg-gray-300'}`}
                >
                  <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${val ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </button>
              </label>
            ))}

            {/* Invoice amount — shown when triggers_invoice is on */}
            {triggersInvoice && (
              <div className="border-t border-gray-200 pt-2.5">
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  Invoice Amount
                  <span className="ml-1 font-normal text-gray-400">(payment due at this milestone)</span>
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                  <input
                    type="number"
                    value={invoiceAmount}
                    onChange={(e) => setInvoiceAmount(e.target.value)}
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                    className={`${inputCls} pl-7`}
                  />
                </div>
                {!invoiceAmount.trim() && (
                  <p className="mt-1 text-xs text-amber-600">
                    Set the amount now, or edit it later in the Financials tab.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 rounded-b-2xl border-t border-gray-200 bg-gray-50 px-5 py-3">
          <button type="button" onClick={onClose} disabled={mutation.isPending}
            className="h-8 rounded-lg px-3.5 text-sm font-medium text-gray-700 hover:bg-gray-200 transition-colors disabled:opacity-50">
            Cancel
          </button>
          <button type="submit" disabled={mutation.isPending}
            className="inline-flex h-8 items-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-700 disabled:opacity-60">
            {mutation.isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Milestone'}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

// ── Delete confirm modal ───────────────────────────────────────────────────

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

// ── Cascade confirm modal ──────────────────────────────────────────────────

function CascadeConfirmModal({
  changes,
  onConfirm,
  onClose,
  isPending,
}: {
  changes: MilestoneCascadeChange[]
  onConfirm: () => void
  onClose: () => void
  isPending: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <p className="text-sm font-semibold text-gray-900">Update dependent milestones?</p>
            <p className="mt-0.5 text-xs text-gray-500">{changes.length} milestone{changes.length !== 1 ? 's' : ''} will shift</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-60 overflow-y-auto px-5 py-3">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                <th className="pb-2 pr-2">Milestone</th>
                <th className="pb-2 pr-2">Phase</th>
                <th className="pb-2 pr-2">Was</th>
                <th className="pb-2">Becomes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {changes.map((c) => (
                <tr key={c.id}>
                  <td className="py-1.5 pr-2 font-medium text-gray-800">{c.name}</td>
                  <td className="py-1.5 pr-2 text-gray-500">{c.phaseName}</td>
                  <td className="py-1.5 pr-2 text-gray-400">{c.oldDate ? fmtDateShort(c.oldDate) : '—'}</td>
                  <td className="py-1.5 font-medium text-brand-700">{fmtDateShort(c.newDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-end gap-3 rounded-b-2xl border-t border-gray-100 bg-gray-50 px-5 py-3">
          <button onClick={onClose} disabled={isPending}
            className="h-8 rounded-lg px-3.5 text-sm font-medium text-gray-700 hover:bg-gray-200 transition-colors disabled:opacity-50">
            Skip
          </button>
          <button onClick={onConfirm} disabled={isPending}
            className="inline-flex h-8 items-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-700 disabled:opacity-60">
            {isPending ? 'Applying…' : `Apply to ${changes.length}`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Modal state ────────────────────────────────────────────────────────────

type ModalState =
  | { type: 'none' }
  | { type: 'add-phase' }
  | { type: 'edit-phase'; phase: ProjectPhase }
  | { type: 'add-milestone'; phaseId: string; nextSeq: number }
  | { type: 'edit-milestone'; milestone: ProjectMilestone }
  | { type: 'delete-phase'; phase: ProjectPhase }
  | { type: 'delete-milestone'; milestone: ProjectMilestone }
  | { type: 'cascade-confirm'; changes: MilestoneCascadeChange[] }
  | { type: 'import-csv' }

// ── Milestone row (list view) ──────────────────────────────────────────────

function MilestoneRow({
  milestone,
  isLast,
  canEdit,
  hideFinancials,
  onEdit,
  onDelete,
}: {
  milestone: ProjectMilestone
  isLast: boolean
  canEdit: boolean
  hideFinancials: boolean
  onEdit: (m: ProjectMilestone) => void
  onDelete: (m: ProjectMilestone) => void
}) {
  const cfg     = MILESTONE_STATUS[milestone.status] ?? MILESTONE_STATUS.not_started
  const done    = milestone.status === 'complete' || milestone.status === 'approved'
  const overdue = isOverdue(milestone.due_date, milestone.completed_date)
  const blocked = milestone.status === 'blocked'

  return (
    <div className={`group relative flex gap-3 py-3 ${!isLast ? 'border-b border-gray-100' : ''}`}>
      <div className="flex flex-col items-center pt-0.5">
        <div className={`h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white ${cfg.dot}`} />
        {!isLast && <div className="mt-1 w-px flex-1 bg-gray-200" />}
      </div>

      <div className="min-w-0 flex-1 pb-1">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`text-sm font-medium leading-snug ${
              done    ? 'text-gray-400 line-through' :
              blocked ? 'text-red-700' :
              overdue ? 'text-amber-700' :
                        'text-gray-900'
            }`}>
              {milestone.name}
            </span>

            <div className="flex items-center gap-1">
              {milestone.triggers_draw_request && (
                <span title="Triggers draw request" className="inline-flex items-center rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-600">
                  DRAW
                </span>
              )}
              {milestone.triggers_invoice && !hideFinancials && (
                <span title="Triggers invoice" className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600">
                  INV
                  {milestone.invoice_amount_cents != null
                    ? <span className="font-normal opacity-80">
                        {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(milestone.invoice_amount_cents / 100)}
                      </span>
                    : <span className="font-normal opacity-60">— no amount</span>
                  }
                </span>
              )}
              {milestone.requires_client_approval && (
                <UserCheckIcon className="h-3.5 w-3.5 text-gray-400" strokeWidth={1.75} title="Requires client approval" />
              )}
              {milestone.is_client_visible && (
                <EyeIcon className="h-3.5 w-3.5 text-gray-400" strokeWidth={1.75} title="Client visible" />
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {done && milestone.completed_date ? (
              <span className="text-xs text-green-600">
                ✓ {fmtDateShort(milestone.completed_date)}
              </span>
            ) : milestone.due_date ? (
              <span className={`text-xs ${overdue ? 'font-medium text-amber-600' : 'text-gray-400'}`}>
                {overdue ? '⚠ Due ' : 'Due '}
                {fmtDateShort(milestone.due_date)}
              </span>
            ) : null}

            {/* Action buttons — visible on hover, hidden for read-only roles */}
            {canEdit && (
              <div className="ml-1 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onEdit(milestone) }}
                  className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-brand-600 transition-colors"
                  title="Edit milestone"
                >
                  <PencilIcon className="h-3.5 w-3.5" strokeWidth={2} />
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onDelete(milestone) }}
                  className="rounded p-0.5 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                  title="Delete milestone"
                >
                  <TrashIcon className="h-3.5 w-3.5" strokeWidth={2} />
                </button>
              </div>
            )}
          </div>
        </div>

        {milestone.description && (
          <p className="mt-0.5 text-xs text-gray-400 leading-relaxed">{milestone.description}</p>
        )}
      </div>
    </div>
  )
}

// ── Phase card (list view) ─────────────────────────────────────────────────

function PhaseCard({
  phase,
  canEdit,
  hideFinancials,
  onEditPhase,
  onDeletePhase,
  onAddMilestone,
  onEditMilestone,
  onDeleteMilestone,
}: {
  phase: ProjectPhase
  canEdit: boolean
  hideFinancials: boolean
  onEditPhase: (p: ProjectPhase) => void
  onDeletePhase: (p: ProjectPhase) => void
  onAddMilestone: (phaseId: string, nextSeq: number) => void
  onEditMilestone: (m: ProjectMilestone) => void
  onDeleteMilestone: (m: ProjectMilestone) => void
}) {
  const cfg         = PHASE_STATUS[phase.status] ?? PHASE_STATUS.not_started
  const accentColor = phase.color ?? PHASE_ACCENT[phase.status] ?? '#d1d5db'
  const total       = phase.milestones.length
  const completed   = phase.milestones.filter((m) => m.status === 'complete' || m.status === 'approved').length
  const pct         = total > 0 ? Math.round((completed / total) * 100) : 0
  const sorted      = [...phase.milestones].sort((a, b) => a.sequence - b.sequence)

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
      <div
        className="flex items-start gap-4 border-l-4 px-5 py-4"
        style={{ borderLeftColor: accentColor }}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-900">{phase.name}</h3>
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${cfg.bg} ${cfg.color} ${cfg.ring}`}>
              {cfg.label}
            </span>
          </div>

          {(phase.start_date || phase.end_date) && (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-500">
              <CalendarIcon className="h-3.5 w-3.5" strokeWidth={1.5} />
              {fmtDate(phase.start_date)}
              {phase.end_date && <> → {fmtDate(phase.end_date)}</>}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="text-right">
            <p className="text-sm font-semibold tabular-nums text-gray-700">
              {total > 0 ? `${completed} / ${total}` : '—'}
            </p>
            <p className="text-xs text-gray-400">milestones</p>
          </div>
          {/* Phase actions — hidden for read-only roles */}
          {canEdit && (
            <div className="flex items-center gap-0.5 ml-1">
              <button
                type="button"
                onClick={() => onEditPhase(phase)}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-brand-600 transition-colors"
                title="Edit phase"
              >
                <PencilIcon className="h-3.5 w-3.5" strokeWidth={2} />
              </button>
              <button
                type="button"
                onClick={() => onDeletePhase(phase)}
                className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                title="Delete phase"
              >
                <TrashIcon className="h-3.5 w-3.5" strokeWidth={2} />
              </button>
            </div>
          )}
        </div>
      </div>

      {total > 0 && (
        <div className="h-1 w-full bg-gray-100">
          <div
            className="h-full transition-all duration-500"
            style={{ width: `${pct}%`, backgroundColor: accentColor }}
          />
        </div>
      )}

      {sorted.length > 0 ? (
        <div className="px-5 py-1">
          {sorted.map((m, i) => (
            <MilestoneRow
              key={m.id}
              milestone={m}
              isLast={i === sorted.length - 1}
              canEdit={canEdit}
              hideFinancials={hideFinancials}
              onEdit={onEditMilestone}
              onDelete={onDeleteMilestone}
            />
          ))}
        </div>
      ) : (
        <div className="px-5 py-3 text-center text-xs text-gray-400">
          No milestones yet.
        </div>
      )}

      {/* Add milestone button — hidden for read-only roles */}
      {canEdit && (
        <div className="border-t border-gray-100 px-5 py-2.5">
          <button
            type="button"
            onClick={() => onAddMilestone(phase.id, sorted.length)}
            className="flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-brand-600 transition-colors"
          >
            <PlusIcon className="h-3.5 w-3.5" strokeWidth={2.5} />
            Add milestone
          </button>
        </div>
      )}
    </div>
  )
}

// ── Gantt view ─────────────────────────────────────────────────────────────

const LEFT_COL_W = 180
const PX_PER_DAY = 14   // pixels per calendar day — adjust for zoom feel

function GanttView({ phases }: { phases: ProjectPhase[] }) {
  const sorted = [...phases].sort((a, b) => a.sequence - b.sequence)

  const allDates: Date[] = []
  for (const phase of sorted) {
    if (phase.start_date) allDates.push(new Date(phase.start_date + 'T00:00:00'))
    if (phase.end_date)   allDates.push(new Date(phase.end_date   + 'T00:00:00'))
    for (const m of phase.milestones) {
      if (m.due_date)       allDates.push(new Date(m.due_date       + 'T00:00:00'))
      if (m.completed_date) allDates.push(new Date(m.completed_date + 'T00:00:00'))
    }
  }

  if (allDates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-white py-16 text-center">
        <CalendarIcon className="mx-auto h-10 w-10 text-gray-300" strokeWidth={1} />
        <h3 className="mt-3 text-sm font-semibold text-gray-900">No dates set</h3>
        <p className="mt-1 text-sm text-gray-500">
          Add start/end dates to phases to see the Gantt chart.
        </p>
      </div>
    )
  }

  const minDate = new Date(Math.min(...allDates.map((d) => d.getTime())))
  const maxDate = new Date(Math.max(...allDates.map((d) => d.getTime())))

  minDate.setDate(minDate.getDate() - 14)
  maxDate.setDate(maxDate.getDate() + 14)

  const totalMs   = maxDate.getTime() - minDate.getTime()
  const totalDays = Math.ceil(totalMs / 86_400_000)
  const CHART_W   = Math.max(600, totalDays * PX_PER_DAY)

  /** Convert a date string to a pixel offset within the chart area. */
  function toPx(dateStr: string | null | undefined, offsetDays = 0): number {
    if (!dateStr) return -1
    const d = new Date(dateStr + 'T00:00:00')
    d.setDate(d.getDate() + offsetDays)
    const ratio = (d.getTime() - minDate.getTime()) / totalMs
    return Math.max(0, Math.min(CHART_W, Math.round(ratio * CHART_W)))
  }

  const months: { label: string; px: number }[] = []
  const cur = new Date(minDate)
  cur.setDate(1)
  if (cur < minDate) cur.setMonth(cur.getMonth() + 1)
  while (cur <= maxDate) {
    const px = Math.round(((cur.getTime() - minDate.getTime()) / totalMs) * CHART_W)
    months.push({ label: fmtMonthYear(cur), px })
    cur.setMonth(cur.getMonth() + 1)
  }

  const today     = new Date()
  const todayPx   = Math.round(((today.getTime() - minDate.getTime()) / totalMs) * CHART_W)
  const showToday = todayPx >= 0 && todayPx <= CHART_W

  const ROW_H = 52

  // Build milestone position map for dependency arrows
  const milestonePositions = new Map<string, { phaseIndex: number; dueDate: string | null }>()
  sorted.forEach((phase, phaseIndex) => {
    for (const m of phase.milestones) {
      milestonePositions.set(m.id, { phaseIndex, dueDate: m.due_date ?? null })
    }
  })

  const arrows: JSX.Element[] = []
  sorted.forEach((phase, phaseIndex) => {
    for (const m of phase.milestones) {
      if (!m.predecessor_id || !m.due_date) continue
      const predPos = milestonePositions.get(m.predecessor_id)
      if (!predPos || !predPos.dueDate) continue
      const fromX = toPx(predPos.dueDate)
      const toX   = toPx(m.due_date)
      if (fromX < 0 || toX < 0) continue
      const fromY = predPos.phaseIndex * ROW_H + ROW_H / 2
      const toY   = phaseIndex * ROW_H + ROW_H / 2
      arrows.push(
        <g key={m.id}>
          <path
            d={`M ${fromX} ${fromY} C ${fromX + 40} ${fromY} ${toX - 40} ${toY} ${toX} ${toY}`}
            stroke="#d1d5db"
            strokeWidth={1.5}
            fill="none"
          />
          <polygon
            points={`${toX},${toY} ${toX - 6},${toY - 3} ${toX - 6},${toY + 3}`}
            fill="#d1d5db"
          />
        </g>,
      )
    }
  })

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
      {/* Horizontal scroll wraps everything */}
      <div className="overflow-x-auto">
        <div style={{ minWidth: LEFT_COL_W + CHART_W }}>

          {/* ── Header row ───────────────────────────────────────────── */}
          <div className="flex border-b border-gray-200 bg-gray-50">
            <div className="shrink-0 border-r border-gray-200 px-4 py-2.5" style={{ width: LEFT_COL_W }}>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Phase</span>
            </div>
            <div className="relative overflow-hidden py-2.5" style={{ width: CHART_W, height: 32 }}>
              {months.map((m) => (
                <span key={m.label} className="absolute whitespace-nowrap text-[10px] font-medium text-gray-400"
                  style={{ left: m.px, transform: 'translateX(-4px)' }}>
                  {m.label}
                </span>
              ))}
            </div>
          </div>

          {/* ── Phase rows — vertically scrollable ───────────────────── */}
          <div className="max-h-[60vh] overflow-y-auto">
            <div className="relative">
              {sorted.map((phase) => {
                const accentColor = phase.color ?? PHASE_ACCENT[phase.status] ?? '#d1d5db'
                const cfg         = PHASE_STATUS[phase.status] ?? PHASE_STATUS.not_started
                const hasBar      = !!(phase.start_date && phase.end_date)
                const barLeft     = hasBar ? toPx(phase.start_date) : -1
                const barRight    = hasBar ? toPx(phase.end_date, 1) : -1
                const barWidth    = hasBar ? Math.max(barRight - barLeft, 4) : 0
                const milestones  = phase.milestones.filter((m) => m.due_date)

                return (
                  <div key={phase.id} className="flex border-b border-gray-100 last:border-0 hover:bg-gray-50/50">
                    <div className="flex shrink-0 flex-col justify-center border-r border-gray-100 px-4 py-3" style={{ width: LEFT_COL_W }}>
                      <span className="truncate text-xs font-semibold text-gray-800">{phase.name}</span>
                      <span className={`mt-0.5 text-[10px] font-medium ${cfg.color}`}>{cfg.label}</span>
                    </div>
                    <div className="relative" style={{ width: CHART_W, minHeight: ROW_H }}>
                      {/* Month grid lines */}
                      {months.map((m) => (
                        <div key={m.label} className="absolute inset-y-0 w-px bg-gray-100" style={{ left: m.px }} />
                      ))}
                      {/* Today line */}
                      {showToday && (
                        <div className="absolute inset-y-0 w-px bg-red-300" style={{ left: todayPx }} />
                      )}
                      {/* Phase duration bar */}
                      {hasBar && (
                        <div
                          className="absolute top-1/2 h-6 -translate-y-1/2 rounded-md"
                          style={{ left: barLeft, width: barWidth, backgroundColor: accentColor, opacity: 0.85 }}
                        />
                      )}
                      {/* Milestone diamonds */}
                      {milestones.map((m) => {
                        const mp      = toPx(m.due_date)
                        if (mp < 0) return null
                        const done    = m.status === 'complete' || m.status === 'approved'
                        const overdue = isOverdue(m.due_date, m.completed_date)
                        const color   = done ? '#16a34a' : overdue ? '#f59e0b' : m.status === 'blocked' ? '#ef4444' : '#6366f1'
                        return (
                          <div
                            key={m.id}
                            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-default"
                            style={{ left: mp }}
                            title={`${m.name} — Due ${fmtDateShort(m.due_date)}${done ? ' ✓' : overdue ? ' (overdue)' : ''}`}
                          >
                            <div className="h-3.5 w-3.5 rotate-45 rounded-sm ring-2 ring-white" style={{ backgroundColor: color }} />
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
              {/* Dependency arrows overlay */}
              {arrows.length > 0 && (
                <svg
                  className="pointer-events-none absolute top-0"
                  style={{ left: LEFT_COL_W, width: CHART_W, height: sorted.length * ROW_H }}
                  aria-hidden
                >
                  {arrows}
                </svg>
              )}
            </div>
          </div>

          {/* ── Today label footer ───────────────────────────────────── */}
          {showToday && (
            <div className="flex border-t border-gray-100 bg-gray-50">
              <div className="shrink-0 border-r border-gray-100" style={{ width: LEFT_COL_W }} />
              <div className="relative py-1.5" style={{ width: CHART_W }}>
                <div className="absolute flex items-center gap-0.5" style={{ left: todayPx, transform: 'translateX(-50%)' }}>
                  <span className="rounded bg-red-400 px-1.5 py-0.5 text-[9px] font-semibold text-white">Today</span>
                </div>
              </div>
            </div>
          )}

          {/* ── Legend ───────────────────────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-4 border-t border-gray-100 bg-gray-50 px-4 py-2.5">
            <div className="flex items-center gap-1.5">
              <div className="h-3 w-6 rounded-sm bg-gray-400 opacity-80" />
              <span className="text-[10px] text-gray-500">Phase bar</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-3 w-3 rotate-45 rounded-sm bg-indigo-500 ring-1 ring-white" />
              <span className="text-[10px] text-gray-500">Milestone (pending)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-3 w-3 rotate-45 rounded-sm bg-green-500 ring-1 ring-white" />
              <span className="text-[10px] text-gray-500">Complete</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-3 w-3 rotate-45 rounded-sm bg-amber-500 ring-1 ring-white" />
              <span className="text-[10px] text-gray-500">Overdue</span>
            </div>
            {showToday && (
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-px bg-red-400" />
                <span className="text-[10px] text-gray-500">Today</span>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}

// ── CSV export ─────────────────────────────────────────────────────────────

function exportCsv(phases: ProjectPhase[], projectName: string): void {
  const milestoneNameById = new Map<string, string>()
  for (const phase of phases) {
    for (const m of phase.milestones) {
      milestoneNameById.set(m.id, m.name)
    }
  }

  const rows: string[][] = [
    ['Type', 'Phase', 'Milestone', 'Status', 'Start Date', 'End Date', 'Due Date',
     'Completed Date', 'Client Visible', 'Triggers Draw', 'Triggers Invoice', 'Invoice Amount ($)',
     'Depends On (Milestone Name)', 'Lag Days'],
  ]
  for (const phase of [...phases].sort((a, b) => a.sequence - b.sequence)) {
    rows.push([
      'Phase', phase.name, '', PHASE_STATUS[phase.status]?.label ?? phase.status,
      phase.start_date ?? '', phase.end_date ?? '', '', '', '', '', '', '', '', '',
    ])
    for (const m of [...phase.milestones].sort((a, b) => a.sequence - b.sequence)) {
      rows.push([
        'Milestone', phase.name, m.name, PHASE_STATUS[m.status]?.label ?? m.status,
        '', '', m.due_date ?? '', m.completed_date ?? '',
        m.is_client_visible ? 'Yes' : 'No',
        m.triggers_draw_request ? 'Yes' : 'No',
        m.triggers_invoice ? 'Yes' : 'No',
        m.invoice_amount_cents != null ? (m.invoice_amount_cents / 100).toFixed(2) : '',
        m.predecessor_id ? (milestoneNameById.get(m.predecessor_id) ?? '') : '',
        String(m.lag_days ?? 0),
      ])
    }
  }
  const csv  = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `${projectName.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-schedule.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ── PDF document ────────────────────────────────────────────────────────────

const PDF_MARGIN     = 32
const PDF_LEFT_COL_W = 150
const PDF_CONTENT_W  = 841.89 - PDF_MARGIN * 2   // A4 landscape width minus margins
const PDF_CHART_W    = PDF_CONTENT_W - PDF_LEFT_COL_W
const PDF_ROW_H      = 28
const PDF_HEADER_H   = 20

function GanttPdfDocument({ phases, projectName }: { phases: ProjectPhase[]; projectName: string }) {
  const sorted = [...phases].sort((a, b) => a.sequence - b.sequence)

  const allDates: Date[] = []
  for (const p of sorted) {
    if (p.start_date) allDates.push(new Date(p.start_date + 'T00:00:00'))
    if (p.end_date)   allDates.push(new Date(p.end_date   + 'T00:00:00'))
    for (const m of p.milestones) {
      if (m.due_date) allDates.push(new Date(m.due_date + 'T00:00:00'))
    }
  }

  const hasChart = allDates.length > 0
  const minDate  = hasChart ? new Date(Math.min(...allDates.map((d) => d.getTime()))) : new Date()
  const maxDate  = hasChart ? new Date(Math.max(...allDates.map((d) => d.getTime()))) : new Date()
  if (hasChart) {
    minDate.setDate(minDate.getDate() - 7)
    maxDate.setDate(maxDate.getDate() + 7)
  }
  const totalMs = hasChart ? maxDate.getTime() - minDate.getTime() : 1

  function toPx(dateStr: string | null | undefined, offsetDays = 0): number {
    if (!dateStr) return -1
    const d = new Date(dateStr + 'T00:00:00')
    d.setDate(d.getDate() + offsetDays)
    const ratio = (d.getTime() - minDate.getTime()) / totalMs
    return Math.max(0, Math.min(PDF_CHART_W, ratio * PDF_CHART_W))
  }

  const months: { label: string; px: number }[] = []
  if (hasChart) {
    const cur = new Date(minDate)
    cur.setDate(1)
    if (cur < minDate) cur.setMonth(cur.getMonth() + 1)
    while (cur <= maxDate) {
      months.push({ label: fmtMonthYear(cur), px: ((cur.getTime() - minDate.getTime()) / totalMs) * PDF_CHART_W })
      cur.setMonth(cur.getMonth() + 1)
    }
  }

  const today   = new Date()
  const todayR  = (today.getTime() - minDate.getTime()) / totalMs
  const todayPx = hasChart && todayR >= 0 && todayR <= 1 ? todayR * PDF_CHART_W : -1

  const totalMilestones = sorted.reduce((n, p) => n + p.milestones.length, 0)
  const doneMilestones  = sorted.reduce((n, p) =>
    n + p.milestones.filter((m) => m.status === 'complete' || m.status === 'approved').length, 0)
  const pct        = totalMilestones > 0 ? Math.round((doneMilestones / totalMilestones) * 100) : 0
  const exportDate = today.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={{ fontFamily: 'Helvetica', padding: PDF_MARGIN }}>

        {/* Header */}
        <View style={{ marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <View>
            <Text style={{ fontSize: 15, fontFamily: 'Helvetica-Bold', color: '#111827' }}>{projectName}</Text>
            <Text style={{ fontSize: 8.5, color: '#6b7280', marginTop: 2 }}>Schedule Export · {exportDate}</Text>
          </View>
          <View style={{ flexDirection: 'row' }}>
            {([
              { label: 'Phases',     value: String(sorted.length) },
              { label: 'Milestones', value: `${doneMilestones} / ${totalMilestones}` },
              { label: 'Complete',   value: `${pct}%` },
            ] as { label: string; value: string }[]).map((s, i) => (
              <View key={s.label} style={{ alignItems: 'flex-end', marginLeft: i > 0 ? 20 : 0 }}>
                <Text style={{ fontSize: 13, fontFamily: 'Helvetica-Bold', color: '#111827' }}>{s.value}</Text>
                <Text style={{ fontSize: 7, color: '#9ca3af' }}>{s.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Gantt chart */}
        {hasChart && (
          <View style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 4, marginBottom: 14 }}>
            {/* Month header */}
            <View style={{ flexDirection: 'row', backgroundColor: '#f9fafb', borderBottomWidth: 1, borderBottomColor: '#e5e7eb', height: PDF_HEADER_H }}>
              <View style={{ width: PDF_LEFT_COL_W, paddingLeft: 8, justifyContent: 'center' }}>
                <Text style={{ fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: '#9ca3af' }}>PHASE</Text>
              </View>
              <View style={{ width: PDF_CHART_W, position: 'relative' }}>
                {months.map((m) => (
                  <Text key={m.label} style={{ position: 'absolute', left: m.px + 2, top: 5, fontSize: 6.5, color: '#9ca3af' }}>
                    {m.label}
                  </Text>
                ))}
              </View>
            </View>

            {/* Phase rows */}
            {sorted.map((phase) => {
              const accentColor = phase.color ?? PHASE_ACCENT[phase.status] ?? '#d1d5db'
              const cfg         = PHASE_STATUS[phase.status] ?? PHASE_STATUS.not_started
              const hasBar      = !!(phase.start_date && phase.end_date)
              const barLeft     = hasBar ? toPx(phase.start_date) : -1
              const barRight    = hasBar ? toPx(phase.end_date, 1) : -1
              const barWidth    = hasBar ? Math.max(barRight - barLeft, 2) : 0
              const milestones  = phase.milestones.filter((m) => m.due_date)
              const cy          = PDF_ROW_H / 2

              return (
                <View key={phase.id} style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#f3f4f6', height: PDF_ROW_H }}>
                  <View style={{ width: PDF_LEFT_COL_W, paddingLeft: 8, justifyContent: 'center' }}>
                    <Text style={{ fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: '#1f2937' }}>{phase.name}</Text>
                    <Text style={{ fontSize: 6, color: '#9ca3af', marginTop: 1 }}>{cfg.label}</Text>
                  </View>
                  <View style={{ width: PDF_CHART_W }}>
                    <Svg width={PDF_CHART_W} height={PDF_ROW_H}>
                      {months.map((m) => (
                        <Line key={m.label} x1={m.px} y1={0} x2={m.px} y2={PDF_ROW_H} stroke="#f3f4f6" strokeWidth={0.5} />
                      ))}
                      {todayPx >= 0 && (
                        <Line x1={todayPx} y1={0} x2={todayPx} y2={PDF_ROW_H} stroke="#fca5a5" strokeWidth={1} />
                      )}
                      {hasBar && (
                        <Rect x={barLeft} y={cy - 5} width={barWidth} height={10} rx={2} fill={accentColor} fillOpacity={0.85} />
                      )}
                      {milestones.map((m) => {
                        const mp   = toPx(m.due_date)
                        if (mp < 0) return null
                        const done    = m.status === 'complete' || m.status === 'approved'
                        const overdue = isOverdue(m.due_date, m.completed_date)
                        const color   = done ? '#16a34a' : overdue ? '#f59e0b' : m.status === 'blocked' ? '#ef4444' : '#6366f1'
                        const s = 4.5
                        return (
                          <Path
                            key={m.id}
                            d={`M ${mp} ${cy - s} L ${mp + s} ${cy} L ${mp} ${cy + s} L ${mp - s} ${cy} Z`}
                            fill={color}
                          />
                        )
                      })}
                    </Svg>
                  </View>
                </View>
              )
            })}

            {/* Today label */}
            {todayPx >= 0 && (
              <View style={{ flexDirection: 'row', backgroundColor: '#f9fafb', borderTopWidth: 1, borderTopColor: '#f3f4f6', height: 14 }}>
                <View style={{ width: PDF_LEFT_COL_W }} />
                <View style={{ width: PDF_CHART_W, position: 'relative' }}>
                  <Text style={{ position: 'absolute', left: todayPx - 8, top: 3, fontSize: 6, fontFamily: 'Helvetica-Bold', color: '#ef4444' }}>
                    Today
                  </Text>
                </View>
              </View>
            )}
          </View>
        )}

        {/* Detail table */}
        <View>
          <View style={{ flexDirection: 'row', backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 4, paddingVertical: 4, paddingHorizontal: 6, marginBottom: 1 }}>
            {([
              { label: 'Phase / Milestone', flex: 3 },
              { label: 'Status',            flex: 1 },
              { label: 'Start',             flex: 1 },
              { label: 'End / Due',         flex: 1 },
              { label: 'Completed',         flex: 1 },
            ] as { label: string; flex: number }[]).map((col) => (
              <Text key={col.label} style={{ flex: col.flex, fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#6b7280' }}>
                {col.label}
              </Text>
            ))}
          </View>

          {sorted.map((phase) => (
            <View key={phase.id}>
              <View style={{ flexDirection: 'row', paddingVertical: 4, paddingHorizontal: 6, backgroundColor: '#fafafa', borderBottomWidth: 1, borderBottomColor: '#f3f4f6' }}>
                <Text style={{ flex: 3, fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#111827' }}>{phase.name}</Text>
                <Text style={{ flex: 1, fontSize: 7, color: '#6b7280' }}>{PHASE_STATUS[phase.status]?.label ?? phase.status}</Text>
                <Text style={{ flex: 1, fontSize: 7, color: '#6b7280' }}>{fmtDate(phase.start_date)}</Text>
                <Text style={{ flex: 1, fontSize: 7, color: '#6b7280' }}>{fmtDate(phase.end_date)}</Text>
                <Text style={{ flex: 1, fontSize: 7, color: '#6b7280' }}>—</Text>
              </View>
              {[...phase.milestones].sort((a, b) => a.sequence - b.sequence).map((m) => {
                const done    = m.status === 'complete' || m.status === 'approved'
                const overdue = isOverdue(m.due_date, m.completed_date)
                return (
                  <View key={m.id} style={{ flexDirection: 'row', paddingVertical: 3, paddingLeft: 18, paddingRight: 6, borderBottomWidth: 1, borderBottomColor: '#f9fafb' }}>
                    <Text style={{ flex: 3, fontSize: 7, color: done ? '#6b7280' : overdue ? '#b45309' : '#374151' }}>◇  {m.name}</Text>
                    <Text style={{ flex: 1, fontSize: 7, color: '#6b7280' }}>{PHASE_STATUS[m.status]?.label ?? m.status}</Text>
                    <Text style={{ flex: 1, fontSize: 7, color: '#6b7280' }}>—</Text>
                    <Text style={{ flex: 1, fontSize: 7, color: '#6b7280' }}>{fmtDate(m.due_date)}</Text>
                    <Text style={{ flex: 1, fontSize: 7, color: done ? '#16a34a' : '#6b7280' }}>{fmtDate(m.completed_date)}</Text>
                  </View>
                )
              })}
            </View>
          ))}
        </View>

      </Page>
    </Document>
  )
}

async function exportPdf(phases: ProjectPhase[], projectName: string): Promise<void> {
  const blob = await pdf(<GanttPdfDocument phases={phases} projectName={projectName} />).toBlob()
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `${projectName.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-schedule.pdf`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Export menu ─────────────────────────────────────────────────────────────

function ExportMenu({ phases, projectName }: { phases: ProjectPhase[]; projectName: string }) {
  const [open,      setOpen]      = useState(false)
  const [exporting, setExporting] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  async function handlePdf() {
    setOpen(false)
    setExporting(true)
    try { await exportPdf(phases, projectName) } finally { setExporting(false) }
  }

  function handleCsv() {
    setOpen(false)
    exportCsv(phases, projectName)
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={exporting}
        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 hover:border-brand-300 hover:text-brand-700 transition-colors disabled:opacity-50"
      >
        <ArrowDownTrayIcon className="h-3.5 w-3.5" strokeWidth={2} />
        {exporting ? 'Exporting…' : 'Export'}
        <ChevronDownIcon className="h-3 w-3 text-gray-400" strokeWidth={2.5} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-40 rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
          <button
            onClick={handlePdf}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <DocumentIcon className="h-3.5 w-3.5 text-red-400" strokeWidth={1.75} />
            PDF — Gantt
          </button>
          <button
            onClick={handleCsv}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <TableCellsIcon className="h-3.5 w-3.5 text-green-500" strokeWidth={1.75} />
            CSV — Table
          </button>
        </div>
      )}
    </div>
  )
}

// ── Import CSV modal ───────────────────────────────────────────────────────

function parseCsv(text: string): { rows: Record<string, string>[]; errors: string[] } {
  function splitRow(line: string): string[] {
    const fields: string[] = []
    let cur = ''
    let inQ = false
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++ }
        else { inQ = !inQ }
      } else if (line[i] === ',' && !inQ) {
        fields.push(cur); cur = ''
      } else {
        cur += line[i]
      }
    }
    fields.push(cur)
    return fields
  }

  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return { rows: [], errors: ['File is empty or has no data rows.'] }

  const header = splitRow(lines[0]).map((h) => h.trim().toLowerCase())
  const REQUIRED = ['type', 'phase', 'milestone', 'status']
  const missing  = REQUIRED.filter((r) => !header.includes(r))
  if (missing.length > 0) {
    return {
      rows: [],
      errors: [`Missing required columns: ${missing.join(', ')}. Download the export CSV to get the correct format.`],
    }
  }

  function col(cells: string[], name: string) {
    const idx = header.indexOf(name)
    return idx >= 0 ? (cells[idx] ?? '').trim() : ''
  }

  const rows: Record<string, string>[] = []
  const errors: string[] = []
  for (let i = 1; i < lines.length; i++) {
    const cells = splitRow(lines[i])
    const type  = col(cells, 'type')
    if (type !== 'Phase' && type !== 'Milestone') {
      errors.push(`Row ${i + 1}: Type must be "Phase" or "Milestone", got "${type}".`)
      continue
    }
    rows.push({
      type,
      phase:          col(cells, 'phase'),
      milestone:      col(cells, 'milestone'),
      status:         col(cells, 'status'),
      startDate:      col(cells, 'start date'),
      endDate:        col(cells, 'end date'),
      dueDate:        col(cells, 'due date'),
      completedDate:  col(cells, 'completed date'),
      clientVisible:  col(cells, 'client visible'),
      triggersDraw:   col(cells, 'triggers draw'),
      triggersInvoice: col(cells, 'triggers invoice'),
      invoiceAmount:  col(cells, 'invoice amount ($)'),
      dependsOn:      col(cells, 'depends on (milestone name)'),
      lagDays:        col(cells, 'lag days'),
    })
  }
  return { rows, errors }
}

function ImportCsvModal({
  projectId,
  tenantId,
  phases,
  onClose,
  onImported,
}: {
  projectId: string
  tenantId: string
  phases: ProjectPhase[]
  onClose: () => void
  onImported: () => void
}) {
  const toast        = useToast()
  const queryClient  = useQueryClient()

  const [step,      setStep]     = useState<'pick' | 'preview' | 'applying'>('pick')
  const [parsed,    setParsed]   = useState<Record<string, string>[]>([])
  const [errors,    setErrors]   = useState<string[]>([])
  const [fileName,  setFileName] = useState('')

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = (ev) => {
      const { rows, errors: errs } = parseCsv(ev.target?.result as string)
      setParsed(rows)
      setErrors(errs)
      setStep('preview')
    }
    reader.readAsText(file)
  }

  const phaseCount     = parsed.filter((r) => r.type === 'Phase').length
  const milestoneCount = parsed.filter((r) => r.type === 'Milestone').length

  // Map status label → status key
  const statusLabelMap: Record<string, string> = {}
  for (const [k, v] of Object.entries(PHASE_STATUS)) statusLabelMap[v.label.toLowerCase()] = k

  async function applyImport() {
    setStep('applying')
    try {
      // Delete all existing phases (cascades to milestones via service)
      for (const phase of phases) {
        await deletePhase(supabase, phase.id, tenantId)
      }

      // Group rows by phase
      type PhaseGroup = { row: Record<string, string>; milestones: Record<string, string>[] }
      const groups: PhaseGroup[] = []
      let cur: PhaseGroup | null = null
      for (const row of parsed) {
        if (row.type === 'Phase') {
          cur = { row, milestones: [] }
          groups.push(cur)
        } else if (cur) {
          cur.milestones.push(row)
        }
      }

      // Insert phases and milestones; track name→id for second pass
      const nameToId  = new Map<string, string>()
      const pendingDeps: { id: string; dependsOn: string; lagDays: number }[] = []

      for (let pi = 0; pi < groups.length; pi++) {
        const { row: pr, milestones } = groups[pi]
        const phaseStatus = statusLabelMap[pr.status.toLowerCase()] ?? 'not_started'
        const newPhase = await upsertPhase(supabase, tenantId, projectId, {
          name:       pr.phase,
          status:     phaseStatus as ProjectPhase['status'],
          start_date: pr.startDate || null,
          end_date:   pr.endDate   || null,
          sequence:   pi,
        })

        for (let mi = 0; mi < milestones.length; mi++) {
          const mr = milestones[mi]
          const mStatus = statusLabelMap[mr.status.toLowerCase()] ?? 'not_started'
          const newM = await upsertMilestone(supabase, tenantId, projectId, {
            phase_id:              newPhase.id,
            name:                  mr.milestone || `Milestone ${mi + 1}`,
            status:                mStatus,
            due_date:              mr.dueDate       || null,
            completed_date:        mr.completedDate || null,
            sequence:              mi,
            is_client_visible:     mr.clientVisible.toLowerCase() === 'yes',
            requires_client_approval: false,
            triggers_draw_request: mr.triggersDraw.toLowerCase() === 'yes',
            triggers_invoice:      mr.triggersInvoice.toLowerCase() === 'yes',
            invoice_amount_cents:  mr.triggersInvoice.toLowerCase() === 'yes' && mr.invoiceAmount
              ? Math.round(parseFloat(mr.invoiceAmount.replace(/,/g, '')) * 100)
              : mr.triggersInvoice.toLowerCase() === 'yes' ? null : undefined,
          })
          nameToId.set(mr.milestone, newM.id)
          if (mr.dependsOn) {
            pendingDeps.push({ id: newM.id, dependsOn: mr.dependsOn, lagDays: parseInt(mr.lagDays, 10) || 0 })
          }
        }
      }

      // Second pass: patch predecessor_id
      for (const dep of pendingDeps) {
        const predId = nameToId.get(dep.dependsOn)
        if (predId) {
          await setMilestonePredecessor(supabase, dep.id, tenantId, predId, dep.lagDays)
        }
      }

      void queryClient.invalidateQueries({ queryKey: ['project-phases', projectId] })
      toast.success(`Imported ${phaseCount} phase${phaseCount !== 1 ? 's' : ''} and ${milestoneCount} milestone${milestoneCount !== 1 ? 's' : ''}`)
      onImported()
      onClose()
    } catch (err) {
      toast.error('Import failed', err instanceof Error ? err.message : 'Try again.')
      setStep('preview')
    }
  }

  return (
    <ModalShell title="Import Schedule from CSV" onClose={onClose}>
      <div className="flex flex-col flex-1 min-h-0">
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {step === 'pick' && (
            <>
              <p className="text-sm text-gray-600">
                Upload a CSV file in the schedule export format. The existing schedule will be replaced.
              </p>
              <label className="block cursor-pointer rounded-xl border-2 border-dashed border-gray-200 px-6 py-10 text-center hover:border-brand-300 transition-colors">
                <input type="file" accept=".csv" className="sr-only" onChange={handleFile} />
                <ArrowUpTrayIcon className="mx-auto mb-2 h-8 w-8 text-gray-300" strokeWidth={1} />
                <p className="text-sm font-medium text-brand-600">Click to select a CSV file</p>
                <p className="mt-1 text-xs text-gray-400">Must match the schedule export format</p>
              </label>
            </>
          )}

          {(step === 'preview' || step === 'applying') && (
            <>
              <div className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-gray-800">{fileName}</p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {phaseCount} phase{phaseCount !== 1 ? 's' : ''} · {milestoneCount} milestone{milestoneCount !== 1 ? 's' : ''}
                    {errors.length > 0 && ` · ${errors.length} error${errors.length !== 1 ? 's' : ''}`}
                  </p>
                </div>
                {step === 'preview' && (
                  <button type="button" onClick={() => { setStep('pick'); setParsed([]); setErrors([]) }}
                    className="text-xs text-gray-500 hover:text-gray-700">
                    Change file
                  </button>
                )}
              </div>

              {errors.length > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                  <p className="mb-1 text-xs font-semibold text-red-700">Fix these errors before importing:</p>
                  <ul className="space-y-0.5">
                    {errors.map((e, i) => <li key={i} className="text-xs text-red-600">• {e}</li>)}
                  </ul>
                </div>
              )}

              {errors.length === 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                  <strong>Replace mode:</strong> All existing phases and milestones will be deleted and replaced with the imported data. This cannot be undone.
                </div>
              )}

              {milestoneCount > 0 && (
                <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-200">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-gray-50">
                      <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                        <th className="px-3 py-2">Phase</th>
                        <th className="px-3 py-2">Milestone</th>
                        <th className="px-3 py-2">Due Date</th>
                        <th className="px-3 py-2">Depends On</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {parsed.filter((r) => r.type === 'Milestone').map((r, i) => (
                        <tr key={i}>
                          <td className="px-3 py-1.5 text-gray-500">{r.phase}</td>
                          <td className="px-3 py-1.5 font-medium text-gray-800">{r.milestone}</td>
                          <td className="px-3 py-1.5 text-gray-500">{r.dueDate || '—'}</td>
                          <td className="px-3 py-1.5 text-gray-500">{r.dependsOn || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 rounded-b-2xl border-t border-gray-200 bg-gray-50 px-5 py-3">
          <button type="button" onClick={onClose} disabled={step === 'applying'}
            className="h-8 rounded-lg px-3.5 text-sm font-medium text-gray-700 hover:bg-gray-200 transition-colors disabled:opacity-50">
            Cancel
          </button>
          {step === 'preview' && (
            <button type="button" onClick={() => void applyImport()}
              disabled={errors.length > 0 || parsed.length === 0}
              className="inline-flex h-8 items-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-700 disabled:opacity-60">
              Import Schedule
            </button>
          )}
          {step === 'applying' && (
            <button disabled
              className="inline-flex h-8 items-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white shadow-sm opacity-60">
              Importing…
            </button>
          )}
        </div>
      </div>
    </ModalShell>
  )
}

// ── Loading skeleton ───────────────────────────────────────────────────────

function ScheduleSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2].map((i) => (
        <div key={i} className="overflow-hidden rounded-xl border border-gray-200 bg-white p-5 shadow-card">
          <div className="mb-4 flex items-center justify-between">
            <div className="space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-28" />
            </div>
            <Skeleton className="h-8 w-16" />
          </div>
          <Skeleton className="mb-4 h-1 w-full rounded-full" />
          {[1, 2, 3].map((j) => (
            <div key={j} className="flex gap-3 py-3 border-b border-gray-100 last:border-0">
              <Skeleton className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-3/5" />
                <Skeleton className="h-3 w-1/4" />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

// ── Summary bar ────────────────────────────────────────────────────────────

function SummaryBar({ phases }: { phases: ProjectPhase[] }) {
  const totalPhases     = phases.length
  const totalMilestones = phases.reduce((n, p) => n + p.milestones.length, 0)
  const doneMilestones  = phases.reduce(
    (n, p) => n + p.milestones.filter((m) => m.status === 'complete' || m.status === 'approved').length, 0,
  )
  const overdueMilestones = phases.reduce(
    (n, p) => n + p.milestones.filter((m) => isOverdue(m.due_date, m.completed_date)).length, 0,
  )
  const blockedPhases = phases.filter((p) => p.status === 'blocked').length
  const pct = totalMilestones > 0 ? Math.round((doneMilestones / totalMilestones) * 100) : 0

  return (
    <div className="mb-4 rounded-xl border border-gray-200 bg-white p-4 shadow-card">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div>
          <p className="text-xs font-medium text-gray-500">Phases</p>
          <p className="text-lg font-semibold tabular-nums text-gray-900">{totalPhases}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-gray-500">Milestones</p>
          <p className="text-lg font-semibold tabular-nums text-gray-900">
            {doneMilestones}<span className="text-sm text-gray-400"> / {totalMilestones}</span>
          </p>
        </div>
        <div>
          <p className="text-xs font-medium text-gray-500">Complete</p>
          <p className="text-lg font-semibold tabular-nums text-gray-900">{pct}%</p>
        </div>
        {overdueMilestones > 0 && (
          <div className="flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2">
            <ExclamationTriangleIcon className="h-4 w-4 text-amber-500" strokeWidth={2} />
            <span className="text-sm font-medium text-amber-700">{overdueMilestones} overdue</span>
          </div>
        )}
        {blockedPhases > 0 && (
          <div className="flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-2">
            <ExclamationTriangleIcon className="h-4 w-4 text-red-500" strokeWidth={2} />
            <span className="text-sm font-medium text-red-700">{blockedPhases} blocked</span>
          </div>
        )}
      </div>
      {totalMilestones > 0 && (
        <div className="mt-3">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
            <div className="h-full rounded-full bg-brand-500 transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}
    </div>
  )
}

// ── View toggle ────────────────────────────────────────────────────────────

type ViewMode = 'list' | 'gantt'

function ViewToggle({ value, onChange }: { value: ViewMode; onChange: (v: ViewMode) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
      {(['list', 'gantt'] as ViewMode[]).map((v) => (
        <button key={v} onClick={() => onChange(v)}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors capitalize ${
            value === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}>
          {v === 'list' ? '☰  List' : '▬  Gantt'}
        </button>
      ))}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export function ScheduleTab() {
  const { id: projectId } = useParams<{ id: string }>()
  const { project, isLoading: projectLoading } = useOutletContext<OutletCtx>()
  const { activeTenantId, tenantMemberships } = useAuth()
  const { data: phases, isLoading: phasesLoading } = useProjectPhases(projectId)
  const queryClient = useQueryClient()
  const [view, setView] = useState<ViewMode>('list')
  const [modal, setModal] = useState<ModalState>({ type: 'none' })

  const isLoading      = projectLoading || phasesLoading
  const sorted         = phases ? [...phases].sort((a, b) => a.sequence - b.sequence) : []
  const tenantId       = activeTenantId ?? ''
  const activeRole     = tenantMemberships.find((m) => m.tenant_id === tenantId)?.role ?? ''
  const isSubcontractor = activeRole === 'subcontractor'
  const canEdit        = !isSubcontractor
  const hideFinancials = isSubcontractor

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ['project-phases', projectId] })
  }

  // Delete phase mutation
  const deletePhaseMut = useMutation({
    mutationFn: (phaseId: string) => deletePhase(supabase, phaseId, tenantId),
    onSuccess: () => { refresh(); setModal({ type: 'none' }) },
  })

  // Delete milestone mutation
  const deleteMilestoneMut = useMutation({
    mutationFn: (milestoneId: string) => deleteMilestone(supabase, milestoneId, tenantId),
    onSuccess: () => { refresh(); setModal({ type: 'none' }) },
  })

  const toast = useToast()

  // Cascade apply mutation — looks up full milestone data to preserve all existing fields
  const cascadeMut = useMutation({
    mutationFn: async (changes: MilestoneCascadeChange[]) => {
      const msMap = new Map<string, ProjectMilestone>()
      for (const phase of sorted) {
        for (const m of phase.milestones) msMap.set(m.id, m)
      }
      await Promise.all(
        changes.map((c) => {
          const m = msMap.get(c.id)
          if (!m) return Promise.resolve({ id: c.id })
          return upsertMilestone(supabase, tenantId, projectId!, {
            id:                       m.id,
            phase_id:                 m.phase_id,
            name:                     m.name,
            description:              m.description,
            due_date:                 c.newDate,
            completed_date:           m.completed_date,
            status:                   m.status,
            sequence:                 m.sequence,
            is_client_visible:        m.is_client_visible,
            requires_client_approval: m.requires_client_approval,
            triggers_draw_request:    m.triggers_draw_request,
            triggers_invoice:         m.triggers_invoice,
            invoice_amount_cents:     m.invoice_amount_cents ?? undefined,
            predecessor_id:           m.predecessor_id,
            lag_days:                 m.lag_days,
          })
        }),
      )
    },
    onSuccess: () => { refresh(); setModal({ type: 'none' }) },
    onError:   (err) => {
      toast.error('Cascade update failed', err instanceof Error ? err.message : 'Try again.')
      setModal({ type: 'none' })
    },
  })

  return (
    <div className="px-5 py-6 lg:px-8">
      {isLoading ? (
        <ScheduleSkeleton />
      ) : sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-white py-16 text-center">
          <CalendarIcon className="mx-auto h-10 w-10 text-gray-300" strokeWidth={1} />
          <h3 className="mt-3 text-sm font-semibold text-gray-900">No schedule yet</h3>
          <p className="mt-1 text-sm text-gray-500 max-w-xs">
            {canEdit ? 'Add a phase to start building the project schedule.' : 'The schedule has not been set up yet.'}
          </p>
          {canEdit && (
            <button
              onClick={() => setModal({ type: 'add-phase' })}
              className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700 transition-colors"
            >
              <PlusIcon className="h-4 w-4" strokeWidth={2.5} />
              Add Phase
            </button>
          )}
        </div>
      ) : (
        <>
          <SummaryBar phases={sorted} />

          <div className="mb-4 flex items-center justify-between gap-3">
            {canEdit ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setModal({ type: 'add-phase' })}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 hover:border-brand-300 hover:text-brand-700 transition-colors"
                >
                  <PlusIcon className="h-3.5 w-3.5" strokeWidth={2.5} />
                  Add Phase
                </button>
                <button
                  onClick={() => setModal({ type: 'import-csv' })}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 hover:border-brand-300 hover:text-brand-700 transition-colors"
                >
                  <ArrowUpTrayIcon className="h-3.5 w-3.5" strokeWidth={2.5} />
                  Import CSV
                </button>
              </div>
            ) : <div />}
            <div className="flex items-center gap-2">
              <ExportMenu phases={sorted} projectName={project?.job?.job_name ?? 'Project'} />
              <ViewToggle value={view} onChange={setView} />
            </div>
          </div>

          {view === 'list' ? (
            <div className="space-y-4">
              {sorted.map((phase) => (
                <PhaseCard
                  key={phase.id}
                  phase={phase}
                  canEdit={canEdit}
                  hideFinancials={hideFinancials}
                  onEditPhase={(p) => setModal({ type: 'edit-phase', phase: p })}
                  onDeletePhase={(p) => setModal({ type: 'delete-phase', phase: p })}
                  onAddMilestone={(phaseId, nextSeq) => setModal({ type: 'add-milestone', phaseId, nextSeq })}
                  onEditMilestone={(m) => setModal({ type: 'edit-milestone', milestone: m })}
                  onDeleteMilestone={(m) => setModal({ type: 'delete-milestone', milestone: m })}
                />
              ))}
            </div>
          ) : (
            <GanttView phases={sorted} />
          )}
        </>
      )}

      {/* ── Modals ──────────────────────────────────────────────────────── */}

      {(modal.type === 'add-phase' || modal.type === 'edit-phase') && (
        <PhaseModal
          projectId={projectId!}
          tenantId={tenantId}
          phase={modal.type === 'edit-phase' ? modal.phase : undefined}
          nextSequence={sorted.length}
          onClose={() => setModal({ type: 'none' })}
          onSaved={refresh}
        />
      )}

      {(modal.type === 'add-milestone' || modal.type === 'edit-milestone') && (
        <MilestoneModal
          projectId={projectId!}
          tenantId={tenantId}
          phases={sorted}
          milestone={modal.type === 'edit-milestone' ? modal.milestone : undefined}
          defaultPhaseId={modal.type === 'add-milestone' ? modal.phaseId : undefined}
          nextSequence={modal.type === 'add-milestone' ? modal.nextSeq : 0}
          onClose={() => setModal({ type: 'none' })}
          onSaved={refresh}
          onCascadeNeeded={(changes) => setModal({ type: 'cascade-confirm', changes })}
        />
      )}

      {modal.type === 'delete-phase' && (
        <DeleteConfirmModal
          label={`phase "${modal.phase.name}"`}
          onConfirm={() => deletePhaseMut.mutate(modal.phase.id)}
          onClose={() => setModal({ type: 'none' })}
          isPending={deletePhaseMut.isPending}
        />
      )}

      {modal.type === 'delete-milestone' && (
        <DeleteConfirmModal
          label={`milestone "${modal.milestone.name}"`}
          onConfirm={() => deleteMilestoneMut.mutate(modal.milestone.id)}
          onClose={() => setModal({ type: 'none' })}
          isPending={deleteMilestoneMut.isPending}
        />
      )}

      {modal.type === 'cascade-confirm' && (
        <CascadeConfirmModal
          changes={modal.changes}
          onConfirm={() => cascadeMut.mutate(modal.changes)}
          onClose={() => setModal({ type: 'none' })}
          isPending={cascadeMut.isPending}
        />
      )}

      {modal.type === 'import-csv' && (
        <ImportCsvModal
          projectId={projectId!}
          tenantId={tenantId}
          phases={sorted}
          onClose={() => setModal({ type: 'none' })}
          onImported={refresh}
        />
      )}
    </div>
  )
}
