import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { queryClient } from '@/lib/queryClient'
import { useAuthListener, useAuth } from '@/hooks/useAuth'
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

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  if (user === null) return <Navigate to="/login" replace />
  return <>{children}</>
}

function AuthRoutes() {
  useAuthListener()
  const { user } = useAuth()

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route index                  element={<DashboardPage />} />
        <Route path="projects"        element={<ProjectsPage />} />

        {/* Project detail with nested tab routes */}
        <Route path="projects/:id"    element={<ProjectDetailPage />}>
          <Route index                element={<Navigate to="overview" replace />} />
          <Route path="overview"      element={<OverviewTab />} />
          <Route path="schedule"      element={<ScheduleTab />} />
          <Route path="financials"    element={<FinancialsTab />} />
          <Route path="documents"     element={<DocumentsTab />} />
          <Route path="field"         element={<ComingSoon name="Field" />} />
          <Route path="subs"          element={<ComingSoon name="Subcontractors" />} />
        </Route>

        <Route path="schedule"        element={<ComingSoon name="Schedule" />} />
        <Route path="financials/*"    element={<ComingSoon name="Financials" />} />
        <Route path="documents"       element={<ComingSoon name="Documents" />} />
        <Route path="field/*"         element={<ComingSoon name="Field" />} />
        <Route path="subcontractors"  element={<ComingSoon name="Subcontractors" />} />
        <Route path="ai"              element={<ComingSoon name="AI Assistant" />} />
        <Route path="*"               element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

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

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AuthRoutes />
        <ToastProvider />
      </BrowserRouter>
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  )
}
