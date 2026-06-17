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
  invoice_amount_cents: number | null
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
  reason: string | null
  notes: string | null
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
        triggers_invoice,
        invoice_amount_cents
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
      schedule_impact_days, reason, notes, created_at
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

// ── Invoice-trigger milestones ─────────────────────────────────────────────

export type InvoiceTriggerState = 'pending' | 'ready' | 'invoiced'

export interface InvoiceTriggerMilestone {
  id:                   string
  project_id:           string
  phase_id:             string | null
  name:                 string
  status:               string
  due_date:             string | null
  completed_date:       string | null
  sequence:             number
  /** PM-configured billing amount in cents; null = not yet set */
  invoice_amount_cents: number | null
  /**
   * Indigo-managed FK to the BB invoice raised for this milestone.
   * Set by PM via the "Link Invoice" picker after BB creates the invoice.
   * NULL = not yet linked.
   * (milestones.linked_invoice_id — migration 021)
   */
  linked_invoice_id:    string | null
  /** Flattened from joined invoice row */
  invoice_id:           string | null
  invoice_number:       string | null
  invoice_status:       string | null
}

/** Derives display state from the milestone + invoice linkage. */
export function getInvoiceTriggerState(m: InvoiceTriggerMilestone): InvoiceTriggerState {
  if (m.invoice_id) return 'invoiced'
  if (m.status === 'complete' || m.status === 'approved') return 'ready'
  return 'pending'
}

/**
 * Returns all milestones with triggers_invoice = true for a project,
 * each decorated with the linked invoice header (if any).
 *
 * Uses milestones.linked_invoice_id (forward FK, Indigo-managed) rather
 * than the original invoices.milestone_id backref. BB never writes
 * invoices.milestone_id, so the backref was always empty — milestones
 * stayed stuck in 'ready' even after BB invoiced them.
 * PMs set linked_invoice_id via the "Link Invoice" picker in FinancialsTab.
 */
export async function getInvoiceTriggerMilestones(
  client: SupabaseClient,
  projectId: string,
): Promise<InvoiceTriggerMilestone[]> {
  // Step 1: fetch the milestones — no FK join, so this works even when the
  // milestones.linked_invoice_id → invoices FK constraint is missing.
  // (The FK was absent due to a migration bug fixed in 035.)
  const { data, error } = await client
    .from('milestones')
    .select(`
      id, project_id, phase_id, name, status,
      due_date, completed_date, sequence, invoice_amount_cents,
      linked_invoice_id
    `)
    .eq('project_id', projectId)
    .eq('triggers_invoice', true)
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('sequence', { ascending: true })

  if (error) throw error

  const rows = (data ?? []) as {
    id: string; project_id: string; phase_id: string | null
    name: string; status: string; due_date: string | null
    completed_date: string | null; sequence: number
    invoice_amount_cents: number | null
    linked_invoice_id: string | null
  }[]

  // Step 2: batch-fetch invoice headers for any milestones that are linked.
  const linkedIds = [...new Set(rows.map((r) => r.linked_invoice_id).filter(Boolean))] as string[]

  const invoiceMap: Record<string, { id: string; invoice_number: string; invoice_status: string }> = {}
  if (linkedIds.length > 0) {
    const { data: invData } = await client
      .from('invoices')
      .select('id, invoice_number, invoice_status')
      .in('id', linkedIds)
    for (const inv of invData ?? []) {
      invoiceMap[(inv as { id: string; invoice_number: string; invoice_status: string }).id] =
        inv as { id: string; invoice_number: string; invoice_status: string }
    }
  }

  return rows.map((row) => {
    const inv = row.linked_invoice_id ? (invoiceMap[row.linked_invoice_id] ?? null) : null
    return {
      id:                   row.id,
      project_id:           row.project_id,
      phase_id:             row.phase_id,
      name:                 row.name,
      status:               row.status,
      due_date:             row.due_date,
      completed_date:       row.completed_date,
      sequence:             row.sequence,
      invoice_amount_cents: row.invoice_amount_cents,
      linked_invoice_id:    row.linked_invoice_id,
      invoice_id:           inv?.id             ?? null,
      invoice_number:       inv?.invoice_number ?? null,
      invoice_status:       inv?.invoice_status ?? null,
    }
  })
}

/**
 * Links (or unlinks) a BB invoice to an invoice-trigger milestone.
 * Pass null to clear the link.
 * This is the write side of the migration 021 fix.
 */
export async function linkMilestoneInvoice(
  client: SupabaseClient,
  milestoneId: string,
  tenantId: string,
  invoiceId: string | null,
): Promise<void> {
  const { error } = await client
    .from('milestones')
    .update({ linked_invoice_id: invoiceId } as unknown as never)
    .eq('id', milestoneId)
    .eq('tenant_id', tenantId)
  if (error) throw error
}

/**
 * Sets the billing amount for a single invoice-trigger milestone.
 * Pass null to clear it.
 */
export async function updateMilestoneInvoiceAmount(
  client: SupabaseClient,
  milestoneId: string,
  tenantId: string,
  amountCents: number | null,
): Promise<void> {
  const { error } = await client
    .from('milestones')
    .update({ invoice_amount_cents: amountCents } as unknown as never)
    .eq('id', milestoneId)
    .eq('tenant_id', tenantId)
  if (error) throw error
}

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

// ── Field types ────────────────────────────────────────────────────────────

export interface ProjectRfi {
  id: string
  number: number
  subject: string
  question: string
  answer: string | null
  status: string
  priority: string
  due_date: string | null
  submitted_at: string | null
  answered_at: string | null
  cost_impact_cents: number | null
  schedule_impact_days: number | null
  created_at: string
}

export interface ProjectPunchItem {
  id: string
  title: string
  description: string | null
  location: string | null
  trade: string | null
  priority: string
  status: string
  due_date: string | null
  closed_at: string | null
  is_client_visible: boolean
  client_notes: string | null
  created_at: string
}

export interface ProjectSubmittal {
  id: string
  number: string
  title: string
  type: string | null
  spec_section: string | null
  status: string
  revision: number
  required_by: string | null
  submitted_at: string | null
  reviewed_at: string | null
  review_notes: string | null
  created_at: string
}

export interface ProjectDailyLog {
  id: string
  date: string
  /** Distinguishes client-facing summaries from internal worker reports. */
  log_type: 'summary' | 'field_associate' | 'subcontractor'
  author_id: string
  /** Joined from user_profiles — present for internal reports shown to PM. */
  author_profile: { first_name: string | null; last_name: string | null } | null
  weather: string | null
  temperature_f: number | null
  crew_count: number | null
  hours_worked: number | null
  work_performed: string
  materials_delivered: string | null
  equipment_used: string | null
  issues_or_delays: string | null
  is_client_visible: boolean
  published_at: string | null
  created_at: string
}

// ── Subs types ─────────────────────────────────────────────────────────────

export interface ProjectSubcontractInvoice {
  id: string
  sub_invoice_number: string
  invoice_date: string
  milestone_description: string
  amount_billed_cents: number
  sub_invoice_status: string | null
  lien_waiver_review_status: string | null
  payment_date: string | null
  notes: string
}

export interface ProjectSubcontract {
  id: string
  reference_number: string
  description: string
  execution_date: string | null
  original_value_cents: number
  subcontract_status: string | null
  created_at: string
  subcontractor: {
    id: string
    name: string
    contact_name: string
    email: string
    phone: string
    subcontractor_status: string | null
    coi_expiration: string | null
    license_expiration: string | null
    is_preferred: boolean
  } | null
  subcontract_invoices: ProjectSubcontractInvoice[]
}

export interface ProjectLienWaiver {
  id: string
  type: string
  amount_cents: number
  through_date: string
  received_at: string | null
  created_at: string
  subcontractor: { id: string; name: string } | null
}

// ── Punch list mutations ───────────────────────────────────────────────────

export interface CreatePunchListItemInput {
  title: string
  description?: string | null
  location?: string | null
  trade?: string | null
  priority?: 'low' | 'normal' | 'high' | 'blocking'
  due_date?: string | null
  is_client_visible?: boolean
}

export interface UpdatePunchListItemInput {
  title?: string
  description?: string | null
  location?: string | null
  trade?: string | null
  priority?: 'low' | 'normal' | 'high' | 'blocking'
  due_date?: string | null
  status?: 'open' | 'in_progress' | 'ready_for_review' | 'closed' | 'void'
  is_client_visible?: boolean
}

export async function createPunchListItem(
  client: SupabaseClient,
  tenantId: string,
  projectId: string,
  userId: string,
  input: CreatePunchListItemInput,
): Promise<{ id: string }> {
  const { data, error } = await client
    .from('punch_list_items')
    .insert({
      tenant_id:   tenantId,
      project_id:  projectId,
      created_by:  userId,
      title:             input.title,
      description:       input.description       ?? null,
      location:          input.location          ?? null,
      trade:             input.trade             ?? null,
      priority:          input.priority          ?? 'normal',
      due_date:          input.due_date          ?? null,
      is_client_visible: input.is_client_visible ?? false,
    } as unknown as never)
    .select('id')
    .single()
  if (error) throw error
  return data as { id: string }
}

export async function updatePunchListItem(
  client: SupabaseClient,
  id: string,
  input: UpdatePunchListItemInput,
): Promise<void> {
  const payload: Record<string, unknown> = { ...input }
  // Auto-set closed_at when resolving to closed, clear it on any other status change
  if (input.status === 'closed') {
    payload.closed_at = new Date().toISOString()
  } else if (input.status) {
    payload.closed_at = null
  }
  const { error } = await client
    .from('punch_list_items')
    .update(payload as unknown as never)
    .eq('id', id)
  if (error) throw error
}

