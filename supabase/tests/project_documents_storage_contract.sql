begin;

create extension if not exists pgtap with schema extensions;

select plan(23);

create temp table test_assertions (
  seq integer primary key,
  assertion_type text not null,
  passed boolean,
  actual text,
  expected text,
  description text not null
) on commit drop;

grant select, insert on table test_assertions to anon, authenticated;

create or replace function test_support_record_ok(
  p_seq integer,
  p_passed boolean,
  p_description text
)
returns void
language sql
set search_path = pg_temp
as $$
  insert into test_assertions (seq, assertion_type, passed, description)
  values (p_seq, 'ok', p_passed, p_description);
$$;

create or replace function test_support_record_is(
  p_seq integer,
  p_actual text,
  p_expected text,
  p_description text
)
returns void
language sql
set search_path = pg_temp
as $$
  insert into test_assertions (seq, assertion_type, actual, expected, description)
  values (p_seq, 'is', p_actual, p_expected, p_description);
$$;

create or replace function test_support_set_auth(p_user_id uuid, p_role text default 'authenticated')
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_user_id::text, ''), true);
  perform set_config('request.jwt.claim.role', p_role, true);
end;
$$;

create or replace function test_support_clear_auth()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'anon', true);
end;
$$;

create or replace function test_support_expect_insert_denied(
  p_bucket_id text,
  p_name text,
  p_owner uuid,
  p_owner_id text
)
returns boolean
language plpgsql
as $$
declare
  v_role text := coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon');
  v_inserted integer;
begin
  execute format('set local role %I', v_role);
  insert into storage.objects (bucket_id, name, owner, owner_id)
  values (p_bucket_id, p_name, p_owner, p_owner_id);
  get diagnostics v_inserted = row_count;
  execute 'reset role';
  return v_inserted = 0;
exception
  when insufficient_privilege then
    execute 'reset role';
    return true;
  when others then
    execute 'reset role';
    raise;
end;
$$;

create or replace function test_support_expect_insert_allowed(
  p_bucket_id text,
  p_name text,
  p_owner uuid,
  p_owner_id text
)
returns boolean
language plpgsql
as $$
declare
  v_role text := coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon');
  v_inserted integer;
begin
  execute format('set local role %I', v_role);
  insert into storage.objects (bucket_id, name, owner, owner_id)
  values (p_bucket_id, p_name, p_owner, p_owner_id);
  get diagnostics v_inserted = row_count;
  execute 'reset role';
  return v_inserted = 1;
exception
  when insufficient_privilege then
    execute 'reset role';
    return false;
  when others then
    execute 'reset role';
    raise;
end;
$$;

create or replace function test_support_expect_select_allowed(p_name text)
returns boolean
language plpgsql
as $$
declare
  v_role text := coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon');
  v_name text;
begin
  execute format('set local role %I', v_role);
  select o.name
    into v_name
    from storage.objects o
   where o.bucket_id = 'project-documents'
     and o.name = p_name;

  execute 'reset role';
  return v_name = p_name;
exception
  when others then
    execute 'reset role';
    raise;
end;
$$;

create or replace function test_support_expect_select_denied(p_name text)
returns boolean
language plpgsql
as $$
declare
  v_role text := coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon');
  v_count integer;
begin
  execute format('set local role %I', v_role);
  select count(*)
    into v_count
    from storage.objects o
   where o.bucket_id = 'project-documents'
     and o.name = p_name;

  execute 'reset role';
  return v_count = 0;
exception
  when others then
    execute 'reset role';
    raise;
end;
$$;

create or replace function test_support_expect_delete_result(p_name text)
returns boolean
language plpgsql
as $$
declare
  v_role text := coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon');
  v_deleted integer;
  v_remaining integer;
  v_owner uuid;
  v_owner_id text;
