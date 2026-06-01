import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getJobCustomer,
  getProjectPhases,
  getCustomerPortalUsers,
  removeCustomerPortalUser,
  setMilestoneClientVisible,
  type JobCustomer,
  type ProjectRow,
  type ProjectPhase,
  type CustomerPortalUser,
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

/** Call the portal-invite Netlify function. Throws on non-2xx. */
async function callPortalInvite(
  customerId: string,
  tenantId:   string,
  email:      string,
  label:      string | null,
  isPrimary?: boolean,
): Promise<{ id: string | null; alreadyExists: boolean }> {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token

  const res = await fetch('/.netlify/functions/portal-invite', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ customerId, tenantId, email, label, isPrimary: isPrimary ?? false }),
  })

  const json = await res.json() as { id?: string | null; alreadyExists?: boolean; error?: string }
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`)
  return { id: json.id ?? null, alreadyExists: json.alreadyExists ?? false }
}

// ── Primary portal access card ─────────────────────────────────────────────

function PrimaryPortalCard({ customer, tenantId }: { customer: JobCustomer; tenantId: string }) {
  const [sending, setSending] = useState(false)
  const [sent,    setSent]    = useState(false)
  const [err,     setErr]     = useState<string | null>(null)

  const isLinked = !!customer.portal_user_id
  const appUrl   = (import.meta.env.VITE_APP_URL as string | undefined)?.replace(/\/$/, '')
    ?? window.location.origin

  async function sendInvite() {
    setSending(true)
    setErr(null)
    try {
      await callPortalInvite(customer.id, tenantId, customer.email, null, true)
      setSent(true)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Something went wrong.')
    }
    setSending(false)
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-card">
      <h2 className="mb-4 text-sm font-semibold text-gray-900">Primary Contact</h2>

      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
            isLinked ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
          }`}>
            {isLinked ? (
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                <path d="M3 8l3 3 7-7"/>
              </svg>
            ) : (
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                <circle cx="8" cy="6" r="2.5"/>
                <path d="M3 13c0-2.5 2.24-4.5 5-4.5s5 2 5 4.5"/>
              </svg>
            )}
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">
              {isLinked ? 'Portal access active' : 'No portal access yet'}
            </p>
            <p className="text-xs text-gray-500">{customer.email}</p>
          </div>
        </div>

        {sent ? (
          <div className="flex shrink-0 items-center gap-2">
            <span className="rounded-lg bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700">
              Invite sent ✓
            </span>
            <button
              onClick={() => { setSent(false); sendInvite() }}
              disabled={sending}
              className="inline-flex items-center rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 disabled:opacity-50"
            >
              Resend
            </button>
          </div>
        ) : (
          <button
            onClick={sendInvite}
            disabled={sending}
            className="shrink-0 inline-flex items-center rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 disabled:opacity-50"
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
          className="ml-2 text-brand-600 transition-colors hover:text-brand-700"
        >
          Copy
        </button>
      </div>
    </div>
  )
}

// ── Secondary portal users panel ───────────────────────────────────────────

