import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useLead } from './useLeads'
import {
  useProposal,
  useProposalLineItems,
  useUpdateProposal,
  useUpsertLineItems,
  useDeleteProposal,
} from './useProposals'
import { TemplatePickerModal } from './TemplatePickerModal'
import { ProposalPDFDocument } from './ProposalPDFDocument'
import { useCompanySettings } from '../settings/useCompanySettings'
import { getProposalStatusMeta, lineTotal, type ProposalLineItem } from './types'
import { useToast } from '@/stores/toastStore'
import { useAuth } from '@/hooks/useAuth'
import { formatMoney } from '@indigo/shared'
import { AIDraftPanel, type AIDraftResult } from '@/components/AIDraftPanel'
import {
  ChevronRightIcon,
  PlusIcon,
  TrashIcon,
  EyeIcon,
  SparklesIcon,
} from '@/components/ui/Icons'

// ── Draft line item type (client-side, no DB ids yet) ─────────────────────────

type DraftItem = {
  _key:             string  // stable local key for React
  id?:              string  // from DB if already saved
  item_name:        string
  description:      string
  unit_price_cents: number
  quantity:         number
}

function newDraftItem(): DraftItem {
  return {
    _key:             crypto.randomUUID(),
    item_name:        '',
    description:      '',
    unit_price_cents: 0,
    quantity:         1,
  }
}

function draftFromSaved(item: ProposalLineItem): DraftItem {
  return {
    _key:             item.id,
    id:               item.id,
    item_name:        item.item_name,
    description:      item.description,
    unit_price_cents: item.unit_price_cents,
    quantity:         item.quantity,
  }
}

// ── Price input helpers ──────────────────────────────────────────────────────

function centsToDisplay(cents: number): string {
  if (cents === 0) return ''
  const dollars = cents / 100
  // Allow negative for credits
  return dollars % 1 === 0 ? String(Math.trunc(dollars)) : dollars.toFixed(2)
}

function parseToCents(raw: string): number {
  const num = parseFloat(raw.replace(/[^0-9.\-]/g, ''))
  return isNaN(num) ? 0 : Math.round(num * 100)
}

