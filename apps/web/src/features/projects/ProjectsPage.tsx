import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { formatMoney, isProjectArchived } from '@indigo/shared'
import { useProjects } from './useProjects'
import { CreateProjectModal } from './CreateProjectModal'
import { StatusBadge, TypeBadge } from '@/components/ui/Badge'
import { SkeletonProjectRow } from '@/components/ui/Skeleton'
import {
  MagnifyingGlassIcon,
  PlusIcon,
  BuildingOfficeIcon,
  MapPinIcon,
  ChevronRightIcon,
} from '@/components/ui/Icons'

type StatusFilter = 'all' | 'active' | 'bidding' | 'on_hold' | 'complete'

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all',      label: 'All' },
  { value: 'active',   label: 'Active' },
  { value: 'bidding',  label: 'Bidding' },
  { value: 'on_hold',  label: 'On Hold' },
  { value: 'complete', label: 'Complete' },
]

// Left border accent colors by status
const STATUS_ACCENT: Record<string, string> = {
  active:    '#6366f1',
  bidding:   '#f59e0b',
  on_hold:   '#9ca3af',
  complete:  '#16a34a',
  cancelled: '#ef4444',
  pending:   '#64748b',
}

function formatDate(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

export function ProjectsPage() {
  const { data: allProjects, isLoading, error } = useProjects()
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [search, setSearch]           = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [showArchived, setShowArchived] = useState(false)

  const archivedCount = useMemo(
    () => allProjects?.filter(isProjectArchived).length ?? 0,
    [allProjects],
  )
  const projects = useMemo(
    () => (showArchived ? allProjects : allProjects?.filter((p) => !isProjectArchived(p))),
    [allProjects, showArchived],
  )

  const filtered = useMemo(() => {
    if (!projects) return []
    return projects.filter((p) => {
      const job = p.job
      if (!job) return false

      const matchesStatus =
        statusFilter === 'all' || job.project_status === statusFilter

      const q = search.toLowerCase()
      const matchesSearch =
        !q ||
        job.job_name.toLowerCase().includes(q) ||
        job.job_number.toLowerCase().includes(q) ||
        (job.city ?? '').toLowerCase().includes(q)

      return matchesStatus && matchesSearch
    })
  }, [projects, search, statusFilter])

  const counts = useMemo(() => {
    if (!projects) return {}
    return projects.reduce<Record<string, number>>((acc, p) => {
      const s = p.job?.project_status ?? 'unknown'
      acc[s] = (acc[s] ?? 0) + 1
      return acc
    }, {})
  }, [projects])

  return (
    <div className="flex h-full flex-col">
      {/* Page header */}
      <div className="border-b border-gray-200 bg-white px-5 py-4 lg:px-8 lg:py-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Projects</h1>
            {!isLoading && projects && (
              <p className="mt-0.5 text-sm text-gray-500">
                {projects.length} project{projects.length !== 1 ? 's' : ''}
                {counts['active'] ? ` · ${counts['active']} active` : ''}
              </p>
            )}
          </div>

          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
          >
            <PlusIcon className="h-4 w-4" strokeWidth={2.5} />
            New Project
          </button>
        </div>

        {/* Search + filters */}
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          {/* Search */}
          <div className="relative flex-1 sm:max-w-xs">
            <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search projects..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-full rounded-lg border border-gray-200 bg-gray-50 pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100 transition-colors"
            />
          </div>

          {/* Status filter pills */}
          <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setStatusFilter(f.value)}
                className={`inline-flex h-8 shrink-0 items-center rounded-full px-3 text-xs font-medium transition-colors ${
                  statusFilter === f.value
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900'
                }`}
              >
                {f.label}
                {f.value !== 'all' && counts[f.value] ? (
                  <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                    statusFilter === f.value ? 'bg-brand-500 text-white' : 'bg-gray-200 text-gray-500'
                  }`}>
                    {counts[f.value]}
                  </span>
                ) : null}
              </button>
            ))}
          </div>

          {archivedCount > 0 && (
            <label className="flex min-h-[44px] shrink-0 cursor-pointer select-none items-center gap-2 text-xs font-medium text-gray-600 sm:ml-auto">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              />
              Show archived ({archivedCount})
            </label>
          )}
        </div>
      </div>

      {/* Create project modal */}
      {showCreateModal && (
        <CreateProjectModal onClose={() => setShowCreateModal(false)} />
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto bg-surface-1 pb-24 lg:pb-0">
        {isLoading ? (
          <div className="mx-auto max-w-4xl px-5 pt-4 lg:px-8">
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
              {Array.from({ length: 5 }).map((_, i) => (
                <SkeletonProjectRow key={i} />
              ))}
            </div>
          </div>
        ) : error ? (
          <ErrorState />
        ) : filtered.length === 0 ? (
          <EmptyState
            hasProjects={!!allProjects?.length}
            searchActive={!!search || statusFilter !== 'all'}
            onNewProject={() => setShowCreateModal(true)}
          />
        ) : (
          <div className="mx-auto max-w-4xl px-5 pt-4 lg:px-8">
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
              {filtered.map((project) => {
                const job = project.job!
                const accentColor = STATUS_ACCENT[job.project_status ?? ''] ?? '#9ca3af'
                const contractCents = job.current_contract_cents ?? job.contract_value_cents
                const location = [job.city, job.state].filter(Boolean).join(', ')
                const targetDate = formatDate(job.target_completion)
                const archived = isProjectArchived(project)

                return (
                  <Link
                    key={project.id}
                    to={`/projects/${project.id}`}
                    className={`group flex items-center gap-4 border-b border-gray-100 px-5 py-4 transition-colors hover:bg-gray-50 last:border-0 ${
                      archived ? 'opacity-60' : ''
                    }`}
                  >
                    {/* Status accent dot */}
                    <div
                      className="h-8 w-1 shrink-0 rounded-full"
                      style={{ backgroundColor: archived ? '#d1d5db' : accentColor }}
                    />

                    {/* Main content */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-gray-900 group-hover:text-brand-700 transition-colors">
                          {job.job_name}
                        </span>
                        {job.project_type && <TypeBadge type={job.project_type} />}
                        {archived && (
                          <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                            Archived
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-500">
                        <span className="font-mono text-gray-400">{job.job_number}</span>
                        {location && (
                          <>
                            <span className="text-gray-300">·</span>
                            <span className="flex items-center gap-0.5">
                              <MapPinIcon className="h-3 w-3" strokeWidth={1.5} />
                              {location}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Right metadata */}
                    <div className="hidden shrink-0 items-center gap-5 sm:flex">
                      {contractCents != null && (
                        <span className="text-sm font-semibold tabular-nums text-gray-900">
                          {formatMoney(contractCents)}
                        </span>
                      )}
                      <StatusBadge status={job.project_status ?? ''} />
                      {targetDate && (
                        <span className="w-24 text-right text-xs text-gray-400">
                          {targetDate}
                        </span>
                      )}
                    </div>

                    <ChevronRightIcon className="h-4 w-4 shrink-0 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-gray-400" />
                  </Link>
                )
              })}
            </div>

            {/* Footer count */}
            {filtered.length > 0 && (
              <p className="mt-3 pb-4 text-center text-xs text-gray-400">
                Showing {filtered.length} of {projects?.length} project{projects?.length !== 1 ? 's' : ''}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function EmptyState({
  hasProjects,
  searchActive,
  onNewProject,
}: {
  hasProjects: boolean
  searchActive: boolean
  onNewProject: () => void
}) {
  if (searchActive) {
    return (
      <div className="flex h-64 items-center justify-center p-6">
        <div className="text-center">
          <MagnifyingGlassIcon className="mx-auto h-10 w-10 text-gray-300" strokeWidth={1} />
          <h3 className="mt-3 text-sm font-semibold text-gray-900">No results</h3>
          <p className="mt-1 text-sm text-gray-500">Try adjusting your search or filter.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-96 items-center justify-center p-6">
      <div className="max-w-sm text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-white">
          <BuildingOfficeIcon className="h-8 w-8 text-gray-300" strokeWidth={1} />
        </div>
        <h3 className="mt-4 text-base font-semibold text-gray-900">
          {hasProjects ? 'No projects match' : 'No projects yet'}
        </h3>
        <p className="mt-1.5 text-sm text-gray-500 leading-relaxed">
          {hasProjects
            ? 'Try changing your filters, or turn on “Show archived”.'
            : 'Projects you create will appear here. Each project tracks financials, schedule, documents, and field activity in one place.'}
        </p>
        {!hasProjects && (
          <button
            onClick={onNewProject}
            className="mt-6 inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-700"
          >
            <PlusIcon className="h-4 w-4" strokeWidth={2.5} />
            Create your first project
          </button>
        )}
      </div>
    </div>
  )
}

function ErrorState() {
  return (
    <div className="flex h-64 items-center justify-center p-6">
      <div className="text-center">
        <p className="text-sm font-semibold text-gray-900">Failed to load projects</p>
        <p className="mt-1 text-sm text-gray-500">Check your connection and try again.</p>
      </div>
    </div>
  )
}