function PortalUserRow({
  user,
  onRemove,
  isRemoving,
  onResend,
  isResending,
}: {
  user:        CustomerPortalUser
  onRemove:    () => void
  isRemoving:  boolean
  onResend:    () => void
  isResending: boolean
}) {
  const [confirming, setConfirming] = useState(false)
  const [resentOk,   setResentOk]   = useState(false)
  const isLinked = !!user.user_id

  async function handleResend() {
    await onResend()
    setResentOk(true)
    setTimeout(() => setResentOk(false), 4000)
  }

  return (
    <div className="flex items-center gap-3 px-5 py-3">
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
        isLinked ? 'bg-green-100 text-green-700' : 'bg-amber-50 text-amber-600'
      }`}>
        {isLinked ? (
          <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
            <path d="M2 7l3 3 7-7"/>
          </svg>
        ) : (
          <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="h-3.5 w-3.5">
            <path d="M7 2v3M7 9v.5M4.5 4.5A3 3 0 017 3.5a3 3 0 012.5 1.5c0 1.5-1 2.5-2.5 2.5A2.5 2.5 0 004.5 10"/>
          </svg>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-900">{user.email}</p>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          {user.label && <span className="font-medium text-gray-500">{user.label}</span>}
          {user.label && <span>·</span>}
          <span>{isLinked ? 'Signed in' : user.invited_at ? 'Invite sent · Pending sign-up' : 'Not yet invited'}</span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {/* Resend button — only shown for pending (not yet signed in) users */}
        {!isLinked && !confirming && (
          resentOk ? (
            <span className="rounded-lg bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700">
              Sent ✓
            </span>
          ) : (
            <button
              onClick={handleResend}
              disabled={isResending}
              className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-50 disabled:opacity-50"
            >
              {isResending ? 'Sending…' : 'Resend'}
            </button>
          )
        )}

        {/* Remove — two-step confirm */}
        {confirming ? (
          <>
            <button
              onClick={() => { setConfirming(false); onRemove() }}
              disabled={isRemoving}
              className="rounded-lg bg-red-500 px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-red-600 disabled:opacity-50"
            >
              {isRemoving ? 'Removing…' : 'Confirm remove'}
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-50"
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
          >
            Remove
          </button>
        )}
      </div>
    </div>
  )
}

function AddPortalUserForm({
  customerId,
  tenantId,
  primaryEmail,
  linkedEmails,
  onSuccess,
}: {
  customerId:   string
  tenantId:     string
  /** Primary customer email — always blocked */
  primaryEmail: string
  /** Emails of secondary users who have already completed sign-up (user_id set) */
  linkedEmails: string[]
  onSuccess:    () => void
}) {
  const [email,   setEmail]   = useState('')
  const [label,   setLabel]   = useState('')
  const [loading, setLoading] = useState(false)
  const [err,     setErr]     = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    setSuccess(null)

    const trimmedEmail = email.trim().toLowerCase()
    if (!trimmedEmail.includes('@')) { setErr('Enter a valid email address.'); return }
    if (trimmedEmail === primaryEmail.toLowerCase()) {
      setErr('That email is already the primary contact for this customer.'); return
    }
    if (linkedEmails.map((x) => x.toLowerCase()).includes(trimmedEmail)) {
      setErr('That contact has already signed in and has active portal access.'); return
    }

    setLoading(true)
    try {
      const result = await callPortalInvite(customerId, tenantId, trimmedEmail, label.trim() || null)
      setSuccess(
        result.alreadyExists
          ? `${trimmedEmail} already has a Supabase account — they can log in at the portal URL.`
          : `Invite sent to ${trimmedEmail}.`,
      )
      setEmail('')
      setLabel('')
      onSuccess()
    } catch (err) {
      setErr(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="border-t border-gray-100 bg-gray-50 px-5 py-4">
      <p className="mb-3 text-xs font-semibold text-gray-700">Add portal contact</p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="mb-1 block text-xs text-gray-500">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="co-owner@example.com"
            required
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>
        <div className="sm:w-36">
          <label className="mb-1 block text-xs text-gray-500">Label (optional)</label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Co-owner"
            maxLength={50}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !email.trim()}
          className="shrink-0 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50 sm:mb-0"
        >
          {loading ? 'Sending…' : 'Send invite'}
        </button>
      </div>

      {err && (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{err}</p>
      )}
      {success && (
        <p className="mt-2 rounded-lg bg-green-50 px-3 py-2 text-xs text-green-700">{success}</p>
      )}
    </form>
  )
}

function SecondaryPortalUsersCard({
  customer,
  tenantId,
}: {
  customer: JobCustomer
  tenantId: string
}) {
  const queryClient = useQueryClient()
  const [resendingId, setResendingId] = useState<string | null>(null)

  const { data: portalUsers = [], isLoading } = useQuery({
    queryKey:  ['customer-portal-users', customer.id],
    queryFn:   () => getCustomerPortalUsers(supabase, customer.id),
    staleTime: 30_000,
  })

  const removeMut = useMutation({
    mutationFn: (id: string) => removeCustomerPortalUser(supabase, id),
    onSuccess:  () => queryClient.invalidateQueries({ queryKey: ['customer-portal-users', customer.id] }),
  })

  async function handleResend(u: CustomerPortalUser) {
    setResendingId(u.id)
    try {
      await callPortalInvite(customer.id, tenantId, u.email, u.label)
      queryClient.invalidateQueries({ queryKey: ['customer-portal-users', customer.id] })
    } finally {
      setResendingId(null)
    }
  }

  // Only block the form for emails that are fully linked (user_id set).
  // Pending users (user_id null) can be re-invited via the form or the Resend button.
  const linkedEmails = portalUsers.filter((u) => !!u.user_id).map((u) => u.email)

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
      <div className="border-b border-gray-100 px-5 py-4">
        <h2 className="text-sm font-semibold text-gray-900">Additional Portal Access</h2>
        <p className="mt-0.5 text-xs text-gray-500">
          Invite co-owners, agents, or other stakeholders. They see the same project data as the primary contact.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-2 p-5">
          <Skeleton className="h-10 w-full"/>
          <Skeleton className="h-10 w-full"/>
        </div>
      ) : portalUsers.length === 0 ? (
        <div className="px-5 py-4">
          <p className="text-xs text-gray-400">No additional contacts yet.</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {portalUsers.map((u) => (
            <PortalUserRow
              key={u.id}
              user={u}
              onRemove={() => removeMut.mutate(u.id)}
              isRemoving={removeMut.isPending && removeMut.variables === u.id}
              onResend={() => handleResend(u)}
              isResending={resendingId === u.id}
            />
          ))}
        </div>
      )}

      <AddPortalUserForm
        customerId={customer.id}
        tenantId={tenantId}
        primaryEmail={customer.email}
        linkedEmails={linkedEmails}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ['customer-portal-users', customer.id] })}
      />
    </div>
  )
}

// ── Milestone visibility section ───────────────────────────────────────────

function MilestoneVisibilitySection({
  phases,
  projectId,
}: {
  phases:     ProjectPhase[]
  projectId:  string
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
            {phases.length > 1 && (
              <div className="bg-gray-50 px-5 py-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                  {phase.name}
                </p>
              </div>
            )}

            {phase.milestones.length === 0 ? (
              <div className="px-5 py-3">
                <p className="text-xs italic text-gray-400">No milestones in this phase</p>
              </div>
            ) : (
              phase.milestones.map((m) => {
                const isToggling = toggleMut.isPending && toggleMut.variables?.id === m.id
                return (
                  <div
                    key={m.id}
                    className="flex items-center justify-between gap-4 px-5 py-3 transition-colors hover:bg-gray-50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className={`truncate text-sm font-medium ${m.is_client_visible ? 'text-gray-900' : 'text-gray-400'}`}>
                        {m.name}
                      </p>
                      <p className="text-xs capitalize text-gray-400">
                        {m.status.replace('_', ' ')}
                        {m.requires_client_approval ? ' · Requires approval' : ''}
                      </p>
                    </div>

                    <button
                      role="switch"
                      aria-checked={m.is_client_visible}
                      disabled={isToggling}
                      onClick={() => toggleMut.mutate({ id: m.id, visible: !m.is_client_visible })}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:opacity-50 ${
                        m.is_client_visible ? 'bg-brand-600' : 'bg-gray-200'
                      }`}
                    >
                      <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition-transform ${
                        m.is_client_visible ? 'translate-x-4' : 'translate-x-0'
                      }`}/>
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
  const { activeTenantId, tenantMemberships } = useAuth()

  const activeRole = tenantMemberships.find((m) => m.tenant_id === activeTenantId)?.role ?? null
  const canManagePortal = ['project_manager', 'admin', 'owner'].includes(activeRole ?? '')

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

  if (customerLoading || phasesLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 px-5 pt-6 lg:px-8">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-card space-y-3">
          <Skeleton className="h-4 w-32"/>
          <Skeleton className="h-12 w-full"/>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-card space-y-3">
          <Skeleton className="h-4 w-40"/>
          <Skeleton className="h-10 w-full"/>
          <Skeleton className="h-10 w-full"/>
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

      {/* Customer info */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-card">
        <h2 className="mb-4 text-sm font-semibold text-gray-900">Customer</h2>
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-100 text-base font-bold text-brand-700">
            {initials(customer.customer_name)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-gray-900">{customer.customer_name}</p>
            <p className="text-sm text-gray-500">{customer.email}</p>
            {customer.phone && <p className="text-sm text-gray-400">{customer.phone}</p>}
          </div>
        </div>
      </div>

      {/* Primary portal access */}
      <PrimaryPortalCard customer={customer} tenantId={activeTenantId ?? ''}/>

      {/* Secondary portal contacts — PM+ only */}
      {canManagePortal && activeTenantId && (
        <SecondaryPortalUsersCard customer={customer} tenantId={activeTenantId}/>
      )}

      {/* Milestone visibility */}
      {phases && (
        <MilestoneVisibilitySection phases={phases} projectId={projectId!}/>
      )}

    </div>
  )
}
