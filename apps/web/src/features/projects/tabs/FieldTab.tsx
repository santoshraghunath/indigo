import { useEffect, useRef, useState } from 'react'
import { useOutletContext, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  ProjectRow,
  ProjectRfi,
  ProjectPunchItem,
  ProjectSubmittal,
  ProjectDailyLog,
  DailyLogPhoto,
  CreateDailyLogInput,
  UpdateDailyLogInput,
  WorkerReportPhotoInfo,
  CreateSummaryLogInput,
  CreatePunchListItemInput,
  UpdatePunchListItemInput,
} from '@indigo/shared'
import {
  createDailyLog,
  updateDailyLog,
  publishDailyLog,
  setDailyLogClientVisible,
  getDailyLogPhotos,
  uploadDailyLogPhoto,
  deleteDailyLogPhoto,
  updateDailyLogPhotoCaption,
  upsertWorkerDailyReport,
  getWorkerReportPhotos,
  createSummaryLog,
  createPunchListItem,
  updatePunchListItem,
  deletePunchListItem,
} from '@indigo/shared'
import { useProjectFieldData } from '../useProject'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/stores/toastStore'
import { Skeleton } from '@/components/ui/Skeleton'
import { PlusIcon, PencilIcon, TrashIcon } from '@/components/ui/Icons'

