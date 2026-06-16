import { useState } from 'react'
import { useOutletContext, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  ProjectRow,
  PMSelectionCategory,
  PMSelectionOption,
  CreateSelectionCategoryInput,
  UpdateSelectionCategoryInput,
  CreateSelectionOptionInput,
  UpdateSelectionOptionInput,
} from '@indigo/shared'
import {
  getPMSelections,
  createSelectionCategory,
  updateSelectionCategory,
  deleteSelectionCategory,
  createSelectionOption,
  updateSelectionOption,
  deleteSelectionOption,
  approvePMClientSelection,
  formatMoney,
} from '@indigo/shared'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/stores/toastStore'
import { Skeleton } from '@/components/ui/Skeleton'
import { PlusIcon, PencilIcon, TrashIcon } from '@/components/ui/Icons'

interface OutletCtx {
  project: ProjectRow | undefined
  isLoading: boolean
}

// ── Helpers ────────────────────────────────────────────────────────────────

function centsFromDollar(s: string): number {
  const n = parseFloat(s.replace(/[^0-9.]/g, ''))
  return isNaN(n) ? 0 : Math.round(n * 100)
}

function dollarFromCents(c: number): string {
  return (c / 100).toFixed(2)
}

function fmtDate(s: string | null): string {
  if (!s) return '—'
  return new Date(s + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function overage(priceCents: number, allowanceCents: number): number {
  return Math.max(0, priceCents - allowanceCents)
}

// ── Status config ──────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: 'pending',         label: 'Pending' },
  { value: 'client_choosing', label: 'Client Choosing' },
  { value: 'selected',        label: 'Selected' },
  { value: 'approved',        label: 'Approved' },
  { value: 'ordered',         label: 'Ordered' },
  { value: 'received',        label: 'Received' },
  { value: 'installed',       label: 'Installed' },
]

const STATUS_BADGE: Record<string, string> = {
  pending:         'bg-gray-100 text-gray-600',
  client_choosing: 'bg-amber-100 text-amber-700',
  selected:        'bg-blue-100 text-blue-700',
  approved:        'bg-green-100 text-green-700',
  ordered:         'bg-purple-100 text-purple-700',
  received:        'bg-teal-100 text-teal-700',
  installed:       'bg-green-100 text-green-700',
}

// ── Toggle ─────────────────────────────────────────────────────────────────

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <label className="flex items-center gap-1.5 cursor-pointer select-none">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-1 ${
          checked ? 'bg-brand-600' : 'bg-gray-200'
        }`}
      >
        <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition-transform ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
      </button>
      {label && <span className="text-xs text-gray-500">{label}</span>}
    </label>
  )
}

// ── Category Modal ─────────────────────────────────────────────────────────

interface CategoryFormState {
  name: string
  description: string
  allowanceDollars: string
  due_date: string
  is_client_visible: boolean
  notes: string
}

function CategoryModal({
  initial,
  onSave,
  onClose,
  isSaving,
}: {
  initial?: PMSelectionCategory
  onSave: (data: CategoryFormState) => void
  onClose: () => void
  isSaving: boolean
}) {
  const [form, setForm] = useState<CategoryFormState>({
    name:              initial?.name ?? '',
    description:       initial?.description ?? '',
    allowanceDollars:  initial ? dollarFromCents(initial.allowance_cents) : '',
    due_date:          initial?.due_date ?? '',
    is_client_visible: initial?.is_client_visible ?? false,
    notes:             initial?.notes ?? '',
  })

  const set = <K extends keyof CategoryFormState>(k: K, v: CategoryFormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="border-b border-gray-100 px-6 py-4">
          <h2 className="text-base font-semibold text-gray-900">
            {initial ? 'Edit Category' : 'New Selection Category'}
          </h2>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Name *</label>
            <input
              autoFocus
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="e.g. Kitchen Tile, Cabinet Hardware"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Description</label>
            <textarea
              rows={2}
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="Brief description for the client"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Allowance ($)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.allowanceDollars}
                onChange={(e) => set('allowanceDollars', e.target.value)}
                placeholder="0.00"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Due Date</label>
              <input
                type="date"
                value={form.due_date}
                onChange={(e) => set('due_date', e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Notes (internal)</label>
            <textarea
              rows={2}
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              placeholder="Internal notes not visible to client"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2.5">
            <div>
              <p className="text-xs font-medium text-gray-700">Visible to client</p>
              <p className="text-[11px] text-gray-400">Show this category in the client portal</p>
            </div>
            <Toggle
              checked={form.is_client_visible}
              onChange={(v) => set('is_client_visible', v)}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-100 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            disabled={!form.name.trim() || isSaving}
            onClick={() => onSave(form)}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40"
          >
            {isSaving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Option Modal ───────────────────────────────────────────────────────────

interface OptionFormState {
  name: string
  description: string
  sku: string
  vendor: string
  vendor_url: string
  unit_cost_dollars: string
  unit_price_dollars: string
  lead_time_days: string
}

function OptionModal({
  initial,
  onSave,
  onClose,
  isSaving,
}: {
  initial?: PMSelectionOption
  onSave: (data: OptionFormState) => void
  onClose: () => void
  isSaving: boolean
}) {
  const [form, setForm] = useState<OptionFormState>({
    name:               initial?.name ?? '',
    description:        initial?.description ?? '',
    sku:                initial?.sku ?? '',
    vendor:             initial?.vendor ?? '',
    vendor_url:         initial?.vendor_url ?? '',
    unit_cost_dollars:  initial ? dollarFromCents(initial.unit_cost_cents) : '',
    unit_price_dollars: initial ? dollarFromCents(initial.unit_price_cents) : '',
    lead_time_days:     initial?.lead_time_days?.toString() ?? '',
  })

  const set = <K extends keyof OptionFormState>(k: K, v: OptionFormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
        <div className="border-b border-gray-100 px-6 py-4">
          <h2 className="text-base font-semibold text-gray-900">
            {initial ? 'Edit Option' : 'Add Option'}
          </h2>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Option Name *</label>
            <input
              autoFocus
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="e.g. White Marble 12×24, Brushed Nickel"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Description</label>
            <textarea
              rows={2}
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="Spec details, finish, size, etc."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Client Price ($)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.unit_price_dollars}
                onChange={(e) => set('unit_price_dollars', e.target.value)}
                placeholder="0.00"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
              <p className="mt-0.5 text-[10px] text-gray-400">Shown to client vs. allowance</p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Your Cost ($)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.unit_cost_dollars}
                onChange={(e) => set('unit_cost_dollars', e.target.value)}
                placeholder="0.00"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
              <p className="mt-0.5 text-[10px] text-gray-400">Internal — not shown to client</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Vendor</label>
              <input
                value={form.vendor}
                onChange={(e) => set('vendor', e.target.value)}
                placeholder="e.g. Floor & Decor"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Lead Time (days)</label>
              <input
                type="number"
                min="0"
                value={form.lead_time_days}
                onChange={(e) => set('lead_time_days', e.target.value)}
                placeholder="e.g. 14"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">SKU / Item #</label>
              <input
                value={form.sku}
                onChange={(e) => set('sku', e.target.value)}
                placeholder="e.g. WM-1224-GL"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Product URL</label>
              <input
                type="url"
                value={form.vendor_url}
                onChange={(e) => set('vendor_url', e.target.value)}
                placeholder="https://…"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-100 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            disabled={!form.name.trim() || isSaving}
            onClick={() => onSave(form)}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40"
          >
            {isSaving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Category Card ──────────────────────────────────────────────────────────

function CategoryCard({
  category,
  userId,
  onRefresh,
}: {
  category: PMSelectionCategory
  userId: string
  onRefresh: () => void
}) {
  const toast = useToast()
  const [expanded, setExpanded] = useState(!category.selection && category.options.length === 0)
  const [editCat,  setEditCat]  = useState(false)
  const [addOpt,   setAddOpt]   = useState(false)
  const [editOpt,  setEditOpt]  = useState<PMSelectionOption | null>(null)

  const updateCatMut = useMutation({
    mutationFn: (input: UpdateSelectionCategoryInput) => updateSelectionCategory(supabase, category.id, input),
    onSuccess: () => { onRefresh(); setEditCat(false) },
    onError: (e: Error) => toast.error(e.message),
  })

  const deleteCatMut = useMutation({
    mutationFn: () => deleteSelectionCategory(supabase, category.id),
    onSuccess: onRefresh,
    onError: (e: Error) => toast.error(e.message),
  })

  const addOptMut = useMutation({
    mutationFn: (input: CreateSelectionOptionInput) => createSelectionOption(supabase, input),
    onSuccess: () => { onRefresh(); setAddOpt(false) },
    onError: (e: Error) => toast.error(e.message),
  })

  const updateOptMut = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateSelectionOptionInput }) =>
      updateSelectionOption(supabase, id, input),
    onSuccess: () => { onRefresh(); setEditOpt(null) },
    onError: (e: Error) => toast.error(e.message),
  })

  const deleteOptMut = useMutation({
    mutationFn: (optId: string) => deleteSelectionOption(supabase, optId),
    onSuccess: onRefresh,
    onError: (e: Error) => toast.error(e.message),
  })

  const approveMut = useMutation({
    mutationFn: () => approvePMClientSelection(supabase, category.selection!.id, userId),
    onSuccess: onRefresh,
    onError: (e: Error) => toast.error(e.message),
  })

  const sel = category.selection
  const selOption = sel?.option_id ? category.options.find((o) => o.id === sel.option_id) : null

  function handleSaveCat(form: CategoryFormState) {
    updateCatMut.mutate({
      name:              form.name.trim(),
      description:       form.description.trim() || null,
      allowance_cents:   centsFromDollar(form.allowanceDollars),
      due_date:          form.due_date || null,
      is_client_visible: form.is_client_visible,
      notes:             form.notes.trim() || null,
    })
  }

  function handleSaveNewOpt(form: OptionFormState) {
    addOptMut.mutate({
      categoryId:       category.id,
      name:             form.name.trim(),
      description:      form.description.trim() || null,
      sku:              form.sku.trim() || null,
      vendor:           form.vendor.trim() || null,
      vendor_url:       form.vendor_url.trim() || null,
      unit_cost_cents:  centsFromDollar(form.unit_cost_dollars),
      unit_price_cents: centsFromDollar(form.unit_price_dollars),
      lead_time_days:   form.lead_time_days ? parseInt(form.lead_time_days) : null,
    })
  }

  function handleSaveEditOpt(form: OptionFormState) {
    if (!editOpt) return
    updateOptMut.mutate({
      id: editOpt.id,
      input: {
        name:             form.name.trim(),
        description:      form.description.trim() || null,
        sku:              form.sku.trim() || null,
        vendor:           form.vendor.trim() || null,
        vendor_url:       form.vendor_url.trim() || null,
        unit_cost_cents:  centsFromDollar(form.unit_cost_dollars),
        unit_price_cents: centsFromDollar(form.unit_price_dollars),
        lead_time_days:   form.lead_time_days ? parseInt(form.lead_time_days) : null,
      },
    })
  }

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {/* ── Card header ── */}
        <div
          className="flex cursor-pointer items-start gap-3 px-5 py-4 hover:bg-gray-50 transition-colors"
          onClick={() => setExpanded((v) => !v)}
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-gray-900">{category.name}</p>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${STATUS_BADGE[category.status] ?? 'bg-gray-100 text-gray-500'}`}>
                {STATUS_OPTIONS.find((s) => s.value === category.status)?.label ?? category.status}
              </span>
              {category.is_client_visible ? (
                <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold text-brand-700">Portal</span>
              ) : (
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-400">Hidden</span>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-gray-400">
              <span>Allowance: <span className="font-medium text-gray-700">{formatMoney(category.allowance_cents)}</span></span>
              {category.due_date && <span>Due {fmtDate(category.due_date)}</span>}
              <span>{category.options.length} option{category.options.length !== 1 ? 's' : ''}</span>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setEditCat(true)}
              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              title="Edit category"
            >
              <PencilIcon className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => { if (confirm(`Delete "${category.name}" and all its options?`)) deleteCatMut.mutate() }}
              className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
              title="Delete category"
            >
              <TrashIcon className="h-3.5 w-3.5" />
            </button>
            <span className="ml-1 text-sm text-gray-300">{expanded ? '▲' : '▼'}</span>
          </div>
        </div>

        {expanded && (
          <div className="border-t border-gray-100">
            {/* Status changer */}
            <div className="flex items-center gap-3 border-b border-gray-50 bg-gray-50 px-5 py-3">
              <span className="text-xs font-medium text-gray-500">Status:</span>
              <select
                value={category.status}
                onChange={(e) => updateCatMut.mutate({ status: e.target.value })}
                className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-700 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
              <div className="ml-auto">
                <Toggle
                  checked={category.is_client_visible}
                  onChange={(v) => updateCatMut.mutate({ is_client_visible: v })}
                  label="Visible in portal"
                />
              </div>
            </div>

            {/* Description / notes */}
            {(category.description || category.notes) && (
              <div className="grid grid-cols-1 gap-3 px-5 py-3 sm:grid-cols-2 border-b border-gray-50">
                {category.description && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Description</p>
                    <p className="mt-0.5 text-xs text-gray-600">{category.description}</p>
                  </div>
                )}
                {category.notes && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Internal Notes</p>
                    <p className="mt-0.5 text-xs text-gray-600">{category.notes}</p>
                  </div>
                )}
              </div>
            )}

            {/* Client selection */}
            {sel && (
              <div className="border-b border-gray-100 bg-green-50 px-5 py-3">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-green-700">Client's Selection</p>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {selOption?.name ?? sel.custom_description ?? '—'}
                    </p>
                    {selOption && (
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-500">
                        <span>{formatMoney(selOption.unit_price_cents)}</span>
                        {overage(selOption.unit_price_cents, category.allowance_cents) > 0 ? (
                          <span className="text-amber-600">+{formatMoney(overage(selOption.unit_price_cents, category.allowance_cents))} over allowance</span>
                        ) : (
                          <span className="text-green-600">Within allowance</span>
                        )}
                        {selOption.vendor && <span>· {selOption.vendor}</span>}
                      </div>
                    )}
                    {sel.custom_vendor && <p className="mt-0.5 text-xs text-gray-400">Vendor: {sel.custom_vendor}</p>}
                    {sel.notes && <p className="mt-0.5 text-xs text-gray-500 italic">"{sel.notes}"</p>}
                    {sel.selected_at && (
                      <p className="mt-0.5 text-[10px] text-gray-400">
                        Submitted {new Date(sel.selected_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        {sel.approved_at && ` · Approved ${new Date(sel.approved_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                      </p>
                    )}
                  </div>
                  {!sel.approved_at && (
                    <button
                      onClick={() => approveMut.mutate()}
                      disabled={approveMut.isPending}
                      className="shrink-0 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-60"
                    >
                      {approveMut.isPending ? 'Approving…' : 'Approve'}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Options list */}
            {category.options.length > 0 && (
              <div className="divide-y divide-gray-50">
                {category.options.map((opt) => {
                  const over = overage(opt.unit_price_cents, category.allowance_cents)
                  const isChosen = sel?.option_id === opt.id
                  return (
                    <div
                      key={opt.id}
                      className={`flex items-start gap-3 px-5 py-3 ${isChosen ? 'bg-brand-50' : ''} ${!opt.is_active ? 'opacity-50' : ''}`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium text-gray-900">{opt.name}</p>
                          {isChosen && <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-semibold text-brand-700">Client's Pick</span>}
                          {!opt.is_active && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-400">Inactive</span>}
                        </div>
                        {opt.description && <p className="mt-0.5 text-xs text-gray-500">{opt.description}</p>}
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-400">
                          <span className={over > 0 ? 'font-medium text-amber-600' : 'font-medium text-green-600'}>
                            {formatMoney(opt.unit_price_cents)}{over > 0 ? ` (+${formatMoney(over)})` : ' ✓'}
                          </span>
                          {opt.unit_cost_cents > 0 && (
                            <span className="text-gray-300">Cost: {formatMoney(opt.unit_cost_cents)}</span>
                          )}
                          {opt.vendor && <span>· {opt.vendor}</span>}
                          {opt.sku && <span>· #{opt.sku}</span>}
                          {opt.lead_time_days && <span>· {opt.lead_time_days}d lead</span>}
                          {opt.vendor_url && (
                            <a
                              href={opt.vendor_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-brand-600 hover:underline"
                            >
                              View ↗
                            </a>
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          onClick={() => setEditOpt(opt)}
                          className="rounded-lg p-1.5 text-gray-300 hover:bg-gray-100 hover:text-gray-600"
                          title="Edit option"
                        >
                          <PencilIcon className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => { if (confirm(`Remove "${opt.name}"?`)) deleteOptMut.mutate(opt.id) }}
                          className="rounded-lg p-1.5 text-gray-300 hover:bg-red-50 hover:text-red-500"
                          title="Delete option"
                        >
                          <TrashIcon className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Add option button */}
            <div className="px-5 py-3">
              <button
                onClick={() => setAddOpt(true)}
                className="flex items-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-xs font-medium text-gray-500 hover:border-brand-400 hover:text-brand-600 transition-colors w-full justify-center"
              >
                <PlusIcon className="h-3.5 w-3.5" />
                Add Option
              </button>
            </div>
          </div>
        )}
      </div>

      {editCat && (
        <CategoryModal
          initial={category}
          onSave={handleSaveCat}
          onClose={() => setEditCat(false)}
          isSaving={updateCatMut.isPending}
        />
      )}
      {addOpt && (
        <OptionModal
          onSave={handleSaveNewOpt}
          onClose={() => setAddOpt(false)}
          isSaving={addOptMut.isPending}
        />
      )}
      {editOpt && (
        <OptionModal
          initial={editOpt}
          onSave={handleSaveEditOpt}
          onClose={() => setEditOpt(null)}
          isSaving={updateOptMut.isPending}
        />
      )}
    </>
  )
}

// ── Main Tab ───────────────────────────────────────────────────────────────

export function SelectionsTab() {
  const { id: projectId } = useParams<{ id: string }>()
  useOutletContext<OutletCtx>()
  const { user, activeTenantId } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const [addCat, setAddCat] = useState(false)

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ['pm-selections', projectId],
    queryFn:  () => getPMSelections(supabase, projectId!),
    enabled:  !!projectId,
  })

  const createCatMut = useMutation({
    mutationFn: (input: CreateSelectionCategoryInput) => createSelectionCategory(supabase, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pm-selections', projectId] })
      setAddCat(false)
      toast.success('Category added')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  function refresh() {
    qc.invalidateQueries({ queryKey: ['pm-selections', projectId] })
  }

  function handleSaveNewCat(form: CategoryFormState) {
    if (!projectId || !activeTenantId) return
    createCatMut.mutate({
      tenantId:          activeTenantId,
      projectId,
      name:              form.name.trim(),
      description:       form.description.trim() || null,
      allowance_cents:   centsFromDollar(form.allowanceDollars),
      due_date:          form.due_date || null,
      is_client_visible: form.is_client_visible,
      notes:             form.notes.trim() || null,
      sequence:          categories.length,
    })
  }

  if (isLoading) {
    return (
      <div className="space-y-3 px-5 py-6 lg:px-8">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
      </div>
    )
  }

  const pending   = categories.filter((c) => !c.selection && ['pending', 'client_choosing'].includes(c.status))
  const selected  = categories.filter((c) => !!c.selection && !c.selection.approved_at)
  const approved  = categories.filter((c) => !!c.selection?.approved_at)
  const inProgress = categories.filter((c) => ['ordered', 'received', 'installed'].includes(c.status))
  const other     = categories.filter(
    (c) => !pending.includes(c) && !selected.includes(c) && !approved.includes(c) && !inProgress.includes(c),
  )

  const groups: { label: string; items: PMSelectionCategory[] }[] = [
    { label: 'Awaiting Client Choice',  items: pending },
    { label: 'Client Selected — Needs Approval', items: selected },
    { label: 'Approved',                items: approved },
    { label: 'In Progress',             items: inProgress },
    { label: 'Other',                   items: other },
  ].filter((g) => g.items.length > 0)

  return (
    <div className="px-5 py-6 lg:px-8">
      {/* Header */}
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Selections</h2>
          {categories.length > 0 && (
            <p className="mt-0.5 text-xs text-gray-400">
              {categories.length} categor{categories.length !== 1 ? 'ies' : 'y'}
              {selected.length > 0 && ` · ${selected.length} awaiting your approval`}
            </p>
          )}
        </div>
        <button
          onClick={() => setAddCat(true)}
          className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700 transition-colors"
        >
          <PlusIcon className="h-4 w-4" />
          Add Category
        </button>
      </div>

      {/* Empty state */}
      {categories.length === 0 && (
        <div className="rounded-2xl border-2 border-dashed border-gray-200 px-6 py-16 text-center">
          <p className="text-sm font-medium text-gray-500">No selection categories yet</p>
          <p className="mt-1 text-xs text-gray-400">
            Add categories for finish materials the client needs to choose — tile, fixtures, hardware, etc.
          </p>
          <button
            onClick={() => setAddCat(true)}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            <PlusIcon className="h-4 w-4" />
            Add First Category
          </button>
        </div>
      )}

      {/* Grouped categories */}
      {groups.map((group) => (
        <div key={group.label} className="mb-6">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{group.label}</p>
          <div className="space-y-3">
            {group.items.map((cat) => (
              <CategoryCard
                key={cat.id}
                category={cat}
                userId={user?.id ?? ''}
                onRefresh={refresh}
              />
            ))}
          </div>
        </div>
      ))}

      {/* New category modal */}
      {addCat && (
        <CategoryModal
          onSave={handleSaveNewCat}
          onClose={() => setAddCat(false)}
          isSaving={createCatMut.isPending}
        />
      )}
    </div>
  )
}
