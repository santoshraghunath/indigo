-- Fix: replace the FOR ALL policy (which lacked an explicit WITH CHECK for
-- INSERT) with separate per-operation policies that match the codebase pattern.

drop policy if exists "tenant members upsert branding" on tenant_branding;

create policy "tenant members insert branding" on tenant_branding
  for insert
  with check (tenant_id in (select get_user_tenant_ids()));

create policy "tenant members update branding" on tenant_branding
  for update
  using  (tenant_id in (select get_user_tenant_ids()))
  with check (tenant_id in (select get_user_tenant_ids()));

create policy "tenant members delete branding" on tenant_branding
  for delete
  using (tenant_id in (select get_user_tenant_ids()));
