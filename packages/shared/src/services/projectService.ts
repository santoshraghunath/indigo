import type { SupabaseClient } from './supabase.js'

// ── Types ──────────────────────────────────────────────────────────────────

export interface ProjectJob {
  id: string
  job_number: string
  job_name: string
  /** BB-owned field with jobs_status_check constraint — not used for Indigo display. */
  status: string
  /** Indigo lifecycle status — 'active' | 'bidding' | 'on_hold' | 'complete' | 'cancelled' | 'pending' */
  project_status: string | null
  job_type: string | null
  /** Indigo-extended field — 'custom' | 'express' | 'service' | 'warranty' | null */
  project_type: string | null
  contract_amount_cents: number | null
  contract_value_cents: number | null
  current_contract_cents: number | null
  address_line1: string | null
  address_line2: string | null
  city: string | null
  state: string | null
  zip: string | null
  job_address: string | null
  start_date: string | null
  target_completion: string | null
  actual_completion: string | null
  permit_number: string | null
  permit_issued_date: string | null
  permit_expiry_date: string | null
  has_construction_loan: boolean
  lender_name: string | null
  loan_amount_cents: number | null
  pm_user_id: string | null
  superintendent_user_id: string | null
  package_name: string | null
  description: string
  notes: string
  internal_notes: string | null
  tags: string[]
}

export interface ProjectRow {
  id: string
  tenant_id: string
  job_id: string
  created_at: string
  updated_at: string
  job: ProjectJob | null
}

export interface ProjectMilestone {
  id: string
  project_id: string
  phase_id: string | null
  name: string
  description: string | null
  due_date: string | null
  completed_date: string | null
  status: string
  sequence: number
  is_client_visible: boolean
  requires_client_approval: boolean
  triggers_draw_request: boolean
  triggers_invoice: boolean
}

export interface ProjectPhase {
  id: string
  project_id: string
  tenant_id: string
  name: string
  sequence: number
  start_date: string | null
  end_date: string | null
  status: string
  color: string | null
  description: string | null
  created_at: string
  updated_at: string
  milestones: ProjectMilestone[]
}

// ── List (lean — only what the card needs) ────────────────────────────────

export async function getProjects(client: SupabaseClient, tenantId: string) {
  const { data, error } = await client
    .from('projects')
    .select(`
      id,
      tenant_id,
      job_id,
      created_at,
      updated_at,
      job:jobs (
        id,
        job_number,
        job_name,
        status,
        project_status,
        job_type,
        project_type,
        contract_amount_cents,
        contract_value_cents,
        current_contract_cents,
        address_line1,
        city,
        state,
        zip,
        start_date,
        target_completion,
        actual_completion,
        pm_user_id,
        superintendent_user_id,
        package_name,
        tags
      )
    `)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as ProjectRow[]
}

// ── Single project (full detail) ───────────────────────────────────────────

export async function getProject(client: SupabaseClient, projectId: string) {
  const { data, error } = await client
    .from('projects')
    .select(`
      id,
      tenant_id,
      job_id,
      created_at,
      updated_at,
      job:jobs (
        id,
        job_number,
        job_name,
        status,
        project_status,
        job_type,
        project_type,
        contract_amount_cents,
        contract_value_cents,
        current_contract_cents,
        address_line1,
        address_line2,
        city,
        state,
        zip,
        job_address,
        start_date,
        target_completion,
        actual_completion,
        permit_number,
        permit_issued_date,
        permit_expiry_date,
        has_construction_loan,
        lender_name,
        loan_amount_cents,
        pm_user_id,
        superintendent_user_id,
        package_name,
        description,
        notes,
        internal_notes,
        tags
      )
    `)
    .eq('id', projectId)
    .single()

  if (error) throw error
  return data as ProjectRow
}

// ── Financials types ───────────────────────────────────────────────────────

export interface ProjectChangeOrder {
  id: string
  co_number: string
  title: string | null
  description: string
  amount_cents: number
  co_status: string | null
  date_submitted: string | null
  approved_at: string | null
  schedule_impact_days: number | null
  created_at: string
}

export interface ProjectDrawRequest {
  id: string
  number: number
  status: string
  amount_requested_cents: number
  amount_approved_cents: number
  amount_funded_cents: number
  percent_complete_at_draw: number | null
  submitted_at: string | null
  approved_at: string | null
  funded_at: string | null
  notes: string | null
}

export interface ProjectDrawSchedule {
  id: string
  lender_name: string | null
  lender_contact: string | null
  lender_email: string | null
  loan_amount_cents: number | null
  holdback_pct: number
  created_at: string
  draw_requests: ProjectDrawRequest[]
}

