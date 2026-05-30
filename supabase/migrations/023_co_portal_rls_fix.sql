-- ============================================================================
-- 023_co_portal_rls_fix.sql
--
-- Bug: COs created natively in BB have co_status = NULL (Indigo never set it).
-- The portal-client RLS policy "clients view their change orders" used
--   co_status in ('pending_approval', 'approved')
-- which excludes NULLs in SQL — so BB-native COs were always invisible to
-- portal clients, even when BB had approved them.
--
-- Fix: expand the predicate to fall back to BB's own `status` column when
-- co_status is null.  BB status values are Title-Case ('Pending', 'Approved').
-- ============================================================================

-- Drop and recreate the portal-client policy with the expanded predicate.
drop policy if exists "clients view their change orders" on job_change_orders;

create policy "clients view their change orders" on job_change_orders
  for select using (
    is_client_on_job(job_id)
    and (
      co_status in ('pending_approval', 'approved')
      or (co_status is null and status in ('Pending', 'Approved'))
    )
  );
