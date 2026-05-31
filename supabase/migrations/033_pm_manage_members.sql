-- ============================================================================
-- 033_pm_manage_members.sql
--
-- Allows PM+ to update tenant_members for non-admin/non-owner members.
-- Required for: deactivate / reactivate employees, change role from UI.
--
-- Safety:
--   - USING clause:    target row's current role must not be admin or owner
--   - WITH CHECK:      new role must not be admin or owner
--   → A PM can never touch an admin/owner account or promote anyone to admin.
--   → Admin+ accounts are still managed exclusively by admin-or-above.
--
-- The existing "admins can manage tenant members" ALL policy covers admin+.
-- This new policy adds a narrower UPDATE path for PM-level users.
-- ============================================================================

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename  = 'tenant_members'
      and policyname = 'pm and above manage field members'
  ) then
    execute $p$
      create policy "pm and above manage field members"
        on tenant_members for update
        using (
          -- Caller is PM+ in this tenant
          user_has_role(tenant_id, 'project_manager')
          -- The target member is not admin or owner
          and role not in ('admin', 'owner')
        )
        with check (
          -- New role must not elevate to admin or owner (no privilege escalation)
          role not in ('admin', 'owner')
          and user_has_role(tenant_id, 'project_manager')
        )
    $p$;
  end if;
end $$;
