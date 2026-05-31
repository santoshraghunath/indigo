import type { SupabaseClient } from './supabase.js'

// ── Types ──────────────────────────────────────────────────────────────────

export interface SubCompany {
  id: string
  tenant_id: string
  name: string
  trade: string | null
  primary_email: string | null
  primary_phone: string | null
  website: string | null
  address_line1: string | null
  city: string | null
  state: string | null
  zip: string | null
  license_number: string | null
  license_state: string | null
  license_expiry: string | null
  insurance_carrier: string | null
  insurance_policy: string | null
  insurance_expiry: string | null
  w9_on_file: boolean
  is_preferred: boolean
  is_active: boolean
  rating: number | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface SubContact {
  id: string
  sub_company_id: string
  tenant_id: string
  first_name: string
  last_name: string
  title: string | null
  email: string | null
  phone: string | null
  is_primary: boolean
  user_id: string | null
  created_at: string
}

export interface UpsertSubCompanyInput {
  id?: string
  name: string
  trade?: string | null
  primary_email?: string | null
  primary_phone?: string | null
  website?: string | null
  address_line1?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
  license_number?: string | null
  license_state?: string | null
  license_expiry?: string | null
  insurance_carrier?: string | null
  insurance_policy?: string | null
  insurance_expiry?: string | null
  w9_on_file?: boolean
  is_preferred?: boolean
  is_active?: boolean
  rating?: number | null
  notes?: string | null
}

export interface UpsertSubContactInput {
  id?: string
  first_name: string
  last_name: string
  title?: string | null
  email?: string | null
  phone?: string | null
  is_primary?: boolean
  user_id?: string | null
}

// ── Queries ────────────────────────────────────────────────────────────────

export async function getSubCompanies(
  client: SupabaseClient,
  tenantId: string,
  includeInactive = false,
): Promise<SubCompany[]> {
  let q = client
    .from('sub_companies')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('name', { ascending: true })

  if (!includeInactive) {
    q = q.eq('is_active', true)
  }

  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as SubCompany[]
}

export async function getSubContacts(
  client: SupabaseClient,
  subCompanyId: string,
): Promise<SubContact[]> {
  const { data, error } = await client
    .from('sub_contacts')
    .select('*')
    .eq('sub_company_id', subCompanyId)
    .order('is_primary', { ascending: false })
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as SubContact[]
}

// ── Mutations ──────────────────────────────────────────────────────────────

export async function upsertSubCompany(
  client: SupabaseClient,
  tenantId: string,
  input: UpsertSubCompanyInput,
): Promise<{ id: string }> {
  const payload: Record<string, unknown> = {
    tenant_id:         tenantId,
    name:              input.name,
    trade:             input.trade             ?? null,
    primary_email:     input.primary_email     ?? null,
    primary_phone:     input.primary_phone     ?? null,
    website:           input.website           ?? null,
    address_line1:     input.address_line1     ?? null,
    city:              input.city              ?? null,
    state:             input.state             ?? null,
    zip:               input.zip               ?? null,
    license_number:    input.license_number    ?? null,
    license_state:     input.license_state     ?? null,
    license_expiry:    input.license_expiry    ?? null,
    insurance_carrier: input.insurance_carrier ?? null,
    insurance_policy:  input.insurance_policy  ?? null,
    insurance_expiry:  input.insurance_expiry  ?? null,
    w9_on_file:        input.w9_on_file        ?? false,
    is_preferred:      input.is_preferred      ?? false,
    is_active:         input.is_active         ?? true,
    rating:            input.rating            ?? null,
    notes:             input.notes             ?? null,
  }

  if (input.id) {
    const { data, error } = await client
      .from('sub_companies')
      .update(payload as unknown as never)
      .eq('id', input.id)
      .eq('tenant_id', tenantId)
      .select('id')
      .single()
    if (error) throw error
    return data as { id: string }
  }

  const { data, error } = await client
    .from('sub_companies')
    .insert(payload as unknown as never)
    .select('id')
    .single()
  if (error) throw error
  return data as { id: string }
}

export async function deleteSubCompany(
  client: SupabaseClient,
  id: string,
  tenantId: string,
): Promise<void> {
  const { error } = await client
    .from('sub_companies')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId)
  if (error) throw error
}

export async function upsertSubContact(
  client: SupabaseClient,
  subCompanyId: string,
  tenantId: string,
  input: UpsertSubContactInput,
): Promise<{ id: string }> {
  const payload: Record<string, unknown> = {
    sub_company_id: subCompanyId,
    tenant_id:      tenantId,
    first_name:     input.first_name,
    last_name:      input.last_name,
    title:          input.title      ?? null,
    email:          input.email      ?? null,
    phone:          input.phone      ?? null,
    is_primary:     input.is_primary ?? false,
    user_id:        input.user_id    ?? null,
  }

  if (input.id) {
    const { data, error } = await client
      .from('sub_contacts')
      .update(payload as unknown as never)
      .eq('id', input.id)
      .select('id')
      .single()
    if (error) throw error
    return data as { id: string }
  }

  const { data, error } = await client
    .from('sub_contacts')
    .insert(payload as unknown as never)
    .select('id')
    .single()
  if (error) throw error
  return data as { id: string }
}

export async function deleteSubContact(
  client: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await client
    .from('sub_contacts')
    .delete()
    .eq('id', id)
  if (error) throw error
}
