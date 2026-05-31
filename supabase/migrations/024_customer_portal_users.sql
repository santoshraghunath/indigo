-- ============================================================================
-- 024_customer_portal_users.sql
--
-- Adds support for multiple portal users per customer (e.g. co-owner, agent).
-- Previously each customer had one portal user tied to customers.portal_user_id.
-- This adds a customer_portal_users join table for additional contacts while
-- leaving the primary customers.portal_user_id path fully intact.
--
-- Changes:
--   1. customer_portal_users table
--   2. RLS on the new table
--   3. is_client_on_job() updated to accept secondary portal users
--   4. portal_link_self() updated to also link via customer_portal_users.email
-- ============================================================================


-- ── 1. Table ──────────────────────────────────────────────────────────────────

create table if not exists customer_portal_users (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id)   on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  -- email stored lowercase; enforced via unique index below
  email       text not null,
  -- set once the invited user completes sign-up and portal_link_self() runs
  user_id     uuid references auth.users(id) on delete set null,
  -- optional free-text label shown in the staff UI (e.g. "Co-owner", "Agent")
  label       text,
  invited_at  timestamptz,
  linked_at   timestamptz,
  created_at  timestamptz not null default now()
);

-- Case-insensitive uniqueness: one row per (customer, email)
create unique index if not exists cpu_customer_email_uniq
  on customer_portal_users (customer_id, lower(email));

create index if not exists cpu_user_id_idx      on customer_portal_users (user_id);
create index if not exists cpu_customer_id_idx  on customer_portal_users (customer_id);
create index if not exists cpu_tenant_id_idx    on customer_portal_users (tenant_id);

comment on table customer_portal_users is
  'Additional portal users for a customer (beyond the primary customers.portal_user_id). '
  'Each row is one invited contact; user_id is populated once they sign up.';


-- ── 2. RLS ────────────────────────────────────────────────────────────────────

alter table customer_portal_users enable row level security;

-- Tenant members (any role) can view all portal users for their customers
do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'customer_portal_users'
      and policyname = 'tenant members view customer portal users'
  ) then
    execute $p$
      create policy "tenant members view customer portal users"
        on customer_portal_users for select
        using (tenant_id in (select get_user_tenant_ids()))
    $p$;
  end if;
end $$;

-- PM and above can insert / update / delete
do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'customer_portal_users'
      and policyname = 'pm and above manage customer portal users'
  ) then
    execute $p$
      create policy "pm and above manage customer portal users"
        on customer_portal_users for all
        using (user_has_role(tenant_id, 'project_manager'))
    $p$;
  end if;
end $$;

-- Portal users can see their own row (used by portal_link_self)
do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'customer_portal_users'
      and policyname = 'portal user sees own row'
  ) then
    execute $p$
      create policy "portal user sees own row"
        on customer_portal_users for select
        using (user_id = auth.uid())
    $p$;
  end if;
end $$;


-- ── 3. is_client_on_job() — add secondary user branch ────────────────────────
--
-- Previous definition only checked customers.portal_user_id = auth.uid().
-- Now also accepts a matching row in customer_portal_users.

create or replace function is_client_on_job(j_id uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1
      from jobs      j
      join customers c on c.id = j.customer_id
     where j.id = j_id
       and (
         -- primary portal user
         c.portal_user_id = auth.uid()
         or
         -- secondary portal user
         exists (
           select 1
             from customer_portal_users cpu
            where cpu.customer_id = c.id
              and cpu.user_id     = auth.uid()
         )
       )
  );
$$;


-- ── 4. portal_link_self() — also link via customer_portal_users ───────────────
--
-- Previous: only updated customers.portal_user_id.
-- Now: first checks customer_portal_users.email (secondary contacts),
--      then falls back to customers.email (primary contact, unchanged).

create or replace function portal_link_self()
returns int language plpgsql security definer as $$
declare
  v_updated    int := 0;
  v_auth_email text;
begin
  select email into v_auth_email
    from auth.users
   where id = auth.uid();

  -- 1. Secondary contact path: match email in customer_portal_users
  update customer_portal_users
     set user_id   = auth.uid(),
         linked_at = now()
   where lower(email) = lower(v_auth_email)
     and user_id is null;

  get diagnostics v_updated = row_count;

  -- 2. Primary contact path (existing behaviour): match customers.email
  if v_updated = 0 then
    update customers
       set portal_user_id = auth.uid()
     where lower(email) = lower(v_auth_email)
       and portal_user_id is null;
    get diagnostics v_updated = row_count;
  end if;

  return v_updated;
end;
$$;
