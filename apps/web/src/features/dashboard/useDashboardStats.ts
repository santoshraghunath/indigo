import { useMemo } from 'react'
import { isProjectArchived } from '@indigo/shared'
import { useProjects } from '@/features/projects/useProjects'

export function useDashboardStats() {
  const { data: projects, isLoading } = useProjects()

  const stats = useMemo(() => {
    if (!projects) return null
    const jobs = projects.filter((p) => !isProjectArchived(p)).map((p) => p.job).filter(Boolean)
    return {
      active:    jobs.filter((j) => j!.project_status === 'active').length,
      bidding:   jobs.filter((j) => j!.project_status === 'bidding').length,
      onHold:    jobs.filter((j) => j!.project_status === 'on_hold').length,
      complete:  jobs.filter((j) => j!.project_status === 'complete').length,
      total:     jobs.length,
    }
  }, [projects])

  return { stats, isLoading }
}
