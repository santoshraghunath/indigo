import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  TenantEmployee,
  WorkSession,
} from '@indigo/shared'
import {
  getTenantEmployees,
  getEmployeeWorkSummary,
  getEmployeeSessions,
  getEmployeeWages,
  upsertEmployeeWage,
  deactivateEmployee,
  reactivateEmployee,
  updateEmployee,
} from '@indigo/shared'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/stores/toastStore'
import { supabase } from '@/lib/supabase'
import { Skeleton } from '@/components/ui/Skeleton'
import {
  UsersIcon,
  PlusIcon,
  PencilIcon,
  ChevronDownIcon,
  XMarkIcon,
} from '@/components/ui/Icons'

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtMoney(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
}

function fmtHours(h: number): string {
  return h.toFixed(1) + 'h'
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return '—'
  return new Date(s + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

function fmtTime(s: string | null | undefined): string {
  if (!s) return '—'
  return new Date(s).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

// ── Role display ────────────────────────────────────────────────────────────

const ROLE_LABEL: Record<string, string> = {
  owner:           'Owner',
  admin:           'Admin',
  project_manager: 'Project Manager',
  field_super:     'Field Supervisor',
  field_associate: 'Field Associate',
  accountant:      'Accountant',
  subcontractor:   'Subcontractor',
  client:          'Client',
}

const ROLE_COLOR: Record<string, string> = {
  owner:           'bg-purple-50  text-purple-700',
  admin:           'bg-indigo-50  text-indigo-700',
  project_manager: 'bg-brand-50   text-brand-700',
  field_super:     'bg-blue-50    text-blue-700',
  field_associate: 'bg-sky-50     text-sky-700',
  accountant:      'bg-emerald-50 text-emerald-700',
}

/** Roles that can be assigned via the Invite Employee drawer. */
const EMPLOYEE_ROLES = [
  { value: 'field_associate', label: 'Field Associate' },
  { value: 'field_super',     label: 'Field Supervisor' },
  { value: 'subcontractor',   label: 'Subcontractor' },
  { value: 'project_manager', label: 'Project Manager' },
  { value: 'accountant',      label: 'Accountant' },
  { value: 'admin',           label: 'Admin' },
  { value: 'owner',           label: 'Owner' },
]

function RoleBadge({ role }: { role: string }) {
  const cls = ROLE_COLOR[role] ?? 'bg-gray-100 text-gray-600'
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>
      {ROLE_LABEL[role] ?? role}
    </span>
  )
}

// ── Common input styles ────────────────────────────────────────────────────

const inputCls =
  'h-9 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm text-gray-900 ' +
  'placeholder:text-gray-400 focus:bg-white focus:border-brand-400 focus:outline-none ' +
  'focus:ring-2 focus:ring-brand-100 transition-colors'

const selectCls =
  'h-9 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm text-gray-900 ' +
  'focus:bg-white focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 transition-colors'

// ── Avatar ─────────────────────────────────────────────────────────────────

function Avatar({
  name,
  avatarUrl,
  size = 'md',
}: {
  name: string
  avatarUrl: string | null
  size?: 'sm' | 'md' | 'lg'
}) {
  const sizeClasses = size === 'sm' ? 'h-7 w-7 text-xs' : size === 'lg' ? 'h-12 w-12 text-base' : 'h-9 w-9 text-sm'
  const initials = name.split(' ').map((p) => p[0]).join('').toUpperCase().slice(0, 2)

  if (avatarUrl) {
    return (
      <img src={avatarUrl} alt={name} className={`${sizeClasses} rounded-full object-cover`} />
    )
  }
  return (
    <div className={`${sizeClasses} flex shrink-0 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-700`}>
      {initials}
    </div>
  )
}

// ── Invite employee drawer ─────────────────────────────────────────────────

function InviteDrawer({
  tenantId,
  session,
  onClose,
  onInvited,
}: {
  tenantId: string
  session: { access_token: string } | null
  onClose: () => void
  onInvited: () => void
}) {
  const toast = useToast()

  const [firstName, setFirstName] = useState('')
  const [lastName,  setLastName]  = useState('')
  const [email,     setEmail]     = useState('')
  const [role,      setRole]      = useState('field_associate')
  const [title,     setTitle]     = useState('')
  const [phone,     setPhone]     = useState('')
  const [errors,    setErrors]    = useState<Record<string, string>>({})

  const mutation = useMutation({
    mutationFn: async () => {
      const errs: Record<string, string> = {}
      if (!firstName.trim()) errs.firstName = 'Required'
      if (!lastName.trim())  errs.lastName  = 'Required'
      if (!email.trim())     errs.email     = 'Required'
      else if (!email.includes('@')) errs.email = 'Invalid email'
      if (Object.keys(errs).length > 0) { setErrors(errs); throw new Error('validation') }

      const res = await fetch('/.netlify/functions/employee-invite', {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          tenantId,
          email:     email.trim().toLowerCase(),
          firstName: firstName.trim(),
          lastName:  lastName.trim(),
          role,
          title:     title.trim() || null,
          phone:     phone.trim() || null,
        }),
      })
      const body = await res.json() as { userId?: string; alreadyExists?: boolean; error?: string }
      if (!res.ok) throw new Error(body.error ?? 'Failed to send invite')
      return body
    },
    onSuccess: (data) => {
      toast.success(data.alreadyExists ? 'Invite sent — user is already registered' : 'Invite email sent')
      onInvited()
      onClose()
    },
    onError: (err) => {
      if ((err as Error).message !== 'validation') {
        toast.error('Invite failed', (err as Error).message)
      }
    },
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrors({})
    mutation.mutate()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center px-4 pb-4 sm:pb-0">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">Invite Employee</h2>
          <button type="button" onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 transition-colors">
            <XMarkIcon className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          {/* Name row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                First Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => { setFirstName(e.target.value); setErrors((p) => ({ ...p, firstName: '' })) }}
                placeholder="Jane"
                className={`${inputCls} ${errors.firstName ? 'border-red-300 bg-red-50' : ''}`}
                autoFocus
              />
              {errors.firstName && <p className="mt-0.5 text-xs text-red-600">{errors.firstName}</p>}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Last Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => { setLastName(e.target.value); setErrors((p) => ({ ...p, lastName: '' })) }}
                placeholder="Smith"
                className={`${inputCls} ${errors.lastName ? 'border-red-300 bg-red-50' : ''}`}
              />
              {errors.lastName && <p className="mt-0.5 text-xs text-red-600">{errors.lastName}</p>}
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Work Email <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setErrors((p) => ({ ...p, email: '' })) }}
              placeholder="jane@example.com"
              className={`${inputCls} ${errors.email ? 'border-red-300 bg-red-50' : ''}`}
            />
            {errors.email && <p className="mt-0.5 text-xs text-red-600">{errors.email}</p>}
          </div>

          {/* Role */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value)} className={selectCls}>
              {EMPLOYEE_ROLES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

          {/* Optional fields */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Job Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Lead Framer"
                className={inputCls}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Phone</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(555) 000-0000"
                className={inputCls}
              />
            </div>
          </div>

          <p className="text-xs text-gray-400">
            An invite email will be sent with a link to set up their account.
          </p>

          <div className="flex items-center justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} disabled={mutation.isPending}
              className="h-8 rounded-lg px-3.5 text-sm font-medium text-gray-700 hover:bg-gray-200 transition-colors disabled:opacity-50">
              Cancel
            </button>
            <button type="submit" disabled={mutation.isPending}
              className="inline-flex h-8 items-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:opacity-60">
              {mutation.isPending ? 'Sending…' : 'Send Invite'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Edit employee drawer ───────────────────────────────────────────────────

function EditDrawer({
  employee,
  canManageAdmins,
  onClose,
  onSaved,
}: {
  employee: TenantEmployee
  canManageAdmins: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const toast = useToast()
  const name  = employee.profile
    ? `${employee.profile.first_name} ${employee.profile.last_name}`
    : 'Employee'

  const [firstName, setFirstName] = useState(employee.profile?.first_name ?? '')
  const [lastName,  setLastName]  = useState(employee.profile?.last_name  ?? '')
  const [title,     setTitle]     = useState(employee.profile?.title      ?? '')
  const [phone,     setPhone]     = useState(employee.profile?.phone      ?? '')
  const [role,      setRole]      = useState(employee.role)

  const canEditRole = !['admin', 'owner'].includes(employee.role) || canManageAdmins

  const mutation = useMutation({
    mutationFn: () =>
      updateEmployee(supabase, employee.id, employee.user_id, {
        first_name: firstName.trim() || undefined,
        last_name:  lastName.trim()  || undefined,
        title:      title.trim()     || null,
        phone:      phone.trim()     || null,
        ...(canEditRole && role !== employee.role ? { role } : {}),
      }),
    onSuccess: () => {
      toast.success('Saved')
      onSaved()
      onClose()
    },
    onError: (err) => {
      toast.error('Save failed', err instanceof Error ? err.message : 'Try again.')
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center px-4 pb-4 sm:pb-0">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">Edit — {name}</h2>
          <button type="button" onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 transition-colors">
            <XMarkIcon className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); mutation.mutate() }} className="px-5 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">First Name</label>
              <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Last Name</label>
              <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputCls} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Job Title</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Lead Carpenter" className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Phone</label>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 000-0000" className={inputCls} />
          </div>
          {canEditRole && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Role</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as TenantEmployee['role'])}
                className={selectCls}
              >
                {EMPLOYEE_ROLES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} disabled={mutation.isPending}
              className="h-8 rounded-lg px-3.5 text-sm font-medium text-gray-700 hover:bg-gray-200 transition-colors disabled:opacity-50">
              Cancel
            </button>
            <button type="submit" disabled={mutation.isPending}
              className="inline-flex h-8 items-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:opacity-60">
              {mutation.isPending ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Wage modal ─────────────────────────────────────────────────────────────

function WageModal({
  tenantId,
  employee,
  onClose,
  onSaved,
}: {
  tenantId: string
  employee: TenantEmployee
  onClose: () => void
  onSaved: () => void
}) {
  const toast  = useToast()
  const { user } = useAuth()
  const name   = employee.profile
    ? `${employee.profile.first_name} ${employee.profile.last_name}`
    : 'Employee'

  const [rateStr,       setRateStr]       = useState('')
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().slice(0, 10))
  const [rateError,     setRateError]     = useState('')

  const mutation = useMutation({
    mutationFn: () => {
      const rate = parseFloat(rateStr)
      if (isNaN(rate) || rate <= 0) { setRateError('Enter a valid hourly rate'); throw new Error('invalid') }
      const cents = Math.round(rate * 100)
      return upsertEmployeeWage(supabase, tenantId, employee.user_id, effectiveDate, cents, user!.id)
    },
    onSuccess: () => {
      toast.success('Wage saved')
      onSaved()
      onClose()
    },
    onError: (err) => {
      if (err.message !== 'invalid') {
        toast.error('Failed to save wage', err instanceof Error ? err.message : 'Try again.')
      }
    },
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setRateError('')
    mutation.mutate()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center px-4 pb-4 sm:pb-0">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">Set Wage — {name}</h2>
          <button type="button" onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 transition-colors">
            <XMarkIcon className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Hourly Rate ($/hr) <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={rateStr}
                onChange={(e) => { setRateStr(e.target.value); setRateError('') }}
                placeholder="e.g. 28.50"
                className={`${inputCls} pl-6 ${rateError ? 'border-red-300 bg-red-50' : ''}`}
                autoFocus
              />
            </div>
            {rateError && <p className="mt-1 text-xs text-red-600">{rateError}</p>}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Effective Date</label>
            <input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} className={inputCls} />
          </div>
          <div className="flex items-center justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} disabled={mutation.isPending}
              className="h-8 rounded-lg px-3.5 text-sm font-medium text-gray-700 hover:bg-gray-200 transition-colors disabled:opacity-50">
              Cancel
            </button>
            <button type="submit" disabled={mutation.isPending}
              className="inline-flex h-8 items-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:opacity-60">
              {mutation.isPending ? 'Saving…' : 'Save Rate'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Employee detail panel ─────────────────────────────────────────────────

function EmployeeDetail({
  employee,
  tenantId,
  canManageWages,
  onWageEdit,
}: {
  employee: TenantEmployee
  tenantId: string
  canManageWages: boolean
  onWageEdit: (emp: TenantEmployee) => void
}) {
  const { data: summary, isLoading: sumLoading } = useQuery({
    queryKey: ['employee-summary', tenantId, employee.user_id],
    queryFn:  () => getEmployeeWorkSummary(supabase, tenantId, employee.user_id),
  })

  const { data: wages = [], isLoading: wagesLoading } = useQuery({
    queryKey: ['employee-wages', tenantId, employee.user_id],
    queryFn:  () => getEmployeeWages(supabase, tenantId, employee.user_id),
  })

  const { data: sessions = [], isLoading: sessionsLoading } = useQuery({
    queryKey: ['employee-sessions', tenantId, employee.user_id],
    queryFn:  () => getEmployeeSessions(supabase, tenantId, employee.user_id, 30),
  })

  return (
    <div className="border-t border-gray-100 bg-gray-50/50 px-5 py-4 space-y-5">
      {/* ── Work stats ──────────────────────────────────────────── */}
      {sumLoading ? (
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      ) : summary ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl bg-white border border-gray-200 p-3 text-center shadow-sm">
            <p className="text-xs font-medium text-gray-500">Sessions</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-gray-900">{summary.total_sessions}</p>
          </div>
          <div className="rounded-xl bg-white border border-gray-200 p-3 text-center shadow-sm">
            <p className="text-xs font-medium text-gray-500">Total Hours</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-gray-900">{fmtHours(summary.total_net_hours)}</p>
            {summary.total_ot_1_5_hours > 0 && (
              <p className="text-[10px] text-amber-600">{fmtHours(summary.total_ot_1_5_hours)} OT</p>
            )}
          </div>
          <div className="rounded-xl bg-white border border-gray-200 p-3 text-center shadow-sm">
            <p className="text-xs font-medium text-gray-500">Labor Cost</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-gray-900">
              {summary.total_labor_cents > 0 ? fmtMoney(summary.total_labor_cents) : '—'}
            </p>
          </div>
          <div className="rounded-xl bg-white border border-gray-200 p-3 text-center shadow-sm">
            <p className="text-xs font-medium text-gray-500">Last Shift</p>
            <p className="mt-1 text-sm font-semibold text-gray-900">
              {summary.last_session_at
                ? new Date(summary.last_session_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                : '—'}
            </p>
          </div>
        </div>
      ) : null}

      {/* ── Wage history ────────────────────────────────────────── */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Wage History</h4>
          {canManageWages && (
            <button
              type="button"
              onClick={() => onWageEdit(employee)}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-gray-500 hover:bg-white hover:text-brand-700 transition-colors"
            >
              <PlusIcon className="h-3 w-3" strokeWidth={2.5} />
              Set Rate
            </button>
          )}
        </div>
        {wagesLoading ? (
          <Skeleton className="h-10 w-full rounded-xl" />
        ) : wages.length === 0 ? (
          <p className="text-xs text-gray-400">No wage records.{canManageWages && ' Use "Set Rate" to add one.'}</p>
        ) : (
          <div className="space-y-1.5">
            {wages.map((w, i) => (
              <div key={w.id} className="flex items-center justify-between rounded-lg bg-white border border-gray-200 px-3 py-2 text-sm shadow-sm">
                <span className="font-medium text-gray-900">{fmtMoney(w.hourly_rate_cents)}/hr</span>
                <div className="flex items-center gap-2">
                  {i === 0 && (
                    <span className="rounded-full bg-green-50 px-1.5 py-0.5 text-[10px] font-semibold text-green-700">Current</span>
                  )}
                  <span className="text-xs text-gray-400">Effective {fmtDate(w.effective_date)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Recent sessions ─────────────────────────────────────── */}
      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
          Recent Work Sessions (last 30)
        </h4>
        {sessionsLoading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => <Skeleton key={i} className="h-10 w-full rounded-xl" />)}
          </div>
        ) : sessions.length === 0 ? (
          <p className="text-xs text-gray-400">No completed sessions.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-3 py-2 text-left font-semibold text-gray-500">Date</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-500">Project</th>
                  <th className="px-3 py-2 text-right font-semibold text-gray-500">In</th>
                  <th className="px-3 py-2 text-right font-semibold text-gray-500">Out</th>
                  <th className="px-3 py-2 text-right font-semibold text-gray-500">Net</th>
                  <th className="px-3 py-2 text-right font-semibold text-gray-500">OT</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => {
                  const proj = (s as WorkSession & { project?: { job?: { job_name?: string; job_number?: string } } }).project
                  const jobName = proj?.job?.job_name ?? '—'
                  const ot = (s.ot_1_5_hours ?? 0) + (s.ot_2_0_hours ?? 0)
                  return (
                    <tr key={s.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors">
                      <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                        {new Date(s.clocked_in_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </td>
                      <td className="px-3 py-2 text-gray-600 max-w-[120px] truncate">{jobName}</td>
                      <td className="px-3 py-2 text-right text-gray-500 whitespace-nowrap">{fmtTime(s.clocked_in_at)}</td>
                      <td className="px-3 py-2 text-right text-gray-500 whitespace-nowrap">
                        {s.clocked_out_at ? fmtTime(s.clocked_out_at) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-gray-900 tabular-nums">
                        {s.net_hours != null ? fmtHours(s.net_hours) : '—'}
                      </td>
                      <td className={`px-3 py-2 text-right tabular-nums ${ot > 0 ? 'font-medium text-amber-600' : 'text-gray-400'}`}>
                        {ot > 0 ? fmtHours(ot) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Employee management actions ───────────────────────────────────────────

function EmployeeActions({
  employee,
  canManageWages,
  compact = false,
  onWageEdit,
  onEdit,
  onToggleActive,
  onPasswordReset,
}: {
  employee: TenantEmployee
  canManageWages: boolean
  compact?: boolean
  onWageEdit: (emp: TenantEmployee) => void
  onEdit: (emp: TenantEmployee) => void
  onToggleActive: (emp: TenantEmployee) => void
  onPasswordReset: (emp: TenantEmployee) => void
}) {
  if (compact) {
    return (
      <div className="grid grid-cols-2 gap-2" onClick={(e) => e.stopPropagation()}>
        {canManageWages && (
          <button
            type="button"
            onClick={() => onWageEdit(employee)}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 shadow-sm hover:bg-gray-50 hover:text-brand-700 transition-colors"
          >
            <PencilIcon className="h-3.5 w-3.5" strokeWidth={2} />
            Set Wage
          </button>
        )}
        <button
          type="button"
          onClick={() => onEdit(employee)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 shadow-sm hover:bg-gray-50 hover:text-gray-900 transition-colors"
        >
          Edit Profile
        </button>
        <button
          type="button"
          onClick={() => onToggleActive(employee)}
          className={`rounded-lg border px-3 py-2 text-xs font-medium shadow-sm transition-colors ${
            employee.is_active
              ? 'border-red-100 bg-white text-red-600 hover:bg-red-50'
              : 'border-green-100 bg-white text-green-700 hover:bg-green-50'
          }`}
        >
          {employee.is_active ? 'Deactivate' : 'Reactivate'}
        </button>
        <button
          type="button"
          onClick={() => onPasswordReset(employee)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 shadow-sm hover:bg-gray-50 hover:text-gray-900 transition-colors"
        >
          Reset Password
        </button>
      </div>
    )
  }

  return (
    <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
      {canManageWages && (
        <button
          type="button"
          title="Set wage"
          onClick={() => onWageEdit(employee)}
          className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-brand-600 transition-colors"
        >
          <PencilIcon className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      )}
      <button
        type="button"
        title="Edit profile"
        onClick={() => onEdit(employee)}
        className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-800 transition-colors"
      >
        Edit
      </button>
      <button
        type="button"
        title={employee.is_active ? 'Deactivate' : 'Reactivate'}
        onClick={() => onToggleActive(employee)}
        className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
          employee.is_active
            ? 'text-red-500 hover:bg-red-50'
            : 'text-green-600 hover:bg-green-50'
        }`}
      >
        {employee.is_active ? 'Deactivate' : 'Reactivate'}
      </button>
      <button
        type="button"
        title="Send password reset email"
        onClick={() => onPasswordReset(employee)}
        className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-800 transition-colors"
      >
        Reset PW
      </button>
    </div>
  )
}

// ── Employee card ──────────────────────────────────────────────────────────

function EmployeeCard({
  employee,
  tenantId,
  canManage,
  canManageWages,
  canManageAdmins,
  onWageEdit,
  onEdit,
  onToggleActive,
  onPasswordReset,
}: {
  employee: TenantEmployee
  tenantId: string
  canManage: boolean
  canManageWages: boolean
  canManageAdmins: boolean
  onWageEdit: (emp: TenantEmployee) => void
  onEdit: (emp: TenantEmployee) => void
  onToggleActive: (emp: TenantEmployee) => void
  onPasswordReset: (emp: TenantEmployee) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const name = employee.profile
    ? `${employee.profile.first_name} ${employee.profile.last_name}`
    : 'Unknown'
  const email    = employee.profile?.email    ?? ''
  const title    = employee.profile?.title    ?? null
  const phone    = employee.profile?.phone    ?? null
  const avatarUrl = employee.profile?.avatar_url ?? null

  // A PM cannot manage admins/owners (prevent privilege escalation in UI)
  const isProtectedRole = ['admin', 'owner'].includes(employee.role)
  const canManageThis   = canManage && (!isProtectedRole || canManageAdmins)

  return (
    <div className={`overflow-hidden rounded-xl border bg-white shadow-card ${!employee.is_active ? 'border-gray-200 opacity-60' : 'border-gray-200'}`}>
      {/* Header row */}
      <div
        className="flex cursor-pointer items-center gap-4 px-5 py-4 hover:bg-gray-50/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <Avatar name={name} avatarUrl={avatarUrl} size="md" />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-gray-900">{name}</span>
            <RoleBadge role={employee.role} />
            {!employee.is_active && (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">Inactive</span>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-gray-400">
            {title && <span className="text-gray-500">{title}</span>}
            <span>{email}</span>
            {phone && <span>{phone}</span>}
          </div>
        </div>

        {/* Action buttons (stop propagation so they don't toggle expand) */}
        {canManageThis && (
          <div className="hidden sm:block">
            <EmployeeActions
              employee={employee}
              canManageWages={canManageWages}
              onWageEdit={onWageEdit}
              onEdit={onEdit}
              onToggleActive={onToggleActive}
              onPasswordReset={onPasswordReset}
            />
          </div>
        )}

        <ChevronDownIcon
          className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
          strokeWidth={2}
        />
      </div>

      {canManageThis && (
        <div className="border-t border-gray-100 bg-gray-50/60 px-5 py-3 sm:hidden">
          <EmployeeActions
            employee={employee}
            canManageWages={canManageWages}
            compact
            onWageEdit={onWageEdit}
            onEdit={onEdit}
            onToggleActive={onToggleActive}
            onPasswordReset={onPasswordReset}
          />
        </div>
      )}

      {/* Expanded detail */}
      {expanded && (
        <EmployeeDetail
          employee={employee}
          tenantId={tenantId}
          canManageWages={canManageWages}
          onWageEdit={onWageEdit}
        />
      )}
    </div>
  )
}

// ── Skeleton ───────────────────────────────────────────────────────────────

function EmployeesSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-card">
          <Skeleton className="h-9 w-9 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-32" />
          </div>
          <Skeleton className="h-8 w-20" />
        </div>
      ))}
    </div>
  )
}

// ── Modal state helpers ────────────────────────────────────────────────────

type ModalState =
  | { type: 'none' }
  | { type: 'invite' }
  | { type: 'wage';   employee: TenantEmployee }
  | { type: 'edit';   employee: TenantEmployee }

// ── Main page ──────────────────────────────────────────────────────────────

export function EmployeesPage() {
  const { activeTenantId, tenantMemberships, session } = useAuth()
  const queryClient = useQueryClient()
  const toast       = useToast()
  const tenantId    = activeTenantId ?? ''

  const [search,     setSearch]     = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const [showInactive, setShowInactive] = useState(false)
  const [modal,      setModal]      = useState<ModalState>({ type: 'none' })

  const { data: employees = [], isLoading } = useQuery({
    queryKey: ['tenant-employees', tenantId],
    queryFn:  () => getTenantEmployees(supabase, tenantId),
    enabled:  !!tenantId,
  })

  // Role checks
  const myRole = tenantMemberships.find((m) => m.tenant_id === tenantId)?.role ?? ''
  const canManage      = ['owner', 'admin', 'project_manager'].includes(myRole)
  const canManageWages = canManage
  const canManageAdmins = ['owner', 'admin'].includes(myRole)

  // Deactivate / reactivate mutation
  const toggleMutation = useMutation({
    mutationFn: (emp: TenantEmployee) =>
      emp.is_active
        ? deactivateEmployee(supabase, emp.id)
        : reactivateEmployee(supabase, emp.id),
    onSuccess: (_data, emp) => {
      toast.success(emp.is_active ? 'Employee deactivated' : 'Employee reactivated')
      void queryClient.invalidateQueries({ queryKey: ['tenant-employees', tenantId] })
    },
    onError: (err) => {
      toast.error('Failed', err instanceof Error ? err.message : 'Try again.')
    },
  })

  // Password reset mutation
  const resetMutation = useMutation({
    mutationFn: (emp: TenantEmployee) => {
      const email = emp.profile?.email
      if (!email) throw new Error('No email on file')
      return supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/`,
      })
    },
    onSuccess: () => {
      toast.success('Password reset email sent')
    },
    onError: (err) => {
      toast.error('Failed to send reset email', err instanceof Error ? err.message : 'Try again.')
    },
  })

  // Filters
  const filtered = employees.filter((emp) => {
    if (!showInactive && !emp.is_active) return false
    if (roleFilter !== 'all' && emp.role !== roleFilter) return false
    if (search) {
      const q = search.toLowerCase()
      const name = `${emp.profile?.first_name ?? ''} ${emp.profile?.last_name ?? ''}`.toLowerCase()
      const email = (emp.profile?.email ?? '').toLowerCase()
      if (!name.includes(q) && !email.includes(q)) return false
    }
    return true
  })

  const activeCount   = employees.filter((e) => e.is_active).length
  const waged         = employees.filter((e) => e.current_wage_cents != null).length
  const unwagedActive = employees.filter((e) => e.is_active && e.current_wage_cents == null).length

  function onWageSaved() {
    void queryClient.invalidateQueries({ queryKey: ['tenant-employees', tenantId] })
    if (modal.type === 'wage') {
      void queryClient.invalidateQueries({ queryKey: ['employee-wages', tenantId, modal.employee.user_id] })
    }
  }

  return (
    <div className="px-5 py-6 lg:px-8">
      {/* ── Page header ───────────────────────────────────────── */}
      <div className="mb-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50">
              <UsersIcon className="h-5 w-5 text-brand-600" strokeWidth={1.75} />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Employees</h1>
              <p className="text-sm text-gray-500">
                {isLoading ? 'Loading…' : `${activeCount} active · ${waged} with wage on file`}
              </p>
            </div>
          </div>
          {canManage && (
            <button
              type="button"
              onClick={() => setModal({ type: 'invite' })}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700 transition-colors"
            >
              <PlusIcon className="h-4 w-4" strokeWidth={2.5} />
              Invite Employee
            </button>
          )}
        </div>

        {/* Warning: active employees with no wage */}
        {unwagedActive > 0 && canManageWages && (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-700">
            <span className="text-base">⚠️</span>
            {unwagedActive} active {unwagedActive === 1 ? 'employee has' : 'employees have'} no wage on file — labor costs won't be calculated.
          </div>
        )}
      </div>

      {/* ── Summary cards ─────────────────────────────────────── */}
      {!isLoading && (
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(
            [
              { label: 'Total Staff',  value: employees.length },
              { label: 'Active',       value: activeCount      },
              { label: 'With Wage',    value: waged            },
              { label: 'Missing Wage', value: unwagedActive    },
            ] as Array<{ label: string; value: number }>
          ).map(({ label, value }) => (
            <div key={label} className="rounded-xl border border-gray-200 bg-white p-4 shadow-card">
              <p className="text-xs font-medium text-gray-500">{label}</p>
              <p className="mt-1.5 text-xl font-semibold tabular-nums text-gray-900">{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Filters ───────────────────────────────────────────── */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="h-9 w-full rounded-lg border border-gray-200 bg-white pl-3 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 transition-colors"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
        >
          <option value="all">All Roles</option>
          {EMPLOYEE_ROLES.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
          />
          Show inactive
        </label>
        {(search || roleFilter !== 'all') && (
          <button
            type="button"
            onClick={() => { setSearch(''); setRoleFilter('all') }}
            className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-500 hover:bg-gray-50 transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* ── Employee list ─────────────────────────────────────── */}
      {isLoading ? (
        <EmployeesSkeleton />
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-white py-16 text-center">
          <UsersIcon className="mx-auto h-10 w-10 text-gray-300" strokeWidth={1} />
          <h3 className="mt-3 text-sm font-semibold text-gray-900">
            {search || roleFilter !== 'all' ? 'No results' : 'No employees'}
          </h3>
          <p className="mt-1 text-sm text-gray-500 max-w-xs">
            {search || roleFilter !== 'all'
              ? 'Try a different search or filter.'
              : canManage
              ? 'Use "Invite Employee" to add your first team member.'
              : 'No team members found.'}
          </p>
          {canManage && !search && roleFilter === 'all' && (
            <button
              type="button"
              onClick={() => setModal({ type: 'invite' })}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700"
            >
              <PlusIcon className="h-4 w-4" strokeWidth={2.5} />
              Invite Employee
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((emp) => (
            <EmployeeCard
              key={emp.id}
              employee={emp}
              tenantId={tenantId}
              canManage={canManage}
              canManageWages={canManageWages}
              canManageAdmins={canManageAdmins}
              onWageEdit={(e) => setModal({ type: 'wage', employee: e })}
              onEdit={(e) => setModal({ type: 'edit', employee: e })}
              onToggleActive={(e) => { if (!toggleMutation.isPending) toggleMutation.mutate(e) }}
              onPasswordReset={(e) => { if (!resetMutation.isPending) resetMutation.mutate(e) }}
            />
          ))}
        </div>
      )}

      {/* ── Modals ────────────────────────────────────────────── */}
      {modal.type === 'invite' && (
        <InviteDrawer
          tenantId={tenantId}
          session={session}
          onClose={() => setModal({ type: 'none' })}
          onInvited={() => void queryClient.invalidateQueries({ queryKey: ['tenant-employees', tenantId] })}
        />
      )}
      {modal.type === 'wage' && (
        <WageModal
          tenantId={tenantId}
          employee={modal.employee}
          onClose={() => setModal({ type: 'none' })}
          onSaved={onWageSaved}
        />
      )}
      {modal.type === 'edit' && (
        <EditDrawer
          employee={modal.employee}
          canManageAdmins={canManageAdmins}
          onClose={() => setModal({ type: 'none' })}
          onSaved={() => void queryClient.invalidateQueries({ queryKey: ['tenant-employees', tenantId] })}
        />
      )}
    </div>
  )
}
