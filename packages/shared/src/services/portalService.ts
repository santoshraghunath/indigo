import type { SupabaseClient } from './supabase.js'

// ── Types ──────────────────────────────────────────────────────────────────

export interface PortalCustomer {
  id: string
  customer_name: string
  email: string
  phone: string
  portal_user_id: string | null
}

export interface PortalProjectJob {
  id: string
  job_name: string
  job_number: string
  project_status: string | null
  project_type: string | null
  address_line1: string | null
  city: string | null
  state: string | null
  contract_value_cents: number | null
  current_contract_cents: number | null
  start_date: string | null
  target_completion: string | null
  actual_completion: string | null
}

export interface PortalProject {
  id: string
  tenant_id: string
  job_id: string
  created_at: string
  job: PortalProjectJob | null
}

export interface PortalMilestone {
  id: string
  name: string
  status: string
  due_date: string | null
  completed_date: string | null
  requires_client_approval: boolean
  client_approved_at: string | null
  sequence: number
  phase_id: string | null
  // Payment schedule fields
  triggers_invoice:      boolean
  invoice_amount_cents:  number | null
  linked_invoice_id:     string | null
}

export interface PortalInvoice {
  id: string
  invoice_number: string
  invoice_date: string
  due_date: string
  /** Indigo lifecycle status (lowercase). Null for invoices created natively in BB. */
  invoice_status: string | null
  /** BB-owned status column (Title-Case). Used as fallback when invoice_status is null. */
  status: string | null
  total_cents: number
  amount_paid_cents: number
  balance_due_cents: number
  sent_at: string | null
  paid_at: string | null
}

export interface PortalDocument {
  id: string
  type: string
  name: string
  mime_type: string | null
  file_size_bytes: number | null
  created_at: string
}

export interface PortalDailyLog {
  id: string
  date: string
  weather: string | null
  temperature_f: number | null
  crew_count: number | null
  hours_worked: number | null
  work_performed: string
  /** AI-drafted client-friendly summary — shown preferentially over work_performed */
  ai_client_summary: string | null
  materials_delivered: string | null
  equipment_used: string | null
  issues_or_delays: string | null
  published_at: string | null
  created_at: string
}

export interface PortalChangeOrder {
  id: string
  co_number: string
  title: string | null
  description: string
  amount_cents: number
  /** Indigo workflow status. May be null for COs created natively in BB. */
  co_status: string | null
  /** BB-owned status column — used as fallback display when co_status is null. */
  status: string | null
  date_submitted: string | null
  approved_at: string | null
  schedule_impact_days: number | null
  created_at: string
}

export interface PortalSelectionOption {
  id: string
  name: string
  description: string | null
  sku: string | null
  vendor: string | null
  vendor_url: string | null
  unit_price_cents: number
  lead_time_days: number | null
  sequence: number
  is_active: boolean
}

export interface PortalClientSelection {
  id: string
  category_id: string
  option_id: string | null
  custom_description: string | null
  custom_vendor: string | null
  custom_price_cents: number | null
  notes: string | null
  selected_at: string | null
  approved_at: string | null
}

export interface PortalSelectionCategory {
  id: string
  name: string
  description: string | null
  allowance_cents: number
  status: string
  due_date: string | null
  sequence: number
  notes: string | null
  options: PortalSelectionOption[]
  /** The client's current selection for this category, or null if not yet chosen */
  selection: PortalClientSelection | null
}

/**
 * A secondary portal contact for a customer.
 * Created by a PM via the portal-invite Netlify function.
 * user_id is null until the invited person completes sign-up.
 */
export interface CustomerPortalUser {
  id:          string
  customer_id: string
  tenant_id:   string
  email:       string
  user_id:     string | null
  label:       string | null
  invited_at:  string | null
  linked_at:   string | null
  created_at:  string
}

export interface PortalProjectData {
  project: PortalProject
  milestones: PortalMilestone[]
  invoices: PortalInvoice[]
  documents: PortalDocument[]
  dailyLogs: PortalDailyLog[]
  changeOrders: PortalChangeOrder[]
}

// ── Mutations ─────────────────────────────────────────────────────────────

/**
 * Called on first portal login when getCustomerByUserId returns null.
 * Calls the portal_link_self() security-definer RPC which matches
 * auth.email() → customers.email (case-insensitive) and sets portal_user_id.
 * Returns the now-linked customer, or null if no match was found.
 */
export async function linkCustomerByEmail(
  client: SupabaseClient,
  userId: string,
): Promise<PortalCustomer | null> {
  const { error } = await client.rpc('portal_link_self')
  if (error) throw error

  // Re-fetch the (now linked) customer
  return getCustomerByUserId(client, userId)
}

/**
 * Portal client approves a change order via the portal_approve_change_order()
 * security-definer RPC. The function validates the caller is the job's
 * client and that the CO is still pending approval.
 */
export async function approvePortalChangeOrder(
  client: SupabaseClient,
  coId: string,
): Promise<void> {
  const { error } = await client.rpc(
    'portal_approve_change_order',
    { p_co_id: coId } as unknown as never,
  )
  if (error) throw error
}

