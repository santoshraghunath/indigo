import { useState, useRef } from 'react'
import { useOutletContext, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  ProjectRow,
  ProjectRfi,
  CreateRfiInput,
  UpdateRfiInput,
  RfiAssignee,
} from '@indigo/shared'
import {
  getProjectRfis,
  createRfi,
  updateRfi,
  submitRfi,
  answerRfi,
  requestRfiClarification,
  respondToRfiClarification,
  closeRfi,
  voidRfi,
  getProjectRfiAssignees,
  uploadProjectDocument,
} from '@indigo/shared'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/stores/toastStore'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import {
  PlusIcon,
  XMarkIcon,
  PencilIcon,
  PaperClipIcon,
  SparklesIcon,
  ExclamationTriangleIcon,
  CheckIcon,
  ChevronRightIcon,
} from '@/components/ui/Icons'

interface OutletCtx {
  project: ProjectRow | undefined
  isLoading: boolean
}

// ── Status config ──────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  draft:        { label: 'Draft',        color: 'text-gray-600',   bg: 'bg-gray-100'   },
  submitted:    { label: 'Submitted',    color: 'text-blue-700',   bg: 'bg-blue-50'    },
  under_review: { label: 'Under Review', color: 'text-amber-700',  bg: 'bg-amber-50'   },
  answered:     { label: 'Answered',     color: 'text-green-700',  bg: 'bg-green-50'   },
  closed:       { label: 'Closed',       color: 'text-slate-600',  bg: 'bg-slate-100'  },
  void:         { label: 'Void',         color: 'text-red-600',    bg: 'bg-red-50'     },
}

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  low:    { label: 'Low',    color: 'text-gray-500'  },
  normal: { label: 'Normal', color: 'text-blue-600'  },
  high:   { label: 'High',   color: 'text-amber-600' },
  urgent: { label: 'Urgent', color: 'text-red-600'   },
}

type FilterKey = 'all' | 'open' | 'answered' | 'closed'

const FILTER_STATUS: Record<FilterKey, string[]> = {
  all:      [],
  open:     ['draft', 'submitted', 'under_review'],
  answered: ['answered'],
  closed:   ['closed', 'void'],
}

// ── Helpers ────────────────────────────────────────────────────────────────