export async function deletePunchListItem(
  client: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await client
    .from('punch_list_items')
    .delete()
    .eq('id', id)
  if (error) throw error
}

// ── Field queries ──────────────────────────────────────────────────────────

export async function getProjectFieldData(
  client: SupabaseClient,
  projectId: string,
  tenantId: string,
) {
  const [rfisRes, punchRes, submittalsRes, logsRes] = await Promise.all([
    client
      .from('rfis')
      .select('id, number, subject, question, answer, status, priority, due_date, submitted_at, answered_at, cost_impact_cents, schedule_impact_days, created_at')
      .eq('project_id', projectId)
      .eq('tenant_id', tenantId)
      .order('number', { ascending: false }),
    client
      .from('punch_list_items')
      .select('id, title, description, location, trade, priority, status, due_date, closed_at, created_at')
      .eq('project_id', projectId)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false }),
    client
      .from('submittals')
      .select('id, number, title, type, spec_section, status, revision, required_by, submitted_at, reviewed_at, review_notes, created_at')
      .eq('project_id', projectId)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false }),
    client
      .from('daily_logs')
      .select('id, date, log_type, author_id, author_profile:user_profiles!daily_logs_author_id_fkey(first_name,last_name), weather, temperature_f, crew_count, hours_worked, work_performed, materials_delivered, equipment_used, issues_or_delays, is_client_visible, published_at, created_at')
      .eq('project_id', projectId)
      .eq('tenant_id', tenantId)
      .order('date', { ascending: false }),
  ])

  if (rfisRes.error) throw rfisRes.error
  if (punchRes.error) throw punchRes.error
  if (submittalsRes.error) throw submittalsRes.error
  if (logsRes.error) throw logsRes.error

  const allLogs = (logsRes.data ?? []) as ProjectDailyLog[]

  return {
    rfis:            (rfisRes.data       ?? []) as ProjectRfi[],
    punchItems:      (punchRes.data      ?? []) as ProjectPunchItem[],
    submittals:      (submittalsRes.data ?? []) as ProjectSubmittal[],
    /** Client-facing PM summaries (log_type = 'summary') */
    summaryLogs:     allLogs.filter((l) => l.log_type === 'summary'),
    /** Internal field-associate and subcontractor reports */
    internalReports: allLogs.filter((l) => l.log_type !== 'summary'),
  }
}

// ── Subs queries ───────────────────────────────────────────────────────────

export async function getProjectSubcontracts(
  client: SupabaseClient,
  jobId: string,
  tenantId: string,
): Promise<ProjectSubcontract[]> {
  const { data, error } = await client
    .from('subcontracts')
    .select(`
      id, reference_number, description, execution_date,
      original_value_cents, subcontract_status, created_at,
      subcontractor:subcontractors (
        id, name, contact_name, email, phone,
        subcontractor_status, coi_expiration, license_expiration, is_preferred
      ),
      subcontract_invoices (
        id, sub_invoice_number, invoice_date, milestone_description,
        amount_billed_cents, sub_invoice_status, lien_waiver_review_status,
        payment_date, notes
      )
    `)
    .eq('job_id', jobId)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data ?? []) as unknown as ProjectSubcontract[]
}

export async function getProjectLienWaivers(
  client: SupabaseClient,
  projectId: string,
  tenantId: string,
): Promise<ProjectLienWaiver[]> {
  const { data, error } = await client
    .from('lien_waivers')
    .select(`
      id, type, amount_cents, through_date, received_at, created_at,
      subcontractor:subcontractors (id, name)
    `)
    .eq('project_id', projectId)
    .eq('tenant_id', tenantId)
    .order('through_date', { ascending: false })

  if (error) throw error
  return (data ?? []) as unknown as ProjectLienWaiver[]
}

// ── Customer lookup ────────────────────────────────────────────────────────

export interface CustomerListItem {
  id: string
  customer_name: string
  email: string
}

/** Full customer record including portal linkage status */
export interface JobCustomer {
  id: string
  customer_name: string
  email: string
  phone: string | null
  portal_user_id: string | null
}

/**
 * Fetches the customer linked to a job.
 * Used by the staff ClientTab to show portal status + send invites.
 */
export async function getJobCustomer(
  client: SupabaseClient,
  jobId: string,
): Promise<JobCustomer | null> {
  // First resolve customer_id from the job
  const { data: job, error: jobError } = await client
    .from('jobs')
    .select('customer_id')
    .eq('id', jobId)
    .single()

  if (jobError) throw jobError
  const customerId = (job as { customer_id: string | null })?.customer_id
  if (!customerId) return null

  const { data, error } = await client
    .from('customers')
    .select('id, customer_name, email, phone, portal_user_id')
    .eq('id', customerId)
    .maybeSingle()

  if (error) throw error
  return data as JobCustomer | null
}

/**
 * Toggles the is_client_visible flag on a single milestone.
 * Used by the staff ClientTab to control portal visibility per milestone.
 */
export async function setMilestoneClientVisible(
  client: SupabaseClient,
  milestoneId: string,
  isVisible: boolean,
): Promise<void> {
  const { error } = await client
    .from('milestones')
    .update({ is_client_visible: isVisible } as unknown as never)
    .eq('id', milestoneId)

  if (error) throw error
}

export async function getCustomers(
  client: SupabaseClient,
  tenantId: string,
): Promise<CustomerListItem[]> {
  const { data, error } = await client
    .from('customers')
    .select('id, customer_name, email')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('customer_name', { ascending: true })

  if (error) throw error
  return (data ?? []) as CustomerListItem[]
}

// ── Create project ─────────────────────────────────────────────────────────

export interface CreateProjectInput {
  job_name: string
  job_number: string
  customer_id: string
  project_status?: string
  project_type?: string
  address_line1?: string
  city?: string
  county?: string
  state?: string
  zip?: string
  start_date?: string
  target_completion?: string
  contract_value_cents?: number
  description?: string
}

export async function createProject(
  client: SupabaseClient,
  tenantId: string,
  userId: string,
  input: CreateProjectInput,
): Promise<{ projectId: string; jobId: string }> {
  // CRITICAL: Never set jobs.status or jobs.job_type — BB-owned fields with
  // check constraints (jobs_status_check, jobs_job_type_check). Let them default.
  const { data: job, error: jobError } = await client
    .from('jobs')
    .insert({
      tenant_id:              tenantId,
      job_number:             input.job_number,
      job_name:               input.job_name,
      customer_id:            input.customer_id,
      project_status:         input.project_status         ?? 'bidding',
      project_type:           input.project_type           ?? null,
      address_line1:          input.address_line1          ?? null,
      city:                   input.city                   ?? null,
      county:                 input.county                 ?? null,
      state:                  input.state                  ?? null,
      zip:                    input.zip                    ?? null,
      start_date:             input.start_date             ?? null,
      target_completion:      input.target_completion      ?? null,
      contract_value_cents:   input.contract_value_cents   ?? null,
      current_contract_cents: input.contract_value_cents   ?? null,
      description:            input.description            ?? '',
    } as unknown as never)
    .select('id')
    .single()

  if (jobError) throw jobError

  const jobId = (job as { id: string }).id

  const { data: project, error: projectError } = await client
    .from('projects')
    .insert({
      tenant_id:  tenantId,
      job_id:     jobId,
      created_by: userId,
    } as unknown as never)
    .select('id')
    .single()

  if (projectError) throw projectError

  return {
    jobId,
    projectId: (project as { id: string }).id,
  }
}

// ── Phase mutations ────────────────────────────────────────────────────────

export interface UpsertPhaseInput {
  id?: string
  name: string
  status: string
  start_date?: string | null
  end_date?: string | null
  color?: string | null
  description?: string | null
  sequence: number
}

export async function upsertPhase(
  client: SupabaseClient,
  tenantId: string,
  projectId: string,
  input: UpsertPhaseInput,
): Promise<{ id: string }> {
  if (input.id) {
    const { data, error } = await client
      .from('project_phases')
      .update({
        name:        input.name,
        status:      input.status,
        start_date:  input.start_date  ?? null,
        end_date:    input.end_date    ?? null,
        color:       input.color       ?? null,
        description: input.description ?? null,
        sequence:    input.sequence,
      } as unknown as never)
      .eq('id', input.id)
      .eq('tenant_id', tenantId)
      .select('id')
      .single()
    if (error) throw error
    return data as { id: string }
  }

  const { data, error } = await client
    .from('project_phases')
    .insert({
      tenant_id:   tenantId,
      project_id:  projectId,
      name:        input.name,
      status:      input.status,
      start_date:  input.start_date  ?? null,
      end_date:    input.end_date    ?? null,
      color:       input.color       ?? null,
      description: input.description ?? null,
      sequence:    input.sequence,
    } as unknown as never)
    .select('id')
    .single()
  if (error) throw error
  return data as { id: string }
}

export async function deletePhase(
  client: SupabaseClient,
  phaseId: string,
  tenantId: string,
): Promise<void> {
  // Delete milestones in this phase first
  await client
    .from('milestones')
    .delete()
    .eq('phase_id', phaseId)
    .eq('tenant_id', tenantId)

  const { error } = await client
    .from('project_phases')
    .delete()
    .eq('id', phaseId)
    .eq('tenant_id', tenantId)
  if (error) throw error
}

// ── Milestone mutations ────────────────────────────────────────────────────

export interface UpsertMilestoneInput {
  id?: string
  phase_id?: string | null
  name: string
  description?: string | null
  due_date?: string | null
  completed_date?: string | null
  status: string
  sequence: number
  is_client_visible: boolean
  requires_client_approval: boolean
  triggers_draw_request: boolean
  triggers_invoice: boolean
  /** Billing amount in cents for invoice-trigger milestones. */
  invoice_amount_cents?: number | null
}