begin
  execute format('set local role %I', v_role);
  perform set_config('storage.allow_delete_query', 'true', true);
  select o.owner, o.owner_id
    into v_owner, v_owner_id
    from storage.objects o
   where o.bucket_id = 'project-documents'
     and o.name = p_name;
  delete from storage.objects o
   where o.bucket_id = 'project-documents'
     and o.name = p_name;

  get diagnostics v_deleted = row_count;
  select count(*)
    into v_remaining
    from storage.objects o
   where o.bucket_id = 'project-documents'
     and o.name = p_name;
  raise notice 'delete helper path=% role=% deleted=% remaining=% owner=% owner_id=% auth_uid=%',
    p_name,
    v_role,
    v_deleted,
    v_remaining,
    v_owner,
    v_owner_id,
    auth.uid();
  execute 'reset role';
  return v_deleted = 1 and v_remaining = 0;
exception
  when insufficient_privilege then
    raise notice 'delete helper insufficient_privilege path=% role=% auth_uid=%',
      p_name,
      v_role,
      auth.uid();
    execute 'reset role';
    return false;
  when others then
    raise notice 'delete helper other_error path=% role=% auth_uid=% sqlstate=% message=%',
      p_name,
      v_role,
      auth.uid(),
      sqlstate,
      sqlerrm;
    execute 'reset role';
    if position('Direct deletion from storage tables is not allowed' in sqlerrm) > 0 then
      return false;
    end if;
    raise;
end;
$$;

do $$
declare
  v_tenant uuid := gen_random_uuid();
  v_other_tenant uuid := gen_random_uuid();
  v_job uuid := gen_random_uuid();
  v_other_job uuid := gen_random_uuid();
  v_customer uuid := gen_random_uuid();
  v_other_customer uuid := gen_random_uuid();
  v_staff_super uuid := gen_random_uuid();
  v_staff_pm uuid := gen_random_uuid();
  v_staff_admin uuid := gen_random_uuid();
  v_staff_owner uuid := gen_random_uuid();
  v_staff_associate uuid := gen_random_uuid();
  v_staff_other_tenant uuid := gen_random_uuid();
  v_portal_allowed uuid := gen_random_uuid();
  v_portal_denied uuid := gen_random_uuid();
  v_project_visible uuid := gen_random_uuid();
  v_project_hidden uuid := gen_random_uuid();
  v_project_other_tenant uuid := gen_random_uuid();
  v_visible_doc uuid := gen_random_uuid();
  v_hidden_doc uuid := gen_random_uuid();
  v_other_tenant_doc uuid := gen_random_uuid();
  v_visible_path text := null;
  v_hidden_path text := null;
  v_other_tenant_path text := null;
  v_orphan_path text := null;
  v_visible_insert_ok boolean := false;
  v_hidden_insert_ok boolean := false;
  v_other_tenant_insert_ok boolean := false;
  v_orphan_insert_ok boolean := false;
