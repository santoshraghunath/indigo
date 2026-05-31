import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { SubCompany, SubContact, UpsertSubCompanyInput, UpsertSubContactInput } from '@indigo/shared'
import {
  getSubCompanies,
  getSubContacts,
  upsertSubCompany,
  deleteSubCompany,
  upsertSubContact,
  deleteSubContact,
} from '@indigo/shared'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/stores/toastStore'
import { supabase } from '@/lib/supabase'
import { Skeleton } from '@/components/ui/Skeleton'
import {
  UsersIcon,
  PlusIcon,
  PencilIcon,
  ChevronDownIcon,
  XMarkIcon,
} from '@/components/ui/Icons'

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtDate(s: string | null | undefined): string {
  if (!s) return '—'
  return new Date(s + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

function expiryColor(expiry: string | null): string {
  if (!expiry) return 'text-gray-400'
  const diff = new Date(expiry).getTime() - Date.now()
  const days = diff / (1000 * 86400)
  if (days < 0)  return 'text-red-600 font-semibold'
  if (days < 30) return 'text-amber-600 font-semibold'
  return 'text-gray-600'
}

// ── Common input styles ────────────────────────────────────────────────────

const inputCls =
  'h-9 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm text-gray-900 ' +
  'placeholder:text-gray-400 focus:bg-white focus:border-brand-400 focus:outline-none ' +
  'focus:ring-2 focus:ring-brand-100 transition-colors'

const selectCls =
  'h-9 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm text-gray-900 ' +
  'focus:bg-white focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 transition-colors'

const labelCls = 'mb-1 block text-sm font-medium text-gray-700'

// ── Sub company form drawer ────────────────────────────────────────────────

function SubCompanyDrawer({
  tenantId,
  company,
  onClose,
  onSaved,
}: {
  tenantId: string
  company: SubCompany | null   // null = create new
  onClose: () => void
  onSaved: (id: string) => void
}) {
  const toast = useToast()
  const isNew = !company

  const [name,              setName]              = useState(company?.name              ?? '')
  const [trade,             setTrade]             = useState(company?.trade             ?? '')
  const [primaryEmail,      setPrimaryEmail]      = useState(company?.primary_email     ?? '')
  const [primaryPhone,      setPrimaryPhone]      = useState(company?.primary_phone     ?? '')
  const [website,           setWebsite]           = useState(company?.website           ?? '')
  const [addressLine1,      setAddressLine1]      = useState(company?.address_line1     ?? '')
  const [city,              setCity]              = useState(company?.city              ?? '')
  const [state,             setState]             = useState(company?.state             ?? '')
  const [zip,               setZip]               = useState(company?.zip               ?? '')
  const [licenseNumber,     setLicenseNumber]     = useState(company?.license_number    ?? '')
  const [licenseState,      setLicenseState]      = useState(company?.license_state     ?? '')
  const [licenseExpiry,     setLicenseExpiry]     = useState(company?.license_expiry    ?? '')
  const [insuranceCarrier,  setInsuranceCarrier]  = useState(company?.insurance_carrier ?? '')
  const [insurancePolicy,   setInsurancePolicy]   = useState(company?.insurance_policy  ?? '')
  const [insuranceExpiry,   setInsuranceExpiry]   = useState(company?.insurance_expiry  ?? '')
  const [w9OnFile,          setW9OnFile]          = useState(company?.w9_on_file        ?? false)
  const [isPreferred,       setIsPreferred]       = useState(company?.is_preferred      ?? false)
  const [rating,            setRating]            = useState<string>(company?.rating != null ? String(company.rating) : '')
  const [notes,             setNotes]             = useState(company?.notes             ?? '')
  const [nameError,         setNameError]         = useState('')

  const mutation = useMutation({
    mutationFn: () => {
      if (!name.trim()) { setNameError('Company name is required'); throw new Error('validation') }
      const input: UpsertSubCompanyInput = {
        id:                company?.id,
        name:              name.trim(),
        trade:             trade.trim()            || null,
        primary_email:     primaryEmail.trim()     || null,
        primary_phone:     primaryPhone.trim()     || null,
        website:           website.trim()          || null,
        address_line1:     addressLine1.trim()     || null,
        city:              city.trim()             || null,
        state:             state.trim()            || null,
        zip:               zip.trim()              || null,
        license_number:    licenseNumber.trim()    || null,
        license_state:     licenseState.trim()     || null,
        license_expiry:    licenseExpiry           || null,
        insurance_carrier: insuranceCarrier.trim() || null,
        insurance_policy:  insurancePolicy.trim()  || null,
        insurance_expiry:  insuranceExpiry         || null,
        w9_on_file:        w9OnFile,
        is_preferred:      isPreferred,
        rating:            rating ? parseInt(rating, 10) : null,
        notes:             notes.trim()            || null,
      }
      return upsertSubCompany(supabase, tenantId, input)
    },
    onSuccess: (data) => {
      toast.success(isNew ? 'Subcontractor added' : 'Saved')
      onSaved(data.id)
      onClose()
    },
    onError: (err) => {
      if ((err as Error).message !== 'validation') {
        toast.error('Save failed', (err as Error).message)
      }
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center px-4 pb-4 sm:pb-0">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 shrink-0">
          <h2 className="text-base font-semibold text-gray-900">
            {isNew ? 'Add Subcontractor' : `Edit — ${company!.name}`}
          </h2>
          <button type="button" onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 transition-colors">
            <XMarkIcon className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
          {/* Basic info */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Company Info</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className={labelCls}>Company Name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => { setName(e.target.value); setNameError('') }}
                  placeholder="Acme Framing LLC"
                  className={`${inputCls} ${nameError ? 'border-red-300 bg-red-50' : ''}`}
                  autoFocus
                />
                {nameError && <p className="mt-0.5 text-xs text-red-600">{nameError}</p>}
              </div>
              <div>
                <label className={labelCls}>Trade / Specialty</label>
                <input type="text" value={trade} onChange={(e) => setTrade(e.target.value)} placeholder="e.g. Framing" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Rating (1–5)</label>
                <select value={rating} onChange={(e) => setRating(e.target.value)} className={selectCls}>
                  <option value="">— No rating —</option>
                  {[1, 2, 3, 4, 5].map((r) => (
                    <option key={r} value={r}>{'★'.repeat(r)} {r}/5</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Email</label>
                <input type="email" value={primaryEmail} onChange={(e) => setPrimaryEmail(e.target.value)} placeholder="info@acme.com" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Phone</label>
                <input type="tel" value={primaryPhone} onChange={(e) => setPrimaryPhone(e.target.value)} placeholder="(555) 000-0000" className={inputCls} />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>Website</label>
                <input type="url" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://acme.com" className={inputCls} />
              </div>
            </div>
          </section>

          {/* Address */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Address</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className={labelCls}>Street</label>
                <input type="text" value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} placeholder="123 Main St" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>City</label>
                <input type="text" value={city} onChange={(e) => setCity(e.target.value)} className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelCls}>State</label>
                  <input type="text" value={state} onChange={(e) => setState(e.target.value)} placeholder="CA" maxLength={2} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>ZIP</label>
                  <input type="text" value={zip} onChange={(e) => setZip(e.target.value)} placeholder="90210" className={inputCls} />
                </div>
              </div>
            </div>
          </section>

          {/* Licensing */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">License</h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className={labelCls}>License Number</label>
                <input type="text" value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>State</label>
                <input type="text" value={licenseState} onChange={(e) => setLicenseState(e.target.value)} placeholder="CA" maxLength={2} className={inputCls} />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>License Expiry</label>
                <input type="date" value={licenseExpiry} onChange={(e) => setLicenseExpiry(e.target.value)} className={inputCls} />
              </div>
            </div>
          </section>

          {/* Insurance */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Insurance (COI)</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Carrier</label>
                <input type="text" value={insuranceCarrier} onChange={(e) => setInsuranceCarrier(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Policy #</label>
                <input type="text" value={insurancePolicy} onChange={(e) => setInsurancePolicy(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>COI Expiry</label>
                <input type="date" value={insuranceExpiry} onChange={(e) => setInsuranceExpiry(e.target.value)} className={inputCls} />
              </div>
            </div>
          </section>

          {/* Flags */}
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Flags</h3>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={w9OnFile} onChange={(e) => setW9OnFile(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
              W-9 on file
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={isPreferred} onChange={(e) => setIsPreferred(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
              Preferred vendor
            </label>
          </section>

          {/* Notes */}
          <section>
            <label className={labelCls}>Internal Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Any internal notes about this subcontractor…"
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:bg-white focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 transition-colors resize-none"
            />
          </section>
        </div>

        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-200 shrink-0">
          <button type="button" onClick={onClose} disabled={mutation.isPending}
            className="h-8 rounded-lg px-3.5 text-sm font-medium text-gray-700 hover:bg-gray-200 transition-colors disabled:opacity-50">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="inline-flex h-8 items-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:opacity-60"
          >
            {mutation.isPending ? 'Saving…' : isNew ? 'Add Subcontractor' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Sub contact form drawer ────────────────────────────────────────────────

function SubContactDrawer({
  subCompanyId,
  tenantId,
  contact,
  onClose,
  onSaved,
}: {
  subCompanyId: string
  tenantId: string
  contact: SubContact | null
  onClose: () => void
  onSaved: () => void
}) {
  const toast = useToast()

  const [firstName, setFirstName] = useState(contact?.first_name ?? '')
  const [lastName,  setLastName]  = useState(contact?.last_name  ?? '')
  const [title,     setTitle]     = useState(contact?.title      ?? '')
  const [email,     setEmail]     = useState(contact?.email      ?? '')
  const [phone,     setPhone]     = useState(contact?.phone      ?? '')
  const [isPrimary, setIsPrimary] = useState(contact?.is_primary ?? false)

  const mutation = useMutation({
    mutationFn: () => {
      const input: UpsertSubContactInput = {
        id:         contact?.id,
        first_name: firstName.trim() || 'Unknown',
        last_name:  lastName.trim()  || '',
        title:      title.trim()     || null,
        email:      email.trim()     || null,
        phone:      phone.trim()     || null,
        is_primary: isPrimary,
      }
      return upsertSubContact(supabase, subCompanyId, tenantId, input)
    },
    onSuccess: () => {
      toast.success(contact ? 'Contact saved' : 'Contact added')
      onSaved()
      onClose()
    },
    onError: (err) => {
      toast.error('Save failed', (err as Error).message)
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center px-4 pb-4 sm:pb-0">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">
            {contact ? 'Edit Contact' : 'Add Contact'}
          </h2>
          <button type="button" onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 transition-colors">
            <XMarkIcon className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); mutation.mutate() }} className="px-5 py-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>First Name</label>
              <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputCls} autoFocus />
            </div>
            <div>
              <label className={labelCls}>Last Name</label>
              <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputCls} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Title</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Project Lead" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Phone</label>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} />
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={isPrimary} onChange={(e) => setIsPrimary(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
            Primary contact
          </label>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} disabled={mutation.isPending}
              className="h-8 rounded-lg px-3.5 text-sm font-medium text-gray-700 hover:bg-gray-200 transition-colors disabled:opacity-50">
              Cancel
            </button>
            <button type="submit" disabled={mutation.isPending}
              className="inline-flex h-8 items-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:opacity-60">
              {mutation.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Sub company card ───────────────────────────────────────────────────────

function SubCompanyCard({
  company,
  tenantId,
  canManage,
  onEdit,
  onDeleted,
}: {
  company: SubCompany
  tenantId: string
  canManage: boolean
  onEdit: (c: SubCompany) => void
  onDeleted: () => void
}) {
  const toast        = useToast()
  const queryClient  = useQueryClient()
  const [expanded, setExpanded] = useState(false)

  const [contactModal, setContactModal] = useState<SubContact | null | 'new'>()

  const { data: contacts = [], isLoading: contactsLoading } = useQuery({
    queryKey: ['sub-contacts', company.id],
    queryFn:  () => getSubContacts(supabase, company.id),
    enabled:  expanded,
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteSubCompany(supabase, company.id, tenantId),
    onSuccess: () => {
      toast.success(`${company.name} removed`)
      onDeleted()
    },
    onError: (err) => {
      toast.error('Delete failed', (err as Error).message)
    },
  })

  const deleteContactMutation = useMutation({
    mutationFn: (id: string) => deleteSubContact(supabase, id),
    onSuccess: () => {
      toast.success('Contact removed')
      void queryClient.invalidateQueries({ queryKey: ['sub-contacts', company.id] })
    },
  })

  const hasLicenseExpiry    = !!company.license_expiry
  const hasInsuranceExpiry  = !!company.insurance_expiry

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
      {/* Header */}
      <div
        className="flex cursor-pointer items-center gap-4 px-5 py-4 hover:bg-gray-50/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {/* Icon */}
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700 text-sm font-bold select-none">
          {company.name.slice(0, 2).toUpperCase()}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-gray-900">{company.name}</span>
            {company.trade && (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">{company.trade}</span>
            )}
            {company.is_preferred && (
              <span className="rounded-full bg-yellow-50 px-2 py-0.5 text-[11px] font-semibold text-yellow-700">⭐ Preferred</span>
            )}
            {company.rating && (
              <span className="text-[11px] text-gray-500">{'★'.repeat(company.rating)}{'☆'.repeat(5 - company.rating)}</span>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-gray-400">
            {company.primary_email && <span>{company.primary_email}</span>}
            {company.primary_phone && <span>{company.primary_phone}</span>}
            {company.city && <span>{company.city}{company.state ? `, ${company.state}` : ''}</span>}
          </div>
        </div>

        {/* Expiry warnings */}
        <div className="hidden shrink-0 items-center gap-4 sm:flex">
          {hasInsuranceExpiry && (
            <div className="text-right">
              <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">COI</p>
              <p className={`text-xs ${expiryColor(company.insurance_expiry)}`}>
                {fmtDate(company.insurance_expiry)}
              </p>
            </div>
          )}
          {hasLicenseExpiry && (
            <div className="text-right">
              <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Lic.</p>
              <p className={`text-xs ${expiryColor(company.license_expiry)}`}>
                {fmtDate(company.license_expiry)}
              </p>
            </div>
          )}
          {canManage && (
            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => onEdit(company)}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-brand-600 transition-colors"
                title="Edit"
              >
                <PencilIcon className="h-3.5 w-3.5" strokeWidth={2} />
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirm(`Remove ${company.name}? This cannot be undone.`)) {
                    deleteMutation.mutate()
                  }
                }}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                title="Delete"
                disabled={deleteMutation.isPending}
              >
                <XMarkIcon className="h-3.5 w-3.5" strokeWidth={2} />
              </button>
            </div>
          )}
        </div>

        <ChevronDownIcon
          className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
          strokeWidth={2}
        />
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50/50 px-5 py-4 space-y-4">
          {/* Details grid */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
            {company.website && (
              <div>
                <p className="text-xs font-medium text-gray-400">Website</p>
                <a href={company.website} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline truncate block">
                  {company.website.replace(/^https?:\/\//, '')}
                </a>
              </div>
            )}
            {company.license_number && (
              <div>
                <p className="text-xs font-medium text-gray-400">License</p>
                <p className="text-gray-700">{company.license_number}{company.license_state ? ` (${company.license_state})` : ''}</p>
                {company.license_expiry && (
                  <p className={`text-xs ${expiryColor(company.license_expiry)}`}>Exp: {fmtDate(company.license_expiry)}</p>
                )}
              </div>
            )}
            {company.insurance_carrier && (
              <div>
                <p className="text-xs font-medium text-gray-400">Insurance (COI)</p>
                <p className="text-gray-700">{company.insurance_carrier}</p>
                {company.insurance_policy && <p className="text-xs text-gray-500">{company.insurance_policy}</p>}
                {company.insurance_expiry && (
                  <p className={`text-xs ${expiryColor(company.insurance_expiry)}`}>Exp: {fmtDate(company.insurance_expiry)}</p>
                )}
              </div>
            )}
            {company.address_line1 && (
              <div>
                <p className="text-xs font-medium text-gray-400">Address</p>
                <p className="text-gray-700">{company.address_line1}</p>
                {(company.city || company.state) && <p className="text-xs text-gray-500">{[company.city, company.state, company.zip].filter(Boolean).join(', ')}</p>}
              </div>
            )}
            <div>
              <p className="text-xs font-medium text-gray-400">Compliance</p>
              <p className="text-gray-700">{company.w9_on_file ? '✓ W-9 on file' : '✗ No W-9'}</p>
            </div>
          </div>

          {company.notes && (
            <p className="text-sm text-gray-600 italic">{company.notes}</p>
          )}

          {/* Contacts */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Contacts</h4>
              {canManage && (
                <button
                  type="button"
                  onClick={() => setContactModal('new')}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-gray-500 hover:bg-white hover:text-brand-700 transition-colors"
                >
                  <PlusIcon className="h-3 w-3" strokeWidth={2.5} />
                  Add Contact
                </button>
              )}
            </div>
            {contactsLoading ? (
              <Skeleton className="h-10 w-full rounded-xl" />
            ) : contacts.length === 0 ? (
              <p className="text-xs text-gray-400">No contacts on file.</p>
            ) : (
              <div className="space-y-1.5">
                {contacts.map((c) => (
                  <div key={c.id} className="flex items-center justify-between rounded-lg bg-white border border-gray-200 px-3 py-2 text-sm shadow-sm">
                    <div>
                      <span className="font-medium text-gray-900">
                        {c.first_name} {c.last_name}
                        {c.is_primary && <span className="ml-1 text-[10px] text-brand-600 font-semibold">(Primary)</span>}
                      </span>
                      {c.title && <span className="ml-2 text-xs text-gray-400">{c.title}</span>}
                      <div className="mt-0.5 flex gap-3 text-xs text-gray-400">
                        {c.email && <span>{c.email}</span>}
                        {c.phone && <span>{c.phone}</span>}
                      </div>
                    </div>
                    {canManage && (
                      <div className="flex items-center gap-1 ml-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => setContactModal(c)}
                          className="rounded p-1 text-gray-400 hover:text-brand-600 transition-colors"
                          title="Edit"
                        >
                          <PencilIcon className="h-3 w-3" strokeWidth={2} />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm('Remove this contact?')) deleteContactMutation.mutate(c.id)
                          }}
                          className="rounded p-1 text-gray-400 hover:text-red-500 transition-colors"
                          title="Remove"
                        >
                          <XMarkIcon className="h-3 w-3" strokeWidth={2} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Contact modal */}
      {contactModal !== undefined && (
        <SubContactDrawer
          subCompanyId={company.id}
          tenantId={tenantId}
          contact={contactModal === 'new' ? null : contactModal}
          onClose={() => setContactModal(undefined)}
          onSaved={() => {
            setContactModal(undefined)
            void queryClient.invalidateQueries({ queryKey: ['sub-contacts', company.id] })
          }}
        />
      )}
    </div>
  )
}

// ── Skeleton ───────────────────────────────────────────────────────────────

function SubsSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-card">
          <Skeleton className="h-9 w-9 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-28" />
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────

export function SubcontractorsPage() {
  const { activeTenantId, tenantMemberships } = useAuth()
  const queryClient = useQueryClient()
  const tenantId    = activeTenantId ?? ''

  const [search,       setSearch]       = useState('')
  const [tradeFilter,  setTradeFilter]  = useState('all')
  const [showInactive, setShowInactive] = useState(false)
  const [companyDrawer, setCompanyDrawer] = useState<SubCompany | null | 'new'>()

  const myRole      = tenantMemberships.find((m) => m.tenant_id === tenantId)?.role ?? ''
  const canManage   = ['owner', 'admin', 'project_manager'].includes(myRole)

  const { data: companies = [], isLoading } = useQuery({
    queryKey: ['sub-companies', tenantId, showInactive],
    queryFn:  () => getSubCompanies(supabase, tenantId, showInactive),
    enabled:  !!tenantId,
  })

  // Unique trades for filter
  const trades = Array.from(new Set(companies.map((c) => c.trade).filter(Boolean))) as string[]

  const filtered = companies.filter((c) => {
    if (tradeFilter !== 'all' && c.trade !== tradeFilter) return false
    if (search) {
      const q = search.toLowerCase()
      if (
        !c.name.toLowerCase().includes(q) &&
        !(c.trade ?? '').toLowerCase().includes(q) &&
        !(c.primary_email ?? '').toLowerCase().includes(q)
      ) return false
    }
    return true
  })

  return (
    <div className="px-5 py-6 lg:px-8">
      {/* ── Header ────────────────────────────────────────────── */}
      <div className="mb-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50">
              <UsersIcon className="h-5 w-5 text-brand-600" strokeWidth={1.75} />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Subcontractors</h1>
              <p className="text-sm text-gray-500">
                {isLoading ? 'Loading…' : `${companies.length} ${companies.length === 1 ? 'company' : 'companies'}`}
              </p>
            </div>
          </div>
          {canManage && (
            <button
              type="button"
              onClick={() => setCompanyDrawer('new')}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700 transition-colors"
            >
              <PlusIcon className="h-4 w-4" strokeWidth={2.5} />
              Add Subcontractor
            </button>
          )}
        </div>
      </div>

      {/* ── Filters ───────────────────────────────────────────── */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, trade, email…"
            className="h-9 w-full rounded-lg border border-gray-200 bg-white pl-3 pr-3 text-sm placeholder:text-gray-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 transition-colors"
          />
        </div>
        {trades.length > 0 && (
          <select
            value={tradeFilter}
            onChange={(e) => setTradeFilter(e.target.value)}
            className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
          >
            <option value="all">All Trades</option>
            {trades.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        )}
        <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
          />
          Show inactive
        </label>
        {(search || tradeFilter !== 'all') && (
          <button
            type="button"
            onClick={() => { setSearch(''); setTradeFilter('all') }}
            className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-500 hover:bg-gray-50 transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* ── Company list ──────────────────────────────────────── */}
      {isLoading ? (
        <SubsSkeleton />
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-white py-16 text-center">
          <UsersIcon className="mx-auto h-10 w-10 text-gray-300" strokeWidth={1} />
          <h3 className="mt-3 text-sm font-semibold text-gray-900">
            {search || tradeFilter !== 'all' ? 'No results' : 'No subcontractors yet'}
          </h3>
          <p className="mt-1 text-sm text-gray-500 max-w-xs">
            {search || tradeFilter !== 'all'
              ? 'Try a different search or filter.'
              : canManage
              ? 'Add your first subcontractor company to build your vendor directory.'
              : 'No subcontractors have been added yet.'}
          </p>
          {canManage && !search && tradeFilter === 'all' && (
            <button
              type="button"
              onClick={() => setCompanyDrawer('new')}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700"
            >
              <PlusIcon className="h-4 w-4" strokeWidth={2.5} />
              Add Subcontractor
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((c) => (
            <SubCompanyCard
              key={c.id}
              company={c}
              tenantId={tenantId}
              canManage={canManage}
              onEdit={(co) => setCompanyDrawer(co)}
              onDeleted={() => void queryClient.invalidateQueries({ queryKey: ['sub-companies', tenantId] })}
            />
          ))}
        </div>
      )}

      {/* ── Company drawer ────────────────────────────────────── */}
      {companyDrawer !== undefined && (
        <SubCompanyDrawer
          tenantId={tenantId}
          company={companyDrawer === 'new' ? null : companyDrawer}
          onClose={() => setCompanyDrawer(undefined)}
          onSaved={() => void queryClient.invalidateQueries({ queryKey: ['sub-companies', tenantId] })}
        />
      )}
    </div>
  )
}
