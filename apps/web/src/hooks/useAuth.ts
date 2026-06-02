import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'

export function useAuthListener() {
  const { setAuth, setProfile, setTenantMemberships, clearAuth } = useAuthStore()

  useEffect(() => {
    // Hydrate existing session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuth(session?.user ?? null, session)
      if (session?.user) loadProfile(session.user.id)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuth(session?.user ?? null, session)
      if (session?.user) {
        loadProfile(session.user.id)
      } else {
        clearAuth()
      }
    })

    return () => subscription.unsubscribe()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadProfile(userId: string) {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('id, first_name, last_name, email, phone, avatar_url, title, twilio_opt_in, created_at, updated_at')
      .eq('id', userId)
      .single()

    if (profile) setProfile(profile)

    const { data: memberships } = await supabase
      .from('tenant_members')
      .select('id, tenant_id, user_id, role, is_active, invited_by, invited_at, accepted_at, created_at, tenant:tenants(id, name, slug, created_at)')
      .eq('user_id', userId)
      .eq('is_active', true)

    // Always call setTenantMemberships (even on empty array) so hasFetchedMemberships
    // flips to true and RequireAuth can distinguish "not yet loaded" from "loaded & empty".
    setTenantMemberships((memberships ?? []) as Parameters<typeof setTenantMemberships>[0])
  }
}

export function useAuth() {
  return useAuthStore()
}