/**
 * Portal client approves a milestone via the portal_approve_milestone()
 * security-definer RPC. The function validates the caller is the job's
 * client and that the milestone actually requires approval.
 */
export async function approvePortalMilestone(
  client: SupabaseClient,
  milestoneId: string,
): Promise<void> {
  const { error } = await client.rpc(
    'portal_approve_milestone',
    { p_milestone_id: milestoneId } as unknown as never,
  )
  if (error) throw error
}

export interface UpsertPortalSelectionInput {
  categoryId: string
  projectId: string
  tenantId: string
  customerId: string
  optionId: string | null
  customDescription?: string | null
  customVendor?: string | null
  notes?: string | null
}

/**
 * Creates or updates the client's selection for a category.
 * client_selections has a UNIQUE constraint on category_id, so upserting
 * on that column is safe — one selection per category per project.
 */
export async function upsertPortalSelection(
  client: SupabaseClient,
  input: UpsertPortalSelectionInput,
): Promise<void> {
  const { error } = await client
    .from('client_selections')
    .upsert(
      {
        category_id:        input.categoryId,
        project_id:         input.projectId,
        tenant_id:          input.tenantId,
        customer_id:        input.customerId,
        option_id:          input.optionId,
        custom_description: input.customDescription ?? null,
        custom_vendor:      input.customVendor ?? null,
        notes:              input.notes ?? null,
        selected_at:        new Date().toISOString(),
      } as unknown as never,
      { onConflict: 'category_id' },
    )

  if (error) throw error
}

// ── Queries ────────────────────────────────────────────────────────────────

export async function getCustomerByUserId(
  client: SupabaseClient,
  userId: string,
): Promise<PortalCustomer | null> {
  // ── Primary contact path ─────────────────────────────────────────────────
  const { data, error } = await client
    .from('customers')
    .select('id, customer_name, email, phone, portal_user_id')
    .eq('portal_user_id', userId)
    .maybeSingle()

  if (error) throw error
  if (data) return data as PortalCustomer

  // ── Secondary contact path ────────────────────────────────────────────────
  // Look up via customer_portal_users → customers join.
  const { data: cpuRow, error: cpuErr } = await client
    .from('customer_portal_users')
    .select('customer:customers(id, customer_name, email, phone, portal_user_id)')
    .eq('user_id', userId)
    .maybeSingle()

  if (cpuErr) throw cpuErr
  if (!cpuRow) return null

  // Supabase returns the joined row as { customer: {...} }
  const customer = (cpuRow as unknown as { customer: PortalCustomer | null }).customer
  return customer ?? null
}

/**
 * Returns all secondary portal contacts for a customer, ordered oldest-first.
 * Used by the staff ClientTab to list and manage portal access.
 */
export async function getCustomerPortalUsers(
  client: SupabaseClient,
  customerId: string,
): Promise<CustomerPortalUser[]> {
  const { data, error } = await client
    .from('customer_portal_users')
    .select('id, customer_id, tenant_id, email, user_id, label, invited_at, linked_at, created_at')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data ?? []) as CustomerPortalUser[]
}

/**
 * Removes a secondary portal contact by row ID.
 * The removed user immediately loses portal access (is_client_on_job returns false).
 */
export async function removeCustomerPortalUser(
  client: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await client
    .from('customer_portal_users')
    .delete()
    .eq('id', id)

  if (error) throw error
}

/**
 * Used by tenant admins/owners in staff portal preview mode.
 * Returns ALL projects in the user's tenant (RLS-filtered), not scoped to a single customer.
 */
export async function getStaffPortalProjects(
  client: SupabaseClient,
): Promise<PortalProject[]> {
  const { data, error } = await client
    .from('projects')
    .select(`
      id, tenant_id, job_id, created_at,
      job:jobs (
        id, job_name, job_number,
        project_status, project_type,
        address_line1, city, state,
        contract_value_cents, current_contract_cents,
        start_date, target_completion, actual_completion
      )
    `)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as PortalProject[]
}

export async function getPortalProjects(
  client: SupabaseClient,
  _customerId: string,
): Promise<PortalProject[]> {
  // Query projects directly — the "clients view their project" RLS policy
  // (is_client_on_job) restricts rows to this customer's projects without
  // requiring a separate direct read of the jobs table.
  const { data, error } = await client
    .from('projects')
    .select(`
      id, tenant_id, job_id, created_at,
      job:jobs (
        id, job_name, job_number,
        project_status, project_type,
        address_line1, city, state,
        contract_value_cents, current_contract_cents,
        start_date, target_completion, actual_completion
      )
    `)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as PortalProject[]
}

