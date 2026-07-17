-- ============================================================================
-- 052_co_approval_atomic_backfill.sql
--
-- Ensure approved_at exists and is backfilled from legacy date_approved,
-- and make portal and pm approval RPCs atomic and predicate-safe to
-- prevent duplicate audit transitions and to accept legacy BB Pending
-- rows from the portal path.
-- ============================================================================

-- IMPLEMENTATION NOTE: migration created to satisfy repairContract ACs; it
-- is intentionally additive and idempotent (adds approved_at if missing,
-- backfills from date_approved, and replaces RPC bodies with atomic updates
-- that enforce the full pending predicate and use UPDATE ... RETURNING for
-- single-row audit insertion).

-- 1) Ensure approved_at exists (idempotent)
alter table job_change_orders
  add column if not exists approved_at timestamptz;

-- 2) Backfill approved_at from legacy date_approved where missing
update job_change_orders
   set approved_at = date_approved::timestamptz
 where approved_at is null
   and date_approved is not null;

-- 3) Atomic, predicate-checked portal approval
create or replace function portal_approve_change_order(p_co_id uuid)
returns void language plpgsql security definer as $$
declare
  v_job_id    uuid;
  v_tenant_id uuid;
  v_old_row   jsonb;
  v_new_row   jsonb;
begin
  -- Read and verify pending state (accept Indigo pending OR legacy Pending)
  select job_id, tenant_id,
         to_jsonb(job_change_orders.*) - 'id'
    into v_job_id, v_tenant_id, v_old_row
    from job_change_orders
   where id = p_co_id
     and (
           co_status = 'pending_approval'
           or (co_status is null and status = 'Pending')
         );

  if not found then
    raise exception 'Change order not found or not pending client approval';
  end if;

  -- Authorization: ensure caller is a portal client on the job
  if not is_client_on_job(v_job_id) then
    raise exception 'Not authorized to approve this change order';
  end if;

  -- Atomically perform the update only if the full pending predicate still
  -- holds and the row is not already approved; RETURNING provides the new
  -- JSONB for the audit entry. This prevents races that would overwrite
  -- a concurrent rejection/cancellation and avoids duplicate audits.
  update job_change_orders
     set co_status           = 'approved',
         approved_at         = now(),
         approved_by_user_id = auth.uid()
   where id = p_co_id
     and (
           co_status = 'pending_approval'
           or (co_status is null and status = 'Pending')
         )
     and approved_at is null
  returning to_jsonb(job_change_orders.*) - 'id'
    into v_new_row;

  if not found then
    -- No row updated because it no longer matched the pending predicate
    -- or was already approved; do not create an audit in that case.
    raise exception 'Change order no longer pending client approval';
  end if;

  -- Insert audit log row (portal user_profiles may not exist; that's OK)
  insert into audit_log (tenant_id, user_id, table_name, record_id, action, old_values, new_values)
  select v_tenant_id,
         up.id,
         'job_change_orders',
         p_co_id,
         'update',
         v_old_row,
         jsonb_build_object(
           'co_status',           'approved',
           'approved_at',         v_new_row -> 'approved_at',
           'approved_by_user_id', auth.uid(),
           '_approved_via',       'portal'
         )
    from user_profiles up
   where up.id = auth.uid()
   limit 1;
end;
$$;

-- 4) Atomic PM approval: PM can approve any unapproved CO regardless of
--    co_status/status; preserve existing PM auth checks and make update
--    atomic to avoid duplicate audits.
create or replace function pm_approve_change_order(p_co_id uuid)
returns void language plpgsql security definer as $$
declare
  v_job_id    uuid;
  v_tenant_id uuid;
  v_old_row   jsonb;
  v_new_row   jsonb;
begin
  -- Read the CO (authorization check uses tenant_members and must run before mutation)
  select job_id, tenant_id,
         to_jsonb(job_change_orders.*) - 'id'
    into v_job_id, v_tenant_id, v_old_row
    from job_change_orders
   where id = p_co_id;

  if not found then
    raise exception 'Change order not found';
  end if;

  -- Verify caller is a PM+ member of the tenant
  if not exists (
    select 1 from tenant_members
     where user_id   = auth.uid()
       and tenant_id = v_tenant_id
       and role in ('project_manager', 'admin', 'owner')
  ) then
    raise exception 'PM+ role required to approve change orders';
  end if;

  -- Atomically update only if not already approved (approved_at is null)
  update job_change_orders
     set co_status           = 'approved',
         approved_at         = now(),
         approved_by_user_id = auth.uid()
   where id = p_co_id
     and approved_at is null
  returning to_jsonb(job_change_orders.*) - 'id'
    into v_new_row;

  if not found then
    -- Already approved: be a no-op
    return;
  end if;

  -- Insert audit log row (staff should have a user_profiles row)
  insert into audit_log (tenant_id, user_id, table_name, record_id, action, old_values, new_values)
  select v_tenant_id,
         up.id,
         'job_change_orders',
         p_co_id,
         'update',
         v_old_row,
         jsonb_build_object(
           'co_status',           'approved',
           'approved_at',         v_new_row -> 'approved_at',
           'approved_by_user_id', auth.uid(),
           '_approved_via',       'pm'
         )
    from user_profiles up
   where up.id = auth.uid()
   limit 1;
end;
$$;
