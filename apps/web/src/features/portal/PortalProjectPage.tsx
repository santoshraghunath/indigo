import { useState, useEffect } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getPortalProjectData,
  getPortalSelections,
  approvePortalMilestone,
  upsertPortalSelection,
  getDailyLogPhotos,
  formatMoney,
} from '@indigo/shared'
import type {
  PortalMilestone,
  PortalInvoice,
  PortalDocument,
  PortalDailyLog,
  PortalChangeOrder,
  PortalSelectionCategory,
  DailyLogPhoto,
} from '@indigo/shared'
import { supabase } from '@/lib/supabase'
import { usePortalAuth } from '@/hooks/usePortalAuth'
import { Skeleton } from '@/components/ui/Skeleton'

// ── Types ──────────────────────────────────────────────────────────────────

type TabId = 'overview' | 'timeline' | 'finances' | 'updates' | 'documents' | 'selections'

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtDate(s: string | null | undefined): string {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function fmtDateShort(s: string | null | undefined): string {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function fmtBytes(n: number | null | undefined): string {
  if (!n) return ''
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function daysUntil(s: string | null | undefined): string {
  if (!s) return ''
  const d = new Date(s + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  if (diff < 0) return `${Math.abs(diff)}d overdue`
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  return `${diff} days away`
}

// ── Icons ──────────────────────────────────────────────────────────────────
// Clean 20×20 stroke icons — no emoji, consistent weight

const IPROPS = {
  viewBox: '0 0 20 20',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: '1.5',
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  className: 'w-[18px] h-[18px] shrink-0',
}

function IconOverview() {
  return (
    <svg {...IPROPS}>
      <rect x="2.75" y="2.75" width="5.5" height="5.5" rx="1"/>
      <rect x="11.75" y="2.75" width="5.5" height="5.5" rx="1"/>
      <rect x="2.75" y="11.75" width="5.5" height="5.5" rx="1"/>
      <rect x="11.75" y="11.75" width="5.5" height="5.5" rx="1"/>
    </svg>
  )
}

function IconTimeline() {
  return (
    <svg {...IPROPS}>
      <circle cx="5" cy="5.5" r="1.5" fill="currentColor" stroke="none"/>
      <circle cx="5" cy="10" r="1.5" fill="currentColor" stroke="none"/>
      <circle cx="5" cy="14.5" r="1.5" fill="currentColor" stroke="none"/>
      <line x1="5" y1="7" x2="5" y2="8.5"/>
      <line x1="5" y1="11.5" x2="5" y2="13"/>
      <line x1="8.5" y1="5.5" x2="17" y2="5.5"/>
      <line x1="8.5" y1="10" x2="17" y2="10"/>
      <line x1="8.5" y1="14.5" x2="14" y2="14.5"/>
    </svg>
  )
}

function IconFinances() {
  return (
    <svg {...IPROPS}>
      <circle cx="10" cy="10" r="7.5"/>
      <path d="M10 6.5V7m0 6v.5M7.75 8.5A2.25 2.25 0 0110 7a2.25 2.25 0 012.25 2.25c0 1.24-1 2.25-2.25 2.25A2.25 2.25 0 007.75 13.75"/>
    </svg>
  )
}

function IconUpdates() {
  return (
    <svg {...IPROPS}>
      <rect x="3.5" y="4" width="13" height="13" rx="1.5"/>
      <line x1="7" y1="8.5" x2="13" y2="8.5"/>
      <line x1="7" y1="11" x2="13" y2="11"/>
      <line x1="7" y1="13.5" x2="10.5" y2="13.5"/>
    </svg>
  )
}

function IconDocuments() {
  return (
    <svg {...IPROPS}>
      <path d="M5.5 2.5h6l4 4v11a1 1 0 01-1 1h-9a1 1 0 01-1-1v-14a1 1 0 011-1z"/>
      <polyline points="11.5,2.5 11.5,6.5 15.5,6.5"/>
    </svg>
  )
}

function IconSelections() {
  // Three vertical swatches
  return (
    <svg {...IPROPS}>
      <rect x="2.5" y="5" width="4" height="12" rx="1"/>
      <rect x="8" y="3" width="4" height="14" rx="1"/>
      <rect x="13.5" y="5" width="4" height="12" rx="1"/>
    </svg>
  )
}

// ── Tab bar ────────────────────────────────────────────────────────────────

interface TabDef {
  id:     TabId
  label:  string
  icon:   React.ReactNode
  badge?: number
}

function TabBar({ tabs, active, onChange }: {
  tabs:     TabDef[]
  active:   TabId
  onChange: (id: TabId) => void
}) {
  return (
    <div className="sticky top-14 z-10 -mx-4 mb-5 border-b border-gray-200 bg-white px-4">
      <nav className="flex overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`relative flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-3 text-sm font-medium whitespace-nowrap transition-colors ${
              active === tab.id
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-gray-400 hover:border-gray-300 hover:text-gray-600'
            }`}
          >
            {tab.icon}
            <span className="hidden sm:block">{tab.label}</span>
            {tab.badge != null && tab.badge > 0 && (
              <span className="flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
                {tab.badge > 9 ? '9+' : tab.badge}
              </span>
            )}
          </button>
        ))}
      </nav>
    </div>
  )
}

// ── Progress card ──────────────────────────────────────────────────────────

function ProgressCard({
  milestones,
  startDate,
  targetCompletion,
  contractCents,
}: {
  milestones:       PortalMilestone[]
  startDate:        string | null
  targetCompletion: string | null
  contractCents:    number | null
}) {
  const done  = milestones.filter((m) => m.status === 'complete' || m.status === 'approved').length
  const total = milestones.length
  const pct   = total > 0 ? Math.round((done / total) * 100) : 0

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-gray-500">Overall Progress</p>
          <p className="mt-0.5 text-3xl font-bold tabular-nums text-gray-900">{pct}%</p>
          {total > 0 && (
            <p className="text-xs text-gray-400">{done} of {total} milestones complete</p>
          )}
        </div>
        {contractCents != null && (
          <div className="text-right">
            <p className="text-sm font-medium text-gray-500">Contract Value</p>
            <p className="mt-0.5 text-xl font-semibold tabular-nums text-gray-900">
              {formatMoney(contractCents)}
            </p>
          </div>
        )}
      </div>

      {total > 0 && (
        <div className="mt-4">
          <div className="h-3 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-brand-500 transition-all duration-700"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-4 border-t border-gray-100 pt-4">
        <div>
          <p className="text-xs font-medium text-gray-500">Start Date</p>
          <p className="mt-0.5 text-sm font-semibold text-gray-800">{fmtDate(startDate)}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-gray-500">Target Completion</p>
          <p className="mt-0.5 text-sm font-semibold text-gray-800">{fmtDate(targetCompletion)}</p>
          {targetCompletion && (
            <p className="text-xs text-gray-400">{daysUntil(targetCompletion)}</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Overview: pending actions ──────────────────────────────────────────────

function OverviewActions({
  milestones,
  selections,
  invoices,
  onApprove,
  approvingId,
  onNavigate,
  isStaffPreview,
}: {
  milestones:     PortalMilestone[]
  selections:     PortalSelectionCategory[] | undefined
  invoices:       PortalInvoice[]
  onApprove:      (id: string) => void
  approvingId:    string | null
  onNavigate:     (tab: TabId) => void
  isStaffPreview: boolean
}) {
  const needsApproval  = milestones.filter(
    (m) => m.requires_client_approval && !m.client_approved_at
        && m.status !== 'complete' && m.status !== 'approved',
  )
  const pendingSel     = (selections ?? []).filter(
    (c) => ['pending', 'client_choosing'].includes(c.status) && !c.selection,
  )
  const outstanding    = invoices.filter((i) => i.balance_due_cents > 0)
  const outstandingAmt = outstanding.reduce((s, i) => s + i.balance_due_cents, 0)
  const hasActions     = needsApproval.length > 0 || pendingSel.length > 0 || outstanding.length > 0

  if (!hasActions) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white px-5 py-8 shadow-sm text-center">
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-green-50">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 text-green-600">
            <path d="M4 10l4 4 8-8"/>
          </svg>
        </div>
        <p className="text-sm font-semibold text-gray-900">All caught up</p>
        <p className="mt-1 text-xs text-gray-500">No pending actions on this project</p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-5 py-4">
        <h2 className="text-base font-semibold text-gray-900">
          {isStaffPreview ? 'Pending Actions' : 'Needs Attention'}
        </h2>
      </div>

      <div className="divide-y divide-gray-100">
        {needsApproval.map((m) => (
          <div key={m.id} className="flex items-start gap-3 px-5 py-4">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-600">
                Milestone approval
              </p>
              <p className="mt-0.5 text-sm font-medium text-gray-900">{m.name}</p>
              {m.due_date && (
                <p className="mt-0.5 text-xs text-gray-400">{fmtDateShort(m.due_date)}</p>
              )}
            </div>
            {isStaffPreview ? (
              <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700">
                Awaiting client
              </span>
            ) : (
              <button
                onClick={() => onApprove(m.id)}
                disabled={approvingId === m.id}
                className="shrink-0 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-amber-600 disabled:opacity-60"
              >
                {approvingId === m.id ? 'Approving…' : 'Approve'}
              </button>
            )}
          </div>
        ))}

        {pendingSel.length > 0 && (
          <div className="flex items-start gap-3 px-5 py-4">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-brand-600">
                Selections needed
              </p>
              <p className="mt-0.5 text-sm font-medium text-gray-900">
                {pendingSel.length} {pendingSel.length === 1 ? 'category' : 'categories'}{' '}
                {isStaffPreview ? 'awaiting client input' : 'need your input'}
              </p>
              <p className="mt-0.5 text-xs text-gray-400 truncate">
                {pendingSel.slice(0, 2).map((s) => s.name).join(', ')}
                {pendingSel.length > 2 ? ` +${pendingSel.length - 2} more` : ''}
              </p>
            </div>
            {!isStaffPreview && (
              <button
                onClick={() => onNavigate('selections')}
                className="shrink-0 rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 transition-colors hover:bg-brand-100"
              >
                View
              </button>
            )}
          </div>
        )}

        {outstanding.length > 0 && (
          <div className="flex items-start gap-3 px-5 py-4">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                Outstanding balance
              </p>
              <p className="mt-0.5 text-sm font-medium text-gray-900">
                {formatMoney(outstandingAmt)}
              </p>
              <p className="mt-0.5 text-xs text-gray-400">
                {outstanding.length} unpaid invoice{outstanding.length !== 1 ? 's' : ''}
              </p>
            </div>
            <button
              onClick={() => onNavigate('finances')}
              className="shrink-0 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50"
            >
              View
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Selections ─────────────────────────────────────────────────────────────

const SELECTION_STATUS_LABEL: Record<string, string> = {
  pending:         'Awaiting your choice',
  client_choosing: 'Your choice needed',
  selected:        'Choice received',
  approved:        'Approved',
  ordered:         'Ordered',
  received:        'Received',
  installed:       'Installed',
}

const SELECTION_STATUS_COLOR: Record<string, string> = {
  pending:         'bg-amber-100 text-amber-700',
  client_choosing: 'bg-amber-100 text-amber-700',
  selected:        'bg-blue-100 text-blue-700',
  approved:        'bg-green-100 text-green-700',
  ordered:         'bg-purple-100 text-purple-700',
  received:        'bg-teal-100 text-teal-700',
  installed:       'bg-green-100 text-green-700',
}

function overage(optionPriceCents: number, allowanceCents: number): number {
  return Math.max(0, optionPriceCents - allowanceCents)
}

function SelectionCategoryCard({
  category,
  onConfirm,
  isConfirming,
}: {
  category:    PortalSelectionCategory
  onConfirm:   (optionId: string | null) => void
  isConfirming: boolean
}) {
  const isLocked     = ['approved', 'ordered', 'received', 'installed'].includes(category.status)
  const hasConfirmed = !!category.selection?.option_id || !!category.selection?.custom_description

  const [isOpen, setIsOpen] = useState(!hasConfirmed && !isLocked)
  const [picked, setPicked] = useState<string | null>(category.selection?.option_id ?? null)

  const selectedOption  = category.options.find((o) => o.id === picked)
  const confirmedOption = category.options.find((o) => o.id === category.selection?.option_id)

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div
        className={`flex items-start justify-between gap-3 p-4 ${!isLocked ? 'cursor-pointer hover:bg-gray-50 transition-colors' : ''}`}
        onClick={() => !isLocked && setIsOpen((v) => !v)}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-gray-900">{category.name}</p>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${SELECTION_STATUS_COLOR[category.status] ?? 'bg-gray-100 text-gray-500'}`}>
              {SELECTION_STATUS_LABEL[category.status] ?? category.status}
            </span>
          </div>
          {category.description && (
            <p className="mt-0.5 text-xs text-gray-500">{category.description}</p>
          )}
          <div className="mt-1 flex items-center gap-3 text-xs text-gray-400">
            <span>Allowance: <span className="font-medium text-gray-700">{formatMoney(category.allowance_cents)}</span></span>
            {category.due_date && <span>Due {fmtDateShort(category.due_date)}</span>}
          </div>
        </div>
        {!isLocked && (
          <span className="shrink-0 text-sm text-gray-300">{isOpen ? '▲' : '▼'}</span>
        )}
      </div>

      {!isOpen && hasConfirmed && (
        <div className="border-t border-gray-100 bg-green-50 px-4 py-3">
          <p className="mb-0.5 text-xs font-medium text-green-700">Your selection</p>
          <p className="text-sm font-semibold text-gray-900">
            {confirmedOption?.name ?? category.selection?.custom_description ?? '—'}
          </p>
          {confirmedOption && confirmedOption.unit_price_cents > category.allowance_cents && (
            <p className="mt-0.5 text-xs text-amber-600">
              +{formatMoney(overage(confirmedOption.unit_price_cents, category.allowance_cents))} over allowance
            </p>
          )}
          {!isLocked && (
            <button
              onClick={(e) => { e.stopPropagation(); setIsOpen(true) }}
              className="mt-1.5 text-xs text-brand-600 hover:text-brand-700"
            >
              Change selection
            </button>
          )}
        </div>
      )}

      {isOpen && (
        <div className="border-t border-gray-100">
          {category.options.length === 0 ? (
            <p className="px-4 py-3 text-sm text-gray-400">No options added yet by your builder.</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {category.options.map((opt) => {
                const over     = overage(opt.unit_price_cents, category.allowance_cents)
                const isPicked = picked === opt.id
                return (
                  <button
                    key={opt.id}
                    onClick={() => setPicked(opt.id)}
                    className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors ${isPicked ? 'bg-brand-50' : 'hover:bg-gray-50'}`}
                  >
                    <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${isPicked ? 'border-brand-600 bg-brand-600' : 'border-gray-300'}`}>
                      {isPicked && <span className="h-1.5 w-1.5 rounded-full bg-white"/>}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-medium ${isPicked ? 'text-brand-900' : 'text-gray-900'}`}>{opt.name}</p>
                      {opt.description && <p className="mt-0.5 text-xs text-gray-500">{opt.description}</p>}
                      <div className="mt-1 flex items-center gap-2 text-xs">
                        {over > 0 ? (
                          <span className="font-medium text-amber-600">+{formatMoney(over)} over allowance</span>
                        ) : (
                          <span className="font-medium text-green-600">Within allowance</span>
                        )}
                        {opt.vendor && <span className="text-gray-400">· {opt.vendor}</span>}
                        {opt.lead_time_days && <span className="text-gray-400">· {opt.lead_time_days}d lead time</span>}
                      </div>
                      {opt.vendor_url && (
                        <a
                          href={opt.vendor_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="mt-1 inline-block text-xs text-brand-600 hover:underline"
                        >
                          View product ↗
                        </a>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {category.options.length > 0 && (
            <div className="flex items-center justify-between gap-3 border-t border-gray-100 bg-gray-50 px-4 py-3">
              {selectedOption && (
                <p className="flex-1 text-xs text-gray-500">
                  Selected: <span className="font-medium text-gray-700">{selectedOption.name}</span>
                  {overage(selectedOption.unit_price_cents, category.allowance_cents) > 0 && (
                    <span className="text-amber-600">
                      {' '}(+{formatMoney(overage(selectedOption.unit_price_cents, category.allowance_cents))})
                    </span>
                  )}
                </p>
              )}
              <button
                disabled={!picked || isConfirming}
                onClick={() => onConfirm(picked)}
                className="shrink-0 rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-40"
              >
                {isConfirming ? 'Saving…' : 'Confirm Selection'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SelectionsTab({
  categories,
  project,
  customerId,
}: {
  categories: PortalSelectionCategory[]
  project:    { id: string; tenant_id: string }
  customerId: string
}) {
  const queryClient = useQueryClient()

  const confirmMut = useMutation({
    mutationFn: ({ categoryId, optionId }: { categoryId: string; optionId: string | null }) =>
      upsertPortalSelection(supabase, {
        categoryId,
        projectId:  project.id,
        tenantId:   project.tenant_id,
        customerId,
        optionId,
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['portal-selections', project.id] }),
  })

  const pending   = categories.filter((c) => !c.selection && ['pending', 'client_choosing'].includes(c.status))
  const confirmed = categories.filter((c) => !!c.selection)
  const other     = categories.filter((c) => !c.selection && !['pending', 'client_choosing'].includes(c.status))

  if (categories.length === 0) {
    return (
      <div className="mt-12 text-center">
        <p className="text-sm text-gray-400">No selections for this project yet.</p>
      </div>
    )
  }

  const pendingCount = pending.length

  return (
    <div className="space-y-3">
      {pendingCount > 0 && (
        <p className="text-xs font-medium text-gray-500">
          {pendingCount} decision{pendingCount !== 1 ? 's' : ''} waiting for your input
        </p>
      )}
      {[...pending, ...confirmed, ...other].map((cat) => (
        <SelectionCategoryCard
          key={cat.id}
          category={cat}
          onConfirm={(optId) => confirmMut.mutate({ categoryId: cat.id, optionId: optId })}
          isConfirming={confirmMut.isPending && confirmMut.variables?.categoryId === cat.id}
        />
      ))}
    </div>
  )
}

// ── Gantt view ─────────────────────────────────────────────────────────────

function GanttView({
  milestones,
  startDate,
  targetCompletion,
}: {
  milestones:        PortalMilestone[]
  startDate:         string | null
  targetCompletion:  string | null
}) {
  const withDates = milestones.filter((m) => m.due_date)

  if (withDates.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white px-5 py-8 shadow-sm text-center">
        <p className="text-sm text-gray-400">No milestones with due dates to display on the Gantt.</p>
      </div>
    )
  }

  // ── Date range ────────────────────────────────────────────────────────────
  const toTs = (s: string) => new Date(s + 'T00:00:00').getTime()
  const dateTss = withDates.map((m) => toTs(m.due_date!))
  const jobStartTs       = startDate         ? toTs(startDate)         : null
  const jobEndTs         = targetCompletion  ? toTs(targetCompletion)  : null

  const rawMin = Math.min(jobStartTs ?? dateTss[0], ...dateTss)
  const rawMax = Math.max(jobEndTs   ?? dateTss[dateTss.length - 1], ...dateTss)
  const rangeDays = Math.max(1, Math.round((rawMax - rawMin) / 86_400_000))

  // Pad 5% on each side, minimum 5 days
  const padMs      = Math.max(5, Math.ceil(rangeDays * 0.05)) * 86_400_000
  const rangeStart = rawMin - padMs
  const rangeEnd   = rawMax + padMs
  const totalMs    = rangeEnd - rangeStart

  function toPct(ts: number) { return ((ts - rangeStart) / totalMs) * 100 }

  const today     = new Date(); today.setHours(0, 0, 0, 0)
  const todayPct  = toPct(today.getTime())
  const showToday = todayPct >= 0 && todayPct <= 100

  // ── Month tick labels ─────────────────────────────────────────────────────
  const months: { label: string; pct: number }[] = []
  const cur = new Date(rangeStart); cur.setDate(1)
  while (cur.getTime() <= rangeEnd) {
    const p = toPct(cur.getTime())
    if (p >= 0 && p <= 100) {
      months.push({
        label: cur.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        pct:   p,
      })
    }
    cur.setMonth(cur.getMonth() + 1)
  }

  // Minimum track width: 5px/day, capped at reasonable scroll width
  const trackMinPx = Math.max(480, rangeDays * 5)

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <div style={{ minWidth: `${trackMinPx + 176}px` }}>

          {/* Month header row */}
          <div className="flex border-b border-gray-100">
            <div className="w-44 shrink-0"/>
            <div className="relative flex-1 h-7">
              {months.map((m, i) => (
                <span
                  key={i}
                  className="absolute top-1 text-[10px] font-medium text-gray-400 whitespace-nowrap"
                  style={{ left: `${m.pct}%`, transform: 'translateX(-50%)' }}
                >
                  {m.label}
                </span>
              ))}
            </div>
          </div>

          {/* Milestone rows */}
          {milestones.map((m) => {
            const done          = m.status === 'complete' || m.status === 'approved'
            const needsApproval = m.requires_client_approval && !m.client_approved_at && !done
            const pos           = m.due_date ? toPct(toTs(m.due_date)) : null

            return (
              <div key={m.id} className="flex items-center border-b border-gray-50 last:border-0 group">
                {/* Name column */}
                <div className="w-44 shrink-0 px-4 py-2.5">
                  <p className={`text-xs font-medium truncate ${done ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
                    {m.name}
                  </p>
                  {m.due_date && (
                    <p className="text-[10px] text-gray-400">{fmtDateShort(m.due_date)}</p>
                  )}
                </div>

                {/* Timeline track */}
                <div className="relative flex-1 h-10">
                  {/* Today line */}
                  {showToday && (
                    <div
                      className="absolute top-0 bottom-0 w-px bg-brand-300 opacity-60"
                      style={{ left: `${todayPct}%` }}
                    />
                  )}

                  {pos !== null ? (
                    <div
                      className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2"
                      style={{ left: `${pos}%` }}
                    >
                      {/* Diamond marker */}
                      <div className={`h-3 w-3 rotate-45 ring-2 ring-white ${
                        done                       ? 'bg-green-500' :
                        needsApproval              ? 'bg-amber-400' :
                        m.status === 'in_progress' ? 'bg-brand-500' :
                                                     'bg-gray-300'
                      }`}/>
                    </div>
                  ) : (
                    <span className="absolute top-1/2 left-2 -translate-y-1/2 text-[10px] italic text-gray-300">
                      No date
                    </span>
                  )}
                </div>
              </div>
            )
          })}

          {/* Today footer label */}
          {showToday && (
            <div className="relative flex border-t border-gray-100">
              <div className="w-44 shrink-0"/>
              <div className="relative flex-1 h-6">
                <div
                  className="absolute top-0 bottom-0 w-px bg-brand-300 opacity-60"
                  style={{ left: `${todayPct}%` }}
                />
                <span
                  className="absolute top-0.5 text-[10px] font-semibold text-brand-600 whitespace-nowrap"
                  style={{ left: `${todayPct}%`, transform: 'translateX(-50%)' }}
                >
                  Today
                </span>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 border-t border-gray-100 px-4 py-2.5">
        {[
          { color: 'bg-green-500',  label: 'Complete'    },
          { color: 'bg-brand-500',  label: 'In progress' },
          { color: 'bg-amber-400',  label: 'Needs approval' },
          { color: 'bg-gray-300',   label: 'Upcoming'    },
        ].map(({ color, label }) => (
          <span key={label} className="flex items-center gap-1.5 text-[11px] text-gray-500">
            <span className={`inline-block h-2.5 w-2.5 rotate-45 ${color}`}/>
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}

// ── Project Schedule (Timeline) tab ────────────────────────────────────────

type ScheduleView = 'list' | 'gantt'

function TimelineTab({
  milestones,
  startDate,
  targetCompletion,
  onApprove,
  approvingId,
  readOnly,
}: {
  milestones:        PortalMilestone[]
  startDate:         string | null
  targetCompletion:  string | null
  onApprove:         (milestoneId: string) => void
  approvingId:       string | null
  readOnly?:         boolean
}) {
  const [view, setView] = useState<ScheduleView>('list')

  if (milestones.length === 0) {
    return (
      <div className="mt-12 text-center">
        <p className="text-sm text-gray-400">No milestones shared yet.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* View toggle */}
      <div className="flex items-center justify-end gap-1">
        {(['list', 'gantt'] as ScheduleView[]).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              view === v
                ? 'bg-brand-600 text-white'
                : 'bg-white border border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700'
            }`}
          >
            {v === 'list' ? (
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="h-3.5 w-3.5">
                <line x1="2" y1="4" x2="14" y2="4"/><line x1="2" y1="8" x2="14" y2="8"/><line x1="2" y1="12" x2="10" y2="12"/>
              </svg>
            ) : (
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="h-3.5 w-3.5">
                <line x1="2" y1="4" x2="8" y2="4"/><line x1="2" y1="8" x2="12" y2="8"/><line x1="2" y1="12" x2="6" y2="12"/>
                <line x1="1" y1="2" x2="1" y2="14"/>
              </svg>
            )}
            <span className="capitalize">{v === 'gantt' ? 'Gantt' : 'List'}</span>
          </button>
        ))}
      </div>

      {view === 'gantt' ? (
        <GanttView
          milestones={milestones}
          startDate={startDate}
          targetCompletion={targetCompletion}
        />
      ) : (
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="space-y-1">
            {milestones.map((m, i) => {
              const done          = m.status === 'complete' || m.status === 'approved'
              const needsApproval = m.requires_client_approval && !m.client_approved_at && !done
              const isLast        = i === milestones.length - 1
              const isApproving   = approvingId === m.id

              return (
                <div key={m.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ring-2 ring-white ${
                      done                       ? 'bg-green-500 text-white' :
                      needsApproval              ? 'bg-amber-400 text-white' :
                      m.status === 'in_progress' ? 'bg-brand-500 text-white' :
                                                   'bg-gray-200 text-gray-400'
                    }`}>
                      {done ? (
                        <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
                          <path d="M2 6l3 3 5-5"/>
                        </svg>
                      ) : (i + 1)}
                    </div>
                    {!isLast && <div className="mt-1 w-px flex-1 bg-gray-200"/>}
                  </div>

                  <div className="min-w-0 flex-1 pb-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-sm font-medium leading-snug ${done ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                        {m.name}
                      </p>
                      {done && m.completed_date ? (
                        <span className="shrink-0 text-xs text-green-600">✓ {fmtDateShort(m.completed_date)}</span>
                      ) : m.due_date ? (
                        <span className="shrink-0 text-xs text-gray-400">Due {fmtDateShort(m.due_date)}</span>
                      ) : null}
                    </div>

                    {needsApproval && (
                      <div className="mt-1.5 flex items-center gap-3">
                        <p className="text-xs font-medium text-amber-600">
                          {readOnly ? 'Client approval required' : 'Your approval is required'}
                        </p>
                        {!readOnly && (
                          <button
                            onClick={() => onApprove(m.id)}
                            disabled={isApproving}
                            className="rounded-lg bg-amber-500 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-amber-600 disabled:opacity-60"
                          >
                            {isApproving ? 'Approving…' : 'Approve'}
                          </button>
                        )}
                      </div>
                    )}
                    {m.requires_client_approval && m.client_approved_at && !done && (
                      <p className="mt-0.5 text-xs text-green-600">
                        ✓ Approved {fmtDateShort(m.client_approved_at)}
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Invoice status helpers ─────────────────────────────────────────────────

// BB invoice_status is a free text column — normalise to lowercase for matching
const INV_STATUS_LABEL: Record<string, string> = {
  draft:    'Draft',
  sent:     'Sent',
  paid:     'Paid',
  void:     'Void',
  overdue:  'Overdue',
}

const INV_STATUS_COLOR: Record<string, string> = {
  draft:   'bg-gray-100 text-gray-500',
  sent:    'bg-blue-100 text-blue-700',
  paid:    'bg-green-100 text-green-700',
  void:    'bg-red-100 text-red-600',
  overdue: 'bg-amber-100 text-amber-700',
}

function invStatusKey(status: string | null): string {
  return (status ?? 'draft').toLowerCase()
}

// ── Invoice row ────────────────────────────────────────────────────────────

function InvoiceRow({ inv }: { inv: PortalInvoice }) {
  const statusKey   = invStatusKey(inv.invoice_status)
  const statusLabel = INV_STATUS_LABEL[statusKey] ?? inv.invoice_status ?? 'Draft'
  const statusColor = INV_STATUS_COLOR[statusKey] ?? 'bg-gray-100 text-gray-500'
  const isVoid      = statusKey === 'void'
  const isPaid      = statusKey === 'paid' || inv.balance_due_cents === 0

  return (
    <div className={`flex items-center gap-3 rounded-xl border border-gray-100 px-4 py-3 ${isVoid ? 'opacity-50' : ''}`}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className={`text-sm font-semibold text-gray-900 ${isVoid ? 'line-through' : ''}`}>
            {inv.invoice_number}
          </p>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${statusColor}`}>
            {statusLabel}
          </span>
        </div>
        <p className="text-xs text-gray-400">
          {fmtDateShort(inv.invoice_date)}
          {!isPaid && !isVoid && inv.due_date ? ` · Due ${fmtDateShort(inv.due_date)}` : ''}
          {isPaid && inv.paid_at ? ` · Paid ${fmtDateShort(inv.paid_at)}` : ''}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className={`text-sm font-semibold tabular-nums ${isVoid ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
          {formatMoney(inv.total_cents)}
        </p>
        {!isPaid && !isVoid && inv.balance_due_cents > 0 && (
          <p className="text-xs text-amber-700">{formatMoney(inv.balance_due_cents)} due</p>
        )}
      </div>
    </div>
  )
}

// ── Finances tab ───────────────────────────────────────────────────────────

function FinancesTab({
  milestones,
  invoices,
  changeOrders,
}: {
  milestones:   PortalMilestone[]
  invoices:     PortalInvoice[]
  changeOrders: PortalChangeOrder[]
}) {
  // Payment schedule milestones
  const paymentMilestones  = milestones.filter((m) => m.triggers_invoice)
  const upcomingPayments   = paymentMilestones.filter((m) => !m.linked_invoice_id)
  const invoicedPayments   = paymentMilestones.filter((m) => !!m.linked_invoice_id)

  // Invoice lookup by id for linked milestones
  const invoiceById = new Map(invoices.map((inv) => [inv.id, inv]))

  const CO_STATUS_LABEL: Record<string, string> = {
    pending_approval: 'Pending',
    approved:         'Approved',
  }
  const CO_STATUS_COLOR: Record<string, string> = {
    pending_approval: 'bg-amber-100 text-amber-700',
    approved:         'bg-green-100 text-green-700',
  }

  /** Normalise to an Indigo co_status key, falling back to BB's status column. */
  function effectiveCOStatus(co: PortalChangeOrder): string {
    if (co.co_status) return co.co_status
    const bb = (co.status ?? '').toLowerCase()
    if (bb === 'approved') return 'approved'
    if (bb === 'pending')  return 'pending_approval'
    return bb
  }

  const approvedCoTotal = changeOrders
    .filter((co) => effectiveCOStatus(co) === 'approved')
    .reduce((sum, co) => sum + co.amount_cents, 0)

  return (
    <div className="space-y-4">

      {/* Payment Schedule */}
      {paymentMilestones.length > 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-base font-semibold text-gray-900">Payment Schedule</h2>

          {upcomingPayments.length > 0 && (
            <div className="mb-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">Upcoming</p>
              <div className="space-y-2">
                {upcomingPayments.map((m) => (
                  <div key={m.id} className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900">{m.name}</p>
                      {m.due_date && (
                        <p className="text-xs text-gray-400">Due {fmtDateShort(m.due_date)}</p>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      {m.invoice_amount_cents != null ? (
                        <p className="text-sm font-semibold tabular-nums text-gray-900">
                          {formatMoney(m.invoice_amount_cents)}
                        </p>
                      ) : (
                        <p className="text-xs text-gray-400">Amount TBD</p>
                      )}
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                        Not yet invoiced
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {invoicedPayments.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">Invoiced</p>
              <div className="space-y-2">
                {invoicedPayments.map((m) => {
                  const linkedInv = m.linked_invoice_id ? invoiceById.get(m.linked_invoice_id) : undefined
                  const sKey      = linkedInv ? invStatusKey(linkedInv.invoice_status) : null
                  return (
                    <div key={m.id} className="flex items-center gap-3 rounded-xl border border-gray-100 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900">{m.name}</p>
                        {linkedInv && (
                          <p className="text-xs text-gray-400">{linkedInv.invoice_number}</p>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        {m.invoice_amount_cents != null && (
                          <p className="text-sm font-semibold tabular-nums text-gray-900">
                            {formatMoney(m.invoice_amount_cents)}
                          </p>
                        )}
                        {sKey && (
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${INV_STATUS_COLOR[sKey] ?? 'bg-gray-100 text-gray-500'}`}>
                            {INV_STATUS_LABEL[sKey] ?? sKey}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Invoices */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-gray-900">Invoices</h2>
        {invoices.length === 0 ? (
          <p className="text-sm text-gray-400">No invoices yet.</p>
        ) : (
          <div className="space-y-2">
            {invoices.map((inv) => <InvoiceRow key={inv.id} inv={inv}/>)}
          </div>
        )}
      </div>

      {/* Change orders */}
      {changeOrders.length > 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-start justify-between gap-4">
            <h2 className="text-base font-semibold text-gray-900">Change Orders</h2>
            {approvedCoTotal !== 0 && (
              <div className="shrink-0 text-right">
                <p className="text-xs text-gray-500">Approved total</p>
                <p className={`text-sm font-semibold tabular-nums ${approvedCoTotal >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                  {approvedCoTotal >= 0 ? '+' : ''}{formatMoney(approvedCoTotal)}
                </p>
              </div>
            )}
          </div>
          <div className="space-y-2">
            {changeOrders.map((co) => {
              const effStatus = effectiveCOStatus(co)
              const label = CO_STATUS_LABEL[effStatus] ?? effStatus
              const color = CO_STATUS_COLOR[effStatus] ?? 'bg-gray-100 text-gray-500'
              return (
                <div key={co.id} className="flex items-start gap-3 rounded-xl border border-gray-100 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-gray-400">{co.co_number}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${color}`}>
                        {label}
                      </span>
                    </div>
                    <p className="mt-0.5 text-sm font-medium text-gray-900">
                      {co.title || co.description || '—'}
                    </p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-gray-400">
                      {co.approved_at && <span>Approved {fmtDateShort(co.approved_at)}</span>}
                      {co.schedule_impact_days != null && co.schedule_impact_days !== 0 && (
                        <span>{co.schedule_impact_days > 0 ? '+' : ''}{co.schedule_impact_days} day{Math.abs(co.schedule_impact_days) !== 1 ? 's' : ''}</span>
                      )}
                    </div>
                  </div>
                  <p className={`shrink-0 text-sm font-semibold tabular-nums ${co.amount_cents >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                    {co.amount_cents >= 0 ? '+' : ''}{formatMoney(co.amount_cents)}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Daily log photos ───────────────────────────────────────────────────────

function PortalPhotoLightbox({
  photos,
  initialIndex,
  onClose,
}: {
  photos:       DailyLogPhoto[]
  initialIndex: number
  onClose:      () => void
}) {
  const [current, setCurrent] = useState(initialIndex)
  const photo = photos[current]

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape')     onClose()
      if (e.key === 'ArrowLeft')  setCurrent((i) => Math.max(0, i - 1))
      if (e.key === 'ArrowRight') setCurrent((i) => Math.min(photos.length - 1, i + 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [photos.length, onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
      >
        ✕
      </button>
      {photos.length > 1 && (
        <p className="absolute left-1/2 top-4 -translate-x-1/2 text-sm text-white/70">
          {current + 1} / {photos.length}
        </p>
      )}
      <img
        src={photo.signedUrl}
        alt={photo.caption ?? `Photo ${current + 1}`}
        className="max-h-[82vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
      {photo.caption && (
        <p className="mt-3 max-w-lg text-center text-sm text-white/80">{photo.caption}</p>
      )}
      {photos.length > 1 && (
        <div className="pointer-events-none absolute inset-y-0 left-0 right-0 flex items-center justify-between px-3">
          <button
            onClick={(e) => { e.stopPropagation(); setCurrent((i) => Math.max(0, i - 1)) }}
            disabled={current === 0}
            className="pointer-events-auto rounded-full bg-white/10 p-2 text-white hover:bg-white/20 disabled:opacity-20"
          >
            ◀
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setCurrent((i) => Math.min(photos.length - 1, i + 1)) }}
            disabled={current === photos.length - 1}
            className="pointer-events-auto rounded-full bg-white/10 p-2 text-white hover:bg-white/20 disabled:opacity-20"
          >
            ▶
          </button>
        </div>
      )}
    </div>
  )
}

function PortalLogPhotos({ logId }: { logId: string }) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  const { data: photos = [], isLoading } = useQuery({
    queryKey:  ['portal-log-photos', logId],
    queryFn:   () => getDailyLogPhotos(supabase, logId),
    staleTime: 300_000,
  })

  if (isLoading) {
    return (
      <div className="mt-3 grid grid-cols-3 gap-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="aspect-square animate-pulse rounded-xl bg-gray-200"/>
        ))}
      </div>
    )
  }

  if (photos.length === 0) return null

  return (
    <>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {photos.map((photo, idx) => (
          <button
            key={photo.id}
            onClick={() => setLightboxIndex(idx)}
            className="group aspect-square overflow-hidden rounded-xl bg-gray-100"
          >
            <img
              src={photo.signedUrl}
              alt={photo.caption ?? `Photo ${idx + 1}`}
              className="h-full w-full object-cover transition-transform group-hover:scale-105"
              loading="lazy"
            />
          </button>
        ))}
      </div>
      {lightboxIndex !== null && (
        <PortalPhotoLightbox
          photos={photos}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </>
  )
}

// ── Updates tab (daily logs with pagination) ───────────────────────────────

const LOGS_PER_PAGE = 10

function UpdatesTab({ logs }: { logs: PortalDailyLog[] }) {
  const [shown, setShown] = useState(LOGS_PER_PAGE)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const visible = logs.slice(0, shown)
  const hasMore = logs.length > shown

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (logs.length === 0) {
    return (
      <div className="mt-12 text-center">
        <p className="text-sm text-gray-400">No daily logs published yet.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="divide-y divide-gray-100">
          {visible.map((log) => {
            const isExpanded = expanded.has(log.id)
            const summary    = log.ai_client_summary || log.work_performed
            const date       = new Date(log.date + 'T00:00:00')
            const dayName    = date.toLocaleDateString('en-US', { weekday: 'long' })
            const dateStr    = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
            const hasDetails = !!(log.materials_delivered || log.equipment_used || log.issues_or_delays)

            return (
              <div key={log.id} className="px-5 py-4">
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{dayName}</p>
                    <p className="text-xs text-gray-400">{dateStr}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 text-xs text-gray-400">
                    {log.weather && (
                      <span>{log.weather}{log.temperature_f != null ? ` · ${log.temperature_f}°F` : ''}</span>
                    )}
                    {log.crew_count != null && (
                      <span>{log.crew_count} crew</span>
                    )}
                  </div>
                </div>

                <p className="text-sm leading-relaxed text-gray-700">{summary}</p>

                {isExpanded && <PortalLogPhotos logId={log.id}/>}

                {isExpanded && hasDetails && (
                  <div className="mt-3 space-y-2 rounded-xl bg-gray-50 px-4 py-3 text-xs text-gray-600">
                    {log.materials_delivered && (
                      <div>
                        <p className="mb-0.5 font-semibold text-gray-700">Materials delivered</p>
                        <p>{log.materials_delivered}</p>
                      </div>
                    )}
                    {log.equipment_used && (
                      <div>
                        <p className="mb-0.5 font-semibold text-gray-700">Equipment used</p>
                        <p>{log.equipment_used}</p>
                      </div>
                    )}
                    {log.issues_or_delays && (
                      <div>
                        <p className="mb-0.5 font-semibold text-amber-700">Issues / delays</p>
                        <p className="text-amber-700">{log.issues_or_delays}</p>
                      </div>
                    )}
                  </div>
                )}

                <button
                  onClick={() => toggle(log.id)}
                  className="mt-2 text-xs text-brand-600 transition-colors hover:text-brand-700"
                >
                  {isExpanded ? 'Show less ▲' : (hasDetails ? 'More details ▼' : 'Photos ▼')}
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {hasMore && (
        <button
          onClick={() => setShown((n) => n + LOGS_PER_PAGE)}
          className="w-full rounded-xl border border-gray-200 bg-white py-3 text-sm font-medium text-gray-600 shadow-sm transition-colors hover:bg-gray-50"
        >
          Load more · {logs.length - shown} remaining
        </button>
      )}

      {!hasMore && logs.length > LOGS_PER_PAGE && (
        <p className="text-center text-xs text-gray-400">All {logs.length} daily logs shown</p>
      )}
    </div>
  )
}

// ── Documents tab ──────────────────────────────────────────────────────────

const DOC_ICON: Record<string, React.ReactNode> = {}

function DocIcon({ type }: { type: string }) {
  const color = {
    plan: 'bg-blue-50 text-blue-600', permit: 'bg-purple-50 text-purple-600',
    contract: 'bg-gray-50 text-gray-600', invoice: 'bg-amber-50 text-amber-600',
    photo: 'bg-teal-50 text-teal-600', warranty: 'bg-green-50 text-green-600',
    report: 'bg-indigo-50 text-indigo-600',
  }[type] ?? 'bg-gray-50 text-gray-400'

  return (
    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${color}`}>
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
        <path d="M5.5 2.5h6l4 4v11a1 1 0 01-1 1h-9a1 1 0 01-1-1v-14a1 1 0 011-1z"/>
        <polyline points="11.5,2.5 11.5,6.5 15.5,6.5"/>
      </svg>
    </div>
  )
}

void DOC_ICON // suppress unused warning

function DocumentsTab({ documents }: { documents: PortalDocument[] }) {
  if (documents.length === 0) {
    return (
      <div className="mt-12 text-center">
        <p className="text-sm text-gray-400">No documents shared yet.</p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="space-y-2">
        {documents.map((doc) => (
          <div key={doc.id} className="flex items-center gap-3 rounded-xl border border-gray-100 px-3 py-3">
            <DocIcon type={doc.type}/>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-gray-900">{doc.name}</p>
              <p className="text-xs text-gray-400">
                {fmtDate(doc.created_at)}
                {doc.file_size_bytes ? ` · ${fmtBytes(doc.file_size_bytes)}` : ''}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Loading skeleton ───────────────────────────────────────────────────────

function PortalSkeleton() {
  return (
    <div className="space-y-4">
      {/* Fake tab bar */}
      <div className="sticky top-14 z-10 -mx-4 mb-5 border-b border-gray-200 bg-white px-4">
        <div className="flex gap-1 py-2">
          {[48, 40, 56, 40, 48, 52].map((w, i) => (
            <div key={i} className="mx-1 h-8 animate-pulse rounded-md bg-gray-100" style={{ width: w }}/>
          ))}
        </div>
      </div>
      <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-3 shadow-sm">
        <Skeleton className="h-8 w-20"/>
        <Skeleton className="h-3 w-full rounded-full"/>
        <div className="grid grid-cols-2 gap-4 pt-2">
          <Skeleton className="h-10 w-full"/>
          <Skeleton className="h-10 w-full"/>
        </div>
      </div>
      <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-3 shadow-sm">
        <Skeleton className="h-5 w-32"/>
        {[1, 2].map((i) => <Skeleton key={i} className="h-14 w-full"/>)}
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export function PortalProjectPage() {
  const { id: projectId }            = useParams<{ id: string }>()
  const { customer, isStaffPreview } = usePortalAuth()
  const queryClient                  = useQueryClient()

  // Tab state: URL search param → persists on refresh; default = overview
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = (searchParams.get('tab') as TabId | null) ?? 'overview'

  function setTab(id: TabId) {
    setSearchParams(id === 'overview' ? {} : { tab: id }, { replace: true })
  }

  // ── Data ────────────────────────────────────────────────────────────────

  const { data, isLoading, error } = useQuery({
    queryKey:  ['portal-project', projectId],
    queryFn:   () => getPortalProjectData(supabase, projectId!),
    enabled:   !!projectId,
    staleTime: 60_000,
  })

  const { data: selections, isLoading: selLoading } = useQuery({
    queryKey:  ['portal-selections', projectId],
    queryFn:   () => getPortalSelections(supabase, projectId!, customer!.id),
    enabled:   !!projectId && !!customer?.id && !isStaffPreview,
    staleTime: 30_000,
  })

  const approveMut = useMutation({
    mutationFn: (milestoneId: string) => approvePortalMilestone(supabase, milestoneId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portal-project', projectId] })
    },
  })

  // ── Guards ───────────────────────────────────────────────────────────────

  if (isLoading) return <PortalSkeleton/>

  if (error || !data) {
    return (
      <div className="mt-12 text-center">
        <p className="text-sm text-gray-500">Unable to load project. Please try again.</p>
      </div>
    )
  }

  const { project, milestones, invoices, documents, dailyLogs, changeOrders } = data
  const job     = project.job
  const address = [job?.address_line1, job?.city, job?.state].filter(Boolean).join(', ')

  // ── Badge counts ─────────────────────────────────────────────────────────

  const pendingApprovalCount = milestones.filter(
    (m) => m.requires_client_approval && !m.client_approved_at
        && m.status !== 'complete' && m.status !== 'approved',
  ).length

  const pendingSelectionCount = (selections ?? []).filter(
    (c) => ['pending', 'client_choosing'].includes(c.status) && !c.selection,
  ).length

  const overviewBadge   = pendingApprovalCount + pendingSelectionCount
  const financesBadge   = invoices.filter((i) => i.balance_due_cents > 0).length
  const selectionsBadge = pendingSelectionCount

  // ── Tab definitions ───────────────────────────────────────────────────────

  const tabs: TabDef[] = [
    { id: 'overview',   label: 'Overview',   icon: <IconOverview/>,   badge: overviewBadge > 0 ? overviewBadge : undefined },
    { id: 'timeline',   label: 'Schedule',    icon: <IconTimeline/>   },
    { id: 'finances',   label: 'Finances',   icon: <IconFinances/>,   badge: financesBadge > 0 ? financesBadge : undefined },
    { id: 'updates',    label: 'Daily Logs', icon: <IconUpdates/>    },
    { id: 'documents',  label: 'Documents',  icon: <IconDocuments/>  },
    ...(!isStaffPreview
      ? [{ id: 'selections' as TabId, label: 'Selections', icon: <IconSelections/>, badge: selectionsBadge > 0 ? selectionsBadge : undefined }]
      : []
    ),
  ]

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Project header */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900">{job?.job_name ?? 'Your Project'}</h1>
        {address && <p className="mt-0.5 text-sm text-gray-500">📍 {address}</p>}
      </div>

      {/* Tab bar — sticky just below portal shell header */}
      <TabBar tabs={tabs} active={activeTab} onChange={setTab}/>

      {/* Tab content */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          <ProgressCard
            milestones={milestones}
            startDate={job?.start_date ?? null}
            targetCompletion={job?.target_completion ?? null}
            contractCents={job?.current_contract_cents ?? job?.contract_value_cents ?? null}
          />
          <OverviewActions
            milestones={milestones}
            selections={selections}
            invoices={invoices}
            onApprove={(id) => approveMut.mutate(id)}
            approvingId={approveMut.isPending ? (approveMut.variables ?? null) : null}
            onNavigate={setTab}
            isStaffPreview={isStaffPreview}
          />
        </div>
      )}

      {activeTab === 'timeline' && (
        <TimelineTab
          milestones={milestones}
          startDate={job?.start_date ?? null}
          targetCompletion={job?.target_completion ?? null}
          onApprove={(id) => approveMut.mutate(id)}
          approvingId={approveMut.isPending ? (approveMut.variables ?? null) : null}
          readOnly={isStaffPreview}
        />
      )}

      {activeTab === 'finances' && (
        <FinancesTab milestones={milestones} invoices={invoices} changeOrders={changeOrders}/>
      )}

      {activeTab === 'updates' && (
        <UpdatesTab logs={dailyLogs}/>
      )}

      {activeTab === 'documents' && (
        <DocumentsTab documents={documents}/>
      )}

      {activeTab === 'selections' && !isStaffPreview && (
        selLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-2xl"/>)}
          </div>
        ) : (
          <SelectionsTab
            categories={selections ?? []}
            project={project}
            customerId={customer!.id}
          />
        )
      )}
    </div>
  )
}
