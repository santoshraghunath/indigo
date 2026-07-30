import { useRef, useEffect, useState, type FormEvent } from 'react'
import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/stores/toastStore'
import { Button } from '@/components/ui/Button'
import {
  HomeIcon,
  FolderIcon,
  CalendarIcon,
  ChartBarIcon,
  DocumentIcon,
  ClipboardIcon,
  UsersIcon,
  SparklesIcon,
  BellIcon,
  Bars3Icon,
  GearIcon,
  XMarkIcon,
  TableCellsIcon,
  FunnelIcon,
  ChevronDownIcon,
  KeyIcon,
  SignOutIcon,
} from '@/components/ui/Icons'

interface NavItem {
  to: string
  label: string
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
  end?: boolean
}

const ALL_NAV_ITEMS: NavItem[] = [
  { to: '/',               label: 'Dashboard',      Icon: HomeIcon,      end: true },
  { to: '/projects',       label: 'Projects',        Icon: FolderIcon },
  { to: '/sales',          label: 'Sales',           Icon: FunnelIcon },
  { to: '/schedule',       label: 'Schedule',        Icon: CalendarIcon },
  { to: '/financials',     label: 'Financials',      Icon: ChartBarIcon },
  { to: '/documents',      label: 'Documents',       Icon: DocumentIcon },
  { to: '/field',          label: 'Field',           Icon: ClipboardIcon },
  { to: '/subcontractors', label: 'Subcontractors',  Icon: UsersIcon },
  { to: '/employees',      label: 'Employees',       Icon: UsersIcon },
  { to: '/reports',        label: 'Reports',         Icon: TableCellsIcon },
  { to: '/ai',             label: 'AI Assistant',    Icon: SparklesIcon },
  { to: '/settings',       label: 'Settings',        Icon: GearIcon },
]

const FIELD_NAV_ITEMS: NavItem[] = [
  { to: '/projects', label: 'Projects', Icon: FolderIcon },
]

const FIELD_ROLES = new Set(['field_associate', 'field_super', 'subcontractor'])

const ROLE_LABELS: Record<string, string> = {
  owner:           'Owner',
  admin:           'Admin',
  project_manager: 'Project Manager',
  field_super:     'Field Supervisor',
  field_associate: 'Field Associate',
  accountant:      'Accountant',
  subcontractor:   'Subcontractor',
  client:          'Client',
}

