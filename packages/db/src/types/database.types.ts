/**
 * Hand-generated from live Supabase schema — fueksflgmkruauanhgzx
 * Regenerate with: pnpm --filter @indigo/db gen:types
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
  | 'accountant' | 'subcontractor' | 'client'
export type PhaseStatus = 'not_started' | 'in_progress' | 'complete' | 'approved' | 'blocked'
export type PoStatus = 'draft' | 'sent' | 'acknowledged' | 'partially_received' | 'complete' | 'void'
export type PunchPriority = 'low' | 'normal' | 'high' | 'blocking'
export type PunchStatus = 'open' | 'in_progress' | 'ready_for_review' | 'closed' | 'void'
export type RfiStatus = 'draft' | 'submitted' | 'under_review' | 'answered' | 'closed' | 'void'
export type ScheduleItemType = 'task' | 'milestone' | 'phase_summary' | 'procurement'
export type SelectionStatus =
  | 'pending' | 'client_choosing' | 'selected' | 'approved'
  | 'ordered' | 'received' | 'installed'
export type SignatureStatus = 'pending' | 'viewed' | 'signed' | 'declined'

// ---------------------------------------------------------------------------
// BuildersBooks (BB) Tables — DO NOT recreate; query as-is
// ---------------------------------------------------------------------------

export interface Tenant {
  id: string
  name: string
  slug: string
  logo_url: string | null
  created_at: string
  updated_at: string
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

/** BB — Client contacts. Indigo adds portal_user_id + stripe_customer_id via migration 001 */
export interface Customer {
  id: string
  tenant_id: string
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  notes: string | null
  /** Added by Indigo migration 001 */
  portal_user_id: string | null
  /** Added by Indigo migration 001 */
  stripe_customer_id: string | null
  created_at: string
  updated_at: string
}

