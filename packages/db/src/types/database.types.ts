/**
 * Hand-generated from live Supabase schema — fueksflgmkruauanhgzx
 * Source of truth: supabase/migrations/Supabase Snippet Full Public Schema Snapshot (Tables, Keys, Enums, Indexes).csv
 *
 * BuildersBooks (BB) tables are marked with a BB comment — do not recreate these.
 * Money: Indigo-owned tables use bigint cents; BB tables use integer cents.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export type BudgetStatus = 'draft' | 'active' | 'locked' | 'closed'
export type DocumentType =
  | 'plan' | 'permit' | 'contract' | 'change_order' | 'invoice'
  | 'lien_waiver' | 'w9' | 'insurance_cert' | 'photo' | 'video'
  | 'submittal' | 'rfi' | 'specification' | 'warranty' | 'report' | 'other'
export type DrawStatus = 'draft' | 'submitted' | 'lender_reviewing' | 'approved' | 'funded' | 'rejected'
export type EstimateStatus =
  | 'draft' | 'internal_review' | 'sent' | 'viewed'
  | 'approved' | 'rejected' | 'expired' | 'superseded'
export type InsightSeverity = 'info' | 'warning' | 'critical'
export type InsightType =
  | 'budget_risk' | 'schedule_risk' | 'scope_creep' | 'margin_alert'
  | 'overdue_rfi' | 'overdue_milestone' | 'insurance_expiring'
  | 'lien_waiver_missing' | 'client_approval_needed' | 'draw_request_ready' | 'general'
export type LienWaiverType =
  | 'conditional_progress' | 'unconditional_progress'
  | 'conditional_final' | 'unconditional_final'
export type MemberRole =
  | 'owner' | 'admin' | 'project_manager' | 'field_super'
  | 'accountant' | 'designer' | 'subcontractor' | 'field_associate' | 'client'
export type PhaseStatus = 'not_started' | 'in_progress' | 'complete' | 'approved' | 'blocked'
export type PoStatus = 'draft' | 'sent' | 'acknowledged' | 'partially_received' | 'complete' | 'void'
export type PunchPriority = 'low' | 'normal' | 'high' | 'blocking'
export type PunchStatus = 'open' | 'in_progress' | 'ready_for_review' | 'closed' | 'void'
export type RfiStatus = 'draft' | 'submitted' | 'under_review' | 'answered' | 'closed' | 'void'
export type ScheduleItemType = 'task' | 'milestone' | 'phase_summary' | 'procurement'
export type SelectionStatus =
  | 'pending' | 'client_choosing' | 'selected' | 'approved'
  | 'ordered' | 'received' | 'installed'
export type SignatureStatus = 'pending' | 'viewed' | 'signed' | 'declined' | 'expired'
export type SubmittalStatus =
  | 'draft' | 'submitted' | 'under_review' | 'approved'
  | 'approved_as_noted' | 'revise_and_resubmit' | 'rejected' | 'void'
export type TaskStatus = 'not_started' | 'in_progress' | 'complete' | 'blocked' | 'cancelled'
export type ThreadType =
  | 'general' | 'rfi' | 'submittal' | 'selection'
  | 'change_order' | 'daily_log' | 'warranty' | 'admin'
export type WarrantyStatus =
  | 'submitted' | 'acknowledged' | 'scheduled' | 'in_progress'
  | 'resolved' | 'denied' | 'escalated'

// ---------------------------------------------------------------------------
// BuildersBooks (BB) Tables — DO NOT recreate; query as-is
// ---------------------------------------------------------------------------

/** BB — Multi-tenant root. No logo_url or updated_at in this table. */
export interface Tenant {
  id: string
  name: string
  slug: string
  created_at: string
}

/** BB — Chart of accounts */
export interface Account {
  id: string
  tenant_id: string
  account_number: number
  account_name: string
  account_type: string
  account_subtype: string
  normal_balance: string
  description: string
  is_active: boolean
  parent_account_number: number | null
  created_at: string
}

/**
 * BB — Client contacts. customer_name is a single combined name field (no first/last).
 * Indigo adds portal_user_id + stripe_customer_id via migration 001.
 */
export interface Customer {
  id: string
  tenant_id: string
  customer_name: string
  company: string
  email: string
  phone: string
  billing_address: string
  property_address: string
  notes: string
  is_active: boolean
  created_date: string | null
  created_at: string
  updated_at: string
  /** Added by Indigo migration 001 */
  portal_user_id: string | null
  /** Added by Indigo migration 001 */
  stripe_customer_id: string | null
}

/** BB — Vendor contacts. vendor_name is the name field (not "name"). */
export interface Vendor {
  id: string
  tenant_id: string
  vendor_name: string
  category: string
  email: string
  phone: string
  address: string
  default_expense_account_id: string | null
  is_active: boolean
  is_1099_required: boolean
  notes: string
  contact_name: string | null
  website: string | null
  payment_terms: string | null
  created_at: string
  updated_at: string
}

/** BB — Core project entity. Indigo's projects table has a job_id FK here. */
export interface Job {
  id: string
  tenant_id: string
  job_number: string
  job_name: string
  customer_id: string
  status: string
  job_type: string
  start_date: string | null
  end_date: string | null
  contract_amount_cents: number
  description: string
  job_address: string
  notes: string
  created_at: string
  updated_at: string
  // Indigo-extended columns (added by Indigo migrations)
  project_type: string | null
  address_line1: string | null
  address_line2: string | null
  city: string | null
  state: string | null
  zip: string | null
  apn: string | null
  target_completion: string | null
  actual_completion: string | null
  contract_value_cents: number | null
  current_contract_cents: number | null
  permit_number: string | null
  permit_issued_date: string | null
  permit_expiry_date: string | null
  has_construction_loan: boolean
  lender_name: string | null
  loan_amount_cents: number | null
  pm_user_id: string | null
  superintendent_user_id: string | null
  package_name: string | null
  tags: string[]
  internal_notes: string | null
}

