-- ============================================================================
-- 032_employee_profile_edit.sql
--
-- Allows PM+ users to update user_profiles rows for members of their tenant.
-- Required for: staff editing employee name, title, phone from EmployeesPage.
--
-- The existing "users can update own profile" policy covers self-edits.
-- This policy adds cross-user edits by tenant managers.
--
-- Note: INSERT into user_profiles during employee invite is done server-side
-- via the employee-invite Netlify function using the service role key, so no
-- INSERT policy is required here.
-- ============================================================================

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename  = 'user_profiles'
      and policyname = 'pm and above update tenant member profiles'
  ) then
    execute $p$
      create policy "pm and above update tenant member profiles"
        on user_profiles for update
        using (
          -- Target user is a member of a tenant where the caller is PM+
          exists (
            select 1 from tenant_members tm
            where tm.user_id   = user_profiles.id
              and user_has_role(tm.tenant_id, 'project_manager')
          )
        )
    $p$;
  end if;
end $$;
