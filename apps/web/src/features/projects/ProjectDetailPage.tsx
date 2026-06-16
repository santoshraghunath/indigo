import { Link, NavLink, Outlet, useParams } from 'react-router-dom'
import { useProject } from './useProject'
import { useAuth } from '@/hooks/useAuth'
import { StatusBadge, TypeBadge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { ChevronRightIcon, MapPinIcon } from '@/components/ui/Icons'

interface Tab {
  to: string
  label: string
  live?: boolean
}

const EMPLOYEE_TABS    = new Set(['Overview', 'Schedule', 'Clock'])
const SUB_VISIBLE_TABS = new Set(['Overview', 'Schedule', 'Field'])

function tabs(id: string, role: string | null): Tab[] {
  const all: Tab[] = [
    { to: `/projects/${id}/overview`,    label: 'Overview',    live: true },
    { to: `/projects/${id}/schedule`,    label: 'Schedule',    live: true },
    { to: `/projects/${id}/financials`,  label: 'Financials', live: true },
    { to: `/projects/${id}/documents`,   label: 'Documents',  live: true },
    { to: `/projects/${id}/field`,       label: 'Field',  live: true },
    { to: `/projects/${id}/subs`,        label: 'Subs',   live: true },
    { to: `/projects/${id}/client`,      label: 'Client', live: true },
    { to: `/projects/${id}/clock`,       label: 'Clock',      live: true },
    { to: `/projects/${id}/selections`,  label: 'Selections', live: true },
  ]
  if (role === 'field_associate' || role === 'field_super')
    return all.filter((t) => EMPLOYEE_TABS.has(t.label))
  if (role === 'subcontractor')
    return all.filter((t) => SUB_VISIBLE_TABS.has(t.label))
  return all
}

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: project, isLoading, error } = useProject(id)
  const { activeTenantId, tenantMemberships } = useAuth()
  const role = tenantMemberships.find((m) => m.tenant_id === activeTenantId)?.role ?? null

  const job = project?.job
  const address = job
    ? [job.address_line1, job.city, job.state].filter(Boolean).join(', ')
    : null

  return (
    <div className="flex flex-col">
      {/* ── Project header ──────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-white">
        {/* Breadcrumb + meta */}
        <div className="border-b border-gray-200 px-5 py-4 lg:px-8">
          {/* Breadcrumb */}
          <nav className="mb-2 flex items-center gap-1.5 text-xs text-gray-500">
            <Link to="/projects" className="hover:text-gray-700 transition-colors">
              Projects
            </Link>
            <ChevronRightIcon className="h-3 w-3 text-gray-300" />
            {isLoading ? (
              <Skeleton className="h-3 w-32" />
            ) : (
              <span className="text-gray-700 font-medium truncate max-w-[200px]">
                {job?.job_name ?? 'Project'}
              </span>
            )}
          </nav>

          {/* Title row */}
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              {isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-6 w-64" />
                  <Skeleton className="h-4 w-48" />
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-xl font-semibold text-gray-900 leading-tight">
                      {job?.job_name ?? 'Unknown Project'}
                    </h1>
                    {job?.project_type && <TypeBadge type={job.project_type} />}
                    {job?.project_status && <StatusBadge status={job.project_status} />}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-500">
                    <span className="font-mono text-xs text-gray-400">{job?.job_number}</span>
                    {address && (
                      <>
                        <span className="text-gray-300">·</span>
                        <span className="flex items-center gap-1">
                          <MapPinIcon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
                          {address}
                        </span>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ── Tab bar ───────────────────────────────────────────────── */}
        <div className="flex items-center gap-0 overflow-x-auto border-b border-gray-200 bg-white px-5 lg:px-8">
          {id && tabs(id, role).map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) =>
                `relative flex h-11 shrink-0 items-center px-4 text-sm font-medium transition-colors
                ${isActive
                  ? 'text-brand-700 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:rounded-t after:bg-brand-600'
                  : 'text-gray-500 hover:text-gray-900'
                }
                ${!tab.live ? 'opacity-40 pointer-events-none' : ''}`
              }
            >
              {tab.label}
              {!tab.live && (
                <span className="ml-1.5 rounded bg-gray-100 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-gray-400">
                  Soon
                </span>
              )}
            </NavLink>
          ))}
        </div>
      </div>

      {/* ── Tab content ─────────────────────────────────────────────── */}
      {error ? (
        <div className="flex h-64 items-center justify-center p-6">
          <p className="text-sm text-gray-500">Failed to load project. Try refreshing.</p>
        </div>
      ) : (
        <div className="pb-24 lg:pb-8">
          <Outlet context={{ project, isLoading }} />
        </div>
      )}
    </div>
  )
}
