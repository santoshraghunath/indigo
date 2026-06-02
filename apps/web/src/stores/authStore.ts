import { create } from 'zustand'
import type { User, Session } from '@supabase/supabase-js'
import type { UserProfile, TenantMember, Tenant } from '@indigo/db'

interface AuthState {
  user: User | null
  session: Session | null
  profile: UserProfile | null
  tenantMemberships: (TenantMember & { tenant: Tenant })[]
  activeTenantId: string | null
  /** True until the first getSession() response has been processed. */
  isLoading: boolean
  /**
   * Flips to true after the tenant_members query completes at least once.
   * Prevents RequireAuth from showing "No access" during the brief window
   * where profile has loaded but the memberships query is still in flight.
   */
  hasFetchedMemberships: boolean

  setAuth: (user: User | null, session: Session | null) => void
  setProfile: (profile: UserProfile | null) => void
  setTenantMemberships: (memberships: (TenantMember & { tenant: Tenant })[]) => void
  setActiveTenant: (tenantId: string) => void
  clearAuth: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  session: null,
  profile: null,
  tenantMemberships: [],
  activeTenantId: null,
  isLoading: true,
  hasFetchedMemberships: false,

  setAuth: (user, session) => set({ user, session, isLoading: false }),
  setProfile: (profile) => set({ profile }),
  setTenantMemberships: (tenantMemberships) =>
    set((state) => ({
      tenantMemberships,
      hasFetchedMemberships: true,
      activeTenantId:
        state.activeTenantId ?? tenantMemberships[0]?.tenant_id ?? null,
    })),
  setActiveTenant: (activeTenantId) => set({ activeTenantId }),
  clearAuth: () =>
    set({
      user: null, session: null, profile: null,
      tenantMemberships: [], activeTenantId: null,
      isLoading: false, hasFetchedMemberships: false,
    }),
}))
