-- RFI enhancements for the designer role + per-project numbering + client assignment.

-- 1. Drop FK on rfis.assigned_to so portal client user IDs (auth.uid() not in
--    user_profiles) can also be assigned to RFIs.
alter table rfis drop constraint if exists rfis_assigned_to_fkey;

-- 2. Clarification fields — designer/client can ask one follow-up question;
--    PM responds inline before the final answer is submitted.
alter table rfis add column if not exists clarification_request  text;
alter table rfis add column if not exists clarification_response text;

-- 3. Per-project auto-numbering trigger.
--    Fires on INSERT when number is NULL or 0 (number is integer, not nullable
--    in the original schema, so callers should pass 0 to trigger auto-assignment).
create or replace function assign_rfi_number()
returns trigger language plpgsql as $$
begin
  if new.number is null or new.number = 0 then
    select coalesce(max(number), 0) + 1 into new.number
    from rfis
    where project_id = new.project_id;
  end if;
  return new;
end;
$$;

drop trigger if exists assign_rfi_number_trigger on rfis;
create trigger assign_rfi_number_trigger
  before insert on rfis
  for each row execute function assign_rfi_number();

-- 4. RLS: designers can UPDATE rfis assigned to them (answer, clarification_request, status).
--    Uses "in (select ...)" form — direct set-returning function calls are not
--    allowed in policy expressions in PostgreSQL.
create policy "designers update assigned rfis" on rfis
  for update
  using (
    tenant_id in (select get_user_tenant_ids()) and
    assigned_to = auth.uid() and
    get_user_role(tenant_id) = 'designer'
  )
  with check (
    tenant_id in (select get_user_tenant_ids()) and
    assigned_to = auth.uid()
  );

-- 5. RLS: portal clients can SELECT rfis assigned to them on their jobs.
create policy "portal clients view assigned rfis" on rfis
  for select using (
    assigned_to = auth.uid() and
    exists (
      select 1 from projects p
      where p.id = project_id and is_client_on_job(p.job_id)
    )
  );

-- 6. RLS: portal clients can UPDATE rfis assigned to them (answer, clarification_request, status).
create policy "portal clients update assigned rfis" on rfis
  for update
  using (
    assigned_to = auth.uid() and
    exists (
      select 1 from projects p
      where p.id = project_id and is_client_on_job(p.job_id)
    )
  )
  with check (
    assigned_to = auth.uid() and
    exists (
      select 1 from projects p
      where p.id = project_id and is_client_on_job(p.job_id)
    )
  );

-- 7. Storage: designers can upload to the project-documents bucket.
--    Avoids set-returning functions by checking tenant_members directly.
do $$ begin
  drop policy if exists "designers upload project documents" on storage.objects;
exception when undefined_object then null; end $$;

create policy "designers upload project documents" on storage.objects
  for insert with check (
    bucket_id = 'project-documents' and
    exists (
      select 1
      from tenant_members tm
      where tm.tenant_id::text = (storage.foldername(name))[1]
        and tm.user_id = auth.uid()
        and tm.role = 'designer'
        and tm.is_active = true
    )
  );