/**
 * BB — Change orders. co_number is text (e.g. "CO-001"), title is nullable.
 * Indigo adds change_order_line_items with a FK here.
 */
export interface JobChangeOrder {
  id: string
  tenant_id: string
  job_id: string
  co_number: string
  description: string
  amount_cents: number
  date_submitted: string | null
  date_approved: string | null
  /** BB-owned — has check constraint. Default 'Pending'. Do not set from Indigo. */
  status: string
  /** Indigo lifecycle: 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'void' */
  co_status: string | null
  notes: string
  title: string | null
  reason: string | null
  markup_pct: number | null
  schedule_impact_days: number | null
  client_viewed_at: string | null
  approved_at: string | null
  rejected_at: string | null
  requested_by_user_id: string | null
  approved_by_user_id: string | null
  signature_document_id: string | null
  ai_drafted: boolean
  updated_at: string | null
  created_at: string
}

/** BB — Client invoices. Indigo adds milestone_id, draw_request_id, stripe fields. */
export interface Invoice {
  id: string
  tenant_id: string
  invoice_number: string
  customer_id: string
  job_id: string | null
  invoice_date: string
  due_date: string
  /** BB-owned — has check constraint. Default 'Draft'. Do not set from Indigo. */
  status: string
  /** Indigo lifecycle: 'draft' | 'sent' | 'viewed' | 'partial' | 'paid' | 'overdue' | 'void' */
  invoice_status: string | null
  subtotal_cents: number
  tax_rate_basis_points: number
  tax_amount_cents: number
  total_cents: number
  amount_paid_cents: number
  balance_due_cents: number
  notes: string
  internal_notes: string
  journal_entry_id: string | null
  /** Added by Indigo */
  milestone_id: string | null
  /** Added by Indigo */
  draw_request_id: string | null
  /** Added by Indigo */
  stripe_session_id: string | null
  /** Added by Indigo */
  stripe_payment_url: string | null
  /** Added by Indigo */
  stripe_payment_intent_id: string | null
  /** Added by Indigo */
  payment_instructions: string | null
  /** Added by Indigo */
  pdf_document_id: string | null
  sent_at: string | null
  paid_at: string | null
  created_at: string
  updated_at: string
}

/** BB — Invoice line items */
export interface InvoiceItem {
  id: string
  tenant_id: string
  invoice_id: string
  description: string
  quantity: number
  unit: string
  unit_price_cents: number
  amount_cents: number
  sort_order: number
  account_id: string | null
  linked_expense_item_id: string | null
}

/** BB — Payments received */
export interface Payment {
  id: string
  tenant_id: string
  invoice_id: string
  payment_date: string
  amount_cents: number
  payment_method: string
  reference_number: string
  deposit_account_id: string | null
  notes: string
  journal_entry_id: string | null
  created_at: string
}

/** BB — AP bills */
export interface Expense {
  id: string
  tenant_id: string
  expense_number: string
  vendor_id: string | null
  job_id: string | null
  expense_date: string
  total_cents: number
  payment_method: string
  reference_number: string
  /** BB-owned — has check constraint. Default 'Draft'. Do not set from Indigo. */
  status: string
  /** Indigo lifecycle: 'draft' | 'submitted' | 'approved' | 'paid' | 'rejected' */
  expense_status: string | null
  receipt_url: string
  notes: string
  journal_entry_id: string | null
  created_at: string
  updated_at: string
}

/** BB — AP bill line items */
export interface ExpenseItem {
  id: string
  tenant_id: string
  expense_id: string
  description: string
  amount_cents: number
  account_id: string | null
  job_id: string | null
  sort_order: number
}

/** BB — Double-entry journal entries */
export interface JournalEntry {
  id: string
  tenant_id: string
  entry_number: string
  entry_date: string
  description: string
  source_type: string
  source_record_id: string | null
  is_balanced: boolean
  total_debits_cents: number
  total_credits_cents: number
  notes: string
  created_at: string
}

/** BB — Journal lines */
export interface JournalLine {
  id: string
  tenant_id: string
  journal_entry_id: string
  account_id: string | null
  account_number: number
  account_name: string
  account_type: string
  normal_balance: string
  debit_cents: number
  credit_cents: number
  description: string
  entry_date: string
  source_type: string
  job_id: string | null
}

/** BB — Subcontractor company directory. name is the company name field. */
export interface Subcontractor {
  id: string
  tenant_id: string
  name: string
  contact_name: string
  email: string
  phone: string
  address: string
  license_number: string
  license_expiration: string | null
  insurance_carrier: string
  coi_expiration: string | null
  w9_on_file: boolean
  is_1099_eligible: boolean
  ein_tax_id: string
  /** BB-owned — has check constraint. Default 'Active'. Do not set from Indigo. */
  status: string
  /** Indigo lifecycle: 'active' | 'inactive' | 'pending_review' */
  subcontractor_status: string | null
  notes: string
  license_state: string | null
  license_expiry: string | null
  insurance_policy: string | null
  insurance_expiry: string | null
  rating: number | null
  rating_count: number
  is_preferred: boolean
  created_at: string
  updated_at: string
}