export interface ProjectInvoice {
  id: string
  invoice_number: string
  invoice_date: string
  due_date: string
  invoice_status: string | null
  total_cents: number
  amount_paid_cents: number
  balance_due_cents: number
  sent_at: string | null
  paid_at: string | null
}

// ── Documents types ────────────────────────────────────────────────────────

export interface ProjectDocumentFolder {
  id: string
  name: string
  type: string | null
  sequence: number
  is_client_visible: boolean
  parent_id: string | null
}

export interface ProjectDocument {
  id: string
  folder_id: string | null
  type: string
  name: string
  description: string | null
  mime_type: string | null
  file_size_bytes: number | null
  version: number
  is_client_visible: boolean
  tags: string[]
  uploaded_by: string | null
  created_at: string
  updated_at: string
}

// ── Phases + milestones ────────────────────────────────────────────────────

export async function getProjectPhases(
  client: SupabaseClient,
  projectId: string,
  tenantId: string,
) {
  const { data, error } = await client
    .from('project_phases')
    .select(`
      id,
      project_id,
      tenant_id,
      name,
      sequence,
      start_date,
      end_date,
      status,
      color,
      description,
      created_at,
      updated_at,
      milestones (
        id,
        project_id,
        phase_id,
        name,
        description,
        due_date,
        completed_date,
        status,
        sequence,
        is_client_visible,
        requires_client_approval,
        triggers_draw_request,
        triggers_invoice
      )
    `)
    .eq('project_id', projectId)
    .eq('tenant_id', tenantId)
    .order('sequence', { ascending: true })

  if (error) throw error
  return (data ?? []) as ProjectPhase[]
}

// ── Change orders ──────────────────────────────────────────────────────────

export async function getProjectChangeOrders(
  client: SupabaseClient,
  jobId: string,
  tenantId: string,
): Promise<ProjectChangeOrder[]> {
  const { data, error } = await client
    .from('job_change_orders')
    .select(`
      id, co_number, title, description, amount_cents,
      co_status, date_submitted, approved_at,
      schedule_impact_days, created_at
    `)
    .eq('job_id', jobId)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data ?? []) as ProjectChangeOrder[]
}

// ── Draw schedule ──────────────────────────────────────────────────────────

export async function getProjectDrawSchedule(
  client: SupabaseClient,
  jobId: string,
  tenantId: string,
): Promise<ProjectDrawSchedule | null> {
  const { data, error } = await client
    .from('draw_schedules')
    .select(`
      id, lender_name, lender_contact, lender_email,
      loan_amount_cents, holdback_pct, created_at,
      draw_requests (
        id, number, status,
        amount_requested_cents, amount_approved_cents, amount_funded_cents,
        percent_complete_at_draw, submitted_at, approved_at, funded_at, notes
      )
    `)
    .eq('job_id', jobId)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return data as ProjectDrawSchedule | null
}

// ── Client invoices ────────────────────────────────────────────────────────

export async function getProjectInvoices(
  client: SupabaseClient,
  jobId: string,
  tenantId: string,
): Promise<ProjectInvoice[]> {
  const { data, error } = await client
    .from('invoices')
    .select(`
      id, invoice_number, invoice_date, due_date,
      invoice_status, total_cents, amount_paid_cents,
      balance_due_cents, sent_at, paid_at
    `)
    .eq('job_id', jobId)
    .eq('tenant_id', tenantId)
    .order('invoice_date', { ascending: false })

  if (error) throw error
  return (data ?? []) as ProjectInvoice[]
}

// ── Documents ──────────────────────────────────────────────────────────────

export async function getProjectDocuments(
  client: SupabaseClient,
  projectId: string,
  tenantId: string,
): Promise<{ folders: ProjectDocumentFolder[]; documents: ProjectDocument[] }> {
  const [foldersRes, docsRes] = await Promise.all([
    client
      .from('document_folders')
      .select('id, name, type, sequence, is_client_visible, parent_id')
      .eq('project_id', projectId)
      .eq('tenant_id', tenantId)
      .order('sequence', { ascending: true }),
    client
      .from('documents')
      .select(`
        id, folder_id, type, name, description, mime_type,
        file_size_bytes, version, is_client_visible, tags,
        uploaded_by, created_at, updated_at
      `)
      .eq('project_id', projectId)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false }),
  ])

  if (foldersRes.error) throw foldersRes.error
  if (docsRes.error) throw docsRes.error

  return {
    folders:   (foldersRes.data ?? []) as ProjectDocumentFolder[],
    documents: (docsRes.data ?? []) as ProjectDocument[],
  }
}