export async function upsertMilestone(
  client: SupabaseClient,
  tenantId: string,
  projectId: string,
  input: UpsertMilestoneInput,
): Promise<{ id: string }> {
  if (input.id) {
    const { data, error } = await client
      .from('milestones')
      .update({
        phase_id:                input.phase_id                ?? null,
        name:                    input.name,
        description:             input.description             ?? null,
        due_date:                input.due_date                ?? null,
        completed_date:          input.completed_date          ?? null,
        status:                  input.status,
        sequence:                input.sequence,
        is_client_visible:       input.is_client_visible,
        requires_client_approval: input.requires_client_approval,
        triggers_draw_request:   input.triggers_draw_request,
        triggers_invoice:        input.triggers_invoice,
        ...(input.invoice_amount_cents !== undefined
          ? { invoice_amount_cents: input.invoice_amount_cents }
          : {}),
      } as unknown as never)
      .eq('id', input.id)
      .eq('tenant_id', tenantId)
      .select('id')
      .single()
    if (error) throw error
    return data as { id: string }
  }

  const { data, error } = await client
    .from('milestones')
    .insert({
      tenant_id:               tenantId,
      project_id:              projectId,
      phase_id:                input.phase_id                ?? null,
      name:                    input.name,
      description:             input.description             ?? null,
      due_date:                input.due_date                ?? null,
      completed_date:          input.completed_date          ?? null,
      status:                  input.status,
      sequence:                input.sequence,
      is_client_visible:       input.is_client_visible,
      requires_client_approval: input.requires_client_approval,
      triggers_draw_request:   input.triggers_draw_request,
      triggers_invoice:        input.triggers_invoice,
      invoice_amount_cents:    input.invoice_amount_cents ?? null,
    } as unknown as never)
    .select('id')
    .single()
  if (error) throw error
  return data as { id: string }
}

export async function deleteMilestone(
  client: SupabaseClient,
  milestoneId: string,
  tenantId: string,
): Promise<void> {
  const { error } = await client
    .from('milestones')
    .delete()
    .eq('id', milestoneId)
    .eq('tenant_id', tenantId)
  if (error) throw error
}

// ── Change order mutations ─────────────────────────────────────────────────

export interface CreateChangeOrderInput {
  co_number: string
  title?: string | null
  description?: string | null
  amount_cents: number
  co_status: string
  date_submitted?: string | null
  schedule_impact_days?: number | null
  reason?: string | null
  notes?: string | null
}

export async function createChangeOrder(
  client: SupabaseClient,
  tenantId: string,
  jobId: string,
  userId: string,
  input: CreateChangeOrderInput,
): Promise<{ id: string }> {
  // CRITICAL: Never set job_change_orders.status — BB-owned with check constraint
  // (default 'Pending'). Track Indigo state in co_status instead.
  const { data, error } = await client
    .from('job_change_orders')
    .insert({
      tenant_id:             tenantId,
      job_id:                jobId,
      co_number:             input.co_number,
      title:                 input.title               ?? null,
      description:           input.description         ?? '',
      amount_cents:          input.amount_cents,
      co_status:             input.co_status,
      date_submitted:        input.date_submitted      ?? null,
      schedule_impact_days:  input.schedule_impact_days ?? null,
      reason:                input.reason              ?? null,
      notes:                 input.notes               ?? '',
      requested_by_user_id:  userId,
    } as unknown as never)
    .select('id')
    .single()
  if (error) throw error
  return data as { id: string }
}

// ── Update / withdraw change order ────────────────────────────────────────

export interface UpdateChangeOrderInput {
  co_number?: string
  title?: string | null
  description?: string | null
  amount_cents?: number
  /** Only editable for draft and pending_approval COs */
  co_status?: string
  date_submitted?: string | null
  schedule_impact_days?: number | null
  reason?: string | null
  notes?: string | null
}

export async function updateChangeOrder(
  client: SupabaseClient,
  coId: string,
  input: UpdateChangeOrderInput,
): Promise<void> {
  // description and notes are NOT NULL columns — coerce null to '' to match
  // the same guard applied in createChangeOrder.
  const payload = {
    ...input,
    ...('description' in input && { description: input.description ?? '' }),
    ...('notes'       in input && { notes:       input.notes       ?? '' }),
  }
  const { error } = await client
    .from('job_change_orders')
    .update(payload as unknown as never)
    .eq('id', coId)
  if (error) throw error
}

/** Resets co_status back to 'draft', unlocking the CO for editing. */
export async function withdrawChangeOrder(
  client: SupabaseClient,
  coId: string,
): Promise<void> {
  const { error } = await client
    .from('job_change_orders')
    .update({ co_status: 'draft' } as unknown as never)
    .eq('id', coId)
  if (error) throw error
}

// ── Daily log photos ──────────────────────────────────────────────────────
// daily_log_photos (from migration 008) is a join table between daily_logs
// and documents. Each photo is a documents row (type='photo',
// storage_bucket='project-photos') plus a daily_log_photos linking row.
//
// Storage path: {tenantId}/daily-logs/{logId}/{uuid}.{ext}

export const PHOTO_BUCKET = 'project-photos'
const SIGNED_URL_EXPIRY = 3_600 // seconds (1 hour)

export interface DailyLogPhoto {
  /** daily_log_photos.id */
  id: string
  daily_log_id: string
  document_id: string
  caption: string | null
  sequence: number
  is_client_visible: boolean
  created_at: string
  // Flattened from joined documents row:
  storage_path: string
  storage_bucket: string
  mime_type: string | null
  file_size_bytes: number | null
  /** Batch-signed URL — valid for 1 hour */
  signedUrl: string
}

/**
 * Uploads a photo to project-photos, creates a documents row (type='photo'),
 * then links it via daily_log_photos. Returns the new record with signed URL.
 */
export async function uploadDailyLogPhoto(
  client: SupabaseClient,
  tenantId: string,
  projectId: string,
  logId: string,
  userId: string,
  file: File,
  caption?: string | null,
): Promise<DailyLogPhoto> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const uuid = crypto.randomUUID()
  const storagePath = `${tenantId}/daily-logs/${logId}/${uuid}.${ext}`

  // 1. Upload to storage
  const { error: uploadError } = await client.storage
    .from(PHOTO_BUCKET)
    .upload(storagePath, file, { upsert: false })
  if (uploadError) throw uploadError

  // 2. Insert documents row
  const { data: doc, error: docError } = await client
    .from('documents')
    .insert({
      tenant_id:       tenantId,
      project_id:      projectId,
      type:            'photo',
      name:            file.name,
      storage_bucket:  PHOTO_BUCKET,
      storage_path:    storagePath,
      mime_type:       file.type || null,
      file_size_bytes: file.size,
      uploaded_by:     userId,
      is_client_visible: false,
    } as unknown as never)
    .select('id')
    .single()

  if (docError) {
    await client.storage.from(PHOTO_BUCKET).remove([storagePath]).catch(() => null)
    throw docError
  }

  const documentId = (doc as { id: string }).id

  // 3. Insert daily_log_photos linking row
  const { data: photo, error: photoError } = await client
    .from('daily_log_photos')
    .insert({
      daily_log_id:      logId,
      document_id:       documentId,
      caption:           caption ?? null,
      sequence:          0,
      is_client_visible: true,
    } as unknown as never)
    .select('id, daily_log_id, document_id, caption, sequence, is_client_visible, created_at')
    .single()

  if (photoError) {
    // Best-effort rollback
    await Promise.resolve(client.from('documents').delete().eq('id', documentId)).catch(() => null)
    await client.storage.from(PHOTO_BUCKET).remove([storagePath]).catch(() => null)
    throw photoError
  }

  // 4. Sign URL for immediate display
  const { data: signed, error: signError } = await client.storage
    .from(PHOTO_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_EXPIRY)
  if (signError) throw signError

  return {
    ...(photo as Omit<DailyLogPhoto, 'storage_path' | 'storage_bucket' | 'mime_type' | 'file_size_bytes' | 'signedUrl'>),
    storage_path:    storagePath,
    storage_bucket:  PHOTO_BUCKET,
    mime_type:       file.type || null,
    file_size_bytes: file.size,
    signedUrl:       signed.signedUrl,
  }
}

/**
 * Fetches all photos for a daily log, joining through documents for the
 * storage path, then batch-signs all URLs in one round-trip (Option B).
 */
export async function getDailyLogPhotos(
  client: SupabaseClient,
  logId: string,
): Promise<DailyLogPhoto[]> {
  const { data, error } = await client
    .from('daily_log_photos')
    .select(`
      id, daily_log_id, document_id, caption, sequence, is_client_visible, created_at,
      document:documents ( storage_path, storage_bucket, mime_type, file_size_bytes )
    `)
    .eq('daily_log_id', logId)
    .order('sequence', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) throw error
  type RawRow = {
    id: string; daily_log_id: string; document_id: string
    caption: string | null; sequence: number; is_client_visible: boolean; created_at: string
    document: { storage_path: string; storage_bucket: string; mime_type: string | null; file_size_bytes: number | null } | null
  }
  const rows = (data ?? []) as RawRow[]
  const valid = rows.filter((r) => r.document !== null)
  if (valid.length === 0) return []

  // Batch-sign all URLs — one storage API call regardless of photo count
  const { data: signed, error: signError } = await client.storage
    .from(PHOTO_BUCKET)
    .createSignedUrls(
      valid.map((r) => r.document!.storage_path),
      SIGNED_URL_EXPIRY,
    )
  if (signError) throw signError

  const urlMap = new Map((signed ?? []).map((s) => [s.path, s.signedUrl ?? '']))

  return valid.map((r) => ({
    id:               r.id,
    daily_log_id:     r.daily_log_id,
    document_id:      r.document_id,
    caption:          r.caption,
    sequence:         r.sequence,
    is_client_visible: r.is_client_visible,
    created_at:       r.created_at,
    storage_path:     r.document!.storage_path,
    storage_bucket:   r.document!.storage_bucket,
    mime_type:        r.document!.mime_type,
    file_size_bytes:  r.document!.file_size_bytes,
    signedUrl:        urlMap.get(r.document!.storage_path) ?? '',
  }))
}

