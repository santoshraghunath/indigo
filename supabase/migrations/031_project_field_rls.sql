-- ============================================================================
-- 031_project_field_rls.sql
--
-- Restricts field-role users (field_associate, field_super, subcontractor)
-- to viewing only the projects they've been explicitly added to via
-- project_members. Accountant and above continue to see all tenant projects.
--
-- Changes:
--   1. project_members  — adds RLS policies (table has RLS enabled but no
--                          policies since migration 003).
--   2. projects         — replaces the blanket "tenant members view projects"
--                          SELECT policy with a role-sensitive version.
--   3. can_access_project() — updated to respect field-role restriction so
--                          that project_phases, milestones, and schedule_items
--                          also honour the same rule.
-- ============================================================================


-- ── 1. project_members policies ───────────────────────────────────────────

-- PM and above can manage all project_members rows for their tenant
create policy "pm and above manage project_members" on project_members
  for all using (user_has_role(tenant_id, 'project_manager'));

-- Every active tenant member can read their own assignment rows.
-- This SELECT policy is required for the subquery in the projects RLS
-- below to resolve correctly when evaluated under a field-role user JWT.
create policy "members view own project assignments" on project_members
  for select using (
    user_id = auth.uid()
    and tenant_id in (select get_user_tenant_ids())
  );


-- ── 2. projects SELECT policy ─────────────────────────────────────────────

-- Drop the existing blanket policy so we can replace it.
do $$ begin
  if exists (
    select 1 from pg_policies
    where tablename = 'projects' and policyname = 'tenant members view projects'
  ) then
    execute $p$ drop policy "tenant members view projects" on projects $p$;
  end if;
end $$;

-- New policy: accountant and above see all tenant projects;
-- field/sub roles see only projects they're a member of.
create policy "tenant members view projects" on projects
  for select using (
    -- Accountant and above (accountant, project_manager, admin, owner):
    -- can see all projects in their tenant.
    user_has_role(tenant_id, 'accountant')
    or
    -- Field/sub roles: only projects they're explicitly assigned to.
    (
      tenant_id in (select get_user_tenant_ids())
      and exists (
        select 1 from project_members pm
        where pm.project_id = projects.id
          and pm.user_id    = auth.uid()
      )
    )
  );


-- ── 3. can_access_project() ───────────────────────────────────────────────
--
-- Updated to mirror the projects policy above. Used by project_phases,
-- milestones, schedule_items, and task_dependencies SELECT policies.
-- Security-definer — bypasses RLS on project_members, which is intentional.

create or replace function can_access_project(proj_id uuid)
returns boolean language plpgsql security definer stable as $$
declare
  t_id uuid;
  j_id uuid;
begin
  select tenant_id, job_id into t_id, j_id
  from projects where id = proj_id;

  -- Accountant and above: unrestricted access to all tenant projects
  if user_has_role(t_id, 'accountant') then return true; end if;

  -- Portal client on this specific job
  if is_client_on_job(j_id) then return true; end if;

  -- Field / sub roles: only assigned projects
  -- (security definer means no RLS interference on project_members query)
  if t_id in (select get_user_tenant_ids()) then
    return exists (
      select 1 from project_members pm
      where pm.project_id = proj_id
        and pm.user_id    = auth.uid()
    );
  end if;

  return false;
end;
$$;