export async function getPortalProjectData(
  client: SupabaseClient,
  projectId: string,
): Promise<PortalProjectData> {
  // Parallel: project + client-visible milestones + client-visible documents + daily logs
  const [projectRes, milestonesRes, docsRes, logsRes] = await Promise.all([
    client
      .from('projects')
      .select(`
        id, tenant_id, job_id, created_at,
        job:jobs (
          id, job_name, job_number,
          project_status, project_type,
          address_line1, city, state,
          contract_value_cents, current_contract_cents,
          start_date, target_completion, actual_completion
        )
      `)
      .eq('id', projectId)
      .single(),
    client
      .from('milestones')
      .select('id, name, status, due_date, completed_date, requires_client_approval, client_approved_at, sequence, phase_id, triggers_invoice, invoice_amount_cents, linked_invoice_id')
      .eq('project_id', projectId)
      .eq('is_client_visible', true)
      .order('due_date', { ascending: true, nullsFirst: false }),
    client
      .from('documents')
      .select('id, type, name, mime_type, file_size_bytes, created_at')
      .eq('project_id', projectId)
      .eq('is_client_visible', true)
      .order('created_at', { ascending: false }),
    client
      .from('daily_logs')
      .select('id, date, weather, temperature_f, crew_count, hours_worked, work_performed, ai_client_summary, materials_delivered, equipment_used, issues_or_delays, published_at, created_at')
      .eq('project_id', projectId)
      .eq('is_client_visible', true)
      .not('published_at', 'is', null)
      .order('date', { ascending: false }),
  ])

  if (projectRes.error)    throw projectRes.error
  if (milestonesRes.error) throw milestonesRes.error
  if (docsRes.error)       throw docsRes.error
  if (logsRes.error)       throw logsRes.error

  const project = projectRes.data as PortalProject

  // Serial: invoices + change orders both require job_id from project
  const [invoicesRes, cosRes] = await Promise.all([
    client
      .from('invoices')
      .select('id, invoice_number, invoice_date, due_date, invoice_status, status, total_cents, amount_paid_cents, balance_due_cents, sent_at, paid_at')
      .eq('job_id', project.job_id)
      // Exclude voided Indigo invoices; BB-native invoices (invoice_status null) are always included.
      // NULL != 'void' is NULL in SQL (falsy), so we must explicitly allow nulls.
      .or('invoice_status.is.null,invoice_status.neq.void')
      .order('invoice_date', { ascending: false }),
    client
      .from('job_change_orders')
      .select('id, co_number, title, description, amount_cents, co_status, status, date_submitted, approved_at, schedule_impact_days, created_at')
      .eq('job_id', project.job_id)
      // Include COs tracked via Indigo (co_status set) OR created natively in BB (co_status null,
      // fall back to BB's status column which defaults 'Pending' and is set to 'Approved' by BB).
      .or('co_status.in.(pending_approval,approved),and(co_status.is.null,status.in.(Pending,Approved))')
      .order('created_at', { ascending: true }),
  ])

  if (invoicesRes.error) throw invoicesRes.error
  if (cosRes.error)      throw cosRes.error

  return {
    project,
    milestones:   (milestonesRes.data ?? []) as PortalMilestone[],
    invoices:     (invoicesRes.data  ?? []) as PortalInvoice[],
    documents:    (docsRes.data      ?? []) as PortalDocument[],
    dailyLogs:    (logsRes.data      ?? []) as PortalDailyLog[],
    changeOrders: (cosRes.data       ?? []) as PortalChangeOrder[],
  }
}

/**
 * Fetches all client-visible selection categories for a project, with their
 * options and the customer's existing selection merged in.
 */
export async function getPortalSelections(
  client: SupabaseClient,
  projectId: string,
  customerId: string | null,
): Promise<PortalSelectionCategory[]> {
  // When customerId is null (e.g. staff preview) skip the client_selections
  // fetch — categories and options are returned but all selections are null.
  const [categoriesRes, selectionsRes] = await Promise.all([
    client
      .from('selection_categories')
      .select(`
        id, name, description, allowance_cents, status, due_date, sequence, notes,
        options:selection_options (
          id, name, description, sku, vendor, vendor_url,
          unit_price_cents, lead_time_days, sequence, is_active
        )
      `)
      .eq('project_id', projectId)
      .eq('is_client_visible', true)
      .order('sequence', { ascending: true }),
    customerId
      ? client
          .from('client_selections')
          .select('id, category_id, option_id, custom_description, custom_vendor, custom_price_cents, notes, selected_at, approved_at')
          .eq('project_id', projectId)
          .eq('customer_id', customerId)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (categoriesRes.error)  throw categoriesRes.error
  if (selectionsRes.error)  throw selectionsRes.error

  // Index existing selections by category_id for O(1) merge
  const selectionMap = new Map<string, PortalClientSelection>()
  for (const s of (selectionsRes.data ?? []) as PortalClientSelection[]) {
    selectionMap.set(s.category_id, s)
  }

  return ((categoriesRes.data ?? []) as (Omit<PortalSelectionCategory, 'selection' | 'options'> & { options: PortalSelectionOption[] })[]).map(
    (cat) => ({
      ...cat,
      options: (cat.options ?? [])
        .filter((o) => o.is_active)
        .sort((a, b) => a.sequence - b.sequence),
      selection: selectionMap.get(cat.id) ?? null,
    }),
  )
}