/**
 * Deletes in safe order: storage object → daily_log_photos row → documents row.
 * documents has no CASCADE from daily_log_photos, so the junction row must
 * be removed before the document can be deleted.
 */
export async function deleteDailyLogPhoto(
  client: SupabaseClient,
  photoId: string,
  documentId: string,
  storagePath: string,
): Promise<void> {
  // 1. Remove storage object (tolerate 404 — already cleaned up)
  const { error: storageError } = await client.storage
    .from(PHOTO_BUCKET)
    .remove([storagePath])
  if (storageError && !storageError.message.includes('Not Found')) throw storageError

  // 2. Remove linking row
  const { error: photoError } = await client
    .from('daily_log_photos')
    .delete()
    .eq('id', photoId)
  if (photoError) throw photoError

  // 3. Remove documents row (no longer referenced)
  const { error: docError } = await client
    .from('documents')
    .delete()
    .eq('id', documentId)
  if (docError) throw docError
}

/** Updates the caption on a single photo. Pass null to clear it. */
export async function updateDailyLogPhotoCaption(
  client: SupabaseClient,
  photoId: string,
  caption: string | null,
): Promise<void> {
  const { error } = await client
    .from('daily_log_photos')
    .update({ caption } as unknown as never)
    .eq('id', photoId)
  if (error) throw error
}

// ── Daily log mutations ────────────────────────────────────────────────────

export interface CreateDailyLogInput {
  date: string
  /** Defaults to 'summary'. Pass 'field_associate' or 'subcontractor' for internal reports. */
  log_type?: 'summary' | 'field_associate' | 'subcontractor'
  weather?: string | null
  temperature_f?: number | null
  crew_count?: number | null
  hours_worked?: number | null
  work_performed: string
  materials_delivered?: string | null
  equipment_used?: string | null
  issues_or_delays?: string | null
  is_client_visible?: boolean
  publish?: boolean
}

export async function createDailyLog(
  client: SupabaseClient,
  tenantId: string,
  projectId: string,
  userId: string,
  input: CreateDailyLogInput,
): Promise<{ id: string }> {
  const { data, error } = await client
    .from('daily_logs')
    .insert({
      tenant_id:           tenantId,
      project_id:          projectId,
      author_id:           userId,
      log_type:            input.log_type ?? 'summary',
      date:                input.date,
      weather:             input.weather              ?? null,
      temperature_f:       input.temperature_f        ?? null,
      crew_count:          input.crew_count           ?? null,
      hours_worked:        input.hours_worked         ?? null,
      work_performed:      input.work_performed,
      materials_delivered: input.materials_delivered  ?? null,
      equipment_used:      input.equipment_used       ?? null,
      issues_or_delays:    input.issues_or_delays     ?? null,
      is_client_visible:   input.is_client_visible    ?? false,
      published_at:        input.publish ? new Date().toISOString() : null,
    } as unknown as never)
    .select('id')
    .single()
  if (error) throw error
  return data as { id: string }
}

export interface UpdateDailyLogInput {
  date?: string
  weather?: string | null
  temperature_f?: number | null
  crew_count?: number | null
  hours_worked?: number | null
  work_performed?: string
  materials_delivered?: string | null
  equipment_used?: string | null
  issues_or_delays?: string | null
  is_client_visible?: boolean
}

export async function updateDailyLog(
  client: SupabaseClient,
  logId: string,
  input: UpdateDailyLogInput,
): Promise<void> {
  const { error } = await client
    .from('daily_logs')
    .update({ ...input } as unknown as never)
    .eq('id', logId)
  if (error) throw error
}

/** Stamps published_at = now() and optionally marks is_client_visible. */
export async function publishDailyLog(
  client: SupabaseClient,
  logId: string,
): Promise<void> {
  const { error } = await client
    .from('daily_logs')
    .update({ published_at: new Date().toISOString() } as unknown as never)
    .eq('id', logId)
  if (error) throw error
}

/** Toggles the client-visible flag on a daily log. */
export async function setDailyLogClientVisible(
  client: SupabaseClient,
  logId: string,
  isVisible: boolean,
): Promise<void> {
  const { error } = await client
    .from('daily_logs')
    .update({ is_client_visible: isVisible } as unknown as never)
    .eq('id', logId)
  if (error) throw error
}

// ── Worker daily report helpers (migration 036) ────────────────────────────
//
// Field associates and subcontractors submit internal reports (not client-visible).
// PM+ later creates a summary log from these, optionally selecting photos to
// include in the client-facing log.

/**
 * Creates or updates a field-associate / subcontractor internal report.
 * Idempotent: if a report already exists for (project, date, author), updates
 * the work_performed text.  Returns the log id in both cases.
 */
export async function upsertWorkerDailyReport(
  client: SupabaseClient,
  tenantId: string,
  projectId: string,
  userId: string,
  logType: 'field_associate' | 'subcontractor',
  date: string,
  workPerformed: string,
): Promise<{ id: string }> {
  // Check for an existing report from this worker on this date
  const { data: existing } = await client
    .from('daily_logs')
    .select('id')
    .eq('project_id', projectId)
    .eq('date', date)
    .eq('author_id', userId)
    .in('log_type', ['field_associate', 'subcontractor'])
    .maybeSingle() as unknown as { data: { id: string } | null }

  if (existing) {
    const { error } = await client
      .from('daily_logs')
      .update({ work_performed: workPerformed } as unknown as never)
      .eq('id', existing.id)
    if (error) throw error
    return { id: existing.id }
  }

  const { data, error } = await client
    .from('daily_logs')
    .insert({
      tenant_id:       tenantId,
      project_id:      projectId,
      author_id:       userId,
      log_type:        logType,
      date,
      work_performed:  workPerformed,
      is_client_visible: false,
    } as unknown as never)
    .select('id')
    .single()
  if (error) throw error
  return data as { id: string }
}

/** Photo info returned by getWorkerReportPhotosForDate, used by PM photo picker. */
export interface WorkerReportPhotoInfo {
  id: string           // daily_log_photos.id
  logId: string        // which internal report this came from
  documentId: string   // document.id — this is what gets linked to the summary
  signedUrl: string
  caption: string | null
}

/**
 * Fetches all photos from the given internal-report log IDs and generates
 * short-lived signed URLs for display in the PM photo picker.
 */
export async function getWorkerReportPhotos(
  client: SupabaseClient,
  logIds: string[],
): Promise<WorkerReportPhotoInfo[]> {
  if (logIds.length === 0) return []

  const { data, error } = await client
    .from('daily_log_photos')
    .select('id, daily_log_id, document_id, caption, documents!daily_log_photos_document_id_fkey(storage_path, storage_bucket)')
    .in('daily_log_id', logIds)
    .order('sequence', { ascending: true })
  if (error) throw error
  if (!data?.length) return []

  const results: WorkerReportPhotoInfo[] = []
  for (const row of data as Array<{
    id: string
    daily_log_id: string
    document_id: string
    caption: string | null
    documents: { storage_path: string; storage_bucket: string } | null
  }>) {
    if (!row.documents) continue
    const { data: signed, error: signErr } = await client.storage
      .from(row.documents.storage_bucket)
      .createSignedUrl(row.documents.storage_path, 3600)
    if (signErr) continue
    results.push({
      id:         row.id,
      logId:      row.daily_log_id,
      documentId: row.document_id,
      signedUrl:  signed!.signedUrl,
      caption:    row.caption,
    })
  }
  return results
}

export interface CreateSummaryLogInput {
  date: string
  weather?: string | null
  temperature_f?: number | null
  crew_count?: number | null
  hours_worked?: number | null
  work_performed: string
  materials_delivered?: string | null
  equipment_used?: string | null
  is_client_visible?: boolean
  publish?: boolean
  /** document_id values from worker-report photos to include in the summary */
  selectedDocumentIds?: string[]
}

/**
 * Creates a client-facing summary daily log (log_type='summary').
 * Optionally links photos from worker reports to the new log.
 */
export async function createSummaryLog(
  client: SupabaseClient,
  tenantId: string,
  projectId: string,
  userId: string,
  input: CreateSummaryLogInput,
): Promise<{ id: string }> {
  const { data, error } = await client
    .from('daily_logs')
    .insert({
      tenant_id:           tenantId,
      project_id:          projectId,
      author_id:           userId,
      log_type:            'summary',
      date:                input.date,
      weather:             input.weather             ?? null,
      temperature_f:       input.temperature_f       ?? null,
      crew_count:          input.crew_count          ?? null,
      hours_worked:        input.hours_worked        ?? null,
      work_performed:      input.work_performed,
      materials_delivered: input.materials_delivered ?? null,
      equipment_used:      input.equipment_used      ?? null,
      is_client_visible:   input.is_client_visible   ?? false,
      published_at:        input.publish ? new Date().toISOString() : null,
    } as unknown as never)
    .select('id')
    .single()
  if (error) throw error
  const logId = (data as { id: string }).id

  // Link selected photos from worker reports to this summary log
  if (input.selectedDocumentIds && input.selectedDocumentIds.length > 0) {
    const photoRows = input.selectedDocumentIds.map((docId, i) => ({
      daily_log_id:      logId,
      document_id:       docId,
      sequence:          i,
      is_client_visible: true,
    }))
    const { error: photoErr } = await client
      .from('daily_log_photos')
      .insert(photoRows as unknown as never)
    if (photoErr) throw photoErr
  }

  return { id: logId }
}