function statusBadge(status: string) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: 'text-gray-600', bg: 'bg-gray-100' }
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${cfg.bg} ${cfg.color}`}>
      {cfg.label}
    </span>
  )
}

function fmtProfile(p: { first_name: string | null; last_name: string | null } | null) {
  if (!p) return '—'
  return [p.first_name, p.last_name].filter(Boolean).join(' ') || '—'
}

function fmtDate(d: string | null) {
  if (!d) return null
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function isOverdue(rfi: ProjectRfi) {
  if (!rfi.due_date) return false
  if (['answered', 'closed', 'void'].includes(rfi.status)) return false
  return new Date(rfi.due_date) < new Date()
}

// ── RFI list item ──────────────────────────────────────────────────────────

function RfiListItem({
  rfi,
  selected,
  onClick,
}: {
  rfi: ProjectRfi
  selected: boolean
  onClick: () => void
}) {
  const overdue = isOverdue(rfi)
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left px-4 py-3 border-b border-gray-100 transition-colors hover:bg-gray-50 focus:outline-none focus-visible:bg-gray-50 ${selected ? 'bg-brand-50' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs text-gray-400 shrink-0">
              RFI-{String(rfi.number).padStart(3, '0')}
            </span>
            {statusBadge(rfi.status)}
            {overdue && (
              <span className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-red-50 text-red-600">
                <ExclamationTriangleIcon className="h-3 w-3" />
                Overdue
              </span>
            )}
          </div>
          <p className="mt-1 text-sm font-medium text-gray-900 truncate">{rfi.subject}</p>
          {rfi.assigned_to_profile && (
            <p className="text-xs text-gray-500 mt-0.5">
              → {fmtProfile(rfi.assigned_to_profile)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 text-gray-400 shrink-0">
          {rfi.due_date && (
            <span className={`text-xs ${overdue ? 'text-red-500' : 'text-gray-400'}`}>
              {fmtDate(rfi.due_date)}
            </span>
          )}
          <ChevronRightIcon className="h-3.5 w-3.5" />
        </div>
      </div>
    </button>
  )
}

// ── Create / Edit modal ────────────────────────────────────────────────────

function CreateEditModal({
  rfi,
  projectId,
  tenantId,
  jobId,
  submittedBy,
  onClose,
  onSaved,
}: {
  rfi: ProjectRfi | null
  projectId: string
  tenantId: string
  jobId: string
  submittedBy: string
  onClose: () => void
  onSaved: () => void
}) {
  const toast = useToast()
  const [subject,      setSubject]      = useState(rfi?.subject ?? '')
  const [question,     setQuestion]     = useState(rfi?.question ?? '')
  const [assignedTo,   setAssignedTo]   = useState(rfi?.assigned_to ?? '')
  const [priority,     setPriority]     = useState(rfi?.priority ?? 'normal')
  const [dueDate,      setDueDate]      = useState(rfi?.due_date ?? '')
  const [costImpact,   setCostImpact]   = useState(
    rfi?.cost_impact_cents != null ? String(rfi.cost_impact_cents / 100) : '',
  )
  const [schedImpact,  setSchedImpact]  = useState(
    rfi?.schedule_impact_days != null ? String(rfi.schedule_impact_days) : '',
  )
  const [isDrafting,   setIsDrafting]   = useState(false)

  const { data: assignees = [] } = useQuery<RfiAssignee[]>({
    queryKey: ['rfi-assignees', tenantId, jobId],
    queryFn:  () => getProjectRfiAssignees(supabase, tenantId, jobId),
    staleTime: 60_000,
  })

  const qc = useQueryClient()

  async function notifyRfi(rfiId: string, event: 'submitted' | 'answered') {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      await fetch('/.netlify/functions/notify-rfi', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ rfiId, tenantId, event }),
      })
    } catch {
      // Non-fatal: notification failure should not block the user
    }
  }

  const saveMut = useMutation({
    mutationFn: async (andSubmit: boolean) => {
      const input: CreateRfiInput | UpdateRfiInput = {
        subject:              subject.trim(),
        question:             question.trim(),
        priority,
        assigned_to:          assignedTo || null,
        due_date:             dueDate || null,
        cost_impact_cents:    costImpact ? Math.round(parseFloat(costImpact) * 100) : null,
        schedule_impact_days: schedImpact ? parseInt(schedImpact) : null,
      }
      if (rfi) {
        await updateRfi(supabase, rfi.id, input)
        if (andSubmit && rfi.status === 'draft') {
          await submitRfi(supabase, rfi.id, submittedBy)
          notifyRfi(rfi.id, 'submitted')
        }
        return rfi.id
      } else {
        const created = await createRfi(supabase, { ...(input as CreateRfiInput), project_id: projectId, tenant_id: tenantId })
        if (andSubmit) {
          await submitRfi(supabase, created.id, submittedBy)
          notifyRfi(created.id, 'submitted')
        }
        return created.id
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project-rfis', projectId] })
      onSaved()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  async function handleDraftWithAI() {
    if (!subject.trim()) { toast.error('Enter a subject first so the AI has context'); return }
    setIsDrafting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      const res = await fetch('/.netlify/functions/draft-rfi', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ tenantId, subject: subject.trim() }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(j.error ?? `Draft failed (${res.status})`)
      }
      const j = await res.json() as { question?: string; text?: string }
      const draft = j.question ?? j.text ?? ''
      if (draft) {
        setQuestion(draft)
        toast.success('AI draft ready — review and edit before saving')
      } else {
        toast.error('No draft text returned')
      }
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setIsDrafting(false)
    }
  }

  const inputCls =
    'block w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 ' +
    'placeholder:text-gray-400 focus:bg-white focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 transition-colors'

  const isEditing = !!rfi

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-16 pb-8 overflow-y-auto">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-xl rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-base font-semibold text-gray-900">
            {isEditing ? 'Edit RFI' : 'New RFI'}
          </h2>
          <button type="button" onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
            <XMarkIcon className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Subject */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Subject <span className="text-red-500">*</span></label>
            <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Beam pocket dimensions at grid A-3" className={inputCls} />
          </div>

          {/* Question */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">Question <span className="text-red-500">*</span></label>
              <button type="button" onClick={handleDraftWithAI} disabled={isDrafting}
                className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 disabled:opacity-50 transition-colors">
                <SparklesIcon className="h-3.5 w-3.5" />
                {isDrafting ? 'Drafting…' : 'AI Draft'}
              </button>
            </div>
            <textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={5}
              placeholder="Describe the information being requested in detail…"
              className={`${inputCls} resize-y`} />
          </div>

          {/* Assign to */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Assign to</label>
            <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} className={inputCls}>
              <option value="">— Unassigned —</option>
              {assignees
                .filter((a) => ['designer', 'client'].includes(a.role))
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.role === 'client' ? 'Client' : 'Designer'})
                  </option>
                ))}
              {assignees.filter((a) => !['designer', 'client'].includes(a.role)).length > 0 && (
                <optgroup label="Other staff">
                  {assignees
                    .filter((a) => !['designer', 'client'].includes(a.role))
                    .map((a) => (
                      <option key={a.id} value={a.id}>{a.name} ({a.role.replace('_', ' ')})</option>
                    ))}
                </optgroup>
              )}
            </select>
          </div>

          {/* Row: priority + due date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Priority</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value)} className={inputCls}>
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Due date</label>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputCls} />
            </div>
          </div>

          {/* Row: cost + schedule impact */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Cost impact ($)</label>
              <input type="number" min="0" step="0.01" value={costImpact}
                onChange={(e) => setCostImpact(e.target.value)}
                placeholder="0.00" className={inputCls} />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Schedule impact (days)</label>
              <input type="number" min="0" value={schedImpact}
                onChange={(e) => setSchedImpact(e.target.value)}
                placeholder="0" className={inputCls} />
            </div>
          </div>
        </div>

        <div className="flex gap-2 border-t border-gray-100 px-5 py-4">
          <Button type="button" variant="ghost" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button type="button" variant="secondary" loading={saveMut.isPending}
            onClick={() => saveMut.mutate(false)}
            disabled={!subject.trim() || !question.trim() || saveMut.isPending}
            className="flex-1">
            Save draft
          </Button>
          <Button type="button" loading={saveMut.isPending}
            onClick={() => saveMut.mutate(true)}
            disabled={!subject.trim() || !question.trim() || saveMut.isPending}
            className="flex-1">
            {isEditing && rfi?.status !== 'draft' ? 'Save' : 'Submit'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── RFI detail panel ───────────────────────────────────────────────────────

function RfiDetail({
  rfi,
  canManage,
  currentUserId,
  onEdit,
  onClose,
  onAction,
}: {
  rfi: ProjectRfi
  canManage: boolean
  currentUserId: string
  onEdit: () => void
  onClose: () => void
  onAction: () => void
}) {
  const toast = useToast()
  const qc = useQueryClient()
  const [answerText,   setAnswerText]   = useState(rfi.answer ?? '')
  const [clarText,     setClarText]     = useState('')
  const [clarRespText, setClarRespText] = useState('')
  const [attachments,  setAttachments]  = useState<File[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  const canAnswer  = rfi.assigned_to === currentUserId && ['submitted', 'under_review'].includes(rfi.status)
  const canClarify = rfi.assigned_to === currentUserId && rfi.status === 'submitted' && !rfi.clarification_request
  const pmCanRespond = canManage && rfi.status === 'under_review' && !!rfi.clarification_request

  async function notifyAnswer() {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      await fetch('/.netlify/functions/notify-rfi', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ rfiId: rfi.id, tenantId: rfi.tenant_id, event: 'answered' }),
      })
    } catch {
      // Non-fatal
    }
  }

  const answerMut = useMutation({
    mutationFn: async () => {
      let docIds = [...(rfi.document_ids ?? [])]
      if (attachments.length) {
        const { data: { session } } = await supabase.auth.getSession()
        const userId = session?.user?.id
        if (!userId) throw new Error('Not authenticated')
        for (const file of attachments) {
          const doc = await uploadProjectDocument(supabase, rfi.tenant_id, rfi.project_id, userId, file, {
            type: 'other',
            isClientVisible: false,
          })
          docIds.push(doc.id)
        }
      }
      await answerRfi(supabase, rfi.id, answerText.trim(), docIds)
      notifyAnswer()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project-rfis', rfi.project_id] })
      setAttachments([])
      toast.success('Answer submitted')
      onAction()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const clarMut = useMutation({
    mutationFn: () => requestRfiClarification(supabase, rfi.id, clarText.trim()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project-rfis', rfi.project_id] })
      setClarText('')
      toast.success('Clarification request sent')
      onAction()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const clarRespMut = useMutation({
    mutationFn: () => respondToRfiClarification(supabase, rfi.id, clarRespText.trim()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project-rfis', rfi.project_id] })
      setClarRespText('')
      toast.success('Response sent')
      onAction()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const closeMut = useMutation({
    mutationFn: () => closeRfi(supabase, rfi.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project-rfis', rfi.project_id] })
      toast.success('RFI closed')
      onAction()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const voidMut = useMutation({
    mutationFn: () => voidRfi(supabase, rfi.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project-rfis', rfi.project_id] })
      toast.success('RFI voided')
      onAction()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const inputCls =
    'block w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 ' +
    'placeholder:text-gray-400 focus:bg-white focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 transition-colors'

  const overdue = isOverdue(rfi)
  const prio = PRIORITY_CONFIG[rfi.priority] ?? { label: rfi.priority, color: 'text-gray-500' }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-mono text-xs text-gray-400">RFI-{String(rfi.number).padStart(3, '0')}</span>
            {statusBadge(rfi.status)}
            {overdue && (
              <span className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-red-50 text-red-600">
                <ExclamationTriangleIcon className="h-3 w-3" />
                Overdue
              </span>
            )}
          </div>
          <h3 className="text-base font-semibold text-gray-900 leading-tight">{rfi.subject}</h3>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {canManage && ['draft', 'submitted'].includes(rfi.status) && (
            <button type="button" onClick={onEdit}
              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors">
              <PencilIcon className="h-4 w-4" />
            </button>
          )}
          <button type="button" onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
            <XMarkIcon className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* Meta grid */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-3 border-b border-gray-100 px-5 py-4 text-sm">
        <div>
          <p className="text-xs text-gray-500 mb-0.5">Submitted by</p>
          <p className="font-medium text-gray-900">{fmtProfile(rfi.submitted_by_profile)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-0.5">Assigned to</p>
          <p className="font-medium text-gray-900">{fmtProfile(rfi.assigned_to_profile)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-0.5">Priority</p>
          <p className={`font-medium ${prio.color}`}>{prio.label}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-0.5">Due date</p>
          <p className={`font-medium ${overdue ? 'text-red-600' : 'text-gray-900'}`}>
            {fmtDate(rfi.due_date) ?? '—'}
          </p>
        </div>
        {rfi.submitted_at && (
          <div>
            <p className="text-xs text-gray-500 mb-0.5">Submitted</p>
            <p className="font-medium text-gray-900">{fmtDate(rfi.submitted_at)}</p>
          </div>
        )}
        {rfi.answered_at && (
          <div>
            <p className="text-xs text-gray-500 mb-0.5">Answered</p>
            <p className="font-medium text-gray-900">{fmtDate(rfi.answered_at)}</p>
          </div>
        )}
        {(rfi.cost_impact_cents != null || rfi.schedule_impact_days != null) && (
          <>
            {rfi.cost_impact_cents != null && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Cost impact</p>
                <p className="font-medium text-gray-900">
                  ${(rfi.cost_impact_cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </p>
              </div>
            )}
            {rfi.schedule_impact_days != null && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Schedule impact</p>
                <p className="font-medium text-gray-900">{rfi.schedule_impact_days} days</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Question */}
      <div className="border-b border-gray-100 px-5 py-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">Question</p>
        <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{rfi.question}</p>
      </div>

      {/* Clarification thread */}
      {(rfi.clarification_request || pmCanRespond || canClarify) && (
        <div className="border-b border-gray-100 px-5 py-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Clarification</p>

          {rfi.clarification_request && (
            <div className="rounded-lg bg-amber-50 border border-amber-100 px-4 py-3">
              <p className="text-xs font-semibold text-amber-700 mb-1">Request from assignee</p>
              <p className="text-sm text-amber-900 whitespace-pre-wrap">{rfi.clarification_request}</p>
            </div>
          )}

          {rfi.clarification_response && (
            <div className="rounded-lg bg-blue-50 border border-blue-100 px-4 py-3">
              <p className="text-xs font-semibold text-blue-700 mb-1">PM response</p>
              <p className="text-sm text-blue-900 whitespace-pre-wrap">{rfi.clarification_response}</p>
            </div>
          )}

          {/* PM responds to clarification */}
          {pmCanRespond && (
            <div className="space-y-2">
              <textarea rows={3} value={clarRespText} onChange={(e) => setClarRespText(e.target.value)}
                placeholder="Respond to the clarification request…" className={`${inputCls} resize-y`} />
              <Button size="sm" loading={clarRespMut.isPending}
                disabled={!clarRespText.trim() || clarRespMut.isPending}
                onClick={() => clarRespMut.mutate()}>
                Send response
              </Button>
            </div>
          )}

          {/* Designer requests clarification */}
          {canClarify && (
            <div className="space-y-2">
              <textarea rows={3} value={clarText} onChange={(e) => setClarText(e.target.value)}
                placeholder="Ask for more information before answering…" className={`${inputCls} resize-y`} />
              <Button size="sm" variant="secondary" loading={clarMut.isPending}
                disabled={!clarText.trim() || clarMut.isPending}
                onClick={() => clarMut.mutate()}>
                Request clarification
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Answer — read-only */}
      {rfi.answer && !canAnswer && (
        <div className="border-b border-gray-100 px-5 py-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">Answer</p>
          <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{rfi.answer}</p>
        </div>
      )}

      {/* Answer form — for assignee */}
      {canAnswer && (
        <div className="border-b border-gray-100 px-5 py-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Your answer</p>
          <textarea rows={5} value={answerText} onChange={(e) => setAnswerText(e.target.value)}
            placeholder="Type your answer here…" className={`${inputCls} resize-y`} />

          {/* Attachments */}
          <div>
            <input ref={fileRef} type="file" className="hidden" multiple
              accept=".pdf,.jpg,.jpeg,.png,.dwg,.dxf,.xlsx,.docx"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? [])
                setAttachments((prev) => [...prev, ...files])
                e.target.value = ''
              }} />
            {attachments.length > 0 && (
              <ul className="mb-2 space-y-1">
                {attachments.map((f, i) => (
                  <li key={i} className="flex items-center justify-between text-xs text-gray-600 bg-gray-50 rounded px-2 py-1">
                    <span className="truncate">{f.name}</span>
                    <button type="button" onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                      className="ml-2 text-gray-400 hover:text-red-500 shrink-0">
                      <XMarkIcon className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button type="button" onClick={() => fileRef.current?.click()}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors">
              <PaperClipIcon className="h-3.5 w-3.5" />
              Attach documents
            </button>
          </div>

          <Button loading={answerMut.isPending}
            disabled={!answerText.trim() || answerMut.isPending}
            onClick={() => answerMut.mutate()}>
            <CheckIcon className="h-4 w-4 mr-1" />
            Submit answer
          </Button>
        </div>
      )}

      {/* PM actions */}
      {canManage && (
        <div className="flex flex-wrap gap-2 px-5 py-4">
          {rfi.status === 'answered' && (
            <Button size="sm" loading={closeMut.isPending} onClick={() => closeMut.mutate()}>
              Close RFI
            </Button>
          )}
          {!['closed', 'void'].includes(rfi.status) && (
            <Button size="sm" variant="ghost"
              loading={voidMut.isPending}
              onClick={() => {
                if (confirm('Void this RFI? This cannot be undone.')) voidMut.mutate()
              }}
              className="text-red-600 hover:bg-red-50">
              Void
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main tab ───────────────────────────────────────────────────────────────

export function RfisTab() {
  const { id: projectId } = useParams<{ id: string }>()
  const { project } = useOutletContext<OutletCtx>()
  const { activeTenantId, user, tenantMemberships } = useAuth()

  const tenantId = activeTenantId ?? project?.tenant_id ?? ''
  const jobId    = project?.job_id ?? ''
  const membership    = tenantMemberships.find((m) => m.tenant_id === tenantId)
  const role          = membership?.role ?? null
  const isDesigner    = role === 'designer'
  const canManage     = ['owner', 'admin', 'project_manager'].includes(role ?? '')
  const currentUserId = user?.id ?? ''

  const [filter,      setFilter]      = useState<FilterKey>('all')
  const [selectedId,  setSelectedId]  = useState<string | null>(null)
  const [showCreate,  setShowCreate]  = useState(false)
  const [editingRfi,  setEditingRfi]  = useState<ProjectRfi | null>(null)

  const { data: rfis = [], isLoading } = useQuery<ProjectRfi[]>({
    queryKey: ['project-rfis', projectId],
    queryFn:  () => getProjectRfis(supabase, projectId!, tenantId),
    enabled:  !!projectId && !!tenantId,
  })

  const filterStatuses = FILTER_STATUS[filter]
  const visibleRfis = rfis.filter((r) => {
    if (filterStatuses.length && !filterStatuses.includes(r.status)) return false
    if (isDesigner && r.assigned_to !== currentUserId) return false
    return true
  })

  const selectedRfi = rfis.find((r) => r.id === selectedId) ?? null

  const openCounts = rfis.filter((r) =>
    (isDesigner ? r.assigned_to === currentUserId : true) &&
    ['submitted', 'under_review'].includes(r.status),
  ).length

  function handleSaved() {
    setShowCreate(false)
    setEditingRfi(null)
  }

  function handleEditRfi(rfi: ProjectRfi) {
    setEditingRfi(rfi)
    setShowCreate(true)
  }

  return (
    <div className="flex h-full" style={{ minHeight: '60vh' }}>
      {/* ── Left: list ─────────────────────────────────────────────── */}
      <div className={`flex flex-col ${selectedRfi ? 'hidden lg:flex lg:w-80 xl:w-96 border-r border-gray-200' : 'flex-1'}`}>
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-2 border-b border-gray-200 px-4 py-3">
          <div className="flex items-center gap-1 overflow-x-auto">
            {(['all', 'open', 'answered', 'closed'] as FilterKey[]).map((f) => (
              <button key={f} type="button" onClick={() => setFilter(f)}
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  filter === f
                    ? 'bg-brand-100 text-brand-700'
                    : 'text-gray-500 hover:bg-gray-100'
                }`}>
                {f === 'all' ? `All (${rfis.filter((r) => isDesigner ? r.assigned_to === currentUserId : true).length})` :
                 f === 'open' ? `Open${openCounts ? ` (${openCounts})` : ''}` :
                 f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          {canManage && (
            <Button size="sm" onClick={() => { setEditingRfi(null); setShowCreate(true) }}
              className="shrink-0">
              <PlusIcon className="h-3.5 w-3.5 mr-1" />
              New RFI
            </Button>
          )}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="space-y-0.5 p-4">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
            </div>
          ) : visibleRfis.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <p className="text-sm text-gray-500">
                {filter === 'all' && rfis.length === 0
                  ? 'No RFIs yet.'
                  : 'No RFIs match this filter.'}
              </p>
              {canManage && filter === 'all' && rfis.length === 0 && (
                <Button size="sm" className="mt-4" onClick={() => { setEditingRfi(null); setShowCreate(true) }}>
                  <PlusIcon className="h-3.5 w-3.5 mr-1" />
                  Create first RFI
                </Button>
              )}
            </div>
          ) : (
            visibleRfis.map((rfi) => (
              <RfiListItem
                key={rfi.id}
                rfi={rfi}
                selected={rfi.id === selectedId}
                onClick={() => setSelectedId(rfi.id === selectedId ? null : rfi.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* ── Right: detail ──────────────────────────────────────────── */}
      {selectedRfi && (
        <div className="flex-1 overflow-y-auto border-l border-gray-100 lg:border-l-0">
          <RfiDetail
            rfi={selectedRfi}
            canManage={canManage}
            currentUserId={currentUserId}
            onEdit={() => handleEditRfi(selectedRfi)}
            onClose={() => setSelectedId(null)}
            onAction={() => setSelectedId(selectedId)}
          />
        </div>
      )}

      {/* ── Create/Edit modal ──────────────────────────────────────── */}
      {showCreate && (
        <CreateEditModal
          rfi={editingRfi}
          projectId={projectId!}
          tenantId={tenantId}
          jobId={jobId}
          submittedBy={currentUserId}
          onClose={() => { setShowCreate(false); setEditingRfi(null) }}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}
