import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getJobCustomer,
  getProjectPhases,
  setMilestoneClientVisible,
  type JobCustomer,
  type ProjectRow,
  type ProjectPhase,
} from '@indigo/shared'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { Skeleton } from '@/components/ui/Skeleton'

// ── Helpers ────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase()
}

// ── Portal invite card ─────────────────────────────────────────────────────

function PortalAccessCard({ customer }: { customer: JobCustomer }) {
  const [sending, setSending]   = useState(false)
  const [sent,    setSent]      = useState(false)
  const [err,     setErr]       = useState<string | null>(null)

  const isLinked = !!customer.portal_user_id

  // Use the configured app URL so the link works regardless of where the
  // PM's browser is running (localhost in dev would produce a broken link
  // for the client). VITE_APP_URL must be set to the deployed domain.
  const appUrl = (import.meta.env.VITE_APP_URL as string | undefined)?.replace(/\/$/, '')
    ?? window.location.origin

  async function sendInvite() {
    setSending(true)
    setErr(null)
    const { error } = await supabase.auth.signInWithOtp({
      email: customer.email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo:  `${appUrl}/portal`,
      },
    })
    if (error) {
      setErr(error.message)
    } else {
      setSent(true)
    }
    setSending(false)
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-card">
      <h2 className="mb-4 text-sm font-semibold text-gray-900">Portal Access</h2>

      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
            isLinked ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
          }`}>
            {isLinked ? '✓' : '?'}
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">
              {isLinked ? 'Portal access active' : 'No portal access yet'}
            </p>
            <p className="text-xs text-gray-500">
              {isLinked
                ? `Linked to ${customer.email}`
                : `Send an invite to ${customer.email}`}
            </p>
          </div>
        </div>

        {sent ? (
          <span className="shrink-0 rounded-lg bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700">
            Invite sent ✓
          </span>
        ) : (
          <button
            onClick={sendInvite}
            disabled={sending}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 disabled:opacity-50"
          >
            {sending ? 'Sending…' : isLinked ? 'Resend invite' : 'Send invite'}
          </button>
        )}
      </div>

      {err && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{err}</p>
      )}

      <div className="mt-4 rounded-lg bg-gray-50 px-4 py-3 text-xs text-gray-500">
        <span className="font-medium text-gray-700">Portal URL: </span>
        <span className="font-mono">{appUrl}/portal</span>
        <button
          onClick={() => navigator.clipboard.writeText(`${appUrl}/portal`)}
          className="ml-2 text-brand-600 hover:text-brand-700 transition-colors"
        >
          Copy
        </button>
      </div>
    </div>
  )
}

// ── Milestone visibility section ───────────────────────────────────────────

function MilestoneVisibilitySection({
  phases,
  projectId,
}: {
  phases: ProjectPhase[]
  projectId: string
}) {
  const queryClient = useQueryClient()

  const toggleMut = useMutation({
    mutationFn: ({ id, visible }: { id: string; visible: boolean }) =>
      setMilestoneClientVisible(supabase, id, visible),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['project-phases', projectId] }),
  })

  const allMilestones = phases.flatMap((ph) =>
    ph.milestones.map((m) => ({ ...m, phaseName: ph.name })),
  )

  if (allMilestones.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-card">
        <h2 className="mb-2 text-sm font-semibold text-gray-900">Milestone Visibility</h2>
        <p className="text-sm text-gray-400">No milestones yet. Add milestones in the Schedule tab.</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-card">
      <div className="border-b border-gray-100 px-5 py-4">
        <h2 className="text-sm font-semibold text-gray-900">Milestone Visibility</h2>
        <p className="mt-0.5 text-xs text-gray-500">
          Control which milestones appear in the client portal timeline.
        </p>
      </div>

      <div className="divide-y divide-gray-50">
        {phases.map((phase) => (
          <div key={phase.id}>
            {/* Phase header */}
            {phases.length > 1 && (
              <div className="bg-gray-50 px-5 py-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                  {phase.name}
                </p>
              </div>
            )}

            {/* Milestones */}
            {phase.milestones.length === 0 ? (
              <div className="px-5 py-3">
                <p className="text-xs text-gray-400 italic">No milestones in this phase</p>
              </div>
            ) : (
              phase.milestones.map((m) => {
                const isToggling =
                  toggleMut.isPending && toggleMut.variables?.id === m.id

                return (
                  <div
                    key={m.id}
                    className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-gray-50 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className={`truncate text-sm font-medium ${m.is_client_visible ? 'text-gray-900' : 'text-gray-400'}`}>
                        {m.name}
                      </p>
                      <p className="text-xs text-gray-400 capitalize">
                        {m.status.replace('_', ' ')}
                        {m.requires_client_approval ? ' · Requires approval' : ''}
                      </p>
                    </div>

                    {/* Toggle switch */}
                    <button
                      role="switch"
                      aria-checked={m.is_client_visible}
                      disabled={isToggling}
                      onClick={() =>
                        toggleMut.mutate({ id: m.id, visible: !m.is_client_visible })
                      }
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:opacity-50 ${
                        m.is_client_visible ? 'bg-brand-600' : 'bg-gray-200'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition-transform ${
                          m.is_client_visible ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                )
              })
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main tab ───────────────────────────────────────────────────────────────

export function ClientTab() {
  const { project } = useOutletContext<{ project: ProjectRow | undefined; isLoading: boolean }>()
  const { activeTenantId } = useAuth()

  const jobId     = project?.job_id
  const projectId = project?.id

  const { data: customer, isLoading: customerLoading } = useQuery({
    queryKey:  ['job-customer', jobId],
    queryFn:   () => getJobCustomer(supabase, jobId!),
    enabled:   !!jobId,
    staleTime: 60_000,
  })

  const { data: phases, isLoading: phasesLoading } = useQuery({
    queryKey:  ['project-phases', projectId],
    queryFn:   () => getProjectPhases(supabase, projectId!, activeTenantId!),
    enabled:   !!projectId && !!activeTenantId,
    staleTime: 30_000,
  })

  const isLoading = customerLoading || phasesLoading

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 px-5 pt-6 lg:px-8">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-card space-y-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-12 w-full" />
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-card space-y-3">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    )
  }

  if (!customer) {
    return (
      <div className="flex h-64 items-center justify-center p-6">
        <div className="text-center">
          <p className="text-sm font-semibold text-gray-900">No customer linked</p>
          <p className="mt-1 text-sm text-gray-500">
            This project has no customer assigned. Edit the project to add one.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-5 pt-6 lg:px-8">

      {/* Customer info card */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-card">
        <h2 className="mb-4 text-sm font-semibold text-gray-900">Customer</h2>
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-100 text-base font-bold text-brand-700">
            {initials(customer.customer_name)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-gray-900">{customer.customer_name}</p>
            <p className="text-sm text-gray-500">{customer.email}</p>
            {customer.phone && (
              <p className="text-sm text-gray-400">{customer.phone}</p>
            )}
          </div>
        </div>
      </div>

      {/* Portal access */}
      <PortalAccessCard customer={customer} />

      {/* Milestone visibility */}
      {phases && (
        <MilestoneVisibilitySection
          phases={phases}
          projectId={projectId!}
        />
      )}

    </div>
  )
}