// ── Draw schedule mutations ────────────────────────────────────────────────

export interface CreateDrawScheduleInput {
  lender_name?: string | null
  lender_contact?: string | null
  lender_email?: string | null
  loan_amount_cents?: number | null
  holdback_pct?: number
}

export async function createDrawSchedule(
  client: SupabaseClient,
  tenantId: string,
  jobId: string,
  input: CreateDrawScheduleInput,
): Promise<{ id: string }> {
  const { data, error } = await client
    .from('draw_schedules')
    .insert({
      tenant_id:         tenantId,
      job_id:            jobId,
      lender_name:       input.lender_name       ?? null,
      lender_contact:    input.lender_contact     ?? null,
      lender_email:      input.lender_email       ?? null,
      loan_amount_cents: input.loan_amount_cents  ?? null,
      holdback_pct:      input.holdback_pct       ?? 10,
    } as unknown as never)
    .select('id')
    .single()
  if (error) throw error
  return data as { id: string }
}

export interface CreateDrawRequestInput {
  number: number
  amount_requested_cents: number
  percent_complete_at_draw?: number | null
  notes?: string | null
  submit_now: boolean
}

export async function createDrawRequest(
  client: SupabaseClient,
  tenantId: string,
  jobId: string,
  drawScheduleId: string,
  userId: string,
  input: CreateDrawRequestInput,
): Promise<{ id: string }> {
  const status = input.submit_now ? 'submitted' : 'draft'
  const { data, error } = await client
    .from('draw_requests')
    .insert({
      draw_schedule_id:         drawScheduleId,
      tenant_id:                tenantId,
      job_id:                   jobId,
      number:                   input.number,
      status,
      amount_requested_cents:   input.amount_requested_cents,
      amount_approved_cents:    0,
      amount_funded_cents:      0,
      percent_complete_at_draw: input.percent_complete_at_draw ?? null,
      notes:                    input.notes                    ?? null,
      submitted_at:             input.submit_now ? new Date().toISOString() : null,
      created_by:               userId,
    } as unknown as never)
    .select('id')
    .single()
  if (error) throw error
  return data as { id: string }
}

// ── Time tracking types (migration 017) ───────────────────────────────────

export type SessionStatus = 'active' | 'on_break' | 'completed' | 'auto_closed'

export interface WorkSession {
  id: string
  tenant_id: string
  project_id: string
  job_id: string
  user_id: string
  // Clock-in
  clocked_in_at: string
  clock_in_lat: number | null
  clock_in_lng: number | null
  clock_in_accuracy_m: number | null
  clock_in_geofence_ok: boolean
  // Clock-out
  clocked_out_at: string | null
  clock_out_lat: number | null
  clock_out_lng: number | null
  clock_out_accuracy_m: number | null
  clock_out_geofence_ok: boolean | null
  // Breaks
  total_break_minutes: number
  auto_break_deducted: boolean
  // Computed hours
  gross_hours: number | null
  net_hours: number | null
  regular_hours: number | null
  ot_1_5_hours: number | null
  ot_2_0_hours: number | null
  is_seventh_day: boolean
  // Labor cost
  wage_snapshot_cents: number | null
  labor_cost_cents: number | null
  // Status
  status: SessionStatus
  time_entry_id: string | null
  notes: string | null
  mileage_miles: number | null
  created_at: string
  // Optional joined user data (when fetching "who's on site")
  user?: { first_name: string; last_name: string; avatar_url: string | null }
}

export interface WorkSessionBreak {
  id: string
  session_id: string
  started_at: string
  ended_at: string | null
  duration_minutes: number | null
  break_type: string
  created_at: string
}

export interface GeofenceViolation {
  id: string
  tenant_id: string
  user_id: string
  project_id: string
  attempt_type: string
  latitude: number
  longitude: number
  accuracy_m: number | null
  distance_from_site_m: number
  geofence_radius_m: number
  was_rejected: boolean
  attempted_at: string
  offsite_reason: string | null
  pm_purchase_approved: boolean | null
}

export interface EmployeeWage {
  id: string
  tenant_id: string
  user_id: string
  effective_date: string
  hourly_rate_cents: number
  created_at: string
}

export interface ClockInResult {
  session_id: string
  geofence_ok: boolean
  warning: string | null
}

export interface ClockOutResult {
  session_id: string
  net_hours: number
  regular_hours: number
  ot_1_5_hours: number
  ot_2_0_hours: number
  labor_cost_cents: number | null
  auto_break_deducted: boolean
  is_seventh_day: boolean
  geofence_ok: boolean
}

export interface ProjectLaborSummary {
  total_net_hours: number
  total_regular_hours: number
  total_ot_1_5_hours: number
  total_ot_2_0_hours: number
  total_labor_cost_cents: number
  active_session_count: number
}

// ── Time tracking RPCs ────────────────────────────────────────────────────

/**
 * Clocks an employee in to a project. Validates geofence if site coordinates
 * are set. Returns session_id + geofence status.
 * Throws 'outside_geofence' if GPS is precise and user is outside the fence.
 */
export async function clockIn(
  client: SupabaseClient,
  projectId: string,
  lat: number,
  lng: number,
  accuracyM: number,
  offsiteReason?: string,
  pmPurchaseApproved?: boolean,
): Promise<ClockInResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (client as any).rpc('clock_in', {
    p_project_id:           projectId,
    p_lat:                  lat,
    p_lng:                  lng,
    p_accuracy_m:           accuracyM,
    p_offsite_reason:       offsiteReason       ?? null,
    p_pm_purchase_approved: pmPurchaseApproved  ?? null,
  })
  if (error) throw error
  return data as ClockInResult
}

/**
 * Clocks out of the active session. Auto-closes any open break. Computes
 * California OT, deducts lunch if needed, writes time_entries row.
 * Geofence at clock-out is logged but NEVER blocks the operation.
 */
export async function clockOut(
  client: SupabaseClient,
  sessionId: string,
  lat: number,
  lng: number,
  accuracyM: number,
): Promise<ClockOutResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (client as any).rpc('clock_out', {
    p_session_id: sessionId,
    p_lat:        lat,
    p_lng:        lng,
    p_accuracy_m: accuracyM,
  })
  if (error) throw error
  return data as ClockOutResult
}

/**
 * Records mileage on a completed work_session.
 * Called immediately after clock_out succeeds, before the query is invalidated.
 */
export async function logSessionMileage(
  client: SupabaseClient,
  sessionId: string,
  miles: number,
): Promise<void> {
  const { error } = await client
    .from('work_sessions')
    .update({ mileage_miles: miles } as unknown as never)
    .eq('id', sessionId)
  if (error) throw error
}

export interface EditSessionInput {
  projectId:     string
  clockedInAt:   string
  clockedOutAt:  string
  breakMinutes:  number
  notes:         string | null
  mileageMiles:  number | null
}

export interface EditSessionResult {
  session_id:       string
  project_id:       string
  job_id:           string
  net_hours:        number | null
  regular_hours:    number | null
  ot_1_5_hours:     number | null
  ot_2_0_hours:     number | null
  labor_cost_cents: number | null
}

/** PM+ edit a completed work session — recomputes hours, OT, and labor cost. */
export async function pmEditWorkSession(
  client: SupabaseClient,
  sessionId: string,
  input: EditSessionInput,
): Promise<EditSessionResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (client as any).rpc('pm_edit_work_session', {
    p_session_id:     sessionId,
    p_project_id:     input.projectId,
    p_clocked_in_at:  input.clockedInAt,
    p_clocked_out_at: input.clockedOutAt,
    p_break_minutes:  input.breakMinutes,
    p_notes:          input.notes ?? null,
    p_mileage_miles:  input.mileageMiles ?? null,
  })
  if (error) throw error
  return data as EditSessionResult
}

/** Starts a break on the active session (sets status → 'on_break'). */
export async function startBreak(
  client: SupabaseClient,
  sessionId: string,
  breakType: 'meal' | 'rest' | 'other' = 'meal',
): Promise<{ break_id: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (client as any).rpc('start_break', {
    p_session_id: sessionId,
    p_break_type: breakType,
  })
  if (error) throw error
  return data as { break_id: string }
}

/** Ends the current break, returns duration_minutes. */
export async function endBreak(
  client: SupabaseClient,
  sessionId: string,
): Promise<{ break_id: string; duration_minutes: number }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (client as any).rpc('end_break', {
    p_session_id: sessionId,
  })
  if (error) throw error
  return data as { break_id: string; duration_minutes: number }
}

/** Sets (or clears) the site GPS pin and optional per-project fence radius. PM+ only. */
export async function setProjectLocation(
  client: SupabaseClient,
  projectId: string,
  lat: number,
  lng: number,
  radiusMeters?: number | null,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (client as any).rpc('set_project_location', {
    p_project_id:    projectId,
    p_lat:           lat,
    p_lng:           lng,
    p_radius_meters: radiusMeters ?? null,
  })
  if (error) throw error
}

// ── Time tracking queries ──────────────────────────────────────────────────

/**
 * Returns the active (or on-break) session for the current user on a project.
 * Returns null if none.
 */
export async function getActiveSession(
  client: SupabaseClient,
  projectId: string,
  userId: string,
): Promise<WorkSession | null> {
  const { data, error } = await client
    .from('work_sessions')
    .select('*')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .in('status', ['active', 'on_break'])
    .maybeSingle()

  if (error) throw error
  return data as WorkSession | null
}

/**
 * Returns all active/on-break sessions for a project — "who's on site" view.
 * Joins user_profiles for display name + avatar.
 */
