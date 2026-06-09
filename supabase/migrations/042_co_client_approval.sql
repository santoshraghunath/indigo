-- ============================================================================
-- 042_co_client_approval.sql
--
-- Adds portal_approve_change_order() security-definer RPC so portal clients
-- can approve change orders submitted for their approval by the PM.
--
-- The RPC mirrors portal_approve_milestone() in structure:
--   • Finds the CO, asserting co_status = 'pending_approval'
--   • Verifies the caller is the client on the CO's job via is_client_on_job()
--     (handles both primary and secondary portal contacts)
--   • Sets co_status = 'approved' and stamps approved_at = now()
-- ============================================================================

create or replace function portal_approve_change_order(p_co_id uuid)
returns void language plpgsql security definer as $$
declare
  v_job_id uuid;
begin
  -- Find the CO and verify it is pending client approval
  select job_id into v_job_id
    from job_change_orders
   where id        = p_co_id
     and co_status = 'pending_approval';

  if not found then
    raise exception 'Change order not found or not pending client approval';
  end if;

  -- is_client_on_job() handles both primary (customers.portal_user_id)
  -- and secondary (customer_portal_users.user_id) portal contacts
  if not is_client_on_job(v_job_id) then
    raise exception 'Not authorized to approve this change order';
  end if;

  update job_change_orders
     set co_status   = 'approved',
         approved_at = now()
   where id = p_co_id;
end;
$$;
