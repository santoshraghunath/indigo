-- ============================================================================
-- 030_sub_companies.sql
--
-- Indigo-native subcontractor company directory.
-- We do NOT write to BB's `subcontractors` table (uncertain check constraints
-- on BB-owned `subcontractor_status`). Instead we maintain our own tables.
--
-- Tables:
--   sub_companies  — company-level directory (Indigo-native)
--   sub_contacts   — individual contacts at a sub company
-- ============================================================================


-- ── sub_companies ─────────────────────────────────────────────────────────

create table sub_companies (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id) on delete cascade,
  name              text not null,
  trade             text,
  -- Contact info
  primary_email     text,
  primary_phone     text,
  website           text,
  address_line1     text,
  city              text,
  state             text,
  zip               text,
  -- Licensing & insurance
  license_number    text,
  license_state     text,
  license_expiry    date,
  insurance_carrier text,
  insurance_policy  text,
  insurance_expiry  date,
  w9_on_file        boolean not null default false,
  -- Status & rating
  is_preferred      boolean not null default false,
  is_active         boolean not null default true,
  rating            smallint check (rating between 1 and 5),
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ── sub_contacts ─────────────────────────────────────────────────────────

create table sub_contacts (
  id              uuid primary key default gen_random_uuid(),
  sub_company_id  uuid not null references sub_companies(id) on delete cascade,
  tenant_id       uuid not null references tenants(id) on delete cascade,
  first_name      text not null,
  last_name       text not null,
  title           text,
  email           text,
  phone           text,
  is_primary      boolean not null default false,
  -- When this contact is also an Indigo app user (tenant_members with role='subcontractor')
  user_id         uuid references user_profiles(id),
  created_at      timestamptz not null default now()
);


-- ── Indexes ───────────────────────────────────────────────────────────────

create index on sub_companies(tenant_id);
create index on sub_companies(tenant_id, is_active);
create index on sub_contacts(sub_company_id);
create index on sub_contacts(tenant_id);
create index on sub_contacts(user_id);


-- ── Triggers ──────────────────────────────────────────────────────────────

create trigger set_updated_at
  before update on sub_companies
  for each row execute function set_updated_at();


-- ── RLS ───────────────────────────────────────────────────────────────────

alter table sub_companies enable row level security;
alter table sub_contacts  enable row level security;

-- Any active tenant member can read the sub directory
create policy "tenant members view sub_companies" on sub_companies
  for select using (tenant_id in (select get_user_tenant_ids()));

create policy "tenant members view sub_contacts" on sub_contacts
  for select using (tenant_id in (select get_user_tenant_ids()));

-- PM and above can create / update / delete
create policy "pm and above manage sub_companies" on sub_companies
  for all using (user_has_role(tenant_id, 'project_manager'));

create policy "pm and above manage sub_contacts" on sub_contacts
  for all using (user_has_role(tenant_id, 'project_manager'));