export async function getActiveSessions(
  client: SupabaseClient,
  projectId: string,
): Promise<WorkSession[]> {
  const { data, error } = await client
    .from('work_sessions')
    .select(`
      *,
      user:user_profiles ( first_name, last_name, avatar_url )
    `)
    .eq('project_id', projectId)
    .in('status', ['active', 'on_break'])
    .order('clocked_in_at', { ascending: true })

  if (error) throw error
  return (data ?? []) as unknown as WorkSession[]
}

/**
 * Returns completed/auto_closed work sessions for a project (history view).
 * Optional date range filter. Joins user_profiles.
 */
export async function getWorkSessions(
  client: SupabaseClient,
  projectId: string,
  opts?: { fromDate?: string; toDate?: string; userId?: string },
): Promise<WorkSession[]> {
  let q = client
    .from('work_sessions')
    .select(`
      *,
      user:user_profiles ( first_name, last_name, avatar_url )
    `)
    .eq('project_id', projectId)
    .in('status', ['completed', 'auto_closed'])
    .order('clocked_in_at', { ascending: false })

  if (opts?.userId)   q = q.eq('user_id', opts.userId)
  if (opts?.fromDate) q = q.gte('clocked_in_at', opts.fromDate)
  if (opts?.toDate)   q = q.lte('clocked_in_at', opts.toDate)

  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as unknown as WorkSession[]
}

/**
 * Aggregated labor cost summary for a project.
 * Includes in-progress hours from active sessions (computed client-side as
 * elapsed time, not OT-broken-down, since they're not yet closed).
 */
export async function getProjectLaborCost(
  client: SupabaseClient,
  projectId: string,
): Promise<ProjectLaborSummary> {
  const { data, error } = await client
    .from('work_sessions')
    .select('net_hours, regular_hours, ot_1_5_hours, ot_2_0_hours, labor_cost_cents, status')
    .eq('project_id', projectId)

  if (error) throw error

  const rows = (data ?? []) as Pick<WorkSession,
    'net_hours' | 'regular_hours' | 'ot_1_5_hours' | 'ot_2_0_hours' | 'labor_cost_cents' | 'status'>[]

  return rows.reduce<ProjectLaborSummary>(
    (acc, r) => {
      if (r.status === 'active' || r.status === 'on_break') {
        acc.active_session_count++
      } else {
        acc.total_net_hours      += r.net_hours      ?? 0
        acc.total_regular_hours  += r.regular_hours  ?? 0
        acc.total_ot_1_5_hours   += r.ot_1_5_hours   ?? 0
        acc.total_ot_2_0_hours   += r.ot_2_0_hours   ?? 0
        acc.total_labor_cost_cents += r.labor_cost_cents ?? 0
      }
      return acc
    },
    {
      total_net_hours: 0, total_regular_hours: 0,
      total_ot_1_5_hours: 0, total_ot_2_0_hours: 0,
      total_labor_cost_cents: 0, active_session_count: 0,
    },
  )
}