/** BB — Subcontracts. reference_number is the contract identifier. */
export interface Subcontract {
  id: string
  tenant_id: string
  subcontractor_id: string
  job_id: string | null
  description: string
  reference_number: string
  execution_date: string | null
  original_value_cents: number
  /** BB-owned — has check constraint. Default 'Draft'. Do not set from Indigo. */
  status: string
  /** Indigo lifecycle: 'draft' | 'sent' | 'active' | 'complete' | 'cancelled' */
  subcontract_status: string | null
  notes: string
  contract_document_url: string
  contract_document_name: string
  contract_document_size: number | null
  created_at: string
  updated_at: string
}

/** BB — Sub invoices */
export interface SubcontractInvoice {
  id: string
  tenant_id: string
  subcontract_id: string
  sub_invoice_number: string
  invoice_date: string
  billing_period_from: string | null
  billing_period_to: string | null
  milestone_description: string
  amount_billed_cents: number
  /** BB-owned — has check constraint. Default 'Received'. Do not set from Indigo. */
  status: string
  /** Indigo lifecycle: 'received' | 'reviewing' | 'approved' | 'paid' | 'disputed' */
  sub_invoice_status: string | null
  payment_date: string | null
  /** BB-owned — has check constraint. Default 'None'. Do not set from Indigo. */
  lien_waiver_status: string
  /** Indigo: 'none' | 'requested' | 'received_conditional' | 'received_unconditional' | 'approved' */
  lien_waiver_review_status: string | null
  notes: string
  lien_waiver_document_url: string
  lien_waiver_document_name: string
  lien_waiver_document_size: number | null
  created_at: string
  updated_at: string
}

/** BB — Sub change orders. co_number is text, description holds the title. */
export interface SubcontractChangeOrder {
  id: string
  tenant_id: string
  subcontract_id: string
  co_number: string
  description: string
  amount_cents: number
  date_submitted: string | null
  date_approved: string | null
  /** BB-owned — has check constraint. Default 'Pending'. Do not set from Indigo. */
  status: string
  /** Indigo lifecycle: 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'void' */
  sub_co_status: string | null
  notes: string
  created_at: string
}

/** BB — Auto-numbering sequences. Composite PK: (tenant_id, name, year) — no id column. */
export interface Sequence {
  tenant_id: string
  name: string
  year: number
  current: number
}

/**
 * BB — Tenant company settings. Note: this is NOT a key/value table.
 * Each column is a named setting field. Only has updated_at, no created_at.
 */
export interface Setting {
  id: string
  tenant_id: string
  display_name: string
  legal_name: string
  address_line1: string
  address_line2: string
  city: string
  state: string
  zip: string
  phone: string
  email: string
  website: string
  license_number: string
  logo_url: string
  logo_base64: string
  updated_at: string
}

// ---------------------------------------------------------------------------
// Indigo-owned Tables
// ---------------------------------------------------------------------------

export interface UserProfile {
  id: string
  first_name: string
  last_name: string
  email: string
  phone: string | null
  avatar_url: string | null
  title: string | null
  twilio_opt_in: boolean
  created_at: string
  updated_at: string
}

export interface TenantMember {
  id: string
  tenant_id: string
  user_id: string
  role: MemberRole
  is_active: boolean
  invited_by: string | null
  invited_at: string | null
  accepted_at: string | null
  created_at: string
}

/** slug is the template key (not "key"). No updated_at column. */
export interface NotificationTemplate {
  id: string
  tenant_id: string | null
  slug: string
  channel: string
  subject: string | null
  body: string
  is_active: boolean
  created_at: string
}

export interface AuditLog {
  id: number
  tenant_id: string | null
  user_id: string | null
  table_name: string
  record_id: string
  action: string
  old_values: Json | null
  new_values: Json | null
  ip_address: string | null
  created_at: string
}

/**
 * Thin join record linking an Indigo project to a BB job.
 * All display data (name, type, dates, PM, address) lives on the Job row.
 */
