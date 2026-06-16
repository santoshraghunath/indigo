import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Navigate } from 'react-router-dom'
import {
  getProjects,
  getClockEntriesReport,
  getLaborCostSummaryReport,
} from '@indigo/shared'
import type { ClockEntryReportRow, LaborSummaryReportRow } from '@indigo/shared'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { Skeleton } from '@/components/ui/Skeleton'
import { ArrowDownTrayIcon } from '@/components/ui/Icons'

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtHours(h: number | null | undefined) {
  if (h == null) return '—'
  return h.toFixed(2) + ' h'
}

function fmtMoney(cents: number | null | undefined) {
  if (cents == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
}

function isPmOrAbove(role: string | undefined) {
  return ['owner', 'admin', 'project_manager'].includes(role ?? '')
}

function defaultFrom() {
  const d = new Date()
  d.setDate(d.getDate() - 6)
  return d.toISOString().slice(0, 10)
}

function defaultTo() {
  return new Date().toISOString().slice(0, 10)
}

function exportCsv(filename: string, headers: string[], rows: (string | number | null | undefined)[][]) {
  const escape = (v: string | number | null | undefined) =>
    `"${String(v ?? '').replace(/"/g, '""')}"`
  const content = [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))].join('\n')
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ── Filter bar ─────────────────────────────────────────────────────────────

interface Filters {
  from:      string
  to:        string
  projectId: string
}

function FilterBar({
  filters,
  onChange,
  projects,
  onRun,
  running,
}: {
  filters:  Filters
  onChange: (f: Filters) => void
  projects: { id: string; job: { job_number?: string | null; job_name?: string | null } | null }[]
  onRun:    () => void
  running:  boolean
}) {
  const inputCls =
    'h-9 rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm text-gray-900 ' +
    'focus:bg-white focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 transition-colors'

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">From</label>
        <input
          type="date"
          value={filters.from}
          max={filters.to}
          onChange={(e) => onChange({ ...filters, from: e.target.value })}
          className={inputCls}
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">To</label>
        <input
          type="date"
          value={filters.to}
          min={filters.from}
          max={defaultTo()}
          onChange={(e) => onChange({ ...filters, to: e.target.value })}
          className={inputCls}
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">Project</label>
        <select
          value={filters.projectId}
          onChange={(e) => onChange({ ...filters, projectId: e.target.value })}
          className={inputCls + ' pr-8'}
        >
          <option value="">All Projects</option>
          {projects.map((p) => {
            const job = p.job
            const label = job?.job_number ? `${job.job_number} — ${job.job_name}` : (job?.job_name ?? p.id)
            return <option key={p.id} value={p.id}>{label}</option>
          })}
        </select>
      </div>
      <button
        onClick={onRun}
        disabled={running}
        className="h-9 rounded-lg bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
      >
        {running ? 'Running…' : 'Run Report'}
      </button>
    </div>
  )
}

// ── Clock Entries report panel ─────────────────────────────────────────────