/** Returns geofence violations for a project (most recent first). */
export async function getGeofenceViolations(
  client: SupabaseClient,
  projectId: string,
): Promise<GeofenceViolation[]> {
  const { data, error } = await client
    .from('geofence_violations')
    .select('*')
    .eq('project_id', projectId)
    .order('attempted_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as GeofenceViolation[]
}

/**
 * Returns breaks for an active session (so the UI can show elapsed break time).
 */
export async function getSessionBreaks(
  client: SupabaseClient,
  sessionId: string,
): Promise<WorkSessionBreak[]> {
  const { data, error } = await client
    .from('work_session_breaks')
    .select('*')
    .eq('session_id', sessionId)
    .order('started_at', { ascending: true })

  if (error) throw error
  return (data ?? []) as WorkSessionBreak[]
}

// ── Wage management ────────────────────────────────────────────────────────

/**
 * Creates or replaces a wage record for a user on a given effective date.
 * Uses upsert on (tenant_id, user_id, effective_date).
 */
export async function upsertEmployeeWage(
  client: SupabaseClient,
  tenantId: string,
  userId: string,
  effectiveDate: string,
  hourlyRateCents: number,
  createdBy: string,
): Promise<{ id: string }> {
  const { data, error } = await client
    .from('employee_wages')
    .upsert({
      tenant_id:         tenantId,
      user_id:           userId,
      effective_date:    effectiveDate,
      hourly_rate_cents: hourlyRateCents,
      created_by:        createdBy,
    } as unknown as never, { onConflict: 'tenant_id,user_id,effective_date' })
    .select('id')
    .single()
  if (error) throw error
  return data as { id: string }
}

/**
 * Returns all wage history for a user within a tenant, newest first.
 */
export async function getEmployeeWages(
  client: SupabaseClient,
  tenantId: string,
  userId: string,
): Promise<EmployeeWage[]> {
  const { data, error } = await client
    .from('employee_wages')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .order('effective_date', { ascending: false })

  if (error) throw error
  return (data ?? []) as EmployeeWage[]
}

/**
 * Updates the tenant-wide default geofence radius.
 * Requires the caller to be PM+ (enforced client-side; DB has no direct
 * policy on updating tenants, so call from a trusted context only).
 */
export async function setTenantGeofenceDefault(
  client: SupabaseClient,
  tenantId: string,
  radiusMeters: number,
): Promise<void> {
  const { error } = await client
    .from('tenants')
    .update({ default_geofence_radius_meters: radiusMeters } as unknown as never)
    .eq('id', tenantId)
  if (error) throw error
}

// ── Permit ──────────────────────────────────────────────────────────────────

export interface PermitInput {
  permit_number:       string | null
  permit_issued_date:  string | null
  permit_expiry_date:  string | null
}

/**
 * Updates the permit fields on the jobs row associated with a project.
 * These columns (permit_number, permit_issued_date, permit_expiry_date) were
 * added by Indigo migration 001 and are safe to write from Indigo.
 */
export async function updateJobPermit(
  client: SupabaseClient,
  jobId: string,
  input: PermitInput,
): Promise<void> {
  const { error } = await client
    .from('jobs')
    .update(input as unknown as never)
    .eq('id', jobId)
  if (error) throw error
}

// ── Inspections ─────────────────────────────────────────────────────────────

export type InspectionResult = 'pending' | 'passed' | 'failed' | 'cancelled'

export interface ProjectInspection {
  id:                   string
  tenant_id:            string
  project_id:           string
  inspection_type:      string
  scheduled_date:       string | null
  completed_date:       string | null
  result:               InspectionResult
  inspector_name:       string | null
  certificate_number:   string | null
  correction_required:  boolean
  correction_resolved:  boolean
  notes:                string | null
  created_by:           string | null
  created_at:           string
  updated_at:           string
}

export interface UpsertInspectionInput {
  id?:                  string
  inspection_type:      string
  scheduled_date:       string | null
  completed_date:       string | null
  result:               InspectionResult
  inspector_name:       string | null
  certificate_number:   string | null
  correction_required:  boolean
  correction_resolved:  boolean
  notes:                string | null
}

/**
 * Lists all inspections for a project, sorted by scheduled_date desc then created_at desc.
 */
export async function getProjectInspections(
  client: SupabaseClient,
  projectId: string,
): Promise<ProjectInspection[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (client as any)
    .from('project_inspections')
    .select('*')
    .eq('project_id', projectId)
    .order('scheduled_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as ProjectInspection[]
}

/**
 * Creates or updates a project inspection record.
 * Pass `id` in the input to update; omit to insert.
 */
export async function upsertInspection(
  client: SupabaseClient,
  tenantId: string,
  projectId: string,
  input: UpsertInspectionInput,
  createdBy: string,
): Promise<ProjectInspection> {
  const payload = {
    ...input,
    tenant_id:  tenantId,
    project_id: projectId,
    created_by: createdBy,
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (client as any)
    .from('project_inspections')
    .upsert(payload, { onConflict: 'id' })
    .select()
    .single()

  if (error) throw error
  return data as ProjectInspection
}

/**
 * Deletes a single inspection by id.
 */
export async function deleteInspection(
  client: SupabaseClient,
  inspectionId: string,
  tenantId: string,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (client as any)
    .from('project_inspections')
    .delete()
    .eq('id', inspectionId)
    .eq('tenant_id', tenantId)

  if (error) throw error
}

// ── Project members management ────────────────────────────────────────────────

export interface ProjectMemberRow {
  id: string
  project_id: string
  user_id: string
  role: string
  created_at: string
  profile: { first_name: string; last_name: string; avatar_url: string | null } | null
}

export async function getProjectMembers(
  client: SupabaseClient,
  projectId: string,
): Promise<ProjectMemberRow[]> {
  const { data, error } = await client
    .from('project_members')
    .select('id, project_id, user_id, role, created_at, profile:user_profiles(first_name, last_name, avatar_url)')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as unknown as ProjectMemberRow[]
}

export async function addProjectMember(
  client: SupabaseClient,
  projectId: string,
  tenantId: string,
  userId: string,
  role: string,
): Promise<void> {
  const { error } = await client
    .from('project_members')
    .insert({ project_id: projectId, tenant_id: tenantId, user_id: userId, role } as unknown as never)
  if (error) throw error
}

export async function removeProjectMember(
  client: SupabaseClient,
  memberId: string,
): Promise<void> {
  const { error } = await client
    .from('project_members')
    .delete()
    .eq('id', memberId)
  if (error) throw error
}

// ── Employee management ──────────────────────────────────────────────────────

export type EmployeeRole = 'owner' | 'admin' | 'project_manager' | 'field_super' | 'field_associate' | 'accountant' | 'subcontractor'

export interface TenantEmployee {
  id:           string   // tenant_members.id
  user_id:      string
  role:         EmployeeRole
  is_active:    boolean
  created_at:   string
  profile: {
    first_name:  string
    last_name:   string
    email:       string
    avatar_url:  string | null
    title:       string | null
    phone:       string | null
  } | null
  /** Most recent hourly rate in cents, if set. */
  current_wage_cents: number | null
}

export interface EmployeeWorkSummary {
  user_id:              string
  total_sessions:       number
  total_net_hours:      number
  total_regular_hours:  number
  total_ot_1_5_hours:   number
  total_ot_2_0_hours:   number
  total_labor_cents:    number
  last_session_at:      string | null
}

/**
 * Returns all tenant members who are employees (not subcontractor / client),
 * joined with their user_profiles. Newest member first.
 */
export async function getTenantEmployees(
  client: SupabaseClient,
  tenantId: string,
): Promise<TenantEmployee[]> {
  const { data, error } = await client
    .from('tenant_members')
    .select(`
      id,
      user_id,
      role,
      is_active,
      created_at,
      profile:user_profiles!tenant_members_user_id_fkey ( first_name, last_name, email, avatar_url, title, phone )
    `)
    .eq('tenant_id', tenantId)
    .not('role', 'in', '("subcontractor","client")')
    .order('created_at', { ascending: false })

  if (error) throw error

  // Fetch latest wages for all employees in one query
  const userIds = ((data ?? []) as unknown as TenantEmployee[]).map((e) => e.user_id)
  let wageMap: Record<string, number> = {}

  if (userIds.length > 0) {
    const { data: wages } = await client
      .from('employee_wages')
      .select('user_id, hourly_rate_cents, effective_date')
      .eq('tenant_id', tenantId)
      .in('user_id', userIds)
      .order('effective_date', { ascending: false })

    if (wages) {
      // Keep only the most recent entry per user (ordered desc, so first win)
      for (const w of wages as Array<{ user_id: string; hourly_rate_cents: number }>) {
        if (!(w.user_id in wageMap)) {
          wageMap[w.user_id] = w.hourly_rate_cents
        }
      }
    }
  }

  return ((data ?? []) as unknown as TenantEmployee[]).map((e) => ({
    ...e,
    current_wage_cents: wageMap[e.user_id] ?? null,
  }))
}

/**
 * Returns all tenant members with role 'subcontractor', joined with their
 * user_profiles. Mirrors getTenantEmployees() but scoped to subs only.
 */
export async function getTenantSubcontractors(
  client: SupabaseClient,
  tenantId: string,
): Promise<TenantEmployee[]> {
  const { data, error } = await client
    .from('tenant_members')
    .select(`
      id,
      user_id,
      role,
      is_active,
      created_at,
      profile:user_profiles!tenant_members_user_id_fkey ( first_name, last_name, email, avatar_url, title, phone )
    `)
    .eq('tenant_id', tenantId)
    .eq('role', 'subcontractor')
    .order('created_at', { ascending: false })

  if (error) throw error

  return ((data ?? []) as unknown as TenantEmployee[]).map((e) => ({
    ...e,
    current_wage_cents: null,
  }))
}

/**
 * Returns aggregated work stats for a single employee across all projects.
 * Only counts completed / auto_closed sessions.
 */
export async function getEmployeeWorkSummary(
  client: SupabaseClient,
  tenantId: string,
  userId: string,
): Promise<EmployeeWorkSummary> {
  const { data, error } = await client
    .from('work_sessions')
    .select('net_hours, regular_hours, ot_1_5_hours, ot_2_0_hours, labor_cost_cents, clocked_in_at')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .in('status', ['completed', 'auto_closed'])

  if (error) throw error

  const rows = (data ?? []) as Array<{
    net_hours: number | null
    regular_hours: number | null
    ot_1_5_hours: number | null
    ot_2_0_hours: number | null
    labor_cost_cents: number | null
    clocked_in_at: string
  }>

  const sum = rows.reduce(
    (acc, r) => ({
      total_sessions:      acc.total_sessions + 1,
      total_net_hours:     acc.total_net_hours     + (r.net_hours      ?? 0),
      total_regular_hours: acc.total_regular_hours + (r.regular_hours  ?? 0),
      total_ot_1_5_hours:  acc.total_ot_1_5_hours  + (r.ot_1_5_hours  ?? 0),
      total_ot_2_0_hours:  acc.total_ot_2_0_hours  + (r.ot_2_0_hours  ?? 0),
      total_labor_cents:   acc.total_labor_cents    + (r.labor_cost_cents ?? 0),
    }),
    { total_sessions: 0, total_net_hours: 0, total_regular_hours: 0, total_ot_1_5_hours: 0, total_ot_2_0_hours: 0, total_labor_cents: 0 },
  )

  const sorted = rows.slice().sort((a, b) =>
    new Date(b.clocked_in_at).getTime() - new Date(a.clocked_in_at).getTime(),
  )

  return {
    user_id:             userId,
    last_session_at:     sorted[0]?.clocked_in_at ?? null,
    ...sum,
  }
}

/**
 * Returns recent work sessions (all projects) for a single employee.
 * Joins project info for display.
 */
export async function getEmployeeSessions(
  client: SupabaseClient,
  tenantId: string,
  userId: string,
  limitRows = 50,
): Promise<WorkSession[]> {
  const { data, error } = await client
    .from('work_sessions')
    .select(`
      *,
      project:projects (
        id,
        job:jobs ( job_name, job_number )
      )
    `)
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .in('status', ['completed', 'auto_closed'])
    .order('clocked_in_at', { ascending: false })
    .limit(limitRows)

  if (error) throw error
  return (data ?? []) as unknown as WorkSession[]
}

// ── Unified project details write ─────────────────────────────────────────

/**
 * Fields that live on the `jobs` table and are safe for Indigo to write.
 *
 * Excluded (BB-owned with check constraints or owned by BB workflows):
 *   - jobs.status           → has check constraint, owned by BB
 *   - jobs.job_type         → has check constraint, owned by BB
 *   - jobs.contract_amount_cents / contract_value_cents → owned by BB contracts
 */
export interface UpdateJobsInput {
  job_name?:               string
  description?:            string | null
  notes?:                  string | null
  internal_notes?:         string | null
  tags?:                   string[]
  start_date?:             string | null
  target_completion?:      string | null
  actual_completion?:      string | null
  address_line1?:          string | null
  address_line2?:          string | null
  city?:                   string | null
  state?:                  string | null
  zip?:                    string | null
  pm_user_id?:             string | null
  superintendent_user_id?: string | null
  package_name?:           string | null
  /** Indigo-extended lifecycle status */
  project_status?:         string | null
  /** Indigo-extended project type */
  project_type?:           string | null
  /** Indigo-managed running contract total */
  current_contract_cents?: number | null
  has_construction_loan?:  boolean
  lender_name?:            string | null
  loan_amount_cents?:      number | null
  permit_number?:          string | null
  permit_issued_date?:     string | null
  permit_expiry_date?:     string | null
}

/**
 * Fields that live on the `projects` table (Indigo-owned).
 */
export interface UpdateProjectsInput {
  site_lat?:                 number | null
  site_lng?:                 number | null
  geofence_radius_meters?:   number | null
}

/**
 * Combined input for the unified write path.
 * Pass only the fields you want to change — undefined fields are skipped.
 */
export interface UpdateProjectDetailsInput {
  jobs?:     UpdateJobsInput
  projects?: UpdateProjectsInput
}

/**
 * Unified project-details writer. Routes `jobs`-owned fields and
 * `projects`-owned fields to the correct tables in parallel.
 *
 * - Only issues a DB call for a table if its sub-object has at least one key.
 * - Never writes BB-protected fields (status, job_type, contract_amount_cents,
 *   contract_value_cents) — those are intentionally excluded from the input type.
 *
 * @param projectId  The Indigo `projects.id`
 * @param jobId      The `jobs.id` linked via projects.job_id
 * @param input      Partial update broken down by table
 */
export async function updateProjectDetails(
  client: SupabaseClient,
  projectId: string,
  jobId: string,
  input: UpdateProjectDetailsInput,
): Promise<void> {
  const tasks: Promise<void>[] = []

  if (input.jobs && Object.keys(input.jobs).length > 0) {
    tasks.push(
      Promise.resolve(
        client
          .from('jobs')
          .update(input.jobs as unknown as never)
          .eq('id', jobId),
      ).then(({ error }) => { if (error) throw error }),
    )
  }

  if (input.projects && Object.keys(input.projects).length > 0) {
    tasks.push(
      Promise.resolve(
        client
          .from('projects')
          .update(input.projects as unknown as never)
          .eq('id', projectId),
      ).then(({ error }) => { if (error) throw error }),
    )
  }

  if (tasks.length === 0) return   // nothing to update
  await Promise.all(tasks)
}

// ── Employee status & profile management ──────────────────────────────────────
// Requires migration 033 (pm_manage_members) for deactivate/reactivate/role-change.

/**
 * Soft-deactivates an employee by setting is_active = false on their
 * tenant_members row. Does NOT ban the Supabase auth account.
 * Deactivated users see a "account deactivated" screen on next login.
 */
export async function deactivateEmployee(
  client: SupabaseClient,
  memberId: string,
): Promise<void> {
  const { error } = await client
    .from('tenant_members')
    .update({ is_active: false } as unknown as never)
    .eq('id', memberId)
  if (error) throw error
}

/**
 * Re-activates a previously deactivated employee.
 */
export async function reactivateEmployee(
  client: SupabaseClient,
  memberId: string,
): Promise<void> {
  const { error } = await client
    .from('tenant_members')
    .update({ is_active: true } as unknown as never)
    .eq('id', memberId)
  if (error) throw error
}

export interface UpdateEmployeeInput {
  /** tenant_members.role — only updatable for non-admin/non-owner members */
  role?: string
  /** user_profiles fields */
  first_name?: string
  last_name?: string
  title?: string | null
  phone?: string | null
}

/**
 * Updates an employee's profile (user_profiles) and optionally their role
 * (tenant_members). Both updates are issued in parallel.
 */
export async function updateEmployee(
  client: SupabaseClient,
  memberId: string,
  userId: string,
  input: UpdateEmployeeInput,
): Promise<void> {
  const tasks: Promise<void>[] = []

  const profileFields: Record<string, unknown> = {}
  if (input.first_name !== undefined) profileFields.first_name = input.first_name
  if (input.last_name  !== undefined) profileFields.last_name  = input.last_name
  if (input.title      !== undefined) profileFields.title      = input.title
  if (input.phone      !== undefined) profileFields.phone      = input.phone

  if (Object.keys(profileFields).length > 0) {
    tasks.push(
      Promise.resolve(
        client
          .from('user_profiles')
          .update(profileFields as unknown as never)
          .eq('id', userId),
      ).then(({ error }) => { if (error) throw error }),
    )
  }

  if (input.role !== undefined) {
    tasks.push(
      Promise.resolve(
        client
          .from('tenant_members')
          .update({ role: input.role } as unknown as never)
          .eq('id', memberId),
      ).then(({ error }) => { if (error) throw error }),
    )
  }

  if (tasks.length === 0) return
  await Promise.all(tasks)
}

// ── PM Change Order Approval (audited) ────────────────────────────────────

/**
 * Approves a change order via the pm_approve_change_order() security-definer
 * RPC, which stamps approved_at + approved_by_user_id and writes to audit_log.
 * Use this instead of a raw co_status='approved' update so every approval
 * has a full audit trail with who approved it.
 */
export async function pmApproveChangeOrder(
  client: SupabaseClient,
  coId: string,
): Promise<void> {
  const { error } = await client.rpc(
    'pm_approve_change_order',
    { p_co_id: coId } as unknown as never,
  )
  if (error) throw error
}

// ── PM Selections ───────────────────────────────────────────────────────────

export interface PMSelectionOption {
  id: string
  name: string
  description: string | null
  sku: string | null
  vendor: string | null
  vendor_url: string | null
  unit_cost_cents: number
  unit_price_cents: number
  lead_time_days: number | null
  sequence: number
  is_active: boolean
}

export interface PMClientSelection {
  id: string
  customer_id: string
  option_id: string | null
  custom_description: string | null
  custom_vendor: string | null
  custom_price_cents: number | null
  notes: string | null
  selected_at: string | null
  approved_at: string | null
}

export interface PMSelectionCategory {
  id: string
  name: string
  description: string | null
  allowance_cents: number
  status: string
  due_date: string | null
  sequence: number
  is_client_visible: boolean
  notes: string | null
  options: PMSelectionOption[]
  selection: PMClientSelection | null
}

export interface CreateSelectionCategoryInput {
  tenantId: string
  projectId: string
  name: string
  description?: string | null
  allowance_cents: number
  due_date?: string | null
  is_client_visible?: boolean
  notes?: string | null
  sequence?: number
}

export interface UpdateSelectionCategoryInput {
  name?: string
  description?: string | null
  allowance_cents?: number
  status?: string
  due_date?: string | null
  is_client_visible?: boolean
  notes?: string | null
}

export interface CreateSelectionOptionInput {
  categoryId: string
  name: string
  description?: string | null
  sku?: string | null
  vendor?: string | null
  vendor_url?: string | null
  unit_cost_cents?: number
  unit_price_cents: number
  lead_time_days?: number | null
  sequence?: number
}

export interface UpdateSelectionOptionInput {
  name?: string
  description?: string | null
  sku?: string | null
  vendor?: string | null
  vendor_url?: string | null
  unit_cost_cents?: number
  unit_price_cents?: number
  lead_time_days?: number | null
  is_active?: boolean
}

export async function getPMSelections(
  client: SupabaseClient,
  projectId: string,
): Promise<PMSelectionCategory[]> {
  const [catsRes, selsRes] = await Promise.all([
    client
      .from('selection_categories')
      .select(`
        id, name, description, allowance_cents, status, due_date, sequence, is_client_visible, notes,
        options:selection_options (
          id, name, description, sku, vendor, vendor_url,
          unit_cost_cents, unit_price_cents, lead_time_days, sequence, is_active
        )
      `)
      .eq('project_id', projectId)
      .order('sequence', { ascending: true }),
    client
      .from('client_selections')
      .select('id, customer_id, category_id, option_id, custom_description, custom_vendor, custom_price_cents, notes, selected_at, approved_at')
      .eq('project_id', projectId),
  ])

  if (catsRes.error) throw catsRes.error
  if (selsRes.error) throw selsRes.error

  const selMap = new Map<string, PMClientSelection>()
  for (const s of (selsRes.data ?? []) as (PMClientSelection & { category_id: string })[]) {
    selMap.set(s.category_id, s)
  }

  return ((catsRes.data ?? []) as (Omit<PMSelectionCategory, 'selection' | 'options'> & { options: PMSelectionOption[] })[]).map(
    (cat) => ({
      ...cat,
      options: (cat.options ?? []).sort((a, b) => a.sequence - b.sequence),
      selection: selMap.get(cat.id) ?? null,
    }),
  )
}

export async function createSelectionCategory(
  client: SupabaseClient,
  input: CreateSelectionCategoryInput,
): Promise<PMSelectionCategory> {
  const { data, error } = await client
    .from('selection_categories')
    .insert({
      tenant_id:         input.tenantId,
      project_id:        input.projectId,
      name:              input.name,
      description:       input.description ?? null,
      allowance_cents:   input.allowance_cents,
      due_date:          input.due_date ?? null,
      is_client_visible: input.is_client_visible ?? false,
      notes:             input.notes ?? null,
      sequence:          input.sequence ?? 0,
    } as unknown as never)
    .select('id, name, description, allowance_cents, status, due_date, sequence, is_client_visible, notes')
    .single()

  if (error) throw error
  const row = data as unknown as Omit<PMSelectionCategory, 'options' | 'selection'>
  return { ...row, options: [], selection: null }
}

export async function updateSelectionCategory(
  client: SupabaseClient,
  categoryId: string,
  input: UpdateSelectionCategoryInput,
): Promise<void> {
  const patch: Record<string, unknown> = {}
  if (input.name             !== undefined) patch.name              = input.name
  if (input.description      !== undefined) patch.description       = input.description
  if (input.allowance_cents  !== undefined) patch.allowance_cents   = input.allowance_cents
  if (input.status           !== undefined) patch.status            = input.status
  if (input.due_date         !== undefined) patch.due_date          = input.due_date
  if (input.is_client_visible !== undefined) patch.is_client_visible = input.is_client_visible
  if (input.notes            !== undefined) patch.notes             = input.notes

  const { error } = await client
    .from('selection_categories')
    .update(patch as never)
    .eq('id', categoryId)

  if (error) throw error
}

export async function deleteSelectionCategory(
  client: SupabaseClient,
  categoryId: string,
): Promise<void> {
  const { error } = await client
    .from('selection_categories')
    .delete()
    .eq('id', categoryId)

  if (error) throw error
}

export async function createSelectionOption(
  client: SupabaseClient,
  input: CreateSelectionOptionInput,
): Promise<PMSelectionOption> {
  const { data, error } = await client
    .from('selection_options')
    .insert({
      category_id:      input.categoryId,
      name:             input.name,
      description:      input.description ?? null,
      sku:              input.sku ?? null,
      vendor:           input.vendor ?? null,
      vendor_url:       input.vendor_url ?? null,
      unit_cost_cents:  input.unit_cost_cents ?? 0,
      unit_price_cents: input.unit_price_cents,
      lead_time_days:   input.lead_time_days ?? null,
      sequence:         input.sequence ?? 0,
    } as unknown as never)
    .select('id, name, description, sku, vendor, vendor_url, unit_cost_cents, unit_price_cents, lead_time_days, sequence, is_active')
    .single()

  if (error) throw error
  return data as unknown as PMSelectionOption
}

export async function updateSelectionOption(
  client: SupabaseClient,
  optionId: string,
  input: UpdateSelectionOptionInput,
): Promise<void> {
  const patch: Record<string, unknown> = {}
  if (input.name             !== undefined) patch.name             = input.name
  if (input.description      !== undefined) patch.description      = input.description
  if (input.sku              !== undefined) patch.sku              = input.sku
  if (input.vendor           !== undefined) patch.vendor           = input.vendor
  if (input.vendor_url       !== undefined) patch.vendor_url       = input.vendor_url
  if (input.unit_cost_cents  !== undefined) patch.unit_cost_cents  = input.unit_cost_cents
  if (input.unit_price_cents !== undefined) patch.unit_price_cents = input.unit_price_cents
  if (input.lead_time_days   !== undefined) patch.lead_time_days   = input.lead_time_days
  if (input.is_active        !== undefined) patch.is_active        = input.is_active

  const { error } = await client
    .from('selection_options')
    .update(patch as never)
    .eq('id', optionId)

  if (error) throw error
}

export async function deleteSelectionOption(
  client: SupabaseClient,
  optionId: string,
): Promise<void> {
  const { error } = await client
    .from('selection_options')
    .delete()
    .eq('id', optionId)

  if (error) throw error
}

export async function approvePMClientSelection(
  client: SupabaseClient,
  selectionId: string,
  approverId: string,
): Promise<void> {
  const { error } = await client
    .from('client_selections')
    .update({ approved_at: new Date().toISOString(), approved_by: approverId } as never)
    .eq('id', selectionId)

  if (error) throw error
}