export interface Project {
  id: string
  tenant_id: string
  job_id: string
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface ProjectMember {
  id: string
  project_id: string
  tenant_id: string
  user_id: string
  role: string
  created_at: string
}

export interface ProjectPhase {
  id: string
  project_id: string
  tenant_id: string
  name: string
  sequence: number
  start_date: string | null
  end_date: string | null
  status: PhaseStatus
  color: string | null
  description: string | null
  created_at: string
  updated_at: string
}

export interface Milestone {
  id: string
  project_id: string
  tenant_id: string
  phase_id: string | null
  name: string
  description: string | null
  due_date: string | null
  completed_date: string | null
  status: PhaseStatus
  sequence: number
  is_client_visible: boolean
  requires_client_approval: boolean
  client_approved_at: string | null
  client_approved_by: string | null
  triggers_draw_request: boolean
  triggers_invoice: boolean
  linked_draw_id: string | null
  linked_invoice_id: string | null
  created_at: string
  updated_at: string
}

export interface ScheduleItem {
  id: string
  project_id: string
  tenant_id: string
  phase_id: string | null
  milestone_id: string | null
  type: ScheduleItemType
  name: string
  description: string | null
  planned_start: string | null
  planned_end: string | null
  actual_start: string | null
  actual_end: string | null
  duration_days: number | null
  assigned_to: string | null
  assigned_trade: string | null
  subcontractor_id: string | null
  status: TaskStatus
  percent_complete: number
  sequence: number
  indent_level: number
  is_collapsed: boolean
  color: string | null
  created_at: string
  updated_at: string
}

/** task_dependencies: depends_on_id FKs schedule_items; no "type" column. */
export interface TaskDependency {
  id: string
  project_id: string
  task_id: string
  depends_on_id: string
  lag_days: number
}

/** No updated_at column on project_templates. */
export interface ProjectTemplate {
  id: string
  tenant_id: string | null
  name: string
  project_type: string
  description: string | null
  is_active: boolean
  created_at: string
}

export interface TemplatePhase {
  id: string
  template_id: string
  name: string
  sequence: number
  duration_days: number
}

export interface TemplateTask {
  id: string
  template_id: string
  phase_id: string | null
  name: string
  duration_days: number
  assigned_trade: string | null
  sequence: number
  indent_level: number
  depends_on_sequence: number | null
}

/** document_folders.project_id is nullable (folders can be tenant-level). */
export interface DocumentFolder {
  id: string
  tenant_id: string
  project_id: string | null
  parent_id: string | null
  name: string
  type: DocumentType | null
  sequence: number
  is_client_visible: boolean
  created_at: string
}

export interface Document {
  id: string
  tenant_id: string
  project_id: string | null
  folder_id: string | null
  type: DocumentType
  name: string
  description: string | null
  storage_bucket: string
  storage_path: string
  mime_type: string | null
  file_size_bytes: number | null
  version: number
  parent_id: string | null
  is_client_visible: boolean
  tags: string[]
  ai_summary: string | null
  uploaded_by: string | null
  created_at: string
  updated_at: string
}

/** token is nullable; no updated_at. */
export interface DocumentSignature {
  id: string
  document_id: string
  tenant_id: string
  signer_id: string | null
  signer_email: string | null
  signer_name: string | null
  status: SignatureStatus
  token: string | null
  token_expires_at: string | null
  signed_at: string | null
  declined_at: string | null
  declined_reason: string | null
  signature_data: string | null
  ip_address: string | null
  user_agent: string | null
  created_at: string
}

/** lien_waivers links to projects (not jobs). through_date and amount_cents are NOT NULL. */
export interface LienWaiver {
  id: string
  tenant_id: string
  project_id: string
  subcontractor_id: string
  type: LienWaiverType
  amount_cents: number
  through_date: string
  received_at: string | null
  document_id: string | null
  purchase_order_id: string | null
  created_at: string
}

export interface LineItemTemplate {
  id: string
  tenant_id: string | null
  name: string
  description: string | null
  unit: string
  default_unit_cost: number
  default_markup_pct: number
  csi_division: string | null
  trade: string | null
  default_account_id: string | null
  tags: string[]
  is_active: boolean
  created_at: string
  updated_at: string
}

/** estimates.name is the display name; number is the estimate identifier (e.g. "EST-001"). */
export interface Estimate {
  id: string
  tenant_id: string
  job_id: string | null
  customer_id: string | null
  number: string
  name: string
  status: EstimateStatus
  version: number
  parent_id: string | null
  subtotal_cents: number
  overhead_pct: number
  overhead_cents: number
  profit_pct: number
  profit_cents: number
  tax_pct: number
  tax_cents: number
  total_cents: number
  margin_pct: number | null
  valid_until: string | null
  sent_at: string | null
  viewed_at: string | null
  approved_at: string | null
  rejected_at: string | null
  signature_document_id: string | null
  notes: string | null
  internal_notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

/** estimate_sections uses sequence (not sort_order). No updated_at. */
export interface EstimateSection {
  id: string
  estimate_id: string
  tenant_id: string
  name: string
  csi_division: string | null
  sequence: number
  subtotal_cents: number
  notes: string | null
  created_at: string
}

export interface EstimateLineItem {
  id: string
  estimate_id: string
  section_id: string | null
  tenant_id: string
  template_id: string | null
  account_id: string | null
  description: string
  quantity: number
  unit: string
  unit_cost_cents: number
  markup_pct: number
  unit_price_cents: number
  total_cents: number
  csi_division: string | null
  trade: string | null
  is_allowance: boolean
  is_optional: boolean
  sequence: number
  notes: string | null
  created_at: string
  updated_at: string
}

export interface Budget {
  id: string
  tenant_id: string
  job_id: string
  estimate_id: string | null
  name: string
  status: BudgetStatus
  total_budgeted_cents: number
  total_committed_cents: number
  total_actual_cents: number
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface BudgetLineItem {
  id: string
  budget_id: string
  estimate_line_item_id: string | null
  tenant_id: string
  job_id: string
  account_id: string | null
  description: string
  csi_division: string | null
  trade: string | null
  budgeted_cents: number
  committed_cents: number
  actual_cost_cents: number
  billed_to_client_cents: number
  sequence: number
  created_at: string
  updated_at: string
}

export interface ChangeOrderLineItem {
  id: string
  job_change_order_id: string
  budget_line_item_id: string | null
  tenant_id: string
  account_id: string | null
  description: string
  quantity: number
  unit: string
  unit_cost_cents: number
  markup_pct: number
  total_cents: number
  csi_division: string | null
  sequence: number
  created_at: string
}

/** draw_schedules.loan_amount_cents is the total loan amount. No updated_at. */
export interface DrawSchedule {
  id: string
  tenant_id: string
  job_id: string
  lender_name: string | null
  lender_contact: string | null
  lender_email: string | null
  loan_amount_cents: number | null
  holdback_pct: number
  created_at: string
}

export interface DrawRequest {
  id: string
  draw_schedule_id: string
  tenant_id: string
  job_id: string
  number: number
  status: DrawStatus
  amount_requested_cents: number
  amount_approved_cents: number
  amount_funded_cents: number
  percent_complete_at_draw: number | null
  submitted_at: string | null
  approved_at: string | null
  funded_at: string | null
  lender_reference: string | null
  notes: string | null
  pdf_document_id: string | null
  created_by: string | null
  created_at: string
}

/** purchase_orders.number is the PO number (not po_number). */
export interface PurchaseOrder {
  id: string
  tenant_id: string
  job_id: string
  subcontractor_id: string | null
  vendor_id: string | null
  subcontract_id: string | null
  budget_line_item_id: string | null
  number: string
  status: PoStatus
  description: string
  scope_of_work: string | null
  total_cents: number
  retention_pct: number
  start_date: string | null
  end_date: string | null
  issued_at: string | null
  acknowledged_at: string | null
  notes: string | null
  document_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

/** retainage_releases links to purchase_orders, not jobs or subcontracts. */
export interface RetainageRelease {
  id: string
  tenant_id: string
  purchase_order_id: string
  amount_cents: number
  released_at: string
  expense_id: string | null
  notes: string | null
  created_at: string
}

/** selection_categories.allowance_cents and status are NOT NULL. */
export interface SelectionCategory {
  id: string
  tenant_id: string
  project_id: string
  phase_id: string | null
  budget_line_item_id: string | null
  name: string
  description: string | null
  allowance_cents: number
  status: SelectionStatus
  due_date: string | null
  sequence: number
  is_client_visible: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

export interface SelectionOption {
  id: string
  category_id: string
  name: string
  description: string | null
  sku: string | null
  vendor: string | null
  vendor_url: string | null
  unit_cost_cents: number
  unit_price_cents: number
  lead_time_days: number | null
  image_urls: string[]
  is_active: boolean
  sequence: number
  created_at: string
}

export interface ClientSelection {
  id: string
  category_id: string
  option_id: string | null
  tenant_id: string
  project_id: string
  customer_id: string
  custom_description: string | null
  custom_sku: string | null
  custom_vendor: string | null
  custom_price_cents: number | null
  overage_cents: number | null
  job_change_order_id: string | null
  notes: string | null
  selected_at: string | null
  approved_at: string | null
  approved_by: string | null
  created_at: string
}

/** message_threads.subject is NOT NULL. type is a ThreadType enum. */
export interface MessageThread {
  id: string
  tenant_id: string
  project_id: string
  type: ThreadType
  subject: string
  participant_ids: string[]
  is_client_visible: boolean
  linked_record_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

/** messages.body is the content field (not "content"). read_by is a JSONB map. */
export interface Message {
  id: string
  thread_id: string
  tenant_id: string
  sender_id: string
  body: string
  attachment_ids: string[]
  read_by: Json
  is_system_message: boolean
  created_at: string
}

/** daily_logs.work_performed is the main notes field (not "notes"). */
export interface DailyLog {
  id: string
  tenant_id: string
  project_id: string
  date: string
  author_id: string
  weather: string | null
  temperature_f: number | null
  crew_count: number | null
  hours_worked: number | null
  work_performed: string
  materials_delivered: string | null
  equipment_used: string | null
  issues_or_delays: string | null
  visitors: string | null
  safety_incidents: string | null
  ai_client_summary: string | null
  ai_drafted_at: string | null
  is_client_visible: boolean
  published_at: string | null
  created_at: string
  updated_at: string
}

/** daily_log_photos uses sequence (not sort_order). */
export interface DailyLogPhoto {
  id: string
  daily_log_id: string
  document_id: string
  caption: string | null
  ai_caption: string | null
  sequence: number
  is_client_visible: boolean
  created_at: string
}

/** notifications: no is_read boolean; use read_at !== null to check read state. */
export interface Notification {
  id: string
  tenant_id: string
  user_id: string
  type: string
  title: string
  body: string | null
  data: Json
  action_url: string | null
  read_at: string | null
  dismissed_at: string | null
  sms_sent_at: string | null
  email_sent_at: string | null
  created_at: string
}

/** rfis.number is integer (not rfi_number string). submitted_by not created_by. */
export interface Rfi {
  id: string
  tenant_id: string
  project_id: string
  number: number
  subject: string
  question: string
  answer: string | null
  status: RfiStatus
  priority: string
  submitted_by: string | null
  assigned_to: string | null
  due_date: string | null
  submitted_at: string | null
  answered_at: string | null
  cost_impact_cents: number | null
  schedule_impact_days: number | null
  document_ids: string[]
  clarification_request: string | null
  clarification_response: string | null
  created_at: string
  updated_at: string
}

/** submittals.number is text. status is SubmittalStatus enum. */
export interface Submittal {
  id: string
  tenant_id: string
  project_id: string
  number: string
  title: string
  type: string | null
  spec_section: string | null
  status: SubmittalStatus
  revision: number
  submitted_by: string | null
  reviewed_by: string | null
  submitted_at: string | null
  required_by: string | null
  reviewed_at: string | null
  review_notes: string | null
  document_ids: string[]
  created_at: string
  updated_at: string
}

/** subcontractor_trades has is_primary, hourly_rate_cents, notes. */
export interface SubcontractorTrade {
  id: string
  subcontractor_id: string
  tenant_id: string
  trade: string
  is_primary: boolean
  hourly_rate_cents: number | null
  notes: string | null
  created_at: string
}

/** time_entries.job_id is NOT NULL. No cost_code column. */
export interface TimeEntry {
  id: string
  tenant_id: string
  job_id: string
  project_id: string | null
  user_id: string
  date: string
  hours: number
  trade: string | null
  description: string | null
  is_billable: boolean
  expense_item_id: string | null
  approved_by: string | null
  approved_at: string | null
  created_at: string
}

/** gps_checkins.note (not notes). Has device_id. */
export interface GpsCheckin {
  id: string
  tenant_id: string
  job_id: string
  project_id: string | null
  user_id: string
  latitude: number | null
  longitude: number | null
  accuracy_meters: number | null
  checked_in_at: string
  checked_out_at: string | null
  device_id: string | null
  note: string | null
}

/** punch_list_items uses closed_at (not completed_at) and photo_ids (uuid[], not photo_urls). */
export interface PunchListItem {
  id: string
  tenant_id: string
  project_id: string
  title: string
  description: string | null
  location: string | null
  trade: string | null
  assigned_to: string | null
  subcontractor_id: string | null
  priority: PunchPriority
  status: PunchStatus
  due_date: string | null
  closed_at: string | null
  photo_ids: string[]
  created_by: string | null
  created_at: string
  updated_at: string
}

/** warranty_claims.status is WarrantyStatus enum. photo_ids (not photo_urls). */
export interface WarrantyClaim {
  id: string
  tenant_id: string
  project_id: string
  customer_id: string
  title: string
  description: string
  category: string | null
  location: string | null
  status: WarrantyStatus
  priority: PunchPriority
  assigned_to: string | null
  subcontractor_id: string | null
  submitted_at: string
  scheduled_date: string | null
  resolved_at: string | null
  resolution_notes: string | null
  cost_to_repair_cents: number | null
  is_billable_to_sub: boolean
  photo_ids: string[]
  created_at: string
  updated_at: string
}

export interface AiConversation {
  id: string
  tenant_id: string
  job_id: string | null
  project_id: string | null
  user_id: string | null
  context_type: string
  messages: Json
  model: string
  input_tokens: number | null
  output_tokens: number | null
  created_at: string
  updated_at: string
}

export interface AiInsight {
  id: string
  tenant_id: string
  job_id: string | null
  project_id: string | null
  type: InsightType
  severity: InsightSeverity
  title: string
  body: string
  data: Json
  suggested_action: string | null
  acknowledged_at: string | null
  acknowledged_by: string | null
  resolved_at: string | null
  expires_at: string | null
  created_at: string
}

export interface AiGeneratedContent {
  id: string
  tenant_id: string
  job_id: string | null
  project_id: string | null
  user_id: string | null
  content_type: string
  source_record_id: string | null
  prompt_version: string | null
  ai_draft: string
  final_content: string | null
  was_edited: boolean | null
  was_used: boolean | null
  conversation_id: string | null
  created_at: string
}

export interface DocumentEmbedding {
  id: string
  tenant_id: string
  document_id: string
  chunk_index: number
  chunk_text: string
  embedding: number[] | null // vector(1536)
  model: string
  created_at: string
}

export interface AiJobRun {
  id: string
  tenant_id: string
  job_name: string
  status: string
  projects_scanned: number | null
  insights_generated: number | null
  error_message: string | null
  started_at: string
  completed_at: string | null
}

// ---------------------------------------------------------------------------
// Helper: Table → Row type map (for generic Supabase query helpers)
// ---------------------------------------------------------------------------

export interface Database {
  public: {
    Tables: {
      // BB tables
      tenants:                    { Row: Tenant;                  Insert: Omit<Tenant, 'id' | 'created_at'>;                               Update: Partial<Omit<Tenant, 'id'>> }
      accounts:                   { Row: Account;                 Insert: Omit<Account, 'id' | 'created_at'>;                              Update: Partial<Omit<Account, 'id'>> }
      customers:                  { Row: Customer;                Insert: Omit<Customer, 'id' | 'created_at' | 'updated_at'>;              Update: Partial<Omit<Customer, 'id'>> }
      vendors:                    { Row: Vendor;                  Insert: Omit<Vendor, 'id' | 'created_at' | 'updated_at'>;                Update: Partial<Omit<Vendor, 'id'>> }
      jobs:                       { Row: Job;                     Insert: Omit<Job, 'id' | 'created_at' | 'updated_at'>;                   Update: Partial<Omit<Job, 'id'>> }
      job_change_orders:          { Row: JobChangeOrder;          Insert: Omit<JobChangeOrder, 'id' | 'created_at'>;                       Update: Partial<Omit<JobChangeOrder, 'id'>> }
      invoices:                   { Row: Invoice;                 Insert: Omit<Invoice, 'id' | 'created_at' | 'updated_at'>;               Update: Partial<Omit<Invoice, 'id'>> }
      invoice_items:              { Row: InvoiceItem;             Insert: Omit<InvoiceItem, 'id'>;                                         Update: Partial<Omit<InvoiceItem, 'id'>> }
      payments:                   { Row: Payment;                 Insert: Omit<Payment, 'id' | 'created_at'>;                              Update: Partial<Omit<Payment, 'id'>> }
      expenses:                   { Row: Expense;                 Insert: Omit<Expense, 'id' | 'created_at' | 'updated_at'>;               Update: Partial<Omit<Expense, 'id'>> }
      expense_items:              { Row: ExpenseItem;             Insert: Omit<ExpenseItem, 'id'>;                                         Update: Partial<Omit<ExpenseItem, 'id'>> }
      journal_entries:            { Row: JournalEntry;            Insert: Omit<JournalEntry, 'id' | 'created_at'>;                         Update: Partial<Omit<JournalEntry, 'id'>> }
      journal_lines:              { Row: JournalLine;             Insert: Omit<JournalLine, 'id'>;                                         Update: Partial<Omit<JournalLine, 'id'>> }
      subcontractors:             { Row: Subcontractor;           Insert: Omit<Subcontractor, 'id' | 'created_at' | 'updated_at'>;         Update: Partial<Omit<Subcontractor, 'id'>> }
      subcontracts:               { Row: Subcontract;             Insert: Omit<Subcontract, 'id' | 'created_at' | 'updated_at'>;           Update: Partial<Omit<Subcontract, 'id'>> }
      subcontract_invoices:       { Row: SubcontractInvoice;      Insert: Omit<SubcontractInvoice, 'id' | 'created_at' | 'updated_at'>;    Update: Partial<Omit<SubcontractInvoice, 'id'>> }
      subcontract_change_orders:  { Row: SubcontractChangeOrder;  Insert: Omit<SubcontractChangeOrder, 'id' | 'created_at'>;               Update: Partial<Omit<SubcontractChangeOrder, 'id'>> }
      sequences:                  { Row: Sequence;                Insert: Sequence;                                                         Update: Partial<Sequence> }
      settings:                   { Row: Setting;                 Insert: Omit<Setting, 'id'>;                                             Update: Partial<Omit<Setting, 'id'>> }
      // Indigo tables
      user_profiles:              { Row: UserProfile;             Insert: Omit<UserProfile, 'created_at' | 'updated_at'>;                  Update: Partial<Omit<UserProfile, 'id'>> }
      tenant_members:             { Row: TenantMember;            Insert: Omit<TenantMember, 'id' | 'created_at'>;                         Update: Partial<Omit<TenantMember, 'id'>> }
      notification_templates:     { Row: NotificationTemplate;    Insert: Omit<NotificationTemplate, 'id' | 'created_at'>;                 Update: Partial<Omit<NotificationTemplate, 'id'>> }
      audit_log:                  { Row: AuditLog;                Insert: Omit<AuditLog, 'id' | 'created_at'>;                             Update: never }
      projects:                   { Row: Project;                 Insert: Omit<Project, 'id' | 'created_at' | 'updated_at'>;               Update: never }
      project_members:            { Row: ProjectMember;           Insert: Omit<ProjectMember, 'id' | 'created_at'>;                        Update: never }
      project_phases:             { Row: ProjectPhase;            Insert: Omit<ProjectPhase, 'id' | 'created_at' | 'updated_at'>;          Update: Partial<Omit<ProjectPhase, 'id'>> }
      milestones:                 { Row: Milestone;               Insert: Omit<Milestone, 'id' | 'created_at' | 'updated_at'>;             Update: Partial<Omit<Milestone, 'id'>> }
      schedule_items:             { Row: ScheduleItem;            Insert: Omit<ScheduleItem, 'id' | 'created_at' | 'updated_at'>;          Update: Partial<Omit<ScheduleItem, 'id'>> }
      task_dependencies:          { Row: TaskDependency;          Insert: Omit<TaskDependency, 'id'>;                                       Update: never }
      project_templates:          { Row: ProjectTemplate;         Insert: Omit<ProjectTemplate, 'id' | 'created_at'>;                      Update: Partial<Omit<ProjectTemplate, 'id'>> }
      template_phases:            { Row: TemplatePhase;           Insert: Omit<TemplatePhase, 'id'>;                                        Update: Partial<Omit<TemplatePhase, 'id'>> }
      template_tasks:             { Row: TemplateTask;            Insert: Omit<TemplateTask, 'id'>;                                         Update: Partial<Omit<TemplateTask, 'id'>> }
      document_folders:           { Row: DocumentFolder;          Insert: Omit<DocumentFolder, 'id' | 'created_at'>;                       Update: Partial<Omit<DocumentFolder, 'id'>> }
      documents:                  { Row: Document;                Insert: Omit<Document, 'id' | 'created_at' | 'updated_at'>;              Update: Partial<Omit<Document, 'id'>> }
      document_signatures:        { Row: DocumentSignature;       Insert: Omit<DocumentSignature, 'id' | 'created_at'>;                    Update: Partial<Omit<DocumentSignature, 'id'>> }
      document_embeddings:        { Row: DocumentEmbedding;       Insert: Omit<DocumentEmbedding, 'id' | 'created_at'>;                    Update: never }
      lien_waivers:               { Row: LienWaiver;              Insert: Omit<LienWaiver, 'id' | 'created_at'>;                           Update: Partial<Omit<LienWaiver, 'id'>> }
      line_item_templates:        { Row: LineItemTemplate;        Insert: Omit<LineItemTemplate, 'id' | 'created_at' | 'updated_at'>;      Update: Partial<Omit<LineItemTemplate, 'id'>> }
      estimates:                  { Row: Estimate;                Insert: Omit<Estimate, 'id' | 'created_at' | 'updated_at'>;              Update: Partial<Omit<Estimate, 'id'>> }
      estimate_sections:          { Row: EstimateSection;         Insert: Omit<EstimateSection, 'id' | 'created_at'>;                      Update: Partial<Omit<EstimateSection, 'id'>> }
      estimate_line_items:        { Row: EstimateLineItem;        Insert: Omit<EstimateLineItem, 'id' | 'created_at' | 'updated_at'>;      Update: Partial<Omit<EstimateLineItem, 'id'>> }
      budgets:                    { Row: Budget;                  Insert: Omit<Budget, 'id' | 'created_at' | 'updated_at'>;                Update: Partial<Omit<Budget, 'id'>> }
      budget_line_items:          { Row: BudgetLineItem;          Insert: Omit<BudgetLineItem, 'id' | 'created_at' | 'updated_at'>;        Update: Partial<Omit<BudgetLineItem, 'id'>> }
      change_order_line_items:    { Row: ChangeOrderLineItem;     Insert: Omit<ChangeOrderLineItem, 'id' | 'created_at'>;                  Update: Partial<Omit<ChangeOrderLineItem, 'id'>> }
      draw_schedules:             { Row: DrawSchedule;            Insert: Omit<DrawSchedule, 'id' | 'created_at'>;                         Update: Partial<Omit<DrawSchedule, 'id'>> }
      draw_requests:              { Row: DrawRequest;             Insert: Omit<DrawRequest, 'id' | 'created_at'>;                          Update: Partial<Omit<DrawRequest, 'id'>> }
      purchase_orders:            { Row: PurchaseOrder;           Insert: Omit<PurchaseOrder, 'id' | 'created_at' | 'updated_at'>;         Update: Partial<Omit<PurchaseOrder, 'id'>> }
      retainage_releases:         { Row: RetainageRelease;        Insert: Omit<RetainageRelease, 'id' | 'created_at'>;                     Update: Partial<Omit<RetainageRelease, 'id'>> }
      selection_categories:       { Row: SelectionCategory;       Insert: Omit<SelectionCategory, 'id' | 'created_at' | 'updated_at'>;     Update: Partial<Omit<SelectionCategory, 'id'>> }
      selection_options:          { Row: SelectionOption;         Insert: Omit<SelectionOption, 'id' | 'created_at'>;                      Update: Partial<Omit<SelectionOption, 'id'>> }
      client_selections:          { Row: ClientSelection;         Insert: Omit<ClientSelection, 'id' | 'created_at'>;                      Update: Partial<Omit<ClientSelection, 'id'>> }
      message_threads:            { Row: MessageThread;           Insert: Omit<MessageThread, 'id' | 'created_at' | 'updated_at'>;         Update: Partial<Omit<MessageThread, 'id'>> }
      messages:                   { Row: Message;                 Insert: Omit<Message, 'id' | 'created_at'>;                              Update: Partial<Omit<Message, 'id'>> }
      daily_logs:                 { Row: DailyLog;                Insert: Omit<DailyLog, 'id' | 'created_at' | 'updated_at'>;              Update: Partial<Omit<DailyLog, 'id'>> }
      daily_log_photos:           { Row: DailyLogPhoto;           Insert: Omit<DailyLogPhoto, 'id' | 'created_at'>;                        Update: Partial<Omit<DailyLogPhoto, 'id'>> }
      notifications:              { Row: Notification;            Insert: Omit<Notification, 'id' | 'created_at'>;                         Update: Partial<Omit<Notification, 'id'>> }
      rfis:                       { Row: Rfi;                     Insert: Omit<Rfi, 'id' | 'created_at' | 'updated_at'>;                   Update: Partial<Omit<Rfi, 'id'>> }
      submittals:                 { Row: Submittal;               Insert: Omit<Submittal, 'id' | 'created_at' | 'updated_at'>;             Update: Partial<Omit<Submittal, 'id'>> }
      subcontractor_trades:       { Row: SubcontractorTrade;      Insert: Omit<SubcontractorTrade, 'id' | 'created_at'>;                   Update: Partial<Omit<SubcontractorTrade, 'id'>> }
      time_entries:               { Row: TimeEntry;               Insert: Omit<TimeEntry, 'id' | 'created_at'>;                            Update: Partial<Omit<TimeEntry, 'id'>> }
      gps_checkins:               { Row: GpsCheckin;              Insert: Omit<GpsCheckin, 'id'>;                                           Update: Partial<Omit<GpsCheckin, 'id'>> }
      punch_list_items:           { Row: PunchListItem;           Insert: Omit<PunchListItem, 'id' | 'created_at' | 'updated_at'>;         Update: Partial<Omit<PunchListItem, 'id'>> }
      warranty_claims:            { Row: WarrantyClaim;           Insert: Omit<WarrantyClaim, 'id' | 'created_at' | 'updated_at'>;         Update: Partial<Omit<WarrantyClaim, 'id'>> }
      ai_conversations:           { Row: AiConversation;          Insert: Omit<AiConversation, 'id' | 'created_at' | 'updated_at'>;        Update: Partial<Omit<AiConversation, 'id'>> }
      ai_insights:                { Row: AiInsight;               Insert: Omit<AiInsight, 'id' | 'created_at'>;                            Update: Partial<Omit<AiInsight, 'id'>> }
      ai_generated_content:       { Row: AiGeneratedContent;      Insert: Omit<AiGeneratedContent, 'id' | 'created_at'>;                   Update: never }
      ai_job_runs:                { Row: AiJobRun;                Insert: Omit<AiJobRun, 'id'>;                                             Update: Partial<Omit<AiJobRun, 'id'>> }
    }
    Functions: {
      get_user_tenant_ids:  { Args: Record<never, never>;                            Returns: string[] }
      get_user_role:        { Args: { t_id: string };                                Returns: MemberRole | null }
      user_has_role:        { Args: { t_id: string; min_role: MemberRole };          Returns: boolean }
      is_client_on_job:     { Args: { j_id: string };                                Returns: boolean }
      can_access_project:   { Args: { proj_id: string };                             Returns: boolean }
      auth_tenant_id:       { Args: Record<never, never>;                            Returns: string | null }
      next_seq:             { Args: { p_tenant: string; p_name: string };            Returns: string }
    }
    Enums: {
      budget_status:        BudgetStatus
      document_type:        DocumentType
      draw_status:          DrawStatus
      estimate_status:      EstimateStatus
      insight_severity:     InsightSeverity
      insight_type:         InsightType
      lien_waiver_type:     LienWaiverType
      member_role:          MemberRole
      phase_status:         PhaseStatus
      po_status:            PoStatus
      punch_priority:       PunchPriority
      punch_status:         PunchStatus
      rfi_status:           RfiStatus
      schedule_item_type:   ScheduleItemType
      selection_status:     SelectionStatus
      signature_status:     SignatureStatus
      submittal_status:     SubmittalStatus
      task_status:          TaskStatus
      thread_type:          ThreadType
      warranty_status:      WarrantyStatus
    }
  }
}
