-- ============================================================================
-- 040_sub_portal_rls.sql
--
-- Grants subcontractor users the ability to create and edit (but not delete)
-- daily logs and punch list items on projects they are explicitly assigned to
-- via project_members.
--
-- Existing policies already cover:
--   • SELECT on daily_logs        — "tenant members view daily logs"
--   • SELECT on punch_list_items  — "tenant members view punch list"
--   • Full CRUD for field_super+  — covers PM, admin, owner, field_super
--
-- This migration adds the narrower subcontractor write paths only.
-- ============================================================================

-- ── daily_logs: subcontractor INSERT ─────────────────────────────────────────
-- Subcontractors may create their own daily work logs (log_type = 'subcontractor')
-- only for projects they are assigned to via project_members.

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'daily_logs' and policyname = 'subcontractors insert own daily logs'
  ) then
    execute $p$
      create policy "subcontractors insert own daily logs"
        on daily_logs for insert
        with check (
          author_id  = auth.uid()
          and log_type = 'subcontractor'
          and project_id in (
            select pm.project_id
            from   project_members pm
            where  pm.user_id    = auth.uid()
              and  pm.tenant_id in (select get_user_tenant_ids())
          )
        )
    $p$;
  end if;
end $$;

-- ── daily_logs: subcontractor UPDATE own unpublished logs ─────────────────────
-- Subcontractors may edit their own logs until they are published.

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'daily_logs' and policyname = 'subcontractors update own unpublished logs'
  ) then
    execute $p$
      create policy "subcontractors update own unpublished logs"
        on daily_logs for update
        using (
          author_id     = auth.uid()
          and published_at is null
          and project_id in (
            select pm.project_id
            from   project_members pm
            where  pm.user_id    = auth.uid()
              and  pm.tenant_id in (select get_user_tenant_ids())
          )
        )
    $p$;
  end if;
end $$;

-- ── punch_list_items: subcontractor INSERT ────────────────────────────────────
-- Subcontractors may add punch list items to their assigned projects.

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'punch_list_items' and policyname = 'subcontractors insert punch list items'
  ) then
    execute $p$
      create policy "subcontractors insert punch list items"
        on punch_list_items for insert
        with check (
          tenant_id in (select get_user_tenant_ids())
          and project_id in (
            select pm.project_id
            from   project_members pm
            where  pm.user_id = auth.uid()
          )
        )
    $p$;
  end if;
end $$;

-- ── punch_list_items: subcontractor UPDATE ────────────────────────────────────
-- Subcontractors may update any punch list item in their assigned projects
-- (e.g. mark items in_progress or ready_for_review).

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'punch_list_items' and policyname = 'subcontractors update punch list items'
  ) then
    execute $p$
      create policy "subcontractors update punch list items"
        on punch_list_items for update
        using (
          tenant_id in (select get_user_tenant_ids())
          and project_id in (
            select pm.project_id
            from   project_members pm
            where  pm.user_id = auth.uid()
          )
        )
    $p$;
  end if;
end $$;
