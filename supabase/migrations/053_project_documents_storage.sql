-- 053_project_documents_storage.sql
-- Consolidated, additive reconciliation for the project-documents storage
-- contract. This is the first unshipped migration in the chain, so it carries
-- the complete final effective state: a private 25 MiB bucket, tenant-scoped
-- staff reads, document-floor uploads via the hierarchical role helper,
-- portal reads limited to authorized client-visible documents, rollback-only
-- orphan cleanup bound to the uploading owner, and no persisted-object delete
-- policy or SQL cleanup helper.

insert into storage.buckets (id, name, public, file_size_limit)
values (
  'project-documents',
  'project-documents',
  false,
  26214400
)
on conflict (id) do update
set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit;

do $$ begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'tenant staff read project documents'
  ) then
    execute 'drop policy "tenant staff read project documents" on storage.objects';
  end if;

  execute $policy$
    create policy "tenant staff read project documents" on storage.objects
      for select using (
        bucket_id = 'project-documents'
        and exists (
          select 1
          from tenants t
          where t.id::text = split_part(storage.objects.name, '/', 1)
            and t.id in (select get_user_tenant_ids())
        )
      )
  $policy$;
end $$;

do $$ begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'tenant staff upload project documents'
  ) then
    execute 'drop policy "tenant staff upload project documents" on storage.objects';
  end if;

  execute $policy$
    create policy "tenant staff upload project documents" on storage.objects
      for insert with check (
        bucket_id = 'project-documents'
        and user_has_role(
          split_part(storage.objects.name, '/', 1)::uuid,
          'field_super'
        )
      )
  $policy$;
end $$;

do $$ begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'portal clients read project documents'
  ) then
    execute 'drop policy "portal clients read project documents" on storage.objects';
  end if;

  execute $policy$
    create policy "portal clients read project documents" on storage.objects
      for select using (
        bucket_id = 'project-documents'
        and exists (
          select 1
          from documents doc
          join projects p on p.id = doc.project_id
          where doc.storage_bucket = 'project-documents'
            and doc.storage_path = storage.objects.name
            and doc.is_client_visible = true
            and is_client_on_job(p.job_id)
        )
      )
  $policy$;
end $$;

do $$ begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'tenant staff cleanup orphaned project document uploads'
  ) then
    execute 'drop policy "tenant staff cleanup orphaned project document uploads" on storage.objects';
  end if;

  execute $policy$
    create policy "tenant staff cleanup orphaned project document uploads" on storage.objects
      for delete using (
        bucket_id = 'project-documents'
        and owner_id = (select auth.uid()::text)
        and exists (
          select 1
          from tenants t
          where t.id::text = split_part(storage.objects.name, '/', 1)
            and t.id in (select get_user_tenant_ids())
        )
        and not exists (
          select 1
          from documents doc
          where doc.storage_bucket = 'project-documents'
            and doc.storage_path = storage.objects.name
        )
      )
  $policy$;
end $$;

do $$ begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'tenant staff delete project documents'
  ) then
    execute 'drop policy "tenant staff delete project documents" on storage.objects';
  end if;
end $$;

drop function if exists public.cleanup_project_document_upload(text);