-- ── Tenant branding ──────────────────────────────────────────────────────────
-- Indigo-owned extension of the BuildersBooks `tenants` table.
-- Stores per-tenant logo + contact info used in proposals and portal.

create table if not exists tenant_branding (
  tenant_id       uuid primary key references tenants(id) on delete cascade,
  logo_url        text,
  company_name    text,
  company_phone   text,
  company_email   text,
  company_address text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table tenant_branding enable row level security;

-- Any member of the tenant can read branding
create policy "tenant members select branding" on tenant_branding
  for select using (tenant_id in (select get_user_tenant_ids()));

-- Separate INSERT / UPDATE / DELETE policies — FOR ALL with only USING
-- does not reliably provide WITH CHECK for INSERT in PostgREST.
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

-- ── Supabase Storage bucket ───────────────────────────────────────────────────
-- Public read so PDF renderer can fetch the logo URL directly.
-- Writes are restricted to authenticated users within the tenant folder.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tenant-assets',
  'tenant-assets',
  true,
  2097152,   -- 2 MB max per file
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

-- Authenticated users may upload into their own tenant folder only
create policy "tenant members upload assets" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'tenant-assets'
    and (storage.foldername(name))[1] in (
      select id::text from tenants
      where id in (select get_user_tenant_ids())
    )
  );

-- Authenticated users may replace/update objects in their tenant folder
create policy "tenant members update assets" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'tenant-assets'
    and (storage.foldername(name))[1] in (
      select id::text from tenants
      where id in (select get_user_tenant_ids())
    )
  );

-- Authenticated users may delete objects in their tenant folder
create policy "tenant members delete assets" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'tenant-assets'
    and (storage.foldername(name))[1] in (
      select id::text from tenants
      where id in (select get_user_tenant_ids())
    )
  );

-- Anyone (including the PDF renderer) can read public bucket objects
create policy "public read tenant assets" on storage.objects
  for select using (bucket_id = 'tenant-assets');
