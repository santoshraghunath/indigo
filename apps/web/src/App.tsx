import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { queryClient } from '@/lib/queryClient'
import { useAuthListener, useAuth } from '@/hooks/useAuth'
import { usePortalAuthListener, usePortalAuth } from '@/hooks/usePortalAuth'
import { AppShell } from '@/components/AppShell'
import { ToastProvider } from '@/components/ui/Toast'
import { LoginPage } from '@/features/auth/LoginPage'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { ProjectsPage } from '@/features/projects/ProjectsPage'
import { ProjectDetailPage } from '@/features/projects/ProjectDetailPage'
import { OverviewTab } from '@/features/projects/tabs/OverviewTab'
import { ScheduleTab } from '@/features/projects/tabs/ScheduleTab'
import { FinancialsTab } from '@/features/projects/tabs/FinancialsTab'
import { DocumentsTab } from '@/features/projects/tabs/DocumentsTab'
import { FieldTab } from '@/features/projects/tabs/FieldTab'
import { SubsTab } from '@/features/projects/tabs/SubsTab'
import { ClientTab } from '@/features/projects/tabs/ClientTab'
import { ClockTab } from '@/features/projects/tabs/ClockTab'
import { EmployeesPage } from '@/features/employees/EmployeesPage'
import { SubcontractorsPage } from '@/features/subcontractors/SubcontractorsPage'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { PortalLoginPage } from '@/features/portal/PortalLoginPage'
import { PortalShell } from '@/features/portal/PortalShell'
import { PortalProjectsPage } from '@/features/portal/PortalProjectsPage'
import { PortalProjectPage } from '@/features/portal/PortalProjectPage'

// ── Roles restricted to projects-only view ────────────────────────────────

const FIELD_ROLES = new Set(['field_associate', 'field_super', 'subcontractor'])

// ── Staff auth guard ───────────────────────────────────────────────────────

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, isLoading, profile, tenantMemberships } = useAuth()
  if (isLoading) return null          // session check in-flight — hold position
  if (user === null) return <Navigate to="/login" replace />

  // Profile has loaded but user has no active memberships →
  // either deactivated or never added to a tenant.
  // We gate on profile != null so we don't flash this during the brief
  // window between isLoading=false and the profile query completing.
  if (profile !== null && tenantMemberships.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="max-w-sm text-center">
          <div className="text-4xl">🔒</div>
          <h2 className="mt-4 text-base font-semibold text-gray-900">No access</h2>
          <p className="mt-2 text-sm text-gray-500">
            Your account doesn't have access to any workspace. Contact your administrator.
          </p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}

function AuthRoutes() {
  useAuthListener()
  const { user, isLoading, tenantMemberships, activeTenantId } = useAuth()

  const activeMembership = tenantMemberships.find((m) => m.tenant_id === activeTenantId)
  const isFieldRole = FIELD_ROLES.has(activeMembership?.role ?? '')

  return (
    <Routes>
      <Route path="/login" element={isLoading ? null : user ? <Navigate to={isFieldRole ? '/projects' : '/'} replace /> : <LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route index                  element={isFieldRole ? <Navigate to="/projects" replace /> : <DashboardPage />} />
        <Route path="projects"        element={<ProjectsPage />} />

        {/* Project detail with nested tab routes */}
        <Route path="projects/:id"    element={<ProjectDetailPage />}>
          <Route index                element={<Navigate to="overview" replace />} />
          <Route path="overview"      element={<OverviewTab />} />
          <Route path="schedule"      element={<ScheduleTab />} />
          <Route path="financials"    element={<FinancialsTab />} />
          <Route path="documents"     element={<DocumentsTab />} />
          <Route path="field"         element={<FieldTab />} />
          <Route path="subs"          element={<SubsTab />} />
          <Route path="client"        element={<ClientTab />} />
          <Route path="clock"         element={<ClockTab />} />
        </Route>

        <Route path="employees"        element={<EmployeesPage />} />
        <Route path="subcontractors"  element={<SubcontractorsPage />} />
        <Route path="settings"         element={<SettingsPage />} />
        <Route path="schedule"        element={<ComingSoon name="Schedule" />} />
        <Route path="financials/*"    element={<ComingSoon name="Financials" />} />
        <Route path="documents"       element={<ComingSoon name="Documents" />} />
        <Route path="field/*"         element={<ComingSoon name="Field" />} />
        <Route path="ai"              element={<ComingSoon name="AI Assistant" />} />
        <Route path="*"               element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

// ── Portal auth guard ──────────────────────────────────────────────────────

function RequirePortalAuth({ children }: { children: React.ReactNode }) {
  const { user, customer, isLoading, isStaffPreview } = usePortalAuth()
  if (isLoading) return null
  if (!user) return <Navigate to="/portal/login" replace />
  // Staff (admin/owner) get preview access even without a customer record
  if (!customer && !isStaffPreview) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="max-w-sm text-center">
          <div className="text-4xl">🔒</div>
          <h2 className="mt-4 text-base font-semibold text-gray-900">No portal access</h2>
          <p className="mt-2 text-sm text-gray-500">
            Your email isn't linked to a client account. Please contact your builder.
          </p>
        </div>
      </div>
    )
  }
  return <>{children}</>
}

function PortalRoutes() {
  usePortalAuthListener()
  const { user } = usePortalAuth()

  return (
    <Routes>
      <Route
        path="login"
        element={user ? <Navigate to="/portal" replace /> : <PortalLoginPage />}
      />
      <Route
        element={
          <RequirePortalAuth>
            <PortalShell />
          </RequirePortalAuth>
        }
      >
        <Route index                   element={<PortalProjectsPage />} />
        <Route path="projects"         element={<PortalProjectsPage />} />
        <Route path="projects/:id"     element={<PortalProjectPage />} />
      </Route>
    </Routes>
  )
}

// ── Shared coming-soon placeholder ────────────────────────────────────────

function ComingSoon({ name }: { name: string }) {
  return (
    <div className="flex h-full min-h-[40vh] items-center justify-center p-6">
      <div className="text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-white">
          <span className="text-2xl">🚧</span>
        </div>
        <h2 className="mt-4 text-base font-semibold text-gray-900">{name}</h2>
        <p className="mt-1 text-sm text-gray-500">Coming in a future phase</p>
      </div>
    </div>
  )
}

// ── Root ───────────────────────────────────────────────────────────────────

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          {/* Customer portal — separate auth context */}
          <Route path="/portal/*" element={<PortalRoutes />} />
          {/* Staff app */}
          <Route path="/*" element={<AuthRoutes />} />
        </Routes>
        <ToastProvider />
      </BrowserRouter>
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  )
}