function ClockEntriesPanel({
  tenantId,
  projects,
}: {
  tenantId: string
  projects: { id: string; job: { job_number?: string | null; job_name?: string | null } | null }[]
}) {
  // Pending = what the user is editing; runFilters = last committed on Run
  const initFilters: Filters = { from: defaultFrom(), to: defaultTo(), projectId: '' }
  const [pendingFilters, setPendingFilters] = useState<Filters>(initFilters)
  const [runFilters,     setRunFilters]     = useState<Filters>(initFilters)
  const [runCount,       setRunCount]       = useState(0)

  const projectMap = new Map(
    projects.map((p) => [
      p.id,
      p.job?.job_number
        ? `${p.job.job_number} — ${p.job.job_name}`
        : (p.job?.job_name ?? p.id),
    ]),
  )

  // Query only fires when runCount > 0; changing pendingFilters has no effect
  const { data: rows = [], isFetching } = useQuery<ClockEntryReportRow[]>({
    queryKey: ['report-clock-entries', tenantId, runFilters, runCount],
    queryFn:  () =>
      getClockEntriesReport(supabase, tenantId, {
        from:      runFilters.from,
        to:        runFilters.to,
        projectId: runFilters.projectId || undefined,
      }),
    enabled:   runCount > 0,
    staleTime: Infinity,
  })

  function run() {
    setRunFilters({ ...pendingFilters })
    setRunCount((c) => c + 1)
  }

  // Totals
  const totalNetHrs  = rows.reduce((s, r) => s + (r.netHours ?? 0), 0)
  const totalOtHrs   = rows.reduce((s, r) => s + (r.ot15Hours ?? 0) + (r.ot20Hours ?? 0), 0)
  const totalMiles   = rows.reduce((s, r) => s + (r.mileageMiles ?? 0), 0)
  const totalCost    = rows.reduce((s, r) => s + (r.laborCostCents ?? 0), 0)
  const hasCosts     = rows.some((r) => r.laborCostCents != null)
  const hasMileage   = rows.some((r) => r.mileageMiles != null)

  function exportRows() {
    exportCsv(
      `clock-entries-${runFilters.from}-to-${runFilters.to}.csv`,
      ['Worker', 'Project', 'Date', 'Clock In', 'Clock Out', 'Break (min)', 'Auto Lunch', 'Net Hours', 'Regular', 'OT 1.5×', 'OT 2×', 'Mileage', 'Labor Cost', 'Notes', 'Status'],
      rows.map((r) => [
        r.workerName,
        projectMap.get(r.projectId) ?? r.projectId,
        fmtDate(r.clockedInAt),
        fmtTime(r.clockedInAt),
        r.clockedOutAt ? fmtTime(r.clockedOutAt) : '',
        r.totalBreakMinutes,
        r.autoBreakDeducted ? 'Yes' : 'No',
        r.netHours?.toFixed(2),
        r.regularHours?.toFixed(2),
        r.ot15Hours?.toFixed(2),
        r.ot20Hours?.toFixed(2),
        r.mileageMiles,
        r.laborCostCents != null ? (r.laborCostCents / 100).toFixed(2) : '',
        r.notes,
        r.status,
      ]),
    )
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
      <div className="px-6 py-5 border-b border-gray-100">
        <h2 className="text-base font-semibold text-gray-900">Clock Entries</h2>
        <p className="mt-0.5 text-sm text-gray-500">
          Individual time sessions with hours, OT breakdown, mileage, and labor cost.
        </p>
      </div>

      <div className="px-6 py-5 border-b border-gray-100">
        <FilterBar
          filters={pendingFilters}
          onChange={setPendingFilters}
          projects={projects}
          onRun={run}
          running={isFetching}
        />
      </div>

      {runCount > 0 && (
        <div className="px-6 py-5">
          {isFetching ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400 italic">No sessions found for this period.</p>
          ) : (
            <>
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm text-gray-500">{rows.length} session{rows.length !== 1 ? 's' : ''}</p>
                <button
                  onClick={exportRows}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <ArrowDownTrayIcon className="h-3.5 w-3.5" />
                  Export CSV
                </button>
              </div>
              <div className="overflow-x-auto -mx-6">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      {['Worker', 'Project', 'Date', 'In', 'Out', 'Break', 'Net Hrs', 'OT Hrs', 'Mileage', 'Cost'].map((h) => (
                        <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 whitespace-nowrap first:pl-6 last:pr-6">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {rows.map((r) => {
                      const otHrs = (r.ot15Hours ?? 0) + (r.ot20Hours ?? 0)
                      return (
                        <tr key={r.id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap pl-6">{r.workerName}</td>
                          <td className="px-4 py-3 text-gray-600 max-w-[180px] truncate">{projectMap.get(r.projectId) ?? '—'}</td>
                          <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtDate(r.clockedInAt)}</td>
                          <td className="px-4 py-3 text-gray-600 whitespace-nowrap tabular-nums">{fmtTime(r.clockedInAt)}</td>
                          <td className="px-4 py-3 text-gray-600 whitespace-nowrap tabular-nums">{r.clockedOutAt ? fmtTime(r.clockedOutAt) : '—'}</td>
                          <td className="px-4 py-3 text-gray-500 whitespace-nowrap tabular-nums">
                            {r.totalBreakMinutes > 0 ? `${r.totalBreakMinutes} min` : '—'}
                            {r.autoBreakDeducted && <span className="ml-1 text-[10px] text-gray-400">(auto)</span>}
                          </td>
                          <td className="px-4 py-3 font-semibold text-gray-900 whitespace-nowrap tabular-nums">{fmtHours(r.netHours)}</td>
                          <td className="px-4 py-3 whitespace-nowrap tabular-nums">
                            {otHrs > 0
                              ? <span className="text-amber-600 font-medium">{fmtHours(otHrs)}</span>
                              : <span className="text-gray-400">—</span>}
                          </td>
                          <td className="px-4 py-3 text-gray-600 whitespace-nowrap tabular-nums">
                            {r.mileageMiles != null ? `${r.mileageMiles} mi` : <span className="text-gray-400">—</span>}
                          </td>
                          <td className="px-4 py-3 text-gray-700 whitespace-nowrap tabular-nums pr-6">{fmtMoney(r.laborCostCents)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-200 bg-gray-50">
                      <td className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide pl-6" colSpan={6}>
                        Total ({rows.length} sessions)
                      </td>
                      <td className="px-4 py-3 font-semibold text-gray-900 tabular-nums whitespace-nowrap">{fmtHours(totalNetHrs)}</td>
                      <td className="px-4 py-3 tabular-nums whitespace-nowrap">
                        {totalOtHrs > 0
                          ? <span className="font-semibold text-amber-600">{fmtHours(totalOtHrs)}</span>
                          : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3 font-semibold text-gray-900 tabular-nums whitespace-nowrap">
                        {hasMileage ? `${totalMiles.toFixed(1)} mi` : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3 tabular-nums whitespace-nowrap pr-6">
                        {hasCosts
                          ? <span className="font-semibold text-gray-900">{fmtMoney(totalCost)}</span>
                          : <span className="text-gray-400">—</span>}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  )
}

// ── Labor Cost Summary panel ───────────────────────────────────────────────

function LaborSummaryPanel({
  tenantId,
  projects,
}: {
  tenantId: string
  projects: { id: string; job: { job_number?: string | null; job_name?: string | null } | null }[]
}) {
  const initFilters: Filters = { from: defaultFrom(), to: defaultTo(), projectId: '' }
  const [pendingFilters, setPendingFilters] = useState<Filters>(initFilters)
  const [runFilters,     setRunFilters]     = useState<Filters>(initFilters)
  const [runCount,       setRunCount]       = useState(0)

  const { data: rows = [], isFetching } = useQuery<LaborSummaryReportRow[]>({
    queryKey: ['report-labor-summary', tenantId, runFilters, runCount],
    queryFn:  () =>
      getLaborCostSummaryReport(supabase, tenantId, {
        from:      runFilters.from,
        to:        runFilters.to,
        projectId: runFilters.projectId || undefined,
      }),
    enabled:   runCount > 0,
    staleTime: Infinity,
  })

  function run() {
    setRunFilters({ ...pendingFilters })
    setRunCount((c) => c + 1)
  }

  const totalHrs  = rows.reduce((s, r) => s + r.totalNetHours, 0)
  const totalCost = rows.reduce((s, r) => s + (r.totalLaborCostCents ?? 0), 0)
  const hasCosts  = rows.some((r) => r.totalLaborCostCents != null)

  function exportRows() {
    exportCsv(
      `labor-summary-${runFilters.from}-to-${runFilters.to}.csv`,
      ['Worker', 'Sessions', 'Total Hours', 'Regular', 'OT 1.5×', 'OT 2×', 'Mileage (mi)', 'Total Cost'],
      [
        ...rows.map((r) => [
          r.workerName,
          r.sessionCount,
          r.totalNetHours.toFixed(2),
          r.regularHours.toFixed(2),
          r.ot15Hours.toFixed(2),
          r.ot20Hours.toFixed(2),
          r.totalMileageMiles.toFixed(1),
          r.totalLaborCostCents != null ? (r.totalLaborCostCents / 100).toFixed(2) : '',
        ]),
        ['TOTAL', rows.reduce((s, r) => s + r.sessionCount, 0), totalHrs.toFixed(2),
         rows.reduce((s, r) => s + r.regularHours, 0).toFixed(2),
         rows.reduce((s, r) => s + r.ot15Hours, 0).toFixed(2),
         rows.reduce((s, r) => s + r.ot20Hours, 0).toFixed(2),
         rows.reduce((s, r) => s + r.totalMileageMiles, 0).toFixed(1),
         (totalCost / 100).toFixed(2)],
      ],
    )
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
      <div className="px-6 py-5 border-b border-gray-100">
        <h2 className="text-base font-semibold text-gray-900">Labor Cost Summary</h2>
        <p className="mt-0.5 text-sm text-gray-500">
          Aggregated hours and cost per worker for the selected period.
        </p>
      </div>

      <div className="px-6 py-5 border-b border-gray-100">
        <FilterBar
          filters={pendingFilters}
          onChange={setPendingFilters}
          projects={projects}
          onRun={run}
          running={isFetching}
        />
      </div>

      {runCount > 0 && (
        <div className="px-6 py-5">
          {isFetching ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400 italic">No sessions found for this period.</p>
          ) : (
            <>
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm text-gray-500">{rows.length} worker{rows.length !== 1 ? 's' : ''}</p>
                <button
                  onClick={exportRows}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <ArrowDownTrayIcon className="h-3.5 w-3.5" />
                  Export CSV
                </button>
              </div>
              <div className="overflow-x-auto -mx-6">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      {['Worker', 'Sessions', 'Total Hrs', 'Regular', 'OT 1.5×', 'OT 2×', 'Mileage', 'Total Cost'].map((h) => (
                        <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 whitespace-nowrap first:pl-6 last:pr-6">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {rows.map((r) => (
                      <tr key={r.userId} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap pl-6">{r.workerName}</td>
                        <td className="px-4 py-3 text-gray-600 tabular-nums">{r.sessionCount}</td>
                        <td className="px-4 py-3 font-semibold text-gray-900 tabular-nums whitespace-nowrap">{fmtHours(r.totalNetHours)}</td>
                        <td className="px-4 py-3 text-gray-600 tabular-nums whitespace-nowrap">{fmtHours(r.regularHours)}</td>
                        <td className="px-4 py-3 tabular-nums whitespace-nowrap">
                          {r.ot15Hours > 0
                            ? <span className="text-amber-600 font-medium">{fmtHours(r.ot15Hours)}</span>
                            : <span className="text-gray-400">—</span>}
                        </td>
                        <td className="px-4 py-3 tabular-nums whitespace-nowrap">
                          {r.ot20Hours > 0
                            ? <span className="text-red-600 font-medium">{fmtHours(r.ot20Hours)}</span>
                            : <span className="text-gray-400">—</span>}
                        </td>
                        <td className="px-4 py-3 text-gray-600 tabular-nums whitespace-nowrap">
                          {r.totalMileageMiles > 0 ? `${r.totalMileageMiles.toFixed(1)} mi` : '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-700 tabular-nums whitespace-nowrap pr-6">{fmtMoney(r.totalLaborCostCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-200 bg-gray-50">
                      <td className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide pl-6">Total</td>
                      <td className="px-4 py-3 font-semibold text-gray-900 tabular-nums">{rows.reduce((s, r) => s + r.sessionCount, 0)}</td>
                      <td className="px-4 py-3 font-semibold text-gray-900 tabular-nums whitespace-nowrap">{fmtHours(totalHrs)}</td>
                      <td className="px-4 py-3 font-semibold text-gray-900 tabular-nums whitespace-nowrap">{fmtHours(rows.reduce((s, r) => s + r.regularHours, 0))}</td>
                      <td className="px-4 py-3 font-semibold text-amber-600 tabular-nums whitespace-nowrap">{fmtHours(rows.reduce((s, r) => s + r.ot15Hours, 0))}</td>
                      <td className="px-4 py-3 font-semibold text-red-600 tabular-nums whitespace-nowrap">{fmtHours(rows.reduce((s, r) => s + r.ot20Hours, 0))}</td>
                      <td className="px-4 py-3 font-semibold text-gray-900 tabular-nums whitespace-nowrap">
                        {rows.reduce((s, r) => s + r.totalMileageMiles, 0) > 0
                          ? `${rows.reduce((s, r) => s + r.totalMileageMiles, 0).toFixed(1)} mi`
                          : '—'}
                      </td>
                      <td className="px-4 py-3 tabular-nums whitespace-nowrap pr-6">
                        {hasCosts
                          ? <span className="font-semibold text-gray-900">{fmtMoney(totalCost)}</span>
                          : '—'}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────

export function ReportsPage() {
  const { activeTenantId, tenantMemberships } = useAuth()
  const tenantId = activeTenantId ?? ''

  const activeMembership = tenantMemberships.find((m) => m.tenant_id === tenantId)
  const role = activeMembership?.role

  if (!isPmOrAbove(role)) return <Navigate to="/" replace />

  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ['projects', tenantId],
    queryFn:  () => getProjects(supabase, tenantId),
    enabled:  !!tenantId,
    staleTime: 300_000,
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const typedProjects = (projects as any[]).map((p) => ({
    id:  p.id as string,
    job: p.job as { job_number?: string | null; job_name?: string | null } | null,
  }))

  return (
    <div className="px-5 py-6 lg:px-8 max-w-5xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Reports</h1>
        <p className="mt-1 text-sm text-gray-500">Export and analyze your time &amp; labor data.</p>
      </div>

      {projectsLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-40 w-full rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
      ) : (
        <>
          <ClockEntriesPanel tenantId={tenantId} projects={typedProjects} />
          <LaborSummaryPanel tenantId={tenantId} projects={typedProjects} />
        </>
      )}
    </div>
  )
}