interface OutletCtx {
  project: ProjectRow | undefined
  isLoading: boolean
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtDate(s: string | null | undefined): string {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function isOverdue(dueDate: string | null): boolean {
  if (!dueDate) return false
  return new Date(dueDate) < new Date()
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function fmtAuthorName(profile: { first_name: string | null; last_name: string | null } | null | undefined): string {
  return [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Worker'
}

// ── Status configs ─────────────────────────────────────────────────────────

const RFI_STATUS: Record<string, { label: string; color: string; bg: string; ring: string }> = {
  draft:        { label: 'Draft',        color: 'text-gray-600',   bg: 'bg-gray-100',  ring: 'ring-gray-200'  },
  submitted:    { label: 'Submitted',    color: 'text-brand-700',  bg: 'bg-brand-50',  ring: 'ring-brand-200' },
  under_review: { label: 'Under Review', color: 'text-amber-700',  bg: 'bg-amber-50',  ring: 'ring-amber-200' },
  answered:     { label: 'Answered',     color: 'text-green-700',  bg: 'bg-green-50',  ring: 'ring-green-200' },
  closed:       { label: 'Closed',       color: 'text-gray-400',   bg: 'bg-gray-50',   ring: 'ring-gray-200'  },
  void:         { label: 'Void',         color: 'text-gray-400',   bg: 'bg-gray-50',   ring: 'ring-gray-200'  },
}

const PUNCH_STATUS: Record<string, { label: string; color: string; bg: string; ring: string }> = {
  open:             { label: 'Open',             color: 'text-red-700',    bg: 'bg-red-50',    ring: 'ring-red-200'    },
  in_progress:      { label: 'In Progress',      color: 'text-amber-700',  bg: 'bg-amber-50',  ring: 'ring-amber-200'  },
  ready_for_review: { label: 'Ready for Review', color: 'text-brand-700',  bg: 'bg-brand-50',  ring: 'ring-brand-200'  },
  closed:           { label: 'Closed',           color: 'text-green-700',  bg: 'bg-green-50',  ring: 'ring-green-200'  },
  void:             { label: 'Void',             color: 'text-gray-400',   bg: 'bg-gray-50',   ring: 'ring-gray-200'   },
}

const PUNCH_PRIORITY: Record<string, { dot: string; label: string }> = {
  low:      { dot: 'bg-gray-300',   label: 'Low'      },
  normal:   { dot: 'bg-brand-400',  label: 'Normal'   },
  high:     { dot: 'bg-amber-400',  label: 'High'     },
  blocking: { dot: 'bg-red-500',    label: 'Blocking' },
}

const SUBMITTAL_STATUS: Record<string, { label: string; color: string; bg: string; ring: string }> = {
  draft:               { label: 'Draft',               color: 'text-gray-600',   bg: 'bg-gray-100',  ring: 'ring-gray-200'  },
  submitted:           { label: 'Submitted',           color: 'text-brand-700',  bg: 'bg-brand-50',  ring: 'ring-brand-200' },
  under_review:        { label: 'Under Review',        color: 'text-amber-700',  bg: 'bg-amber-50',  ring: 'ring-amber-200' },
  approved:            { label: 'Approved',            color: 'text-green-700',  bg: 'bg-green-50',  ring: 'ring-green-200' },
  approved_as_noted:   { label: 'Approved as Noted',   color: 'text-green-700',  bg: 'bg-green-50',  ring: 'ring-green-200' },
  revise_and_resubmit: { label: 'Revise & Resubmit',   color: 'text-amber-700',  bg: 'bg-amber-50',  ring: 'ring-amber-200' },
  rejected:            { label: 'Rejected',            color: 'text-red-700',    bg: 'bg-red-50',    ring: 'ring-red-200'   },
  void:                { label: 'Void',                color: 'text-gray-400',   bg: 'bg-gray-50',   ring: 'ring-gray-200'  },
}

function Badge({ status, map }: { status: string; map: Record<string, { label: string; color: string; bg: string; ring: string }> }) {
  const cfg = map[status] ?? { label: status, color: 'text-gray-500', bg: 'bg-gray-100', ring: 'ring-gray-200' }
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${cfg.bg} ${cfg.color} ${cfg.ring}`}>
      {cfg.label}
    </span>
  )
}

// ── Toggle switch ──────────────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label?: string
}) {
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
        <span
          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </button>
      {label && <span className="text-xs text-gray-500">{label}</span>}
    </label>
  )
}

// ── Summary stats ──────────────────────────────────────────────────────────

function FieldSummary({
  rfis, punchItems, submittals, summaryLogs,
}: {
  rfis: ProjectRfi[]
  punchItems: ProjectPunchItem[]
  submittals: ProjectSubmittal[]
  summaryLogs: ProjectDailyLog[]
}) {
  const openRfis      = rfis.filter((r) => !['closed', 'void'].includes(r.status)).length
  const openPunch     = punchItems.filter((p) => !['closed', 'void'].includes(p.status)).length
  const pendingSubs   = submittals.filter((s) => !['approved', 'approved_as_noted', 'void'].includes(s.status)).length
  const overdueRfis   = rfis.filter((r) => isOverdue(r.due_date) && !['closed', 'void', 'answered'].includes(r.status)).length
  const publishedLogs = summaryLogs.filter((l) => l.published_at).length

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {[
        { label: 'Daily Logs',         value: summaryLogs.length, warn: false, sub: publishedLogs > 0 ? `${publishedLogs} published` : undefined },
        { label: 'Open RFIs',          value: openRfis,           warn: overdueRfis > 0, sub: overdueRfis > 0 ? `${overdueRfis} overdue` : undefined },
        { label: 'Punch Items',        value: openPunch,          warn: openPunch > 0 },
        { label: 'Pending Submittals', value: pendingSubs,        warn: false },
      ].map((item) => (
        <div key={item.label} className="rounded-xl border border-gray-200 bg-white p-4 shadow-card">
          <p className="text-xs font-medium text-gray-500">{item.label}</p>
          <p className={`mt-1 text-2xl font-semibold tabular-nums ${item.warn ? 'text-amber-600' : 'text-gray-900'}`}>
            {item.value}
          </p>
          {item.sub && <p className="mt-0.5 text-xs text-gray-400">{item.sub}</p>}
        </div>
      ))}
    </div>
  )
}

// ── Daily Log form ─────────────────────────────────────────────────────────

interface DailyLogFormValues {
  date: string
  weather: string
  temperature_f: string
  crew_count: string
  hours_worked: string
  work_performed: string
  materials_delivered: string
  equipment_used: string
  issues_or_delays: string
  is_client_visible: boolean
  publish: boolean
}

function emptyForm(): DailyLogFormValues {
  return {
    date: todayIso(),
    weather: '',
    temperature_f: '',
    crew_count: '',
    hours_worked: '',
    work_performed: '',
    materials_delivered: '',
    equipment_used: '',
    issues_or_delays: '',
    is_client_visible: false,
    publish: false,
  }
}

function logToForm(log: ProjectDailyLog): DailyLogFormValues {
  return {
    date: log.date,
    weather: log.weather ?? '',
    temperature_f: log.temperature_f != null ? String(log.temperature_f) : '',
    crew_count: log.crew_count != null ? String(log.crew_count) : '',
    hours_worked: log.hours_worked != null ? String(log.hours_worked) : '',
    work_performed: log.work_performed,
    materials_delivered: log.materials_delivered ?? '',
    equipment_used: log.equipment_used ?? '',
    issues_or_delays: log.issues_or_delays ?? '',
    is_client_visible: log.is_client_visible,
    publish: !!log.published_at,
  }
}

interface DailyLogModalProps {
  mode: 'create' | 'edit'
  log?: ProjectDailyLog
  onSubmit: (values: DailyLogFormValues, stagedPhotos: File[]) => void
  onClose: () => void
  isLoading: boolean
}

function DailyLogModal({ mode, log, onSubmit, onClose, isLoading }: DailyLogModalProps) {
  const [form, setForm] = useState<DailyLogFormValues>(() =>
    mode === 'edit' && log ? logToForm(log) : emptyForm(),
  )
  const [stagedPhotos, setStagedPhotos] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const photoInputRef = useRef<HTMLInputElement>(null)

  // Revoke object URLs when they're removed or modal unmounts
  useEffect(() => {
    return () => previews.forEach((url) => URL.revokeObjectURL(url))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof DailyLogFormValues>(key: K, value: DailyLogFormValues[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  function addFiles(files: FileList | null) {
    if (!files) return
    const valid = Array.from(files).filter(
      (f) => f.type.startsWith('image/') && f.size <= MAX_FILE_SIZE_MB * 1024 * 1024,
    )
    if (valid.length === 0) return
    const newPreviews = valid.map((f) => URL.createObjectURL(f))
    setStagedPhotos((prev) => [...prev, ...valid])
    setPreviews((prev) => [...prev, ...newPreviews])
    if (photoInputRef.current) photoInputRef.current.value = ''
  }

  function removeStaged(idx: number) {
    URL.revokeObjectURL(previews[idx])
    setStagedPhotos((prev) => prev.filter((_, i) => i !== idx))
    setPreviews((prev) => prev.filter((_, i) => i !== idx))
  }

  const isPublished = mode === 'edit' && !!log?.published_at

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-base font-semibold text-gray-900">
            {mode === 'create' ? 'New Summary' : `Edit Log — ${fmtDate(log?.date)}`}
          </h2>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[70vh] overflow-y-auto px-6 py-5 space-y-4">
          {/* Date */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Date *</label>
            <input
              type="date"
              value={form.date}
              onChange={(e) => set('date', e.target.value)}
              disabled={isPublished}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-gray-50 disabled:text-gray-400"
            />
          </div>

          {/* Weather row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Weather</label>
              <input
                type="text"
                placeholder="e.g. Partly cloudy"
                value={form.weather}
                onChange={(e) => set('weather', e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Temp (°F)</label>
              <input
                type="number"
                placeholder="72"
                value={form.temperature_f}
                onChange={(e) => set('temperature_f', e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
          </div>

          {/* Crew row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Crew Count</label>
              <input
                type="number"
                placeholder="8"
                value={form.crew_count}
                onChange={(e) => set('crew_count', e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Hours Worked</label>
              <input
                type="number"
                step="0.5"
                placeholder="64"
                value={form.hours_worked}
                onChange={(e) => set('hours_worked', e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
          </div>

          {/* Work performed */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Work Performed *</label>
            <textarea
              rows={3}
              placeholder="Describe the work completed today…"
              value={form.work_performed}
              onChange={(e) => set('work_performed', e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none"
            />
          </div>

          {/* Materials */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Materials Delivered</label>
            <textarea
              rows={2}
              placeholder="List any materials that arrived on site…"
              value={form.materials_delivered}
              onChange={(e) => set('materials_delivered', e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none"
            />
          </div>

          {/* Equipment */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Equipment Used</label>
            <textarea
              rows={2}
              placeholder="Equipment or machinery used today…"
              value={form.equipment_used}
              onChange={(e) => set('equipment_used', e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none"
            />
          </div>

          {/* Issues */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Issues / Delays</label>
            <textarea
              rows={2}
              placeholder="Any issues, delays, or safety observations…"
              value={form.issues_or_delays}
              onChange={(e) => set('issues_or_delays', e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none"
            />
          </div>

          {/* Photos */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs font-medium text-gray-700">
                Photos{stagedPhotos.length > 0 ? ` (${stagedPhotos.length} staged)` : ''}
              </label>
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                className="flex items-center gap-1 rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200"
              >
                <PlusIcon className="h-3 w-3" /> Add
              </button>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => addFiles(e.target.files)}
              />
            </div>

            {previews.length > 0 ? (
              <div className="grid grid-cols-4 gap-2">
                {previews.map((url, i) => (
                  <div key={i} className="group relative aspect-square">
                    <img
                      src={url}
                      alt={`Photo ${i + 1}`}
                      className="h-full w-full rounded-lg object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeStaged(i)}
                      className="absolute right-0.5 top-0.5 hidden rounded-full bg-black/60 p-0.5 text-[10px] text-white hover:bg-red-600 group-hover:block"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  className="aspect-square rounded-lg border-2 border-dashed border-gray-200 text-gray-400 hover:border-brand-300 hover:text-brand-500 transition-colors flex items-center justify-center"
                >
                  <PlusIcon className="h-5 w-5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-gray-200 py-5 text-xs text-gray-400 hover:border-brand-300 hover:text-brand-500 transition-colors"
              >
                <PlusIcon className="h-4 w-4" />
                Add site photos (optional)
              </button>
            )}
          </div>

          {/* Toggles */}
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-700">Client Visible</p>
                <p className="text-[11px] text-gray-400">Show in the client portal when published</p>
              </div>
              <Toggle
                checked={form.is_client_visible}
                onChange={(v) => set('is_client_visible', v)}
              />
            </div>

            {!isPublished && (
              <div className="flex items-center justify-between border-t border-gray-200 pt-3">
                <div>
                  <p className="text-xs font-medium text-gray-700">Publish Now</p>
                  <p className="text-[11px] text-gray-400">Lock this log and make it available to the portal</p>
                </div>
                <Toggle
                  checked={form.publish}
                  onChange={(v) => set('publish', v)}
                />
              </div>
            )}

            {isPublished && (
              <p className="text-[11px] text-amber-600 border-t border-gray-200 pt-3">
                ⚠ This log is published. Date is locked; other fields can still be updated.
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-gray-100 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!form.work_performed.trim() || !form.date || isLoading}
            onClick={() => onSubmit(form, stagedPhotos)}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {isLoading
              ? 'Saving…'
              : mode === 'create'
                ? stagedPhotos.length > 0 ? `Create Summary + ${stagedPhotos.length} Photo${stagedPhotos.length > 1 ? 's' : ''}` : 'Create Summary'
                : stagedPhotos.length > 0 ? `Save + ${stagedPhotos.length} Photo${stagedPhotos.length > 1 ? 's' : ''}` : 'Save Changes'
            }
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Photo lightbox ─────────────────────────────────────────────────────────

function PhotoLightbox({
  photos,
  initialIndex,
  onClose,
}: {
  photos: DailyLogPhoto[]
  initialIndex: number
  onClose: () => void
}) {
  const [current, setCurrent] = useState(initialIndex)
  const photo = photos[current]

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft')  setCurrent((i) => Math.max(0, i - 1))
      if (e.key === 'ArrowRight') setCurrent((i) => Math.min(photos.length - 1, i + 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [photos.length, onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90"
      onClick={onClose}
    >
      {/* Close */}
      <button
        onClick={onClose}
        className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
      >
        ✕
      </button>

      {/* Counter */}
      {photos.length > 1 && (
        <p className="absolute top-4 left-1/2 -translate-x-1/2 text-sm text-white/70">
          {current + 1} / {photos.length}
        </p>
      )}

      {/* Image */}
      <img
        src={photo.signedUrl}
        alt={photo.caption ?? `Photo ${current + 1}`}
        className="max-h-[82vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />

      {/* Caption */}
      {photo.caption && (
        <p className="mt-3 max-w-lg text-center text-sm text-white/80">{photo.caption}</p>
      )}

      {/* Prev / Next */}
      {photos.length > 1 && (
        <div className="absolute inset-y-0 left-0 right-0 flex items-center justify-between px-3 pointer-events-none">
          <button
            onClick={(e) => { e.stopPropagation(); setCurrent((i) => Math.max(0, i - 1)) }}
            disabled={current === 0}
            className="pointer-events-auto rounded-full bg-white/10 p-2 text-white hover:bg-white/20 disabled:opacity-20"
          >
            ◀
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setCurrent((i) => Math.min(photos.length - 1, i + 1)) }}
            disabled={current === photos.length - 1}
            className="pointer-events-auto rounded-full bg-white/10 p-2 text-white hover:bg-white/20 disabled:opacity-20"
          >
            ▶
          </button>
        </div>
      )}
    </div>
  )
}

// ── Log photo gallery (lazy-mounts when log row is expanded) ───────────────

const MAX_FILE_SIZE_MB = 20

function LogPhotoGallery({
  logId,
  projectId,
  tenantId,
  userId,
}: {
  logId: string
  projectId: string
  tenantId: string
  userId: string
}) {
  const qc = useQueryClient()
  const toast = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [uploading, setUploading] = useState(false)
  const [editingCaption, setEditingCaption] = useState<{ id: string; draft: string } | null>(null)

  const { data: photos = [], isLoading } = useQuery({
    queryKey:  ['log-photos', logId],
    queryFn:   () => getDailyLogPhotos(supabase, logId),
    staleTime: 60_000,
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['log-photos', logId] })

  const deleteMut = useMutation({
    mutationFn: ({ id, documentId, path }: { id: string; documentId: string; path: string }) =>
      deleteDailyLogPhoto(supabase, id, documentId, path),
    onSuccess: () => { invalidate(); toast.success('Photo removed') },
    onError:   (e: Error) => toast.error(e.message),
  })

  const captionMut = useMutation({
    mutationFn: ({ id, caption }: { id: string; caption: string | null }) =>
      updateDailyLogPhotoCaption(supabase, id, caption),
    onSuccess: () => { invalidate(); setEditingCaption(null) },
    onError:   (e: Error) => toast.error(e.message),
  })

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return

    const valid = Array.from(files).filter((f) => {
      if (!f.type.startsWith('image/')) {
        toast.error(`${f.name} is not an image`)
        return false
      }
      if (f.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        toast.error(`${f.name} exceeds ${MAX_FILE_SIZE_MB} MB`)
        return false
      }
      return true
    })
    if (valid.length === 0) return

    setUploading(true)
    try {
      await Promise.all(valid.map((f) => uploadDailyLogPhoto(supabase, tenantId, projectId, logId, userId, f)))
      invalidate()
      toast.success(`${valid.length} photo${valid.length > 1 ? 's' : ''} added`)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div className="mt-3 border-t border-gray-200 pt-3">
      {/* Section header */}
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
          Photos{photos.length > 0 ? ` (${photos.length})` : ''}
        </p>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1 rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200 disabled:opacity-50"
        >
          {uploading ? (
            <span className="animate-pulse">Uploading…</span>
          ) : (
            <>
              <PlusIcon className="h-3 w-3" />
              Add Photos
            </>
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="aspect-square animate-pulse rounded-lg bg-gray-200" />
          ))}
        </div>
      ) : photos.length === 0 ? (
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-200 py-6 text-xs text-gray-400 hover:border-brand-300 hover:text-brand-500 transition-colors"
        >
          <PlusIcon className="h-4 w-4" />
          Add photos to this log
        </button>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {photos.map((photo, idx) => (
            <div key={photo.id} className="group relative">
              {/* Thumbnail */}
              <button
                onClick={() => setLightboxIndex(idx)}
                className="block aspect-square w-full overflow-hidden rounded-lg bg-gray-100"
              >
                <img
                  src={photo.signedUrl}
                  alt={photo.caption ?? `Photo ${idx + 1}`}
                  className="h-full w-full object-cover transition-transform group-hover:scale-105"
                  loading="lazy"
                />
              </button>

              {/* Delete button (hover) */}
              <button
                onClick={() => deleteMut.mutate({ id: photo.id, documentId: photo.document_id, path: photo.storage_path })}
                disabled={deleteMut.isPending}
                className="absolute right-1 top-1 hidden rounded-full bg-black/60 p-0.5 text-[10px] text-white hover:bg-red-600 group-hover:flex"
                title="Remove photo"
              >
                ✕
              </button>

              {/* Caption */}
              {editingCaption?.id === photo.id ? (
                <div className="mt-1">
                  <input
                    autoFocus
                    type="text"
                    value={editingCaption.draft}
                    onChange={(e) => setEditingCaption({ id: photo.id, draft: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter')
                        captionMut.mutate({ id: photo.id, caption: editingCaption.draft.trim() || null })
                      if (e.key === 'Escape') setEditingCaption(null)
                    }}
                    onBlur={() =>
                      captionMut.mutate({ id: photo.id, caption: editingCaption.draft.trim() || null })
                    }
                    placeholder="Add caption…"
                    className="w-full rounded border border-brand-400 px-1.5 py-0.5 text-[11px] focus:outline-none"
                  />
                </div>
              ) : (
                <button
                  onClick={() => setEditingCaption({ id: photo.id, draft: photo.caption ?? '' })}
                  className="mt-0.5 block w-full truncate text-left text-[11px] text-gray-400 hover:text-gray-600"
                  title={photo.caption ?? 'Add caption'}
                >
                  {photo.caption ?? <span className="italic">Add caption</span>}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightboxIndex !== null && photos.length > 0 && (
        <PhotoLightbox
          photos={photos}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  )
}

// ── Worker Report Modal ────────────────────────────────────────────────────

interface WorkerReportModalProps {
  projectId: string
  tenantId: string
  userId: string
  role: string | null
  onSuccess: () => void
  onClose: () => void
}

function WorkerReportModal({ projectId, tenantId, userId, role, onSuccess, onClose }: WorkerReportModalProps) {
  const toast = useToast()
  const [workPerformed, setWorkPerformed] = useState('')
  const [stagedPhotos, setStagedPhotos] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const photoInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    return () => previews.forEach((url) => URL.revokeObjectURL(url))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function addFiles(files: FileList | null) {
    if (!files) return
    const valid = Array.from(files).filter(
      (f) => f.type.startsWith('image/') && f.size <= MAX_FILE_SIZE_MB * 1024 * 1024,
    )
    if (valid.length === 0) return
    const newPreviews = valid.map((f) => URL.createObjectURL(f))
    setStagedPhotos((prev) => [...prev, ...valid])
    setPreviews((prev) => [...prev, ...newPreviews])
    if (photoInputRef.current) photoInputRef.current.value = ''
  }

  function removeStaged(idx: number) {
    URL.revokeObjectURL(previews[idx])
    setStagedPhotos((prev) => prev.filter((_, i) => i !== idx))
    setPreviews((prev) => prev.filter((_, i) => i !== idx))
  }

  // Determine log_type from role
  const logType: 'field_associate' | 'subcontractor' =
    role === 'subcontractor' ? 'subcontractor' : 'field_associate'

  const canSubmit = workPerformed.trim().length > 0 && stagedPhotos.length > 0

  async function handleSubmit() {
    if (!canSubmit) return
    setIsSubmitting(true)
    try {
      const { id: logId } = await upsertWorkerDailyReport(
        supabase, tenantId, projectId, userId, logType, todayIso(), workPerformed.trim(),
      )
      await Promise.all(
        stagedPhotos.map((f) => uploadDailyLogPhoto(supabase, tenantId, projectId, logId, userId, f)),
      )
      toast.success('Report submitted')
      onSuccess()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-base font-semibold text-gray-900">Submit Field Report</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[70vh] overflow-y-auto px-6 py-5 space-y-4">
          {/* Work performed */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              What did you work on today? *
            </label>
            <textarea
              rows={4}
              placeholder="Describe the work you completed today…"
              value={workPerformed}
              onChange={(e) => setWorkPerformed(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none"
            />
          </div>

          {/* Photos — at least 1 required */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs font-medium text-gray-700">
                Photos * {stagedPhotos.length === 0 ? <span className="text-red-500">(at least 1 required)</span> : `(${stagedPhotos.length} selected)`}
              </label>
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                className="flex items-center gap-1 rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200"
              >
                <PlusIcon className="h-3 w-3" /> Add
              </button>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => addFiles(e.target.files)}
              />
            </div>

            {previews.length > 0 ? (
              <div className="grid grid-cols-4 gap-2">
                {previews.map((url, i) => (
                  <div key={i} className="group relative aspect-square">
                    <img
                      src={url}
                      alt={`Photo ${i + 1}`}
                      className="h-full w-full rounded-lg object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeStaged(i)}
                      className="absolute right-0.5 top-0.5 hidden rounded-full bg-black/60 p-0.5 text-[10px] text-white hover:bg-red-600 group-hover:block"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  className="aspect-square rounded-lg border-2 border-dashed border-gray-200 text-gray-400 hover:border-brand-300 hover:text-brand-500 transition-colors flex items-center justify-center"
                >
                  <PlusIcon className="h-5 w-5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-red-200 py-5 text-xs text-gray-400 hover:border-brand-300 hover:text-brand-500 transition-colors"
              >
                <PlusIcon className="h-4 w-4" />
                Add at least one site photo
              </button>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-gray-100 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSubmit || isSubmitting}
            onClick={handleSubmit}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {isSubmitting ? 'Submitting…' : 'Submit Report'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Summary Builder Modal ──────────────────────────────────────────────────

interface SummaryBuilderModalProps {
  projectId: string
  tenantId: string
  userId: string
  date: string
  reports: ProjectDailyLog[]
  onClose: () => void
  onSuccess: () => void
}

function SummaryBuilderModal({
  projectId,
  tenantId,
  userId,
  date,
  reports,
  onClose,
  onSuccess,
}: SummaryBuilderModalProps) {
  const toast = useToast()
  const qc = useQueryClient()

  const [summaryText, setSummaryText] = useState('')
  const [weather, setWeather] = useState('')
  const [temperatureF, setTemperatureF] = useState('')
  const [crewCount, setCrewCount] = useState('')
  const [hoursWorked, setHoursWorked] = useState('')
  const [publish, setPublish] = useState(false)
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set())
  const [isDrafting, setIsDrafting] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Fetch photos for all reports in this date group
  const logIds = reports.map((r) => r.id)
  const { data: reportPhotos = [], isLoading: photosLoading } = useQuery({
    queryKey: ['worker-report-photos', ...logIds],
    queryFn: () => getWorkerReportPhotos(supabase, logIds),
    enabled: logIds.length > 0,
    staleTime: 60_000,
  })

  function togglePhoto(documentId: string) {
    setSelectedDocIds((prev) => {
      const next = new Set(prev)
      if (next.has(documentId)) {
        next.delete(documentId)
      } else {
        next.add(documentId)
      }
      return next
    })
  }

  async function handleDraftWithAI() {
    setIsDrafting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      const res = await fetch('/.netlify/functions/draft-daily-summary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          tenantId,
          projectName: 'this project',
          reports: reports.map((r) => ({
            authorName: fmtAuthorName(r.author_profile),
            logType: r.log_type,
            workPerformed: r.work_performed,
          })),
        }),
      })

      if (!res.ok) {
        const json = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(json.error ?? `Draft failed (${res.status})`)
      }

      const json = await res.json() as { summary?: string; text?: string }
      const drafted = json.summary ?? json.text ?? ''
      if (drafted) {
        setSummaryText(drafted)
        toast.success('AI draft ready — review and edit before saving')
      } else {
        toast.error('No draft text returned')
      }
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setIsDrafting(false)
    }
  }

  async function handleSave() {
    if (!summaryText.trim()) return
    setIsSubmitting(true)
    try {
      await createSummaryLog(supabase, tenantId, projectId, userId, {
        date,
        weather: weather || null,
        temperature_f: temperatureF ? Number(temperatureF) : null,
        crew_count: crewCount ? Number(crewCount) : null,
        hours_worked: hoursWorked ? Number(hoursWorked) : null,
        work_performed: summaryText.trim(),
        is_client_visible: publish,
        publish,
        selectedDocumentIds: [...selectedDocIds],
      } satisfies CreateSummaryLogInput)

      qc.invalidateQueries({ queryKey: ['project-field', projectId] })
      toast.success('Summary created')
      onSuccess()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const formattedDate = new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  // Group photos by report for author labels
  const photosByLogId = new Map<string, WorkerReportPhotoInfo[]>()
  for (const photo of reportPhotos) {
    const arr = photosByLogId.get(photo.logId) ?? []
    arr.push(photo)
    photosByLogId.set(photo.logId, arr)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl flex flex-col" style={{ maxHeight: '90vh' }}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 shrink-0">
          <h2 className="text-base font-semibold text-gray-900">
            Create Daily Summary — {formattedDate}
          </h2>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-6">

          {/* Section 1: Internal Reports */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
              Internal Reports ({reports.length})
            </p>
            <div className="space-y-2">
              {reports.map((r) => (
                <div key={r.id} className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-gray-700">
                      {fmtAuthorName(r.author_profile)}
                    </span>
                    {r.log_type === 'field_associate' ? (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">FA</span>
                    ) : (
                      <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-semibold text-purple-700">Sub</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-600 whitespace-pre-line">{r.work_performed}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Section 2: Select Photos */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
              Select Photos
              {selectedDocIds.size > 0 && (
                <span className="ml-2 text-brand-600 normal-case font-medium">
                  {selectedDocIds.size} selected
                </span>
              )}
            </p>
            {photosLoading ? (
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="aspect-square animate-pulse rounded-lg bg-gray-200" />
                ))}
              </div>
            ) : reportPhotos.length === 0 ? (
              <p className="text-xs text-gray-400 italic">No photos attached to these reports.</p>
            ) : (
              <div className="space-y-3">
                {reports.map((r) => {
                  const photos = photosByLogId.get(r.id) ?? []
                  if (photos.length === 0) return null
                  return (
                    <div key={r.id}>
                      <p className="text-[11px] text-gray-400 mb-1.5">
                        {fmtAuthorName(r.author_profile)}
                      </p>
                      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                        {photos.map((photo) => {
                          const isSelected = selectedDocIds.has(photo.documentId)
                          return (
                            <button
                              key={photo.id}
                              type="button"
                              onClick={() => togglePhoto(photo.documentId)}
                              className={`relative aspect-square overflow-hidden rounded-lg border-2 transition-all ${
                                isSelected
                                  ? 'border-brand-500 ring-2 ring-brand-300'
                                  : 'border-transparent opacity-70 hover:opacity-100'
                              }`}
                            >
                              <img
                                src={photo.signedUrl}
                                alt={photo.caption ?? 'Report photo'}
                                className="h-full w-full object-cover"
                                loading="lazy"
                              />
                              {isSelected && (
                                <div className="absolute inset-0 flex items-center justify-center bg-brand-600/20">
                                  <span className="rounded-full bg-brand-600 p-0.5 text-[10px] text-white">✓</span>
                                </div>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Section 3: Client-Facing Summary */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                Client-Facing Summary *
              </p>
              <button
                type="button"
                onClick={handleDraftWithAI}
                disabled={isDrafting}
                className="flex items-center gap-1.5 rounded-lg border border-brand-300 bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-100 disabled:opacity-50 transition-colors"
              >
                {isDrafting ? (
                  <>
                    <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-brand-400 border-t-transparent" />
                    Drafting…
                  </>
                ) : (
                  <>✨ Draft with AI</>
                )}
              </button>
            </div>
            <textarea
              rows={5}
              placeholder="Write a client-facing summary of today's work…"
              value={summaryText}
              onChange={(e) => setSummaryText(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none"
            />
          </div>

          {/* Weather / Crew row */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Weather</label>
              <input
                type="text"
                placeholder="Partly cloudy"
                value={weather}
                onChange={(e) => setWeather(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Temp (°F)</label>
              <input
                type="number"
                placeholder="72"
                value={temperatureF}
                onChange={(e) => setTemperatureF(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Crew #</label>
              <input
                type="number"
                placeholder="8"
                value={crewCount}
                onChange={(e) => setCrewCount(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Hours</label>
              <input
                type="number"
                step="0.5"
                placeholder="64"
                value={hoursWorked}
                onChange={(e) => setHoursWorked(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
          </div>

          {/* Section 4: Options */}
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-700">Publish immediately</p>
                <p className="text-[11px] text-gray-400">Make this summary available to the client portal</p>
              </div>
              <Toggle checked={publish} onChange={setPublish} />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-gray-100 px-6 py-4 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!summaryText.trim() || isSubmitting}
            onClick={handleSave}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {isSubmitting ? 'Saving…' : 'Save Summary'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Worker Reports Section ─────────────────────────────────────────────────

interface WorkerReportsSectionProps {
  reports: ProjectDailyLog[]
  projectId: string
  tenantId: string
  userId: string
  role: string | null
  summaryLogs: ProjectDailyLog[]
}

function WorkerReportsSection({
  reports,
  projectId,
  tenantId,
  userId,
  role,
  summaryLogs,
}: WorkerReportsSectionProps) {
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showSubmitModal, setShowSubmitModal] = useState(false)
  const [summaryBuilderDate, setSummaryBuilderDate] = useState<string | null>(null)

  const isFieldWorker = ['field_associate', 'field_super', 'subcontractor'].includes(role ?? '')
  const isPM = ['project_manager', 'admin', 'owner'].includes(role ?? '')

  const invalidate = () => qc.invalidateQueries({ queryKey: ['project-field', projectId] })

  // Dates that already have a summary log
  const summarizedDates = new Set(summaryLogs.map((s) => s.date))

  // Group reports by date (sorted descending)
  const reportsByDate = new Map<string, ProjectDailyLog[]>()
  for (const r of reports) {
    const arr = reportsByDate.get(r.date) ?? []
    arr.push(r)
    reportsByDate.set(r.date, arr)
  }
  const sortedDates = [...reportsByDate.keys()].sort((a, b) => b.localeCompare(a))

  // Reports for the summary builder (filtered by selected date)
  const reportsForBuilderDate = summaryBuilderDate
    ? (reportsByDate.get(summaryBuilderDate) ?? [])
    : []

  return (
    <>
      <div className="rounded-xl border border-gray-200 bg-white shadow-card">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-gray-900">
            Field Reports
            <span className="ml-2 text-xs font-normal text-gray-400">{reports.length}</span>
          </h2>
          {isFieldWorker && (
            <button
              onClick={() => setShowSubmitModal(true)}
              className="flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
            >
              <PlusIcon className="h-3.5 w-3.5" />
              Submit Report
            </button>
          )}
        </div>

        {reports.length === 0 ? (
          <EmptySection label="No field reports yet." />
        ) : (
          <div className="divide-y divide-gray-100">
            {sortedDates.map((date) => {
              const dateReports = reportsByDate.get(date) ?? []
              const hasSummary = summarizedDates.has(date)
              const formattedDate = new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              })

              return (
                <div key={date}>
                  {/* Date group header */}
                  <div className="flex items-center justify-between bg-gray-50/60 px-5 py-2 border-b border-gray-100">
                    <span className="text-xs font-semibold text-gray-600">{formattedDate}</span>
                    {isPM && !hasSummary && (
                      <button
                        onClick={() => setSummaryBuilderDate(date)}
                        className="rounded-md bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700 hover:bg-brand-100 transition-colors"
                      >
                        Create Summary →
                      </button>
                    )}
                    {isPM && hasSummary && (
                      <span className="rounded bg-green-50 px-2 py-0.5 text-[10px] font-semibold text-green-600">
                        Summary created
                      </span>
                    )}
                  </div>

                  {/* Reports for this date */}
                  {dateReports.map((report) => {
                    const isOpen = expanded === report.id
                    return (
                      <div key={report.id}>
                        <div className="flex items-start gap-2 px-5 py-3">
                          {/* Expand toggle */}
                          <button
                            onClick={() => setExpanded(isOpen ? null : report.id)}
                            className="mt-0.5 shrink-0 text-gray-400 hover:text-gray-600"
                            title={isOpen ? 'Collapse' : 'Expand'}
                          >
                            <span className="text-xs">{isOpen ? '▲' : '▼'}</span>
                          </button>

                          {/* Main content */}
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-medium text-gray-800">
                                {fmtAuthorName(report.author_profile)}
                              </span>
                              {report.log_type === 'field_associate' ? (
                                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">FA</span>
                              ) : (
                                <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-semibold text-purple-700">Sub</span>
                              )}
                            </div>
                            <p className={`mt-0.5 text-xs text-gray-500 ${isOpen ? '' : 'line-clamp-2'}`}>
                              {report.work_performed}
                            </p>
                          </div>
                        </div>

                        {/* Expanded detail */}
                        {isOpen && (
                          <div className="border-t border-gray-100 bg-gray-50/50 px-5 py-3 ml-7 space-y-2">
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Work Performed</p>
                              <p className="mt-0.5 text-xs text-gray-700 whitespace-pre-line">{report.work_performed}</p>
                            </div>
                            {/* Photos */}
                            <LogPhotoGallery
                              logId={report.id}
                              projectId={projectId}
                              tenantId={tenantId}
                              userId={userId}
                            />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Worker Report Modal */}
      {showSubmitModal && (
        <WorkerReportModal
          projectId={projectId}
          tenantId={tenantId}
          userId={userId}
          role={role}
          onSuccess={() => {
            setShowSubmitModal(false)
            invalidate()
          }}
          onClose={() => setShowSubmitModal(false)}
        />
      )}

      {/* Summary Builder Modal */}
      {summaryBuilderDate !== null && (
        <SummaryBuilderModal
          projectId={projectId}
          tenantId={tenantId}
          userId={userId}
          date={summaryBuilderDate}
          reports={reportsForBuilderDate}
          onClose={() => setSummaryBuilderDate(null)}
          onSuccess={() => setSummaryBuilderDate(null)}
        />
      )}
    </>
  )
}

// ── Daily Summary Section ──────────────────────────────────────────────────

interface DailySummarySectionProps {
  logs: ProjectDailyLog[]
  internalReports: ProjectDailyLog[]
  projectId: string
  tenantId: string
  userId: string
  role: string | null
}

function DailySummarySection({
  logs,
  internalReports,
  projectId,
  tenantId,
  userId,
  role,
}: DailySummarySectionProps) {
  const qc = useQueryClient()
  const toast = useToast()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [modal, setModal] = useState<{ type: 'create' } | { type: 'edit'; log: ProjectDailyLog } | null>(null)
  const [summaryBuilderOpen, setSummaryBuilderOpen] = useState(false)

  const isPM = ['project_manager', 'admin', 'owner'].includes(role ?? '')

  const invalidate = () => qc.invalidateQueries({ queryKey: ['project-field', projectId] })

  const createMut = useMutation({
    mutationFn: async ({ vals, photos }: { vals: DailyLogFormValues; photos: File[] }) => {
      const { id: logId } = await createDailyLog(supabase, tenantId, projectId, userId, {
        date: vals.date,
        weather: vals.weather || null,
        temperature_f: vals.temperature_f ? Number(vals.temperature_f) : null,
        crew_count: vals.crew_count ? Number(vals.crew_count) : null,
        hours_worked: vals.hours_worked ? Number(vals.hours_worked) : null,
        work_performed: vals.work_performed,
        materials_delivered: vals.materials_delivered || null,
        equipment_used: vals.equipment_used || null,
        issues_or_delays: vals.issues_or_delays || null,
        is_client_visible: vals.is_client_visible,
        publish: vals.publish,
        log_type: 'summary',
      } satisfies CreateDailyLogInput)
      if (photos.length > 0) {
        await Promise.all(
          photos.map((f) => uploadDailyLogPhoto(supabase, tenantId, projectId, logId, userId, f)),
        )
      }
    },
    onSuccess: () => { invalidate(); setModal(null); toast.success('Summary created') },
    onError: (e: Error) => toast.error(e.message),
  })

  const editMut = useMutation({
    mutationFn: async ({ logId, vals, photos }: { logId: string; vals: DailyLogFormValues; photos: File[] }) => {
      await updateDailyLog(supabase, logId, {
        date: vals.date,
        weather: vals.weather || null,
        temperature_f: vals.temperature_f ? Number(vals.temperature_f) : null,
        crew_count: vals.crew_count ? Number(vals.crew_count) : null,
        hours_worked: vals.hours_worked ? Number(vals.hours_worked) : null,
        work_performed: vals.work_performed,
        materials_delivered: vals.materials_delivered || null,
        equipment_used: vals.equipment_used || null,
        issues_or_delays: vals.issues_or_delays || null,
        is_client_visible: vals.is_client_visible,
      } satisfies UpdateDailyLogInput)
      if (photos.length > 0) {
        await Promise.all(
          photos.map((f) => uploadDailyLogPhoto(supabase, tenantId, projectId, logId, userId, f)),
        )
        qc.invalidateQueries({ queryKey: ['log-photos', logId] })
      }
    },
    onSuccess: () => { invalidate(); setModal(null); toast.success('Summary updated') },
    onError: (e: Error) => toast.error(e.message),
  })

  const publishMut = useMutation({
    mutationFn: (logId: string) => publishDailyLog(supabase, logId),
    onSuccess: () => { invalidate(); toast.success('Summary published') },
    onError: (e: Error) => toast.error(e.message),
  })

  const visibleMut = useMutation({
    mutationFn: ({ logId, visible }: { logId: string; visible: boolean }) =>
      setDailyLogClientVisible(supabase, logId, visible),
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message),
  })

  const isBusy = createMut.isPending || editMut.isPending

  // Get today's date for the summary builder default
  const builderDate = todayIso()
  const reportsForBuilder = internalReports.filter((r) => r.date === builderDate)

  return (
    <>
      <div className="rounded-xl border border-gray-200 bg-white shadow-card">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-gray-900">Daily Summaries</h2>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400">{logs.length} logs</span>
            {isPM && internalReports.length > 0 && (
              <button
                onClick={() => setSummaryBuilderOpen(true)}
                className="flex items-center gap-1 rounded-lg border border-brand-300 bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-100 transition-colors"
              >
                Create Summary from Reports
              </button>
            )}
            {isPM && (
              <button
                onClick={() => setModal({ type: 'create' })}
                className="flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
              >
                <PlusIcon className="h-3.5 w-3.5" />
                New Summary
              </button>
            )}
          </div>
        </div>

        {logs.length === 0 ? (
          <EmptySection label="No daily summaries yet." />
        ) : (
          <div className="divide-y divide-gray-100">
            {logs.map((log) => {
              const isOpen = expanded === log.id
              const isPublished = !!log.published_at

              return (
                <div key={log.id}>
                  <div className="flex items-start gap-2 px-5 py-3">
                    {/* Expand toggle */}
                    <button
                      onClick={() => setExpanded(isOpen ? null : log.id)}
                      className="mt-0.5 shrink-0 text-gray-400 hover:text-gray-600"
                      title={isOpen ? 'Collapse' : 'Expand'}
                    >
                      <span className="text-xs">{isOpen ? '▲' : '▼'}</span>
                    </button>

                    {/* Main content */}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-gray-900">
                          {new Date(log.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                        </span>
                        {log.weather && (
                          <span className="text-xs text-gray-400">
                            {log.weather}{log.temperature_f ? ` · ${log.temperature_f}°F` : ''}
                          </span>
                        )}
                        {log.crew_count != null && (
                          <span className="text-xs text-gray-400">
                            {log.crew_count} crew{log.hours_worked != null ? ` · ${log.hours_worked}h` : ''}
                          </span>
                        )}
                        {isPublished ? (
                          <span className="rounded bg-green-50 px-1.5 py-0.5 text-[10px] font-semibold text-green-700">PUBLISHED</span>
                        ) : (
                          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500">DRAFT</span>
                        )}
                        {log.is_client_visible && (
                          <span className="rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-600">CLIENT</span>
                        )}
                      </div>
                      <p className={`mt-0.5 text-xs text-gray-500 ${isOpen ? '' : 'line-clamp-1'}`}>
                        {log.work_performed}
                      </p>
                    </div>

                    {/* Actions — only for PM+ */}
                    {isPM && (
                      <div className="flex shrink-0 items-center gap-2">
                        {/* Client visible toggle */}
                        <Toggle
                          checked={log.is_client_visible}
                          onChange={(v) => visibleMut.mutate({ logId: log.id, visible: v })}
                          label="Client"
                        />

                        {/* Publish button — only for draft logs */}
                        {!isPublished && (
                          <button
                            onClick={() => publishMut.mutate(log.id)}
                            disabled={publishMut.isPending}
                            className="rounded-md bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700 hover:bg-green-100 disabled:opacity-50"
                          >
                            Publish
                          </button>
                        )}

                        {/* Edit button */}
                        <button
                          onClick={() => setModal({ type: 'edit', log })}
                          className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                          title="Edit summary"
                        >
                          <PencilIcon className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Expanded detail */}
                  {isOpen && (
                    <div className="space-y-2 border-t border-gray-100 bg-gray-50/50 px-5 py-3 ml-7">
                      {[
                        { label: 'Work Performed',      value: log.work_performed },
                        { label: 'Materials Delivered', value: log.materials_delivered },
                        { label: 'Equipment Used',      value: log.equipment_used },
                        { label: 'Issues / Delays',     value: log.issues_or_delays },
                      ].filter((item) => item.value).map((item) => (
                        <div key={item.label}>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{item.label}</p>
                          <p className="mt-0.5 text-xs text-gray-700 whitespace-pre-line">{item.value}</p>
                        </div>
                      ))}

                      {/* Photos — lazy-fetched once the row is expanded */}
                      <LogPhotoGallery
                        logId={log.id}
                        projectId={projectId}
                        tenantId={tenantId}
                        userId={userId}
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Create/Edit Summary Modal */}
      {modal?.type === 'create' && (
        <DailyLogModal
          mode="create"
          onSubmit={(vals, photos) => createMut.mutate({ vals, photos })}
          onClose={() => setModal(null)}
          isLoading={isBusy}
        />
      )}
      {modal?.type === 'edit' && (
        <DailyLogModal
          mode="edit"
          log={modal.log}
          onSubmit={(vals, photos) => editMut.mutate({ logId: modal.log.id, vals, photos })}
          onClose={() => setModal(null)}
          isLoading={isBusy}
        />
      )}

      {/* Summary Builder from Reports */}
      {summaryBuilderOpen && (
        <SummaryBuilderModal
          projectId={projectId}
          tenantId={tenantId}
          userId={userId}
          date={builderDate}
          reports={reportsForBuilder}
          onClose={() => setSummaryBuilderOpen(false)}
          onSuccess={() => {
            setSummaryBuilderOpen(false)
            qc.invalidateQueries({ queryKey: ['project-field', projectId] })
          }}
        />
      )}
    </>
  )
}

// ── RFIs ───────────────────────────────────────────────────────────────────

function RfisSection({ rfis }: { rfis: ProjectRfi[] }) {
  const open = rfis.filter((r) => !['closed', 'void'].includes(r.status))
  const closed = rfis.filter((r) => ['closed', 'void'].includes(r.status))

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-card">
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
        <h2 className="text-sm font-semibold text-gray-900">RFIs</h2>
        <span className="text-xs text-gray-400">{rfis.length} total</span>
      </div>

      {rfis.length === 0 ? (
        <EmptySection label="No RFIs on this project." />
      ) : (
        <div className="divide-y divide-gray-100">
          {[...open, ...closed].map((rfi) => (
            <div key={rfi.id} className="px-5 py-3">
              <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-gray-400">RFI-{String(rfi.number).padStart(3, '0')}</span>
                  <span className="text-sm font-medium text-gray-900">{rfi.subject}</span>
                  <Badge status={rfi.status} map={RFI_STATUS} />
                </div>
                <div className="shrink-0 text-right">
                  {rfi.due_date && (
                    <span className={`text-xs ${isOverdue(rfi.due_date) && !['answered','closed','void'].includes(rfi.status) ? 'font-medium text-amber-600' : 'text-gray-400'}`}>
                      Due {fmtDate(rfi.due_date)}
                    </span>
                  )}
                </div>
              </div>
              <p className="mt-0.5 text-xs text-gray-500 line-clamp-2">{rfi.question}</p>
              {rfi.answer && (
                <p className="mt-1 rounded-md bg-green-50 px-2 py-1 text-xs text-green-800 line-clamp-2">
                  ✓ {rfi.answer}
                </p>
              )}
              {(rfi.cost_impact_cents || rfi.schedule_impact_days) && (
                <div className="mt-1 flex gap-3">
                  {rfi.cost_impact_cents != null && rfi.cost_impact_cents !== 0 && (
                    <span className="text-xs text-amber-600">Cost impact: {rfi.cost_impact_cents > 0 ? '+' : ''}${(rfi.cost_impact_cents / 100).toLocaleString()}</span>
                  )}
                  {rfi.schedule_impact_days != null && rfi.schedule_impact_days !== 0 && (
                    <span className="text-xs text-amber-600">Schedule: {rfi.schedule_impact_days > 0 ? '+' : ''}{rfi.schedule_impact_days}d</span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Punch List ─────────────────────────────────────────────────────────────

const PUNCH_STATUS_OPTIONS: { value: ProjectPunchItem['status']; label: string }[] = [
  { value: 'open',             label: 'Open' },
  { value: 'in_progress',      label: 'In Progress' },
  { value: 'ready_for_review', label: 'Ready for Review' },
  { value: 'closed',           label: 'Closed' },
  { value: 'void',             label: 'Void' },
]

const PUNCH_PRIORITY_OPTIONS: { value: ProjectPunchItem['priority']; label: string }[] = [
  { value: 'low',      label: 'Low' },
  { value: 'normal',   label: 'Normal' },
  { value: 'high',     label: 'High' },
  { value: 'blocking', label: 'Blocking' },
]

interface PunchFormData {
  title: string
  description: string | null
  location: string | null
  trade: string | null
  priority: ProjectPunchItem['priority']
  status: ProjectPunchItem['status']
  due_date: string | null
}

function PunchItemForm({
  item,
  onSave,
  onCancel,
  isSaving,
}: {
  item?: ProjectPunchItem | null
  onSave: (data: PunchFormData) => void
  onCancel: () => void
  isSaving: boolean
}) {
  const [title,       setTitle]       = useState(item?.title       ?? '')
  const [description, setDescription] = useState(item?.description ?? '')
  const [location,    setLocation]    = useState(item?.location    ?? '')
  const [trade,       setTrade]       = useState(item?.trade       ?? '')
  const [priority,    setPriority]    = useState<ProjectPunchItem['priority']>(item?.priority ?? 'normal')
  const [status,      setStatus]      = useState<ProjectPunchItem['status']>(item?.status ?? 'open')
  const [dueDate,     setDueDate]     = useState(item?.due_date    ?? '')

  const inputCls = 'h-9 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:bg-white focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 transition-colors'
  const selectCls = 'h-9 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm text-gray-900 focus:bg-white focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 transition-colors'
  const labelCls = 'mb-1 block text-xs font-medium text-gray-600'

  return (
    <div className="border-t border-gray-100 bg-gray-50 px-5 py-4">
      <p className="mb-3 text-xs font-semibold text-gray-700">{item ? 'Edit Item' : 'Add Item'}</p>
      <div className="space-y-3">
        <div>
          <label className={labelCls}>Title <span className="text-red-500">*</span></label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Describe the punch item…"
            className={inputCls}
            autoFocus
          />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <label className={labelCls}>Priority</label>
            <select value={priority} onChange={(e) => setPriority(e.target.value as ProjectPunchItem['priority'])} className={selectCls}>
              {PUNCH_PRIORITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          {item && (
            <div>
              <label className={labelCls}>Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as ProjectPunchItem['status'])} className={selectCls}>
                {PUNCH_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className={labelCls}>Due Date</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Trade</label>
            <input type="text" value={trade} onChange={(e) => setTrade(e.target.value)} placeholder="e.g. Framing" className={inputCls} />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Location</label>
            <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Master bath" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Notes</label>
            <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Additional details…" className={inputCls} />
          </div>
        </div>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSaving}
          className="h-8 rounded-lg px-3.5 text-sm font-medium text-gray-600 hover:bg-gray-200 transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!title.trim() || isSaving}
          onClick={() => onSave({
            title:       title.trim(),
            description: description.trim() || null,
            location:    location.trim()    || null,
            trade:       trade.trim()       || null,
            priority,
            status,
            due_date:    dueDate            || null,
          })}
          className="inline-flex h-8 items-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {isSaving ? 'Saving…' : item ? 'Save' : 'Add Item'}
        </button>
      </div>
    </div>
  )
}

function PunchListSection({
  items,
  projectId,
  tenantId,
  userId,
  canDelete,
}: {
  items: ProjectPunchItem[]
  projectId: string
  tenantId: string
  userId: string
  canDelete: boolean
}) {
  const queryClient   = useQueryClient()
  const priorityOrder = ['blocking', 'high', 'normal', 'low']
  const sorted        = [...items].sort((a, b) => priorityOrder.indexOf(a.priority) - priorityOrder.indexOf(b.priority))

  const [showForm,   setShowForm]   = useState(false)
  const [editingId,  setEditingId]  = useState<string | null>(null)

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['project-field', projectId] })
  }

  const createMut = useMutation({
    mutationFn: (input: CreatePunchListItemInput) =>
      createPunchListItem(supabase, tenantId, projectId, userId, input),
    onSuccess: () => { invalidate(); setShowForm(false) },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdatePunchListItemInput }) =>
      updatePunchListItem(supabase, id, input),
    onSuccess: () => { invalidate(); setEditingId(null) },
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => deletePunchListItem(supabase, id),
    onSuccess: invalidate,
  })

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-card">
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
        <h2 className="text-sm font-semibold text-gray-900">Punch List</h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">{items.length} items</span>
          {!showForm && (
            <button
              type="button"
              onClick={() => { setShowForm(true); setEditingId(null) }}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-brand-700 transition-colors"
            >
              + Add Item
            </button>
          )}
        </div>
      </div>

      {items.length === 0 && !showForm ? (
        <EmptySection label="No punch list items yet." />
      ) : (
        <div className="divide-y divide-gray-100">
          {sorted.map((item) => {
            const pCfg = PUNCH_PRIORITY[item.priority] ?? PUNCH_PRIORITY.normal
            const isEditing = editingId === item.id
            return (
              <div key={item.id}>
                {isEditing ? (
                  <PunchItemForm
                    item={item}
                    isSaving={updateMut.isPending}
                    onCancel={() => setEditingId(null)}
                    onSave={(data) => updateMut.mutate({ id: item.id, input: data as UpdatePunchListItemInput })}
                  />
                ) : (
                  <div className="group flex gap-3 px-5 py-3">
                    <div className="mt-1.5 flex shrink-0 flex-col items-center">
                      <div className={`h-2.5 w-2.5 rounded-full ring-2 ring-white ${pCfg.dot}`} title={pCfg.label} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-sm font-medium ${item.status === 'closed' || item.status === 'void' ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                          {item.title}
                        </span>
                        <Badge status={item.status} map={PUNCH_STATUS} />
                      </div>
                      <div className="mt-0.5 flex flex-wrap gap-2 text-xs text-gray-400">
                        {item.trade    && <span>{item.trade}</span>}
                        {item.location && <span>· {item.location}</span>}
                        {item.due_date && (
                          <span className={isOverdue(item.due_date) && item.status !== 'closed' ? 'text-amber-600' : ''}>
                            · Due {fmtDate(item.due_date)}
                          </span>
                        )}
                      </div>
                      {item.description && (
                        <p className="mt-0.5 text-xs text-gray-400 line-clamp-1">{item.description}</p>
                      )}
                    </div>
                    {/* Row actions */}
                    <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={() => { setEditingId(item.id); setShowForm(false) }}
                        className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-brand-600 transition-colors"
                        title="Edit"
                      >
                        <PencilIcon className="h-3.5 w-3.5" strokeWidth={2} />
                      </button>
                      {canDelete && (
                        <button
                          type="button"
                          disabled={deleteMut.isPending}
                          onClick={() => { if (confirm('Delete this punch list item?')) deleteMut.mutate(item.id) }}
                          className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-50"
                          title="Delete"
                        >
                          <TrashIcon className="h-3.5 w-3.5" strokeWidth={2} />
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {showForm && (
        <PunchItemForm
          isSaving={createMut.isPending}
          onCancel={() => setShowForm(false)}
          onSave={(data) => createMut.mutate(data as CreatePunchListItemInput)}
        />
      )}
    </div>
  )
}

// ── Submittals ─────────────────────────────────────────────────────────────

function SubmittalsSection({ submittals }: { submittals: ProjectSubmittal[] }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-card">
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
        <h2 className="text-sm font-semibold text-gray-900">Submittals</h2>
        <span className="text-xs text-gray-400">{submittals.length} total</span>
      </div>

      {submittals.length === 0 ? (
        <EmptySection label="No submittals on this project." />
      ) : (
        <div className="divide-y divide-gray-100">
          {submittals.map((sub) => (
            <div key={sub.id} className="px-5 py-3">
              <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-gray-400">{sub.number}{sub.revision > 0 ? ` Rev.${sub.revision}` : ''}</span>
                  <span className="text-sm font-medium text-gray-900">{sub.title}</span>
                  <Badge status={sub.status} map={SUBMITTAL_STATUS} />
                </div>
                {sub.required_by && (
                  <span className={`shrink-0 text-xs ${isOverdue(sub.required_by) && !['approved','approved_as_noted','void'].includes(sub.status) ? 'font-medium text-amber-600' : 'text-gray-400'}`}>
                    Required {fmtDate(sub.required_by)}
                  </span>
                )}
              </div>
              <div className="mt-0.5 flex flex-wrap gap-2 text-xs text-gray-400">
                {sub.type && <span>{sub.type.replace('_', ' ')}</span>}
                {sub.spec_section && <span>· {sub.spec_section}</span>}
                {sub.submitted_at && <span>· Submitted {fmtDate(sub.submitted_at)}</span>}
              </div>
              {sub.review_notes && (
                <p className="mt-1 text-xs text-gray-500 line-clamp-1">Note: {sub.review_notes}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Shared empty state ─────────────────────────────────────────────────────

function EmptySection({ label }: { label: string }) {
  return (
    <div className="px-5 py-10 text-center">
      <p className="text-sm text-gray-400">{label}</p>
    </div>
  )
}

// ── Loading skeleton ───────────────────────────────────────────────────────

function FieldSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-xl border border-gray-200 bg-white p-4 space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-10" />
          </div>
        ))}
      </div>
      {[1, 2].map((i) => (
        <div key={i} className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-px w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ))}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export function FieldTab() {
  const { id: projectId } = useParams<{ id: string }>()
  const { isLoading: projectLoading } = useOutletContext<OutletCtx>()
  const { data: fieldData, isLoading: fieldLoading } = useProjectFieldData(projectId)
  const { user, activeTenantId, tenantMemberships } = useAuth()

  const role = tenantMemberships.find((m) => m.tenant_id === activeTenantId)?.role ?? null
  const isPM = ['project_manager', 'admin', 'owner'].includes(role ?? '')
  const canManageField = ['field_super', 'accountant', 'project_manager', 'admin', 'owner'].includes(role ?? '')
  const isFieldWorker = ['field_associate', 'field_super', 'subcontractor'].includes(role ?? '')

  // Suppress unused-variable warnings for role flags that may be used by future callers
  void isPM
  void canManageField
  void isFieldWorker

  const isLoading = projectLoading || fieldLoading

  if (isLoading) {
    return <div className="px-5 py-6 lg:px-8"><FieldSkeleton /></div>
  }

  const rfis             = fieldData?.rfis             ?? []
  const punchItems       = fieldData?.punchItems       ?? []
  const submittals       = fieldData?.submittals       ?? []
  const summaryLogs      = fieldData?.summaryLogs      ?? []
  const internalReports  = fieldData?.internalReports  ?? []

  return (
    <div className="space-y-4 px-5 py-6 lg:px-8">
      <FieldSummary
        rfis={rfis}
        punchItems={punchItems}
        submittals={submittals}
        summaryLogs={summaryLogs}
      />

      {/* Worker reports — visible to all (RLS filters to own for FA/sub) */}
      <WorkerReportsSection
        reports={internalReports}
        projectId={projectId!}
        tenantId={activeTenantId!}
        userId={user!.id}
        role={role}
        summaryLogs={summaryLogs}
      />

      {/* Client-facing summaries */}
      <DailySummarySection
        logs={summaryLogs}
        internalReports={internalReports}
        projectId={projectId!}
        tenantId={activeTenantId!}
        userId={user!.id}
        role={role}
      />

      <RfisSection rfis={rfis} />
      <PunchListSection
        items={punchItems}
        projectId={projectId!}
        tenantId={activeTenantId!}
        userId={user!.id}
        canDelete={role !== 'subcontractor'}
      />
      <SubmittalsSection submittals={submittals} />
    </div>
  )
}