function formatDisplayPrice(cents: number): string {
  if (cents === 0) return '$0'
  const dollars = cents / 100
  if (Math.abs(dollars) % 1 === 0) {
    return dollars < 0
      ? `-$${Math.abs(dollars).toLocaleString()}`
      : `$${dollars.toLocaleString()}`
  }
  return `$${dollars.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// ── Column settings panel ─────────────────────────────────────────────────────

function ColumnSettings({
  cols,
  onChange,
}: {
  cols: { col_item: boolean; col_description: boolean; col_unit_price: boolean; col_quantity: boolean; col_price: boolean }
  onChange: (patch: Partial<typeof cols>) => void
}) {
  const options = [
    { key: 'col_item' as const,        label: 'Item' },
    { key: 'col_description' as const, label: 'Description' },
    { key: 'col_unit_price' as const,  label: 'Unit Price' },
    { key: 'col_quantity' as const,    label: 'Quantity' },
    { key: 'col_price' as const,       label: 'Price' },
  ]

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-xs font-medium text-gray-500">Columns:</span>
      {options.map(({ key, label }) => (
        <label key={key} className="flex cursor-pointer items-center gap-1.5">
          <input
            type="checkbox"
            checked={cols[key]}
            onChange={(e) => onChange({ [key]: e.target.checked })}
            className="h-3.5 w-3.5 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
          />
          <span className="text-xs text-gray-600">{label}</span>
        </label>
      ))}
    </div>
  )
}

// ── Line items table ──────────────────────────────────────────────────────────

function LineItemsTable({
  items,
  cols,
  onChange,
  onAddTemplate,
}: {
  items: DraftItem[]
  cols: { col_item: boolean; col_description: boolean; col_unit_price: boolean; col_quantity: boolean; col_price: boolean }
  onChange: (items: DraftItem[]) => void
  onAddTemplate: () => void
}) {
  const dragKey    = useRef<string | null>(null)
  const dragOverKey = useRef<string | null>(null)

  function update(key: string, patch: Partial<DraftItem>) {
    onChange(items.map((it) => it._key === key ? { ...it, ...patch } : it))
  }

  function remove(key: string) {
    onChange(items.filter((it) => it._key !== key))
  }

  function addRow() {
    onChange([...items, newDraftItem()])
  }

  function handleDragStart(key: string) { dragKey.current = key }
  function handleDragOver(e: React.DragEvent, key: string) {
    e.preventDefault()
    dragOverKey.current = key
  }
  function handleDrop() {
    const fromKey = dragKey.current
    const toKey   = dragOverKey.current
    if (!fromKey || !toKey || fromKey === toKey) return
    const fromIdx = items.findIndex((i) => i._key === fromKey)
    const toIdx   = items.findIndex((i) => i._key === toKey)
    const next    = [...items]
    const [moved] = next.splice(fromIdx, 1)
    next.splice(toIdx, 0, moved)
    onChange(next)
    dragKey.current    = null
    dragOverKey.current = null
  }

  const total = items.reduce((sum, it) => sum + lineTotal({ ...it, id: '', proposal_id: '', tenant_id: '', sort_order: 0 }), 0)

  const thCls = 'border-b border-gray-200 bg-gray-50 px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500'

  return (
    <div>
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full min-w-[480px] border-collapse">
          <thead>
            <tr>
              <th className={`${thCls} w-8`} />
              {cols.col_item        && <th className={`${thCls} w-48`}>Item</th>}
              {cols.col_description && <th className={thCls}>Description</th>}
              {cols.col_unit_price  && <th className={`${thCls} w-28 text-right`}>Unit Price</th>}
              {cols.col_quantity    && <th className={`${thCls} w-16 text-right`}>Qty</th>}
              {cols.col_price       && <th className={`${thCls} w-28 text-right`}>Price</th>}
              <th className={`${thCls} w-8`} />
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => {
              const total = lineTotal({ ...item, id: '', proposal_id: '', tenant_id: '', sort_order: idx })
              return (
                <tr
                  key={item._key}
                  draggable
                  onDragStart={() => handleDragStart(item._key)}
                  onDragOver={(e) => handleDragOver(e, item._key)}
                  onDrop={handleDrop}
                  className="group border-b border-gray-100 last:border-0 hover:bg-gray-50/50 transition-colors"
                >
                  {/* Drag handle */}
                  <td className="px-2 py-2 w-8">
                    <div className="cursor-grab active:cursor-grabbing flex flex-col gap-0.5 items-center opacity-30 group-hover:opacity-60 transition-opacity">
                      <span className="block h-0.5 w-4 rounded-full bg-gray-400" />
                      <span className="block h-0.5 w-4 rounded-full bg-gray-400" />
                      <span className="block h-0.5 w-4 rounded-full bg-gray-400" />
                    </div>
                  </td>

                  {/* Item name */}
                  {cols.col_item && (
                    <td className="px-3 py-2 align-top">
                      <input
                        className="w-full rounded border-0 bg-transparent text-sm font-semibold text-gray-900 placeholder:text-gray-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100 focus:rounded-md px-1.5 py-1 transition-all"
                        placeholder="Item name"
                        value={item.item_name}
                        onChange={(e) => update(item._key, { item_name: e.target.value })}
                      />
                    </td>
                  )}

                  {/* Description */}
                  {cols.col_description && (
                    <td className="px-3 py-2 align-top">
                      <AutoResizeTextarea
                        className="w-full resize-none rounded border-0 bg-transparent text-sm text-gray-700 placeholder:text-gray-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100 focus:rounded-md px-1.5 py-1 transition-all"
                        placeholder="Description"
                        value={item.description}
                        onChange={(v) => update(item._key, { description: v })}
                      />
                    </td>
                  )}

                  {/* Unit price */}
                  {cols.col_unit_price && (
                    <td className="px-3 py-2 align-top text-right">
                      <PriceInput
                        cents={item.unit_price_cents}
                        onChange={(c) => update(item._key, { unit_price_cents: c })}
                      />
                    </td>
                  )}

                  {/* Quantity */}
                  {cols.col_quantity && (
                    <td className="px-3 py-2 align-top text-right">
                      <input
                        type="number"
                        min="0"
                        step="1"
                        className="w-16 rounded border-0 bg-transparent text-right text-sm text-gray-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100 focus:rounded-md px-1 py-1 transition-all"
                        value={item.quantity}
                        onChange={(e) => update(item._key, { quantity: parseFloat(e.target.value) || 1 })}
                      />
                    </td>
                  )}

                  {/* Price / line total */}
                  {cols.col_price && (
                    <td className="px-3 py-2 align-top text-right">
                      {(cols.col_unit_price || cols.col_quantity) ? (
                        // Computed value — read-only display
                        <span className={`text-sm font-semibold tabular-nums ${total < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                          {formatDisplayPrice(total)}
                        </span>
                      ) : (
                        // Direct price entry
                        <PriceInput
                          cents={item.unit_price_cents}
                          onChange={(c) => update(item._key, { unit_price_cents: c })}
                        />
                      )}
                    </td>
                  )}

                  {/* Delete */}
                  <td className="px-2 py-2 align-top w-8">
                    <button
                      onClick={() => remove(item._key)}
                      className="rounded p-1 text-gray-300 opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-500 transition-all"
                    >
                      <TrashIcon className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {/* Add row / template buttons */}
        <div className="flex items-center gap-3 border-t border-gray-100 bg-gray-50 px-4 py-2.5">
          <button
            onClick={addRow}
            className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-brand-600 transition-colors"
          >
            <PlusIcon className="h-3.5 w-3.5" strokeWidth={2.5} />
            Add Row
          </button>
          <span className="text-gray-200">|</span>
          <button
            onClick={onAddTemplate}
            className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-brand-600 transition-colors"
          >
            <PlusIcon className="h-3.5 w-3.5" strokeWidth={2.5} />
            Add from Template
          </button>
        </div>
      </div>

      {/* Total */}
      <div className="mt-4 flex justify-end">
        <div className="rounded-xl border border-gray-200 bg-white px-6 py-3">
          <div className="flex items-baseline gap-3">
            <span className="text-sm font-medium text-gray-500">Total Price:</span>
            <span className="text-xl font-bold tabular-nums text-gray-900">
              {formatMoney(total)}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Auto-resize textarea ──────────────────────────────────────────────────────

