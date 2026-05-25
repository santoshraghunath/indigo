import { useOutletContext, useParams } from 'react-router-dom'
import type { ProjectRow, ProjectChangeOrder, ProjectDrawRequest, ProjectDrawSchedule, ProjectInvoice } from '@indigo/shared'
import { formatMoney } from '@indigo/shared'
import {
  useProjectChangeOrders,
  useProjectDrawSchedule,
  useProjectInvoices,
} from '../useProject'
import { Skeleton } from '@/components/ui/Skeleton'
import { ExclamationTriangleIcon, CalendarIcon } from '@/components/ui/Icons'

interface OutletCtx {
  project: ProjectRow | undefined
  isLoading: boolean
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtDate(s: string | null | undefined): string {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtPct(n: number | null | undefined): string {
  if (n == null) return '—'
  return `${n}%`
}

function fmtBytes(n: number | null | undefined): string {
  if (!n) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

// ── Status configs ─────────────────────────────────────────────────────────

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

// ── Contract Summary ───────────────────────────────────────────────────────

function ContractSummary({
  job,
  changeOrders,
}: {
  job: ProjectRow['job']
  changeOrders: ProjectChangeOrder[]
}) {
  const original = job?.contract_value_cents ?? job?.contract_amount_cents ?? null
  const current  = job?.current_contract_cents ?? original

  const approvedCOs = changeOrders
    .filter((co) => co.co_status === 'approved')
    .reduce((sum, co) => sum + co.amount_cents, 0)

  const totalBilled  = 0  // TODO: from invoices
  const billedPct    = current && current > 0 ? Math.round((totalBilled / current) * 100) : 0

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

      {/* Progress bar — billed vs contract */}
      {current && current > 0 && (
        <div className="px-5 py-3 border-t border-gray-100">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs text-gray-500">Billed progress</span>
            <span className="text-xs font-medium text-gray-700">{billedPct}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-brand-500 transition-all duration-500"
              style={{ width: `${billedPct}%` }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Change Orders ──────────────────────────────────────────────────────────

function ChangeOrdersSection({ changeOrders }: { changeOrders: ProjectChangeOrder[] }) {
  const total = changeOrders.reduce((sum, co) => sum + co.amount_cents, 0)

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-card">
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
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

      {changeOrders.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <p className="text-sm text-gray-400">No change orders on this project.</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {changeOrders.map((co) => (
            <div key={co.id} className="flex items-start gap-4 px-5 py-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-semibold text-gray-500">{co.co_number}</span>
                  <span className="text-sm font-medium text-gray-900 truncate">
                    {co.title ?? co.description ?? '—'}
                  </span>
                  <StatusBadge status={co.co_status} map={CO_STATUS} />
                </div>
                {co.schedule_impact_days != null && co.schedule_impact_days !== 0 && (
                  <p className="mt-0.5 text-xs text-gray-400">
                    {co.schedule_impact_days > 0 ? '+' : ''}{co.schedule_impact_days} day schedule impact
                  </p>
                )}
                {co.approved_at && (
                  <p className="mt-0.5 text-xs text-gray-400">Approved {fmtDate(co.approved_at)}</p>
                )}
              </div>
              <div className="shrink-0 text-right">
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
          ))}
        </div>
      )}
    </div>
  )
}

// ── Draw Schedule ──────────────────────────────────────────────────────────

function DrawScheduleSection({
  schedule,
  jobHasLoan,
}: {
  schedule: ProjectDrawSchedule | null
  jobHasLoan: boolean
}) {
  if (!jobHasLoan && !schedule) return null

  const draws = schedule
    ? [...schedule.draw_requests].sort((a, b) => a.number - b.number)
    : []

  const totalFunded = draws.reduce((s, d) => s + d.amount_funded_cents, 0)
  const loanAmt     = schedule?.loan_amount_cents ?? null
  const holdbackPct = schedule?.holdback_pct ?? 10
  const holdbackAmt = loanAmt != null ? Math.round(loanAmt * holdbackPct / 100) : null
  const netLoan     = loanAmt != null && holdbackAmt != null ? loanAmt - holdbackAmt : null
  const fundedPct   = netLoan && netLoan > 0 ? Math.round((totalFunded / netLoan) * 100) : 0

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-card">
      <div className="border-b border-gray-100 px-5 py-4">
        <h2 className="text-sm font-semibold text-gray-900">Construction Loan &amp; Draws</h2>
      </div>

      {/* Lender info */}
      {schedule && (
        <div className="grid grid-cols-2 gap-px bg-gray-100 border-b border-gray-100 lg:grid-cols-4">
          {[
            { label: 'Lender',      value: schedule.lender_name ?? '—' },
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
            <div
              className="h-full rounded-full bg-green-500 transition-all duration-500"
              style={{ width: `${fundedPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Draw requests */}
      {draws.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <p className="text-sm text-gray-400">No draw requests submitted yet.</p>
        </div>
      ) : (
        <>
          {/* Header */}
          <div className="hidden grid-cols-5 gap-4 border-b border-gray-100 px-5 py-2 lg:grid">
            {['Draw #', 'Requested', 'Approved', 'Funded', 'Status'].map((h) => (
              <p key={h} className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{h}</p>
            ))}
          </div>
          <div className="divide-y divide-gray-100">
            {draws.map((draw) => (
              <DrawRow key={draw.id} draw={draw} />
            ))}
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
    </div>
  )
}

// ── Invoices ───────────────────────────────────────────────────────────────

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
          {/* Column headers */}
          <div className="hidden grid-cols-5 gap-4 border-b border-gray-100 px-5 py-2 lg:grid">
            {['Invoice', 'Date', 'Total', 'Paid', 'Balance'].map((h) => (
              <p key={h} className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{h}</p>
            ))}
          </div>

          <div className="divide-y divide-gray-100">
            {invoices.map((inv) => (
              <div key={inv.id} className="grid grid-cols-2 gap-x-4 gap-y-1 px-5 py-3 lg:grid-cols-5 lg:items-center">
                <div>
                  <p className="text-sm font-semibold text-gray-800">{inv.invoice_number}</p>
                </div>
                <div className="text-right lg:text-left">
                  <StatusBadge status={inv.invoice_status} map={INVOICE_STATUS} />
                </div>
                <div className="lg:hidden" />
                <div>
                  <p className="text-[10px] text-gray-400 lg:hidden">Date</p>
                  <p className="text-sm text-gray-700">{fmtDate(inv.invoice_date)}</p>
                </div>
                <div className="col-span-2 mt-1 grid grid-cols-3 gap-2 lg:col-span-3 lg:mt-0">
                  {[
                    { label: 'Total',   value: formatMoney(inv.total_cents),   bold: true },
                    { label: 'Paid',    value: formatMoney(inv.amount_paid_cents) },
                    { label: 'Balance', value: formatMoney(inv.balance_due_cents), warn: inv.balance_due_cents > 0 && inv.invoice_status === 'overdue' },
                  ].map((item) => (
                    <div key={item.label}>
                      <p className="text-[10px] text-gray-400 lg:hidden">{item.label}</p>
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

          {/* Totals footer */}
          <div className="grid grid-cols-5 gap-4 border-t border-gray-200 bg-gray-50 px-5 py-3">
            <div className="col-span-2">
              <p className="text-xs font-semibold text-gray-600">Totals</p>
            </div>
            {[
              { value: formatMoney(totalBilled),  muted: false },
              { value: formatMoney(totalPaid),    muted: false },
              { value: formatMoney(totalBalance), muted: totalBalance === 0 },
            ].map((item, i) => (
              <p key={i} className={`text-sm font-semibold tabular-nums ${
                !item.muted && i === 2 && totalBalance > 0 ? 'text-amber-700' : 'text-gray-800'
              }`}>
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

// ── Main component ─────────────────────────────────────────────────────────

export function FinancialsTab() {
  const { id: projectId } = useParams<{ id: string }>()
  const { project, isLoading: projectLoading } = useOutletContext<OutletCtx>()

  const jobId = project?.job?.id
  const jobHasLoan = project?.job?.has_construction_loan ?? false

  const { data: changeOrders, isLoading: cosLoading } = useProjectChangeOrders(jobId)
  const { data: drawSchedule, isLoading: drawLoading } = useProjectDrawSchedule(jobId)
  const { data: invoices,     isLoading: invLoading  } = useProjectInvoices(jobId)

  const isLoading = projectLoading || cosLoading || drawLoading || invLoading

  if (isLoading) {
    return <div className="px-5 py-6 lg:px-8"><FinancialsSkeleton /></div>
  }

  return (
    <div className="space-y-4 px-5 py-6 lg:px-8">
      <ContractSummary
        job={project?.job ?? null}
        changeOrders={changeOrders ?? []}
      />

      <ChangeOrdersSection changeOrders={changeOrders ?? []} />

      <DrawScheduleSection
        schedule={drawSchedule ?? null}
        jobHasLoan={jobHasLoan}
      />

      <InvoicesSection invoices={invoices ?? []} />
    </div>
  )
}