begin
  insert into auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
  ) values
    (
      '00000000-0000-0000-0000-000000000000',
      v_staff_super,
      'authenticated',
      'authenticated',
      'storage-super@example.com',
      crypt('password', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb,
      now(),
      now(),
      '',
      '',
      '',
      ''
    ),
    (
      '00000000-0000-0000-0000-000000000000',
      v_staff_pm,
      'authenticated',
      'authenticated',
      'storage-pm@example.com',
      crypt('password', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb,
      now(),
      now(),
      '',
      '',
      '',
      ''
    ),
    (
      '00000000-0000-0000-0000-000000000000',
      v_staff_associate,
      'authenticated',
      'authenticated',
      'storage-associate@example.com',
      crypt('password', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb,
      now(),
      now(),
      '',
      '',
      '',
      ''
    ),
    (
      '00000000-0000-0000-0000-000000000000',
      v_staff_admin,
      'authenticated',
      'authenticated',
      'storage-admin@example.com',
      crypt('password', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb,
      now(),
      now(),
      '',
      '',
      '',
      ''
    ),
    (
      '00000000-0000-0000-0000-000000000000',
      v_staff_owner,
      'authenticated',
      'authenticated',
      'storage-owner@example.com',
      crypt('password', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb,
      now(),
      now(),
      '',
      '',
      '',
      ''
    ),
    (
      '00000000-0000-0000-0000-000000000000',
      v_staff_other_tenant,
      'authenticated',
      'authenticated',
      'other-tenant-staff@example.com',
      crypt('password', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb,
      now(),
      now(),
      '',
      '',
      '',
      ''
    ),
    (
      '00000000-0000-0000-0000-000000000000',
      v_portal_allowed,
      'authenticated',
      'authenticated',
      'portal-allowed@example.com',
      crypt('password', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb,
      now(),
      now(),
      '',
      '',
      '',
      ''
    ),
    (
      '00000000-0000-0000-0000-000000000000',
      v_portal_denied,
      'authenticated',
      'authenticated',
      'portal-denied@example.com',
      crypt('password', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb,
      now(),
      now(),
      '',
      '',
      '',
      ''
    );

  insert into tenants (id, name, slug) values
    (v_tenant, 'Storage Contract Tenant', 'storage-contract-tenant'),
    (v_other_tenant, 'Other Storage Tenant', 'other-storage-tenant');

  insert into user_profiles (id, first_name, last_name, email) values
    (v_staff_super, 'Storage', 'Super', 'storage-super@example.com'),
    (v_staff_pm, 'Storage', 'PM', 'storage-pm@example.com'),
    (v_staff_admin, 'Storage', 'Admin', 'storage-admin@example.com'),
    (v_staff_owner, 'Storage', 'Owner', 'storage-owner@example.com'),
    (v_staff_associate, 'Storage', 'Associate', 'storage-associate@example.com'),
    (v_staff_other_tenant, 'Other', 'Tenant Staff', 'other-tenant-staff@example.com'),
    (v_portal_allowed, 'Portal', 'Allowed', 'portal-allowed@example.com'),
    (v_portal_denied, 'Portal', 'Denied', 'portal-denied@example.com');

  insert into tenant_members (tenant_id, user_id, role, is_active) values
    (v_tenant, v_staff_super, 'field_super', true),
    (v_tenant, v_staff_pm, 'project_manager', true),
    (v_tenant, v_staff_admin, 'admin', true),
    (v_tenant, v_staff_owner, 'owner', true),
    (v_tenant, v_staff_associate, 'field_associate', true),
    (v_other_tenant, v_staff_other_tenant, 'field_super', true);

  insert into customers (id, tenant_id, customer_name, email, portal_user_id) values
    (v_customer, v_tenant, 'Visible Customer', 'visible-customer@example.com', v_portal_allowed),
    (v_other_customer, v_other_tenant, 'Other Customer', 'other-customer@example.com', v_portal_denied);

  insert into jobs (
    id,
    tenant_id,
    job_number,
    job_name,
    customer_id,
    status,
    job_type,
    contract_amount_cents,
    description,
    job_address,
    notes
  ) values
    (
      v_job,
      v_tenant,
      'JOB-STORAGE-001',
      'Storage Contract Visible Job',
      v_customer,
      'active',
      'construction',
      1000000,
      'Visible job for project document storage contract testing',
      '123 Visible Job Lane',
      'Visible job fixture notes'
    ),
    (
      v_other_job,
      v_other_tenant,
      'JOB-STORAGE-002',
      'Storage Contract Other Tenant Job',
      v_other_customer,
      'active',
      'construction',
      2000000,
      'Other tenant job for project document storage contract testing',
      '456 Other Tenant Way',
      'Other tenant job fixture notes'
    );

  insert into projects (id, tenant_id, job_id) values
    (v_project_visible, v_tenant, v_job),
    (v_project_other_tenant, v_other_tenant, v_other_job);

  v_project_hidden := v_project_visible;

  v_visible_path := v_tenant::text || '/' || v_project_visible::text || '/visible-' || gen_random_uuid()::text || '.pdf';
  v_hidden_path := v_tenant::text || '/' || v_project_hidden::text || '/hidden-' || gen_random_uuid()::text || '.pdf';
  v_other_tenant_path := v_other_tenant::text || '/' || v_project_other_tenant::text || '/other-' || gen_random_uuid()::text || '.pdf';
  v_orphan_path := v_tenant::text || '/' || v_project_visible::text || '/orphan-' || gen_random_uuid()::text || '.pdf';

  perform test_support_set_auth(v_staff_super);
  v_visible_insert_ok := test_support_expect_insert_allowed('project-documents', v_visible_path, v_staff_super, v_staff_super::text);
  v_hidden_insert_ok := test_support_expect_insert_allowed('project-documents', v_hidden_path, v_staff_super, v_staff_super::text);
  v_orphan_insert_ok := test_support_expect_insert_allowed('project-documents', v_orphan_path, v_staff_super, v_staff_super::text);

  perform test_support_set_auth(v_staff_other_tenant);
  v_other_tenant_insert_ok := test_support_expect_insert_allowed('project-documents', v_other_tenant_path, v_staff_other_tenant, v_staff_other_tenant::text);

  perform test_support_set_auth(v_staff_super);
  insert into documents (
    id, tenant_id, project_id, type, name, storage_bucket, storage_path, uploaded_by, is_client_visible
  ) values
    (v_visible_doc, v_tenant, v_project_visible, 'other', 'Visible Project Document', 'project-documents', v_visible_path, v_staff_super, true),
    (v_hidden_doc, v_tenant, v_project_hidden, 'other', 'Hidden Project Document', 'project-documents', v_hidden_path, v_staff_super, false);

  perform test_support_set_auth(v_staff_other_tenant);
  insert into documents (
    id, tenant_id, project_id, type, name, storage_bucket, storage_path, uploaded_by, is_client_visible
  ) values
    (v_other_tenant_doc, v_other_tenant, v_project_other_tenant, 'other', 'Other Tenant Project Document', 'project-documents', v_other_tenant_path, v_staff_other_tenant, true);

  perform test_support_clear_auth();

  perform test_support_record_is(
    1,
    (
      select row_to_json(b)
      from (
        select public, file_size_limit
        from storage.buckets
        where id = 'project-documents'
      ) b
    )::text,
    '{"public":false,"file_size_limit":26214400}',
    'project-documents bucket stays private with a 25 MiB limit'
  );

  perform test_support_record_ok(
    2,
    not exists (
      select 1
      from storage.buckets
      where id = 'project-documents'
        and public = true
    ),
    'no public project-documents bucket row exists'
  );
  perform test_support_record_ok(
    3,
    not exists (
      select 1
      from pg_proc
      where pronamespace = 'public'::regnamespace
        and proname = 'project_document_public_url'
    ),
    'no public project document URL helper exists'
  );
  perform test_support_record_ok(4, v_visible_insert_ok, 'field_super can upload tenant-scoped project document objects');
  perform test_support_record_ok(5, v_hidden_insert_ok, 'field_super can upload hidden tenant-scoped project document objects');
  perform test_support_record_ok(6, v_other_tenant_insert_ok, 'field_super can upload objects within their own tenant scope');
  perform test_support_record_ok(7, v_orphan_insert_ok, 'field_super can create orphan candidate objects before metadata persists');

  perform test_support_set_auth(v_staff_pm);
  perform test_support_record_ok(
    8,
    test_support_expect_insert_allowed(
      'project-documents',
      v_tenant::text || '/' || v_project_visible::text || '/pm-allowed-' || gen_random_uuid()::text || '.pdf',
      v_staff_pm,
      v_staff_pm::text
    ),
    'project_manager upload is allowed because storage insert follows the hierarchical field_super floor'
  );
  perform test_support_set_auth(v_staff_admin);
  perform test_support_record_ok(
    9,
    test_support_expect_insert_allowed(
      'project-documents',
      v_tenant::text || '/' || v_project_visible::text || '/admin-allowed-' || gen_random_uuid()::text || '.pdf',
      v_staff_admin,
      v_staff_admin::text
    ),
    'admin upload is allowed because storage insert follows the hierarchical field_super floor'
  );
  perform test_support_set_auth(v_staff_owner);
  perform test_support_record_ok(
    10,
    test_support_expect_insert_allowed(
      'project-documents',
      v_tenant::text || '/' || v_project_visible::text || '/owner-allowed-' || gen_random_uuid()::text || '.pdf',
      v_staff_owner,
      v_staff_owner::text
    ),
    'owner upload is allowed because storage insert follows the hierarchical field_super floor'
  );
  perform test_support_set_auth(v_staff_pm);
  perform test_support_record_ok(11, test_support_expect_select_allowed(v_visible_path), 'tenant staff can read visible tenant document object');
  perform test_support_record_ok(12, test_support_expect_select_allowed(v_hidden_path), 'tenant staff can read hidden tenant document object');
  perform test_support_record_ok(13, test_support_expect_select_denied(v_other_tenant_path), 'tenant staff cannot read other-tenant document objects');
  perform test_support_record_ok(14, not test_support_expect_delete_result(v_visible_path), 'persisted project-document object delete is denied by rollback-only policy');
  perform test_support_set_auth(v_staff_super);
  perform test_support_record_ok(15, test_support_expect_delete_result(v_orphan_path), 'uploading owner can clean up orphan object before metadata persists');

  perform test_support_set_auth(v_staff_other_tenant);
  perform test_support_record_ok(16, test_support_expect_select_allowed(v_other_tenant_path), 'other-tenant field_super can read their own tenant document object');
  perform test_support_record_ok(17, test_support_expect_select_denied(v_visible_path), 'other-tenant staff cannot read tenant-scoped document objects');

  perform test_support_set_auth(v_portal_allowed);
  perform test_support_record_ok(18, test_support_expect_select_allowed(v_visible_path), 'authorized portal client can read client-visible document object on allowed job');
  perform test_support_record_ok(19, test_support_expect_select_denied(v_hidden_path), 'portal client cannot read hidden document objects');
  perform test_support_record_ok(20, test_support_expect_select_denied(v_other_tenant_path), 'portal client cannot read unauthorized other-tenant document objects');

  perform test_support_set_auth(v_portal_denied);
  perform test_support_record_ok(21, test_support_expect_select_denied(v_visible_path), 'unauthorized portal client cannot read visible document objects on someone else''s job');

  perform test_support_set_auth(v_staff_associate);
  perform test_support_record_ok(
    22,
    test_support_expect_insert_denied(
      'project-documents',
      v_tenant::text || '/' || v_project_visible::text || '/associate-denied-' || gen_random_uuid()::text || '.pdf',
      v_staff_associate,
      v_staff_associate::text
    ),
    'field_associate upload is denied below the hierarchical field_super floor'
  );

  perform test_support_clear_auth();
  perform test_support_record_ok(
    23,
    not exists (
      select 1
      from pg_proc
      where pronamespace = 'public'::regnamespace
        and proname = 'cleanup_project_document_upload'
    ),
    'unsafe direct SQL cleanup function remains removed'
  );
end;
$$;

select test_support_clear_auth();

select is(actual, expected, description)
from test_assertions
where seq = 1;

select ok(passed, description)
from test_assertions
where seq between 2 and 23
order by seq;

drop function test_support_expect_delete_result(text);
drop function test_support_expect_select_denied(text);
drop function test_support_expect_select_allowed(text);
drop function test_support_expect_insert_allowed(text, text, uuid, text);
drop function test_support_expect_insert_denied(text, text, uuid, text);
drop function test_support_record_ok(integer, boolean, text);
drop function test_support_record_is(integer, text, text, text);
drop function test_support_clear_auth();
drop function test_support_set_auth(uuid, text);

select * from finish();
rollback;