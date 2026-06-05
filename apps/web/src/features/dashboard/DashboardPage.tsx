import { Link } from 'react-router-dom'
import { formatMoney } from '@indigo/shared'
import { useAuth } from '@/hooks/useAuth'
import { useDashboardStats } from './useDashboardStats'
import { useProjects } from '@/features/projects/useProjects'
import { SkeletonCard } from '@/components/ui/Skeleton'
import { StatusBadge, TypeBadge } from '@/components/ui/Badge'

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

interface StatCardProps {
  label: string
  value: string | number
  icon: string
  loading?: boolean
  href?: string
}

function StatCard({ label, value, icon, loading, href }: StatCardProps) {
  const content = (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-card transition-shadow hover:shadow-panel">
      <div className="flex items-center gap-2">
        <span className="text-lg leading-none">{icon}</span>
        <span className="text-xs font-medium text-gray-500">{label}</span>
      </div>
      {loading ? (
        <div className="mt-2 h-7 w-12 animate-pulse rounded bg-gray-200" />
      ) : (
        <p className="mt-2 text-2xl font-semibold tabular-nums text-gray-900">{value}</p>
      )}
    </div>
  )

  return href ? (
    <Link to={href} className="block">
      {content}
    </Link>
  ) : (
    content
  )
}

export function DashboardPage() {
  const { profile } = useAuth()
  const { stats, isLoading } = useDashboardStats()
  const { data: projects, isLoading: projectsLoading } = useProjects()
  const recentProjects = projects?.filter(p => p.job != null).slice(0, 3) ?? []

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month:   'long',
    day:     'numeric',
  })

  return (
    <div className="p-5 pb-24 lg:p-8 lg:pb-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">
          {greeting()}{profile?.first_name ? `, ${profile.first_name}` : ''}
        </h1>
        <p className="mt-0.5 text-sm text-gray-500">{today}</p>
      </div>

      {/* Stats */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Active Projects"
          value={stats?.active ?? '—'}
          icon="🏗️"
          loading={isLoading}
          href="/projects"
        />
        <StatCard label="Open RFIs"    value="—" icon="❓" />
        <StatCard label="Pending COs"  value="—" icon="📝" />
        <StatCard label="Draw Ready"   value="—" icon="💰" />
      </div>

      {/* AI Insights */}
      <div className="mb-6">
        <h2 className="mb-3 text-sm font-semibold text-gray-900">AI Insights</h2>
        <div className="rounded-xl border border-brand-100 bg-brand-50 px-4 py-3 text-sm text-brand-700">
          ✦ Autonomous PM is watching your active projects. Insights will appear here each morning.
        </div>
      </div>

      {/* Recent projects */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Recent Projects</h2>
          <Link to="/projects" className="text-xs font-medium text-brand-600 hover:text-brand-700 transition-colors">
            View all →
          </Link>
        </div>
        <div className="space-y-3">
          {projectsLoading ? (
            <>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </>
          ) : recentProjects.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">No projects yet.</p>
          ) : (
            recentProjects.map((project) => {
              const job = project.job!
              const contractCents = job.current_contract_cents ?? job.contract_value_cents
              const location = [job.city, job.state].filter(Boolean).join(', ')
              return (
                <Link
                  key={project.id}
                  to={`/projects/${project.id}`}
                  className="block rounded-xl border border-gray-200 bg-white p-4 shadow-card transition-shadow hover:shadow-panel"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-gray-900">{job.job_name}</span>
                        {job.project_type && <TypeBadge type={job.project_type} />}
                      </div>
                      <p className="mt-0.5 font-mono text-xs text-gray-400">{job.job_number}{location ? ` · ${location}` : ''}</p>
                    </div>
                    <StatusBadge status={job.project_status ?? ''} />
                  </div>
                  {contractCents != null && (
                    <p className="mt-3 text-sm font-semibold tabular-nums text-gray-700">
                      {formatMoney(contractCents)}
                    </p>
                  )}
                </Link>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