function SidebarNavItem({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        `relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
          isActive
            ? 'bg-brand-50 text-brand-700 before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-0.5 before:rounded-r-full before:bg-brand-500'
            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <item.Icon
            className={`h-[18px] w-[18px] shrink-0 ${isActive ? 'text-brand-600' : 'text-gray-400'}`}
            strokeWidth={isActive ? 2 : 1.75}
          />
          <span>{item.label}</span>
        </>
      )}
    </NavLink>
  )
}

// ── Change password modal ──────────────────────────────────────────────────

function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const toast = useToast()
  const [password, setPassword] = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    if (password !== confirm) { setError('Passwords do not match'); return }
    setLoading(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) {
      setError(updateError.message)
    } else {
      toast.success('Password updated')
      onClose()
    }
    setLoading(false)
  }

  const inputCls =
    'block w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 ' +
    'placeholder:text-gray-400 focus:bg-white focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 transition-colors'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-base font-semibold text-gray-900">Change password</h2>
          <button type="button" onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
            <XMarkIcon className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          <div>
            <label htmlFor="new-pw" className="mb-1.5 block text-sm font-medium text-gray-700">
              New password
            </label>
            <input id="new-pw" type="password" required autoFocus autoComplete="new-password"
              value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="Min. 8 characters" className={inputCls} />
          </div>
          <div>
            <label htmlFor="confirm-pw" className="mb-1.5 block text-sm font-medium text-gray-700">
              Confirm password
            </label>
            <input id="confirm-pw" type="password" required autoComplete="new-password"
              value={confirm} onChange={(e) => setConfirm(e.target.value)}
              placeholder="••••••••" className={inputCls} />
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-lg border border-gray-200 bg-white py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <Button type="submit" loading={loading} className="flex-1">
              Update password
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── User menu dropdown (desktop) ────────────────────────────────────────────

function UserMenuDropdown({
  userName,
  email,
  userInitial,
  role,
  onChangePassword,
  onSignOut,
}: {
  userName: string
  email: string
  userInitial: string
  role: string | undefined
  onChangePassword: () => void
  onSignOut: () => void
}) {
  return (
    <div className="absolute bottom-full left-0 right-0 mb-1.5 rounded-xl border border-gray-200 bg-white shadow-modal overflow-hidden z-50">
      {/* User card */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700 select-none">
          {userInitial}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-900">{userName}</p>
          <p className="truncate text-[11px] text-gray-400">{email}</p>
          {role && (
            <span className="mt-0.5 inline-block rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
              {ROLE_LABELS[role] ?? role}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="p-1">
        <button
          onClick={onChangePassword}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left"
        >
          <KeyIcon className="h-4 w-4 shrink-0 text-gray-400" strokeWidth={2} />
          Change password
        </button>
      </div>

      <div className="border-t border-gray-100 p-1">
        <button
          onClick={onSignOut}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors text-left"
        >
          <SignOutIcon className="h-4 w-4 shrink-0" strokeWidth={2} />
          Sign out
        </button>
      </div>
    </div>
  )
}

// ── AppShell ───────────────────────────────────────────────────────────────

export function AppShell() {
  const { profile, tenantMemberships, activeTenantId } = useAuth()
  const location = useLocation()
  const [drawerOpen,   setDrawerOpen]   = useState(false)
  const [menuOpen,     setMenuOpen]     = useState(false)
  const [changePwOpen, setChangePwOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const activeMembership = tenantMemberships.find((m) => m.tenant_id === activeTenantId)
  const activeTenant     = activeMembership?.tenant
  const userInitial      = profile?.first_name?.[0]?.toUpperCase() ?? '?'
  const userName         = profile ? `${profile.first_name} ${profile.last_name}` : 'Loading…'
  const userRole         = activeMembership?.role

  const isFieldRole = FIELD_ROLES.has(activeMembership?.role ?? '')
  const NAV_ITEMS   = isFieldRole ? FIELD_NAV_ITEMS : ALL_NAV_ITEMS

  // Close the desktop menu on outside click
  useEffect(() => {
    if (!menuOpen) return
    function handleOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [menuOpen])

  async function handleSignOut() {
    setMenuOpen(false)
    setDrawerOpen(false)
    await supabase.auth.signOut()
  }

  function openChangePassword() {
    setMenuOpen(false)
    setDrawerOpen(false)
    setChangePwOpen(true)
  }

  return (
    <div className="flex h-screen overflow-hidden bg-surface-1">
      {/* ── Sidebar (desktop) ────────────────────────────────────────── */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-gray-200 bg-white lg:flex">
        {/* Logo + workspace */}
        <div className="flex h-14 items-center gap-3 border-b border-gray-200 px-4">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-xs font-bold text-white select-none">
            I
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-gray-900">Indigo</p>
            {activeTenant && (
              <p className="truncate text-[11px] text-gray-400">{activeTenant.name}</p>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
          {NAV_ITEMS.map((item) => (
            <SidebarNavItem key={item.to} item={item} />
          ))}
        </nav>

        {/* User profile — click to open menu */}
        <div ref={menuRef} className="relative border-t border-gray-200 p-3">
          {menuOpen && (
            <UserMenuDropdown
              userName={userName}
              email={profile?.email ?? ''}
              userInitial={userInitial}
              role={userRole}
              onChangePassword={openChangePassword}
              onSignOut={handleSignOut}
            />
          )}
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-gray-50 transition-colors text-left"
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700 select-none">
              {userInitial}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-gray-900">{userName}</p>
              <p className="truncate text-[11px] text-gray-400">{profile?.email ?? ''}</p>
            </div>
            <ChevronDownIcon
              className={`h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform duration-150 ${menuOpen ? 'rotate-180' : ''}`}
              strokeWidth={2}
            />
          </button>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-4 lg:px-6">
          {/* Mobile hamburger */}
          <button
            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 transition-colors lg:hidden"
            aria-label="Open menu"
            onClick={() => setDrawerOpen(true)}
          >
            <Bars3Icon className="h-5 w-5" />
          </button>

          <div className="flex-1" />

          {/* Notifications */}
          <button
            className="relative rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 transition-colors"
            aria-label="Notifications"
          >
            <BellIcon className="h-5 w-5" />
          </button>

          {/* Mobile user avatar — tapping opens the drawer */}
          <button
            onClick={() => setDrawerOpen(true)}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700 lg:hidden"
            aria-label="Account menu"
          >
            {userInitial}
          </button>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>

      {/* ── Mobile drawer ────────────────────────────────────────────── */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
          />
          {/* Panel */}
          <div className="absolute left-0 top-0 bottom-0 w-72 flex flex-col bg-white shadow-xl">
            {/* Header */}
            <div className="flex h-14 items-center justify-between border-b border-gray-200 px-4">
              <div className="flex items-center gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-xs font-bold text-white select-none">
                  I
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">Indigo</p>
                  {activeTenant && (
                    <p className="truncate text-[11px] text-gray-400">{activeTenant.name}</p>
                  )}
                </div>
              </div>
              <button
                className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 transition-colors"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close menu"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            {/* Nav items */}
            <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
              {NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={() => setDrawerOpen(false)}
                  className={({ isActive }) =>
                    `relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-brand-50 text-brand-700 before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-0.5 before:rounded-r-full before:bg-brand-500'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <item.Icon
                        className={`h-[18px] w-[18px] shrink-0 ${isActive ? 'text-brand-600' : 'text-gray-400'}`}
                        strokeWidth={isActive ? 2 : 1.75}
                      />
                      <span>{item.label}</span>
                    </>
                  )}
                </NavLink>
              ))}
            </nav>

            {/* User section + actions */}
            <div className="border-t border-gray-200 p-3 space-y-1">
              {/* User card */}
              <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700 select-none">
                  {userInitial}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-gray-900">{userName}</p>
                  <p className="truncate text-[11px] text-gray-400">{profile?.email ?? ''}</p>
                  {userRole && (
                    <span className="inline-block rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
                      {ROLE_LABELS[userRole] ?? userRole}
                    </span>
                  )}
                </div>
              </div>

              {/* Action buttons */}
              <button
                onClick={openChangePassword}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left"
              >
                <KeyIcon className="h-4 w-4 shrink-0 text-gray-400" strokeWidth={2} />
                Change password
              </button>
              <button
                onClick={handleSignOut}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors text-left"
              >
                <SignOutIcon className="h-4 w-4 shrink-0" strokeWidth={2} />
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Bottom nav (mobile only) ──────────────────────────────────── */}
      <nav className="fixed bottom-0 left-0 right-0 z-10 flex items-center justify-around border-t border-gray-200 bg-white/95 backdrop-blur-sm px-2 pb-safe lg:hidden">
        {NAV_ITEMS.slice(0, 5).map((item) => {
          const isActive = item.end
            ? location.pathname === item.to
            : location.pathname.startsWith(item.to)
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className="flex min-h-[56px] flex-col items-center justify-center gap-1 px-3"
            >
              <item.Icon
                className={`h-[22px] w-[22px] transition-colors ${isActive ? 'text-brand-600' : 'text-gray-400'}`}
                strokeWidth={isActive ? 2 : 1.5}
              />
              <span className={`text-[10px] font-medium transition-colors ${isActive ? 'text-brand-600' : 'text-gray-400'}`}>
                {item.label}
              </span>
            </NavLink>
          )
        })}
      </nav>

      {/* ── Change password modal ─────────────────────────────────────── */}
      {changePwOpen && <ChangePasswordModal onClose={() => setChangePwOpen(false)} />}
    </div>
  )
}
