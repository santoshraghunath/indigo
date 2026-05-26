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
} from '@indigo/shared'
import { useProjectFieldData } from '../useProject'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/stores/toastStore'
import { Skeleton } from '@/components/ui/Skeleton'
import { PlusIcon, PencilIcon } from '@/components/ui/Icons'

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
  rfis, punchItems, submittals, dailyLogs,
}: {
  rfis: ProjectRfi[]
  punchItems: ProjectPunchItem[]
  submittals: ProjectSubmittal[]
  dailyLogs: ProjectDailyLog[]
}) {
  const openRfis      = rfis.filter((r) => !['closed', 'void'].includes(r.status)).length
  const openPunch     = punchItems.filter((p) => !['closed', 'void'].includes(p.status)).length
  const pendingSubs   = submittals.filter((s) => !['approved', 'approved_as_noted', 'void'].includes(s.status)).length
  const overdueRfis   = rfis.filter((r) => isOverdue(r.due_date) && !['closed', 'void', 'answered'].includes(r.status)).length
  const publishedLogs = dailyLogs.filter((l) => l.published_at).length

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {[
        { label: 'Daily Logs',         value: dailyLogs.length, warn: false, sub: publishedLogs > 0 ? `${publishedLogs} published` : undefined },
        { label: 'Open RFIs',          value: openRfis,         warn: overdueRfis > 0, sub: overdueRfis > 0 ? `${overdueRfis} overdue` : undefined },
        { label: 'Punch Items',        value: openPunch,        warn: openPunch > 0 },
        { label: 'Pending Submittals', value: pendingSubs,      warn: false },
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
            {mode === 'create' ? 'New Daily Log' : `Edit Log — ${fmtDate(log?.date)}`}
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
                ? stagedPhotos.length > 0 ? `Create Log + ${stagedPhotos.length} Photo${stagedPhotos.length > 1 ? 's' : ''}` : 'Create Log'
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

// ── Daily Logs section ─────────────────────────────────────────────────────

interface DailyLogsSectionProps {
  logs: ProjectDailyLog[]
  projectId: string
  tenantId: string
  userId: string
}

function DailyLogsSection({ logs, projectId, tenantId, userId }: DailyLogsSectionProps) {
  const qc = useQueryClient()
  const toast = useToast()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [modal, setModal] = useState<{ type: 'create' } | { type: 'edit'; log: ProjectDailyLog } | null>(null)

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
      } satisfies CreateDailyLogInput)
      if (photos.length > 0) {
        await Promise.all(
          photos.map((f) => uploadDailyLogPhoto(supabase, tenantId, projectId, logId, userId, f)),
        )
      }
    },
    onSuccess: () => { invalidate(); setModal(null); toast.success('Daily log created') },
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
        // Invalidate the photo gallery for this log so it refreshes on re-expand
        qc.invalidateQueries({ queryKey: ['log-photos', logId] })
      }
    },
    onSuccess: () => { invalidate(); setModal(null); toast.success('Log updated') },
    onError: (e: Error) => toast.error(e.message),
  })

  const publishMut = useMutation({
    mutationFn: (logId: string) => publishDailyLog(supabase, logId),
    onSuccess: () => { invalidate(); toast.success('Log published') },
    onError: (e: Error) => toast.error(e.message),
  })

  const visibleMut = useMutation({
    mutationFn: ({ logId, visible }: { logId: string; visible: boolean }) =>
      setDailyLogClientVisible(supabase, logId, visible),
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message),
  })

  const isBusy = createMut.isPending || editMut.isPending

  return (
    <>
      <div className="rounded-xl border border-gray-200 bg-white shadow-card">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-gray-900">Daily Logs</h2>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400">{logs.length} logs</span>
            <button
              onClick={() => setModal({ type: 'create' })}
              className="flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
            >
              <PlusIcon className="h-3.5 w-3.5" />
              New Log
            </button>
          </div>
        </div>

        {logs.length === 0 ? (
          <EmptySection label="No daily logs yet. Create the first one above." />
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

                    {/* Actions */}
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

                      {/* Edit button — always available for staff */}
                      <button
                        onClick={() => setModal({ type: 'edit', log })}
                        className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                        title="Edit log"
                      >
                        <PencilIcon className="h-3.5 w-3.5" />
                      </button>
                    </div>
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

      {/* Modals */}
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

function PunchListSection({ items }: { items: ProjectPunchItem[] }) {
  const priorityOrder = ['blocking', 'high', 'normal', 'low']
  const sorted = [...items].sort((a, b) => priorityOrder.indexOf(a.priority) - priorityOrder.indexOf(b.priority))

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-card">
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
        <h2 className="text-sm font-semibold text-gray-900">Punch List</h2>
        <span className="text-xs text-gray-400">{items.length} items</span>
      </div>

      {items.length === 0 ? (
        <EmptySection label="No punch list items." />
      ) : (
        <div className="divide-y divide-gray-100">
          {sorted.map((item) => {
            const pCfg = PUNCH_PRIORITY[item.priority] ?? PUNCH_PRIORITY.normal
            return (
              <div key={item.id} className="flex gap-3 px-5 py-3">
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
                    {item.trade && <span>{item.trade}</span>}
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
              </div>
            )
          })}
        </div>
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
  const { user, activeTenantId } = useAuth()

  const isLoading = projectLoading || fieldLoading

  if (isLoading) {
    return <div className="px-5 py-6 lg:px-8"><FieldSkeleton /></div>
  }

  const rfis       = fieldData?.rfis       ?? []
  const punchItems = fieldData?.punchItems ?? []
  const submittals = fieldData?.submittals ?? []
  const dailyLogs  = fieldData?.dailyLogs  ?? []

  return (
    <div className="space-y-4 px-5 py-6 lg:px-8">
      <FieldSummary
        rfis={rfis}
        punchItems={punchItems}
        submittals={submittals}
        dailyLogs={dailyLogs}
      />
      <DailyLogsSection
        logs={dailyLogs}
        projectId={projectId!}
        tenantId={activeTenantId!}
        userId={user!.id}
      />
      <RfisSection rfis={rfis} />
      <PunchListSection items={punchItems} />
      <SubmittalsSection submittals={submittals} />
    </div>
  )
}
