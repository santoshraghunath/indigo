import { useOutletContext, useParams } from 'react-router-dom'
import type { ProjectRow } from '@indigo/shared'
import { formatMoney } from '@indigo/shared'
import { useProjectPhases } from '../useProject'
import { Skeleton } from '@/components/ui/Skeleton'
import { MapPinIcon, CurrencyDollarIcon, CalendarIcon, BuildingOfficeIcon } from '@/components/ui/Icons'

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

// ── Main component ─────────────────────────────────────────────────────────

export function OverviewTab() {
  const { id } = useParams<{ id: string }>()
  const { project, isLoading } = useOutletContext<OutletCtx>()
  const { data: phases, isLoading: phasesLoading } = useProjectPhases(id)

  const job = project?.job

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
        <MetricCard
          label="Start Date"
          value={fmtDate(job.start_date)}
        />
        <MetricCard
          label="Target Completion"
          value={fmtDate(job.target_completion)}
        />
        <MetricCard
          label="Days Remaining"
          value={daysLeftLabel}
          accent={daysLeftAccent}
        />
      </div>

      {/* ── Two-column detail ──────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Job details */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-card">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
            <BuildingOfficeIcon className="h-4 w-4 text-gray-400" strokeWidth={1.75} />
            Job Details
          </h2>
          <div>
            <DetailRow label="Address" value={
              fullAddress
                ? <span className="flex items-start gap-1">
                    <MapPinIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" strokeWidth={1.5} />
                    {fullAddress}
                  </span>
                : null
            } />
            <DetailRow label="Package" value={job.package_name ?? null} />
            <DetailRow label="Tags" value={
              job.tags?.length
                ? <span className="flex flex-wrap gap-1">
                    {job.tags.map((t) => (
                      <span key={t} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{t}</span>
                    ))}
                  </span>
                : null
            } />
            <DetailRow label="Description" value={
              job.description?.trim() ? job.description : null
            } />
            <DetailRow label="Notes" value={
              job.notes?.trim() ? job.notes : null
            } />
          </div>
        </div>

        {/* Permit + loan */}
        <div className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-card">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
              <CalendarIcon className="h-4 w-4 text-gray-400" strokeWidth={1.75} />
              Permit
            </h2>
            {job.permit_number ? (
              <div>
                <DetailRow label="Permit #" value={job.permit_number} />
                <DetailRow label="Issued"   value={fmtDate(job.permit_issued_date, 'long')} />
                <DetailRow label="Expires"  value={fmtDate(job.permit_expiry_date, 'long')} />
              </div>
            ) : (
              <p className="text-sm text-gray-400">No permit on file</p>
            )}
          </div>

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

      {/* ── Empty phases call-to-action ───────────────────────────── */}
      {!phasesLoading && phases && phases.length === 0 && (
        <div className="mt-4 rounded-xl border border-dashed border-gray-200 bg-white p-6 text-center">
          <p className="text-sm font-medium text-gray-700">No phases defined</p>
          <p className="mt-1 text-xs text-gray-400">
            Schedule builder coming in Phase 2 — phases and milestones will appear here.
          </p>
        </div>
      )}
    </div>
  )
}