/** BB — Vendor contacts */
export interface Vendor {
  id: string
  tenant_id: string
  name: string
  contact_name: string | null
  email: string | null
  phone: string | null
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

/** BB — Core project entity. Indigo's projects table has a job_id FK here */
export interface Job {
  id: string
  tenant_id: string
  job_number: string
  name: string
  description: string | null
  customer_id: string | null
  project_type: string | null
  status: string
  contract_amount: number | null
  start_date: string | null
  end_date: string | null
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  tags: string[]
  created_at: string
  updated_at: string
}

/** BB — Change orders. Indigo adds change_order_line_items FKing here */
export interface JobChangeOrder {
  id: string
  tenant_id: string
  job_id: string
  co_number: number
  title: string
  description: string | null
  status: string
  amount: number
  /** Set by Indigo CO drafter */
  ai_drafted: boolean
  approved_at: string | null
  approved_by: string | null
  created_at: string
  updated_at: string
}

/** BB — Client invoices. Indigo adds milestone_id + draw_request_id columns */
export interface Invoice {
  id: string
  tenant_id: string
  job_id: string
  customer_id: string
  invoice_number: string
  invoice_date: string
  due_date: string | null
  status: string
  subtotal: number
  tax: number
  total: number
  notes: string | null
  /** Added by Indigo */
  milestone_id: string | null
  /** Added by Indigo */
  draw_request_id: string | null
  /** Added by Indigo */
  stripe_session_id: string | null
  /** Added by Indigo */
  pdf_document_id: string | null
  journal_entry_id: string | null
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
  unit_price: number
  amount: number
  account_id: string | null
  linked_expense_item_id: string | null
  created_at: string
  updated_at: string
}

/** BB — Payments received */
export interface Payment {
  id: string
  tenant_id: string
  invoice_id: string | null
  customer_id: string | null
  job_id: string | null
  amount: number
  payment_date: string
  payment_method: string | null
  reference: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

/** BB — AP bills (always "expenses" not "bills" in this codebase) */
export interface Expense {
  id: string
  tenant_id: string
  job_id: string | null
  vendor_id: string | null
  expense_number: string
  expense_date: string
  due_date: string | null
  status: string
  subtotal: number
  tax: number
  total: number
  notes: string | null
  journal_entry_id: string | null
  created_at: string
  updated_at: string
}

/** BB — AP bill line items */
export interface ExpenseItem {
  id: string
  tenant_id: string
  expense_id: string
  job_id: string | null
  description: string
  quantity: number
  unit_price: number
  amount: number
  account_id: string | null
  created_at: string
  updated_at: string
}

/** BB — Double-entry journal entries */
export interface JournalEntry {
  id: string
  tenant_id: string
  entry_number: string
  entry_date: string
  description: string | null
  source_type: string | null
  source_id: string | null
  created_at: string
  updated_at: string
}

/** BB — Journal lines (NOT journal_entry_lines) */
export interface JournalLine {
  id: string
  tenant_id: string
  journal_entry_id: string
  account_id: string
  description: string | null
  debit: number
  credit: number
  source_type: string | null
  entry_date: string
  created_at: string
}

/** BB — Subcontractor company directory */
export interface Subcontractor {
  id: string
  tenant_id: string
  company_name: string
  contact_name: string | null
  email: string | null
  phone: string | null
  license_number: string | null
  insurance_expiry: string | null
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

/** BB — Subcontracts */
export interface Subcontract {
  id: string
  tenant_id: string
  job_id: string
  subcontractor_id: string
  contract_number: string
  scope: string | null
  amount: number
  status: string
  start_date: string | null
  end_date: string | null
  created_at: string
  updated_at: string
}

/** BB — Sub invoices */
export interface SubcontractInvoice {
  id: string
  tenant_id: string
  subcontract_id: string
  invoice_number: string | null
  amount: number
  invoice_date: string
  status: string
  notes: string | null
  created_at: string
  updated_at: string
}

/** BB — Sub change orders */
export interface SubcontractChangeOrder {
  id: string
  tenant_id: string
  subcontract_id: string
  co_number: number
  title: string
  amount: number
  status: string
  created_at: string
  updated_at: string
}

/** BB — Auto-numbering sequences */
export interface Sequence {
  tenant_id: string
  name: string
  year: number
  current: number
}

/** BB — Tenant settings */
export interface Setting {
  id: string
  tenant_id: string
  key: string
  value: Json
  created_at: string
  updated_at: string
}

// ---------------------------------------------------------------------------
// Indigo-owned Tables
// ---------------------------------------------------------------------------

export interface UserProfile {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  phone: string | null
  created_at: string
  updated_at: string
}

export interface TenantMember {
  id: string
  tenant_id: string
  user_id: string
  role: MemberRole
  is_active: boolean
  invited_at: string | null
  joined_at: string | null
  created_at: string
  updated_at: string
}

export interface NotificationTemplate {
  id: string
  tenant_id: string | null
  key: string
  channel: string
  subject: string | null
  body: string
  created_at: string
  updated_at: string
}

export interface AuditLog {
  id: number   // bigint sequence, not uuid
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

/** 1:1 extension of BB jobs table */
export interface Project {
  id: string
  tenant_id: string
  job_id: string
  name: string
  description: string | null
  project_type: 'custom' | 'express' | null
  status: string
  pm_user_id: string | null
  super_user_id: string | null
  start_date: string | null
  target_completion: string | null
  actual_completion: string | null
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  created_at: string
  updated_at: string
}

export interface ProjectMember {
  id: string
  project_id: string
  user_id: string
  role: string
  created_at: string
}

export interface ProjectPhase {
  id: string
  tenant_id: string
  project_id: string
  name: string
  description: string | null
  status: PhaseStatus
  sort_order: number
  start_date: string | null
  end_date: string | null
  created_at: string
  updated_at: string
}

export interface Milestone {
  id: string
  tenant_id: string
  project_id: string
  phase_id: string | null
  name: string
  description: string | null
  due_date: string | null
  completed_at: string | null
  amount_cents: number | null
  requires_client_approval: boolean
  client_approved_at: string | null
  client_approved_by: string | null
  created_at: string
  updated_at: string
}

export interface ScheduleItem {
  id: string
  tenant_id: string
  project_id: string
  phase_id: string | null
  parent_id: string | null
  type: ScheduleItemType
  name: string
  start_date: string | null
  end_date: string | null
  duration_days: number | null
  percent_complete: number
  assigned_to: string | null
  trade: string | null
  notes: string | null
  is_critical_path: boolean
  created_at: string
  updated_at: string
}

export interface TaskDependency {
  id: string
  task_id: string
  depends_on_id: string
  type: string
}

export interface ProjectTemplate {
  id: string
  tenant_id: string | null
  name: string
  description: string | null
  project_type: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface TemplatePhase {
  id: string
  template_id: string
  name: string
  sort_order: number
  duration_days: number | null
}

export interface TemplateTask {
  id: string
  phase_id: string
  name: string
  sort_order: number
  duration_days: number | null
  trade: string | null
}

export interface DocumentFolder {
  id: string
  tenant_id: string
  project_id: string
  parent_id: string | null
  name: string
  is_client_visible: boolean
  created_at: string
  updated_at: string
}

export interface Document {
  id: string
  tenant_id: string
  project_id: string | null
  folder_id: string | null
  parent_id: string | null
  uploaded_by: string | null
  name: string
  type: DocumentType
  storage_path: string
  size_bytes: number | null
  mime_type: string | null
  version: number
  is_client_visible: boolean
  tags: string[]
  created_at: string
  updated_at: string
}

export interface DocumentSignature {
  id: string
  tenant_id: string
  document_id: string
  signer_id: string | null
  signer_email: string | null
  signer_name: string | null
  status: SignatureStatus
  token: string
  signed_at: string | null
  ip_address: string | null
  created_at: string
  updated_at: string
}

export interface LienWaiver {
  id: string
  tenant_id: string
  job_id: string
  subcontractor_id: string | null
  type: LienWaiverType
  through_date: string | null
  amount_cents: number | null
  status: string
  document_id: string | null
  signed_at: string | null
  created_at: string
  updated_at: string
}

export interface LineItemTemplate {
  id: string
  tenant_id: string | null
  name: string
  description: string | null
  unit: string | null
  unit_price_cents: number | null
  account_id: string | null
  category: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Estimate {
  id: string
  tenant_id: string
  job_id: string | null
  customer_id: string | null
  parent_id: string | null
  created_by: string | null
  title: string
  description: string | null
  status: EstimateStatus
  version: number
  subtotal_cents: number
  markup_percent: number
  markup_cents: number
  tax_percent: number
  tax_cents: number
  total_cents: number
  valid_until: string | null
  sent_at: string | null
  viewed_at: string | null
  approved_at: string | null
  rejected_at: string | null
  signature_document_id: string | null
  notes: string | null
  ai_drafted: boolean
  created_at: string
  updated_at: string
}

export interface EstimateSection {
  id: string
  tenant_id: string
  estimate_id: string
  name: string
  sort_order: number
  subtotal_cents: number
  created_at: string
  updated_at: string
}

export interface EstimateLineItem {
  id: string
  tenant_id: string
  estimate_id: string
  section_id: string | null
  template_id: string | null
  account_id: string | null
  description: string
  quantity: number
  unit: string | null
  unit_price_cents: number
  total_cents: number
  notes: string | null
  sort_order: number
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
  tenant_id: string
  job_change_order_id: string
  budget_line_item_id: string | null
  account_id: string | null
  description: string
  quantity: number
  unit: string | null
  unit_price_cents: number
  total_cents: number
  sort_order: number
  created_at: string
  updated_at: string
}

export interface DrawSchedule {
  id: string
  tenant_id: string
  job_id: string
  total_loan_amount_cents: number
  lender_name: string | null
  lender_contact: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface DrawRequest {
  id: string
  tenant_id: string
  job_id: string
  draw_schedule_id: string
  created_by: string | null
  number: number
  status: DrawStatus
  amount_requested_cents: number
  amount_approved_cents: number | null
  period_from: string | null
  period_to: string | null
  submitted_at: string | null
  approved_at: string | null
  funded_at: string | null
  lender_notes: string | null
  pdf_document_id: string | null
  created_at: string
  updated_at: string
}

export interface PurchaseOrder {
  id: string
  tenant_id: string
  job_id: string
  subcontractor_id: string | null
  subcontract_id: string | null
  created_by: string | null
  po_number: string
  description: string | null
  status: PoStatus
  amount_cents: number
  issued_date: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface RetainageRelease {
  id: string
  tenant_id: string
  job_id: string
  subcontract_id: string | null
  amount_cents: number
  release_date: string
  notes: string | null
  created_at: string
  updated_at: string
}

export interface SelectionCategory {
  id: string
  tenant_id: string
  project_id: string
  name: string
  description: string | null
  due_date: string | null
  is_client_visible: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface SelectionOption {
  id: string
  category_id: string
  name: string
  description: string | null
  manufacturer: string | null
  model_number: string | null
  unit_price_cents: number | null
  image_url: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

export interface ClientSelection {
  id: string
  tenant_id: string
  project_id: string
  category_id: string
  customer_id: string | null
  option_id: string | null
  job_change_order_id: string | null
  approved_by: string | null
  status: SelectionStatus
  client_notes: string | null
  pm_notes: string | null
  approved_at: string | null
  created_at: string
  updated_at: string
}

export interface MessageThread {
  id: string
  tenant_id: string
  project_id: string
  subject: string | null
  is_client_visible: boolean
  participant_ids: string[]
  last_message_at: string | null
  created_at: string
  updated_at: string
}

export interface Message {
  id: string
  thread_id: string
  sender_id: string
  content: string
  is_read: boolean
  attachments: Json | null
  created_at: string
}

export interface DailyLog {
  id: string
  tenant_id: string
  project_id: string
  author_id: string | null
  date: string
  weather: string | null
  temperature_f: number | null
  crew_count: number | null
  notes: string
  ai_client_summary: string | null
  is_client_visible: boolean
  published_at: string | null
  created_at: string
  updated_at: string
}

export interface DailyLogPhoto {
  id: string
  daily_log_id: string
  document_id: string
  caption: string | null
  ai_caption: string | null
  sort_order: number
  created_at: string
}

export interface Notification {
  id: string
  tenant_id: string
  user_id: string
  type: string
  title: string
  body: string | null
  data: Json | null
  is_read: boolean
  read_at: string | null
  created_at: string
}

export interface Rfi {
  id: string
  tenant_id: string
  project_id: string
  created_by: string | null
  rfi_number: string
  subject: string
  question: string
  answer: string | null
  status: RfiStatus
  priority: string | null
  due_date: string | null
  answered_at: string | null
  answered_by: string | null
  drawing_reference: string | null
  spec_reference: string | null
  ai_drafted: boolean
  created_at: string
  updated_at: string
}

export interface Submittal {
  id: string
  tenant_id: string
  project_id: string
  submittal_number: string
  title: string
  description: string | null
  status: string
  spec_section: string | null
  submitted_by: string | null
  submitted_at: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
}

export interface SubcontractorTrade {
  id: string
  tenant_id: string
  subcontractor_id: string
  trade: string
  created_at: string
}

export interface TimeEntry {
  id: string
  tenant_id: string
  project_id: string | null
  job_id: string | null
  user_id: string
  date: string
  hours: number
  description: string | null
  cost_code: string | null
  created_at: string
  updated_at: string
}

export interface GpsCheckin {
  id: string
  tenant_id: string
  user_id: string
  job_id: string | null
  project_id: string | null
  latitude: number
  longitude: number
  accuracy_meters: number | null
  checked_in_at: string
  checked_out_at: string | null
  notes: string | null
}

export interface PunchListItem {
  id: string
  tenant_id: string
  project_id: string
  created_by: string | null
  assigned_to: string | null
  title: string
  description: string | null
  location: string | null
  status: PunchStatus
  priority: PunchPriority
  due_date: string | null
  completed_at: string | null
  photo_urls: string[]
  created_at: string
  updated_at: string
}

export interface WarrantyClaim {
  id: string
  tenant_id: string
  project_id: string
  customer_id: string | null
  assigned_to: string | null
  title: string
  description: string
  status: string
  priority: string | null
  photo_urls: string[]
  resolved_at: string | null
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
  /** Full message history as JSONB array */
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
  embedding: number[] // vector(1536)
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
      tenants:                    { Row: Tenant;               Insert: Omit<Tenant, 'id' | 'created_at' | 'updated_at'>;               Update: Partial<Omit<Tenant, 'id'>> }
      accounts:                   { Row: Account;              Insert: Omit<Account, 'id' | 'created_at' | 'updated_at'>;              Update: Partial<Omit<Account, 'id'>> }
      customers:                  { Row: Customer;             Insert: Omit<Customer, 'id' | 'created_at' | 'updated_at'>;             Update: Partial<Omit<Customer, 'id'>> }
      vendors:                    { Row: Vendor;               Insert: Omit<Vendor, 'id' | 'created_at' | 'updated_at'>;               Update: Partial<Omit<Vendor, 'id'>> }
      jobs:                       { Row: Job;                  Insert: Omit<Job, 'id' | 'created_at' | 'updated_at'>;                  Update: Partial<Omit<Job, 'id'>> }
      job_change_orders:          { Row: JobChangeOrder;       Insert: Omit<JobChangeOrder, 'id' | 'created_at' | 'updated_at'>;       Update: Partial<Omit<JobChangeOrder, 'id'>> }
      invoices:                   { Row: Invoice;              Insert: Omit<Invoice, 'id' | 'created_at' | 'updated_at'>;              Update: Partial<Omit<Invoice, 'id'>> }
      invoice_items:              { Row: InvoiceItem;          Insert: Omit<InvoiceItem, 'id' | 'created_at' | 'updated_at'>;          Update: Partial<Omit<InvoiceItem, 'id'>> }
      payments:                   { Row: Payment;              Insert: Omit<Payment, 'id' | 'created_at' | 'updated_at'>;              Update: Partial<Omit<Payment, 'id'>> }
      expenses:                   { Row: Expense;              Insert: Omit<Expense, 'id' | 'created_at' | 'updated_at'>;              Update: Partial<Omit<Expense, 'id'>> }
      expense_items:              { Row: ExpenseItem;          Insert: Omit<ExpenseItem, 'id' | 'created_at' | 'updated_at'>;          Update: Partial<Omit<ExpenseItem, 'id'>> }
      journal_entries:            { Row: JournalEntry;         Insert: Omit<JournalEntry, 'id' | 'created_at' | 'updated_at'>;         Update: Partial<Omit<JournalEntry, 'id'>> }
      journal_lines:              { Row: JournalLine;          Insert: Omit<JournalLine, 'id' | 'created_at'>;                         Update: Partial<Omit<JournalLine, 'id'>> }
      subcontractors:             { Row: Subcontractor;        Insert: Omit<Subcontractor, 'id' | 'created_at' | 'updated_at'>;        Update: Partial<Omit<Subcontractor, 'id'>> }
      subcontracts:               { Row: Subcontract;          Insert: Omit<Subcontract, 'id' | 'created_at' | 'updated_at'>;          Update: Partial<Omit<Subcontract, 'id'>> }
      subcontract_invoices:       { Row: SubcontractInvoice;   Insert: Omit<SubcontractInvoice, 'id' | 'created_at' | 'updated_at'>;   Update: Partial<Omit<SubcontractInvoice, 'id'>> }
      subcontract_change_orders:  { Row: SubcontractChangeOrder; Insert: Omit<SubcontractChangeOrder, 'id' | 'created_at' | 'updated_at'>; Update: Partial<Omit<SubcontractChangeOrder, 'id'>> }
      settings:                   { Row: Setting;              Insert: Omit<Setting, 'id' | 'created_at' | 'updated_at'>;              Update: Partial<Omit<Setting, 'id'>> }
      // Indigo tables
      user_profiles:              { Row: UserProfile;          Insert: Omit<UserProfile, 'created_at' | 'updated_at'>;                 Update: Partial<Omit<UserProfile, 'id'>> }
      tenant_members:             { Row: TenantMember;         Insert: Omit<TenantMember, 'id' | 'created_at' | 'updated_at'>;         Update: Partial<Omit<TenantMember, 'id'>> }
      audit_log:                  { Row: AuditLog;             Insert: Omit<AuditLog, 'id' | 'created_at'>;                            Update: never }
      projects:                   { Row: Project;              Insert: Omit<Project, 'id' | 'created_at' | 'updated_at'>;              Update: Partial<Omit<Project, 'id'>> }
      project_members:            { Row: ProjectMember;        Insert: Omit<ProjectMember, 'id' | 'created_at'>;                       Update: never }
      project_phases:             { Row: ProjectPhase;         Insert: Omit<ProjectPhase, 'id' | 'created_at' | 'updated_at'>;         Update: Partial<Omit<ProjectPhase, 'id'>> }
      milestones:                 { Row: Milestone;            Insert: Omit<Milestone, 'id' | 'created_at' | 'updated_at'>;            Update: Partial<Omit<Milestone, 'id'>> }
      schedule_items:             { Row: ScheduleItem;         Insert: Omit<ScheduleItem, 'id' | 'created_at' | 'updated_at'>;         Update: Partial<Omit<ScheduleItem, 'id'>> }
      document_folders:           { Row: DocumentFolder;       Insert: Omit<DocumentFolder, 'id' | 'created_at' | 'updated_at'>;       Update: Partial<Omit<DocumentFolder, 'id'>> }
      documents:                  { Row: Document;             Insert: Omit<Document, 'id' | 'created_at' | 'updated_at'>;             Update: Partial<Omit<Document, 'id'>> }
      document_signatures:        { Row: DocumentSignature;    Insert: Omit<DocumentSignature, 'id' | 'created_at' | 'updated_at'>;    Update: Partial<Omit<DocumentSignature, 'id'>> }
      lien_waivers:               { Row: LienWaiver;           Insert: Omit<LienWaiver, 'id' | 'created_at' | 'updated_at'>;           Update: Partial<Omit<LienWaiver, 'id'>> }
      line_item_templates:        { Row: LineItemTemplate;     Insert: Omit<LineItemTemplate, 'id' | 'created_at' | 'updated_at'>;     Update: Partial<Omit<LineItemTemplate, 'id'>> }
      estimates:                  { Row: Estimate;             Insert: Omit<Estimate, 'id' | 'created_at' | 'updated_at'>;             Update: Partial<Omit<Estimate, 'id'>> }
      estimate_sections:          { Row: EstimateSection;      Insert: Omit<EstimateSection, 'id' | 'created_at' | 'updated_at'>;      Update: Partial<Omit<EstimateSection, 'id'>> }
      estimate_line_items:        { Row: EstimateLineItem;     Insert: Omit<EstimateLineItem, 'id' | 'created_at' | 'updated_at'>;     Update: Partial<Omit<EstimateLineItem, 'id'>> }
      budgets:                    { Row: Budget;               Insert: Omit<Budget, 'id' | 'created_at' | 'updated_at'>;               Update: Partial<Omit<Budget, 'id'>> }
      budget_line_items:          { Row: BudgetLineItem;       Insert: Omit<BudgetLineItem, 'id' | 'created_at' | 'updated_at'>;       Update: Partial<Omit<BudgetLineItem, 'id'>> }
      change_order_line_items:    { Row: ChangeOrderLineItem;  Insert: Omit<ChangeOrderLineItem, 'id' | 'created_at' | 'updated_at'>;  Update: Partial<Omit<ChangeOrderLineItem, 'id'>> }
      draw_schedules:             { Row: DrawSchedule;         Insert: Omit<DrawSchedule, 'id' | 'created_at' | 'updated_at'>;         Update: Partial<Omit<DrawSchedule, 'id'>> }
      draw_requests:              { Row: DrawRequest;          Insert: Omit<DrawRequest, 'id' | 'created_at' | 'updated_at'>;          Update: Partial<Omit<DrawRequest, 'id'>> }
      purchase_orders:            { Row: PurchaseOrder;        Insert: Omit<PurchaseOrder, 'id' | 'created_at' | 'updated_at'>;        Update: Partial<Omit<PurchaseOrder, 'id'>> }
      retainage_releases:         { Row: RetainageRelease;     Insert: Omit<RetainageRelease, 'id' | 'created_at'>;                    Update: Partial<Omit<RetainageRelease, 'id'>> }
      selection_categories:       { Row: SelectionCategory;    Insert: Omit<SelectionCategory, 'id' | 'created_at' | 'updated_at'>;    Update: Partial<Omit<SelectionCategory, 'id'>> }
      selection_options:          { Row: SelectionOption;      Insert: Omit<SelectionOption, 'id' | 'created_at' | 'updated_at'>;      Update: Partial<Omit<SelectionOption, 'id'>> }
      client_selections:          { Row: ClientSelection;      Insert: Omit<ClientSelection, 'id' | 'created_at' | 'updated_at'>;      Update: Partial<Omit<ClientSelection, 'id'>> }
      message_threads:            { Row: MessageThread;        Insert: Omit<MessageThread, 'id' | 'created_at' | 'updated_at'>;        Update: Partial<Omit<MessageThread, 'id'>> }
      messages:                   { Row: Message;              Insert: Omit<Message, 'id' | 'created_at'>;                             Update: Partial<Omit<Message, 'id'>> }
      daily_logs:                 { Row: DailyLog;             Insert: Omit<DailyLog, 'id' | 'created_at' | 'updated_at'>;             Update: Partial<Omit<DailyLog, 'id'>> }
      daily_log_photos:           { Row: DailyLogPhoto;        Insert: Omit<DailyLogPhoto, 'id' | 'created_at'>;                       Update: Partial<Omit<DailyLogPhoto, 'id'>> }
      notifications:              { Row: Notification;         Insert: Omit<Notification, 'id' | 'created_at'>;                        Update: Partial<Omit<Notification, 'id'>> }
      rfis:                       { Row: Rfi;                  Insert: Omit<Rfi, 'id' | 'created_at' | 'updated_at'>;                  Update: Partial<Omit<Rfi, 'id'>> }
      submittals:                 { Row: Submittal;            Insert: Omit<Submittal, 'id' | 'created_at' | 'updated_at'>;            Update: Partial<Omit<Submittal, 'id'>> }
      subcontractor_trades:       { Row: SubcontractorTrade;   Insert: Omit<SubcontractorTrade, 'id' | 'created_at'>;                  Update: never }
      time_entries:               { Row: TimeEntry;            Insert: Omit<TimeEntry, 'id' | 'created_at' | 'updated_at'>;            Update: Partial<Omit<TimeEntry, 'id'>> }
      gps_checkins:               { Row: GpsCheckin;           Insert: Omit<GpsCheckin, 'id'>;                                         Update: Partial<Omit<GpsCheckin, 'id'>> }
      punch_list_items:           { Row: PunchListItem;        Insert: Omit<PunchListItem, 'id' | 'created_at' | 'updated_at'>;        Update: Partial<Omit<PunchListItem, 'id'>> }
      warranty_claims:            { Row: WarrantyClaim;        Insert: Omit<WarrantyClaim, 'id' | 'created_at' | 'updated_at'>;        Update: Partial<Omit<WarrantyClaim, 'id'>> }
      ai_conversations:           { Row: AiConversation;       Insert: Omit<AiConversation, 'id' | 'created_at' | 'updated_at'>;      Update: Partial<Omit<AiConversation, 'id'>> }
      ai_insights:                { Row: AiInsight;            Insert: Omit<AiInsight, 'id' | 'created_at'>;                           Update: Partial<Omit<AiInsight, 'id'>> }
      ai_generated_content:       { Row: AiGeneratedContent;   Insert: Omit<AiGeneratedContent, 'id' | 'created_at'>;                  Update: never }
      document_embeddings:        { Row: DocumentEmbedding;    Insert: Omit<DocumentEmbedding, 'id' | 'created_at'>;                   Update: never }
      ai_job_runs:                { Row: AiJobRun;             Insert: Omit<AiJobRun, 'id'>;                                           Update: Partial<Omit<AiJobRun, 'id'>> }
    }
    Functions: {
      get_user_tenant_ids:  { Args: Record<never, never>;  Returns: string[] }
      get_user_role:        { Args: { t_id: string };       Returns: MemberRole | null }
      user_has_role:        { Args: { tenant_id: string; role: MemberRole }; Returns: boolean }
      is_client_on_job:     { Args: { j_id: string };       Returns: boolean }
      can_access_project:   { Args: { proj_id: string };    Returns: boolean }
      auth_tenant_id:       { Args: Record<never, never>;  Returns: string | null }
      next_seq:             { Args: { p_tenant: string; p_name: string }; Returns: string }
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
    }
  }
}
