// ── Domain types for the Sales / Proposals feature ─────────────────────────

export type LeadStatus =
  | 'new'
  | 'contacted'
  | 'qualified'
  | 'proposal_sent'
  | 'won'
  | 'lost'

export type LeadSource =
  | 'referral'
  | 'website'
  | 'social'
  | 'repeat'
  | 'cold'
  | 'other'

export type ActivityType =
  | 'note'
  | 'call'
  | 'email'
  | 'meeting'
  | 'site_visit'

export type ProposalStatus =
  | 'draft'
  | 'sent'
  | 'viewed'
  | 'signed'
  | 'declined'
  | 'expired'

export interface Contact {
  id: string
  tenant_id: string
  first_name: string
  last_name: string | null
  email: string | null
  phone: string | null
  company: string | null
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface Lead {
  id: string
  tenant_id: string
  contact_id: string | null
  client_name: string
  client_email: string | null
  client_phone: string | null
  title: string
  job_address: string | null
  job_city: string | null
  job_state: string | null
  job_zip: string | null
  job_type: string | null
  description: string | null
  estimated_value_cents: number | null
  status: LeadStatus
  lead_source: LeadSource | null
  assigned_to: string | null
  lead_date: string
  follow_up_date: string | null
  won_date: string | null
  lost_date: string | null
  lost_reason: string | null
  project_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface LeadActivity {
  id: string
  tenant_id: string
  lead_id: string
  type: ActivityType
  description: string
  activity_date: string
  created_by: string | null
  created_at: string
}

export interface Proposal {
  id: string
  tenant_id: string
  lead_id: string | null
  title: string
  proposal_number: string | null
  client_name: string | null
  client_email: string | null
  job_address: string | null
  job_city: string | null
  job_state: string | null
  job_zip: string | null
  intro_text: string | null
  closeout_text: string | null
  col_item: boolean
  col_description: boolean
  col_unit_price: boolean
  col_quantity: boolean
  col_price: boolean
  status: ProposalStatus
  ai_drafted: boolean
  portal_token: string | null
  sent_at: string | null
  viewed_at: string | null
  expires_at: string | null
  signed_at: string | null
  signer_name: string | null
  signer_email: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface ProposalLineItem {
  id: string
  proposal_id: string
  tenant_id: string
  sort_order: number
  item_name: string
  description: string
  unit_price_cents: number
  quantity: number
}

export interface ProposalLineItemTemplate {
  id: string
  tenant_id: string
  item_name: string
  description: string
  unit_price_cents: number
  sort_order: number
  category: string
  created_at: string
  updated_at: string
}

// ── Pipeline constants ───────────────────────────────────────────────────────

export const LEAD_STATUSES: { value: LeadStatus; label: string; color: string }[] = [
  { value: 'new',           label: 'New',           color: 'bg-gray-100 text-gray-700' },
  { value: 'contacted',     label: 'Contacted',     color: 'bg-blue-100 text-blue-700' },
  { value: 'qualified',     label: 'Qualified',     color: 'bg-purple-100 text-purple-700' },
  { value: 'proposal_sent', label: 'Proposal Sent', color: 'bg-amber-100 text-amber-700' },
  { value: 'won',           label: 'Won',           color: 'bg-green-100 text-green-700' },
  { value: 'lost',          label: 'Lost',          color: 'bg-red-100 text-red-700' },
]

export const PIPELINE_STAGES: LeadStatus[] = [
  'new',
  'contacted',
  'qualified',
  'proposal_sent',
  'won',
  'lost',
]

export const LEAD_SOURCES: { value: LeadSource; label: string }[] = [
  { value: 'referral', label: 'Referral' },
  { value: 'website',  label: 'Website' },
  { value: 'social',   label: 'Social Media' },
  { value: 'repeat',   label: 'Repeat Client' },
  { value: 'cold',     label: 'Cold Outreach' },
  { value: 'other',    label: 'Other' },
]

export const ACTIVITY_TYPES: { value: ActivityType; label: string; icon: string }[] = [
  { value: 'note',       label: 'Note',       icon: '📝' },
  { value: 'call',       label: 'Call',       icon: '📞' },
  { value: 'email',      label: 'Email',      icon: '✉️' },
  { value: 'meeting',    label: 'Meeting',    icon: '🤝' },
  { value: 'site_visit', label: 'Site Visit', icon: '🏠' },
]

export const PROPOSAL_STATUSES: { value: ProposalStatus; label: string; color: string }[] = [
  { value: 'draft',    label: 'Draft',    color: 'bg-gray-100 text-gray-700' },
  { value: 'sent',     label: 'Sent',     color: 'bg-blue-100 text-blue-700' },
  { value: 'viewed',   label: 'Viewed',   color: 'bg-purple-100 text-purple-700' },
  { value: 'signed',   label: 'Signed',   color: 'bg-green-100 text-green-700' },
  { value: 'declined', label: 'Declined', color: 'bg-red-100 text-red-700' },
  { value: 'expired',  label: 'Expired',  color: 'bg-orange-100 text-orange-700' },
]

export function getLeadStatusMeta(status: LeadStatus) {
  return LEAD_STATUSES.find((s) => s.value === status) ?? LEAD_STATUSES[0]
}

export function getProposalStatusMeta(status: ProposalStatus) {
  return PROPOSAL_STATUSES.find((s) => s.value === status) ?? PROPOSAL_STATUSES[0]
}

export function lineTotal(item: ProposalLineItem): number {
  return Math.round(item.unit_price_cents * item.quantity)
}
