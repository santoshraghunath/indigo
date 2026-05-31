import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
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
} from '@/components/ui/Icons'

interface NavItem {
  to: string
  label: string
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
  end?: boolean
}

// Full navigation for PM-and-above staff
const ALL_NAV_ITEMS: NavItem[] = [
  { to: '/',               label: 'Dashboard',      Icon: HomeIcon,      end: true },
  { to: '/projects',       label: 'Projects',        Icon: FolderIcon },
  { to: '/schedule',       label: 'Schedule',        Icon: CalendarIcon },
  { to: '/financials',     label: 'Financials',      Icon: ChartBarIcon },
  { to: '/documents',      label: 'Documents',       Icon: DocumentIcon },
  { to: '/field',          label: 'Field',           Icon: ClipboardIcon },
  { to: '/subcontractors', label: 'Subcontractors',  Icon: UsersIcon },
  { to: '/employees',      label: 'Employees',        Icon: UsersIcon },
  { to: '/ai',             label: 'AI Assistant',    Icon: SparklesIcon },
  { to: '/settings',       label: 'Settings',         Icon: GearIcon },
]

// Field and subcontractor roles: Projects tab only
const FIELD_NAV_ITEMS: NavItem[] = [
  { to: '/projects', label: 'Projects', Icon: FolderIcon },
]

/** Roles restricted to the Projects-only view */
const FIELD_ROLES = new Set(['field_associate', 'field_super', 'subcontractor'])

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

export function AppShell() {
  const { profile, tenantMemberships, activeTenantId } = useAuth()
  const location = useLocation()

  const activeMembership = tenantMemberships.find((m) => m.tenant_id === activeTenantId)
  const activeTenant     = activeMembership?.tenant
  const userInitial      = profile?.first_name?.[0]?.toUpperCase() ?? '?'
  const userName         = profile ? `${profile.first_name} ${profile.last_name}` : 'Loading…'

  // Field/sub roles only see the Projects nav item
  const isFieldRole = FIELD_ROLES.has(activeMembership?.role ?? '')
  const NAV_ITEMS   = isFieldRole ? FIELD_NAV_ITEMS : ALL_NAV_ITEMS

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

        {/* User profile */}
        <div className="border-t border-gray-200 p-3">
          <div className="flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-gray-50 transition-colors cursor-pointer">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
              {userInitial}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-gray-900">{userName}</p>
              <p className="truncate text-[11px] text-gray-400">{profile?.email ?? ''}</p>
            </div>
          </div>
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

          {/* Mobile user avatar */}
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700 lg:hidden">
            {userInitial}
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>

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
    </div>
  )
}
