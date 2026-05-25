import { useQuery } from '@tanstack/react-query'
import {
  getProject,
  getProjectPhases,
  getProjectChangeOrders,
  getProjectDrawSchedule,
  getProjectInvoices,
  getProjectDocuments,
} from '@indigo/shared'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

export function useProject(projectId: string | undefined) {
  return useQuery({
    queryKey:  ['project', projectId],
    queryFn:   () => getProject(supabase, projectId!),
    enabled:   !!projectId,
    staleTime: 30_000,
  })
}

export function useProjectPhases(projectId: string | undefined) {
  const { activeTenantId } = useAuth()

  return useQuery({
    queryKey:  ['project-phases', projectId],
    queryFn:   () => getProjectPhases(supabase, projectId!, activeTenantId!),
    enabled:   !!projectId && !!activeTenantId,
    staleTime: 30_000,
  })
}

export function useProjectChangeOrders(jobId: string | undefined) {
  const { activeTenantId } = useAuth()

  return useQuery({
    queryKey:  ['project-change-orders', jobId],
    queryFn:   () => getProjectChangeOrders(supabase, jobId!, activeTenantId!),
    enabled:   !!jobId && !!activeTenantId,
    staleTime: 60_000,
  })
}

export function useProjectDrawSchedule(jobId: string | undefined) {
  const { activeTenantId } = useAuth()

  return useQuery({
    queryKey:  ['project-draw-schedule', jobId],
    queryFn:   () => getProjectDrawSchedule(supabase, jobId!, activeTenantId!),
    enabled:   !!jobId && !!activeTenantId,
    staleTime: 60_000,
  })
}

export function useProjectInvoices(jobId: string | undefined) {
  const { activeTenantId } = useAuth()

  return useQuery({
    queryKey:  ['project-invoices', jobId],
    queryFn:   () => getProjectInvoices(supabase, jobId!, activeTenantId!),
    enabled:   !!jobId && !!activeTenantId,
    staleTime: 60_000,
  })
}

export function useProjectDocuments(projectId: string | undefined) {
  const { activeTenantId } = useAuth()

  return useQuery({
    queryKey:  ['project-documents', projectId],
    queryFn:   () => getProjectDocuments(supabase, projectId!, activeTenantId!),
    enabled:   !!projectId && !!activeTenantId,
    staleTime: 60_000,
  })
}