function AutoResizeTextarea({
  value,
  onChange,
  className,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  className?: string
  placeholder?: string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 'px'
  }, [value])

  return (
    <textarea
      ref={ref}
      className={className}
      placeholder={placeholder}
      value={value}
      rows={1}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

// ── Price input ───────────────────────────────────────────────────────────────

function PriceInput({ cents, onChange }: { cents: number; onChange: (c: number) => void }) {
  const [editing, setEditing] = useState(false)
  const [raw, setRaw]         = useState('')

  function handleFocus() {
    setRaw(centsToDisplay(cents))
    setEditing(true)
  }

  function handleBlur() {
    onChange(parseToCents(raw))
    setEditing(false)
  }

  return (
    <div className="relative">
      {!editing && (
        <span
          className={`block w-full cursor-text rounded px-1.5 py-1 text-right text-sm font-semibold tabular-nums hover:bg-gray-100 transition-colors ${
            cents < 0 ? 'text-red-600' : 'text-gray-900'
          }`}
          onClick={() => { setRaw(centsToDisplay(cents)); setEditing(true) }}
        >
          {formatDisplayPrice(cents)}
        </span>
      )}
      {editing && (
        <input
          type="text"
          autoFocus
          className="w-full rounded border-0 bg-white text-right text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-100 focus:rounded-md px-1.5 py-1 transition-all"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur() }}
        />
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function ProposalEditorPage() {
  const { id: leadId = '', proposalId = '' } = useParams<{ id: string; proposalId: string }>()
  const navigate = useNavigate()
  const toast    = useToast()

  const { session, activeTenantId } = useAuth()
  const authToken = session?.access_token ?? ''

  const { data: lead }     = useLead(leadId)
  const { data: proposal, isLoading: propLoading } = useProposal(proposalId)
  const { data: savedItems = [], isLoading: itemsLoading } = useProposalLineItems(proposalId)
  const { data: branding } = useCompanySettings()

  const updateProposal = useUpdateProposal()
  const upsertItems    = useUpsertLineItems()
  const deleteProposal = useDeleteProposal()

  // ── Local draft state ───────────────────────────────────────────────────────

  const [title,         setTitle]         = useState('')
  const [introText,     setIntroText]     = useState('')
  const [closeoutText,  setCloseoutText]  = useState('')
  const [clientName,    setClientName]    = useState('')
  const [clientEmail,   setClientEmail]   = useState('')
  const [jobAddress,    setJobAddress]    = useState('')
  const [jobCity,       setJobCity]       = useState('')
  const [jobState,      setJobState]      = useState('')
  const [jobZip,        setJobZip]        = useState('')
  const [cols, setCols] = useState({
    col_item: true, col_description: true, col_unit_price: false,
    col_quantity: false, col_price: true,
  })
  const [items,           setItems]           = useState<DraftItem[]>([])
  const [showTemplatePicker, setShowTemplatePicker] = useState(false)
  const [showDeleteConfirm,  setShowDeleteConfirm]  = useState(false)
  const [showAIPanel,        setShowAIPanel]        = useState(false)
  const [isDirty, setIsDirty]                 = useState(false)
  const [isSaving, setIsSaving]               = useState(false)
  const [isPdfGenerating, setIsPdfGenerating] = useState(false)
  const initialized = useRef(false)

  // Populate draft from loaded data
  useEffect(() => {
    if (!proposal || initialized.current) return
    setTitle(proposal.title)
    setIntroText(proposal.intro_text ?? '')
    setCloseoutText(proposal.closeout_text ?? '')
    setClientName(proposal.client_name ?? '')
    setClientEmail(proposal.client_email ?? '')
    setJobAddress(proposal.job_address ?? '')
    setJobCity(proposal.job_city ?? '')
    setJobState(proposal.job_state ?? '')
    setJobZip(proposal.job_zip ?? '')
    setCols({
      col_item:        proposal.col_item,
      col_description: proposal.col_description,
      col_unit_price:  proposal.col_unit_price,
      col_quantity:    proposal.col_quantity,
      col_price:       proposal.col_price,
    })
    initialized.current = true
  }, [proposal])

  useEffect(() => {
    if (savedItems.length > 0 && initialized.current) {
      setItems(savedItems.map(draftFromSaved))
    }
  }, [savedItems])

  function markDirty() { setIsDirty(true) }

  // ── Apply AI draft ──────────────────────────────────────────────────────────

  function handleAIApply(draft: AIDraftResult) {
    setTitle(draft.title)
    setIntroText(draft.intro_text)
    setItems(
      draft.line_items.map((item, i) => ({
        _key:             crypto.randomUUID(),
        item_name:        item.item_name,
        description:      item.description,
        unit_price_cents: item.unit_price_cents,
        quantity:         item.quantity,
        sort_order:       i,
      })),
    )
    setShowAIPanel(false)
    setIsDirty(true)
    toast.success('AI draft applied — review and save when ready')
  }

  // ── Save ────────────────────────────────────────────────────────────────────

  async function handleSave() {
    setIsSaving(true)
    try {
      await Promise.all([
        updateProposal.mutateAsync({
          id: proposalId,
          title,
          intro_text:    introText     || null,
          closeout_text: closeoutText  || null,
          client_name:   clientName    || null,
          client_email:  clientEmail   || null,
          job_address:   jobAddress    || null,
          job_city:      jobCity       || null,
          job_state:     jobState      || null,
          job_zip:       jobZip        || null,
          ...cols,
        }),
        upsertItems.mutateAsync({ proposalId, items }),
      ])
      setIsDirty(false)
      toast.success('Proposal saved')
    } catch {
      toast.error('Failed to save')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleMarkSent() {
    await updateProposal.mutateAsync({ id: proposalId, status: 'sent', sent_at: new Date().toISOString() })
    toast.success('Proposal marked as sent')
  }

  async function handleDelete() {
    await deleteProposal.mutateAsync({ id: proposalId, leadId })
    navigate(`/sales/leads/${leadId}`)
    toast.success('Proposal deleted')
  }

  // ── Template insert ─────────────────────────────────────────────────────────

  function handleInsertFromTemplates(
    newItems: Omit<ProposalLineItem, 'id' | 'proposal_id' | 'tenant_id' | 'sort_order'>[],
  ) {
    const drafts: DraftItem[] = newItems.map((item) => ({
      _key:             crypto.randomUUID(),
      item_name:        item.item_name,
      description:      item.description,
      unit_price_cents: item.unit_price_cents,
      quantity:         item.quantity,
    }))
    setItems((prev) => [...prev, ...drafts])
    markDirty()
  }

  // ── Portal link ─────────────────────────────────────────────────────────────

  const portalUrl = proposal?.portal_token
    ? `${window.location.origin}/portal/proposals/${proposal.portal_token}`
    : null

  function copyPortalLink() {
    if (portalUrl) {
      navigator.clipboard.writeText(portalUrl)
      toast.success('Link copied to clipboard')
    }
  }

  const handleDownloadPDF = useCallback(async () => {
    if (!proposal) return
    setIsPdfGenerating(true)
    try {
      const { pdf } = await import('@react-pdf/renderer')
      const blob = await pdf(
        <ProposalPDFDocument
          proposal={proposal}
          items={savedItems}
          logoUrl={branding?.logo_url}
          companyName={branding?.company_name}
          companyPhone={branding?.company_phone}
        />
      ).toBlob()
      const url = URL.createObjectURL(blob)
      const a   = document.createElement('a')
      a.href     = url
      a.download = `${proposal.title || 'Proposal'}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      toast.error('PDF generation failed')
      console.error(err)
    } finally {
      setIsPdfGenerating(false)
    }
  }, [proposal, savedItems])

  // ── Loading ─────────────────────────────────────────────────────────────────

  if (propLoading || itemsLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
      </div>
    )
  }

  if (!proposal) {
    return <div className="p-8 text-sm text-gray-500">Proposal not found.</div>
  }

  const statusMeta = getProposalStatusMeta(proposal.status)

  return (
    <div className="flex h-full flex-col">
      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-gray-200 bg-white px-5 py-3 lg:px-8">
        <div className="flex items-center justify-between gap-3">
          {/* Breadcrumb */}
          <div className="flex min-w-0 items-center gap-1.5 text-sm text-gray-500">
            <Link to="/sales" className="hover:text-brand-600 transition-colors whitespace-nowrap hidden sm:inline">Sales</Link>
            <ChevronRightIcon className="h-3 w-3 shrink-0 hidden sm:block" strokeWidth={2} />
            <Link to={`/sales/leads/${leadId}`} className="hover:text-brand-600 transition-colors truncate max-w-[100px] sm:max-w-[160px]">
              {lead?.title ?? 'Lead'}
            </Link>
            <ChevronRightIcon className="h-3 w-3 shrink-0" strokeWidth={2} />
            <span className="truncate font-medium text-gray-900 max-w-[120px] sm:max-w-none">{title || 'Proposal'}</span>
          </div>

          {/* Always-visible: status + save */}
          <div className="flex shrink-0 items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusMeta.color}`}>
              {statusMeta.label}
            </span>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:opacity-60 transition-colors"
            >
              {isSaving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>

        {/* Secondary actions row — wraps on small screens */}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowAIPanel((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-100 transition-colors"
          >
            <SparklesIcon className="h-3.5 w-3.5" />
            Draft with AI
          </button>
          {isDirty && (
            <span className="text-xs text-amber-600 font-medium">Unsaved changes</span>
          )}
          {portalUrl && (
            <button
              onClick={copyPortalLink}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Copy Client Link
            </button>
          )}
          <button
            onClick={handleDownloadPDF}
            disabled={isPdfGenerating}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-60 transition-colors"
          >
            {isPdfGenerating ? 'Generating…' : 'Download PDF'}
          </button>
          <Link
            to={`/sales/leads/${leadId}/proposals/${proposalId}/preview`}
            target="_blank"
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <EyeIcon className="h-3.5 w-3.5" />
            Preview
          </Link>
          {proposal.status === 'draft' && (
            <button
              onClick={handleMarkSent}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Mark Sent
            </button>
          )}
        </div>
      </div>

      {/* ── Editor body ─────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto bg-gray-50 pb-24 lg:pb-8">
        <div className="mx-auto max-w-4xl px-5 py-6 lg:px-8 space-y-6">

          {/* AI Draft Panel */}
          {showAIPanel && activeTenantId && (
            <AIDraftPanel
              tenantId={activeTenantId}
              authToken={authToken}
              leadId={leadId || undefined}
              jobType={lead?.job_type || undefined}
              address={lead?.job_address ? [lead.job_address, lead.job_city].filter(Boolean).join(', ') : undefined}
              onApply={handleAIApply}
              onDismiss={() => setShowAIPanel(false)}
            />
          )}

          {/* Proposal title */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-500 uppercase tracking-wide">Proposal Title</label>
            <input
              className="h-11 w-full rounded-xl border border-gray-200 bg-white px-4 text-lg font-semibold text-gray-900 placeholder:text-gray-300 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 transition-colors shadow-sm"
              placeholder="e.g. Robinson Sonoma Home Renovation"
              value={title}
              onChange={(e) => { setTitle(e.target.value); markDirty() }}
            />
          </div>

          {/* Column settings */}
          <div className="rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
            <ColumnSettings
              cols={cols}
              onChange={(patch) => { setCols((c) => ({ ...c, ...patch })); markDirty() }}
            />
          </div>

          {/* Client info */}
          <div className="rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Client Info</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-gray-500">Client Name</label>
                <input
                  className="h-9 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm text-gray-900 focus:border-brand-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100 transition-colors"
                  placeholder="Michael and Natalia Robinson"
                  value={clientName}
                  onChange={(e) => { setClientName(e.target.value); markDirty() }}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">Client Email</label>
                <input
                  type="email"
                  className="h-9 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm text-gray-900 focus:border-brand-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100 transition-colors"
                  value={clientEmail}
                  onChange={(e) => { setClientEmail(e.target.value); markDirty() }}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">Address</label>
                <input
                  className="h-9 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm text-gray-900 focus:border-brand-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100 transition-colors"
                  placeholder="1376 Grayson Ave"
                  value={jobAddress}
                  onChange={(e) => { setJobAddress(e.target.value); markDirty() }}
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="mb-1 block text-xs text-gray-500">City</label>
                  <input
                    className="h-9 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm text-gray-900 focus:border-brand-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100 transition-colors"
                    value={jobCity}
                    onChange={(e) => { setJobCity(e.target.value); markDirty() }}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-500">State</label>
                  <input
                    maxLength={2}
                    className="h-9 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm text-gray-900 focus:border-brand-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100 transition-colors"
                    value={jobState}
                    onChange={(e) => { setJobState(e.target.value.toUpperCase()); markDirty() }}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-500">Zip</label>
                  <input
                    className="h-9 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm text-gray-900 focus:border-brand-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100 transition-colors"
                    value={jobZip}
                    onChange={(e) => { setJobZip(e.target.value); markDirty() }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Intro text */}
          <div className="rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Intro / Cover Letter</h3>
            <textarea
              className="w-full resize-none rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-800 placeholder:text-gray-300 focus:border-brand-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100 transition-colors leading-relaxed"
              rows={8}
              placeholder="Thank you for considering Good Guy Builders for your project!&#10;&#10;Write your intro, pitch, and any context the client needs before reviewing the pricing table..."
              value={introText}
              onChange={(e) => { setIntroText(e.target.value); markDirty() }}
            />
          </div>

          {/* Line items */}
          <div className="rounded-xl border border-gray-200 bg-white px-5 py-5 shadow-sm">
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-wide text-gray-500">Line Items</h3>
            <LineItemsTable
              items={items}
              cols={cols}
              onChange={(next) => { setItems(next); markDirty() }}
              onAddTemplate={() => setShowTemplatePicker(true)}
            />
          </div>

          {/* Closeout text */}
          <div className="rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Closing Notes</h3>
            <textarea
              className="w-full resize-none rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-800 placeholder:text-gray-300 focus:border-brand-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100 transition-colors"
              rows={4}
              placeholder="Any closing remarks, next steps, or notes for the client..."
              value={closeoutText}
              onChange={(e) => { setCloseoutText(e.target.value); markDirty() }}
            />
          </div>

          {/* Signature preview */}
          <div className="rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm opacity-70">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Signature Block (auto)</h3>
            <p className="mb-4 text-sm text-gray-600 italic">
              I confirm that my action here represents my electronic signature and is binding.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
              {(['Signature', 'Date', 'Print Name'] as const).map((label) => (
                <div key={label}>
                  <p className="mb-1 text-xs font-medium text-gray-500">{label}</p>
                  <div className="h-9 rounded-lg border-b-2 border-gray-300" />
                </div>
              ))}
            </div>
          </div>

          {/* Danger zone */}
          <div className="rounded-xl border border-red-100 bg-white px-5 py-4">
            {showDeleteConfirm ? (
              <div>
                <p className="text-sm font-medium text-red-800">Delete this proposal?</p>
                <p className="mt-1 text-xs text-red-600">This cannot be undone.</p>
                <div className="mt-3 flex gap-2">
                  <button onClick={() => setShowDeleteConfirm(false)} className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors">Cancel</button>
                  <button onClick={handleDelete} className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 transition-colors">Delete</button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="flex items-center gap-1.5 text-xs font-medium text-red-500 hover:text-red-700 transition-colors"
              >
                <TrashIcon className="h-3.5 w-3.5" />
                Delete Proposal
              </button>
            )}
          </div>
        </div>
      </div>

      {showTemplatePicker && (
        <TemplatePickerModal
          onInsert={handleInsertFromTemplates}
          onClose={() => setShowTemplatePicker(false)}
        />
      )}
    </div>
  )
}
