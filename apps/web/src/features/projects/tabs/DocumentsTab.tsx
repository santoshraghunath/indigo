import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useOutletContext, useParams } from 'react-router-dom'
import {
  getProjectDocumentDownload,
  uploadProjectDocument,
  type ProjectRow,
  type ProjectDocument,
} from '@indigo/shared'
import { useProjectDocuments } from '../useProject'
import { Skeleton } from '@/components/ui/Skeleton'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/stores/toastStore'

interface OutletCtx {
  project: ProjectRow | undefined
  isLoading: boolean
}

const MAX_PROJECT_DOCUMENT_SIZE_BYTES = 25 * 1024 * 1024

// ── Document type config ───────────────────────────────────────────────────

type DocType =
  | 'plan' | 'permit' | 'contract' | 'change_order' | 'invoice'
  | 'lien_waiver' | 'w9' | 'insurance_cert' | 'photo' | 'video'
  | 'submittal' | 'rfi' | 'specification' | 'warranty' | 'report' | 'other'

interface DocTypeConfig {
  label: string
  emoji: string
  description: string
}

const DOC_TYPES: Record<DocType, DocTypeConfig> = {
  plan:           { label: 'Plans',           emoji: '📐', description: 'Architectural & engineering drawings' },
  permit:         { label: 'Permits',         emoji: '🏛️', description: 'Building & trade permits' },
  contract:       { label: 'Contracts',       emoji: '📄', description: 'Owner agreements & scopes' },
  change_order:   { label: 'Change Orders',   emoji: '🔄', description: 'Approved scope changes' },
  invoice:        { label: 'Invoices',        emoji: '💳', description: 'Client billing documents' },
  lien_waiver:    { label: 'Lien Waivers',    emoji: '🔒', description: 'Conditional & unconditional releases' },
  w9:             { label: 'W-9 / Tax',       emoji: '📋', description: 'IRS forms and tax documents' },
  insurance_cert: { label: 'Insurance',       emoji: '🛡️', description: 'Certificates of insurance' },
  photo:          { label: 'Photos',          emoji: '📷', description: 'Site and progress photos' },
  video:          { label: 'Videos',          emoji: '🎥', description: 'Walkthroughs & inspections' },
  submittal:      { label: 'Submittals',      emoji: '📦', description: 'Product data & shop drawings' },
  rfi:            { label: 'RFIs',            emoji: '❓', description: 'Requests for information' },
  specification:  { label: 'Specifications',  emoji: '📝', description: 'Project specifications' },
  warranty:       { label: 'Warranties',      emoji: '✅', description: 'Manufacturer & labor warranties' },
  report:         { label: 'Reports',         emoji: '📊', description: 'Inspections & test reports' },
  other:          { label: 'Other',           emoji: '📁', description: 'Miscellaneous documents' },
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtDate(s: string): string {
  return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtBytes(n: number | null | undefined): string {
  if (!n) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function mimeIcon(mime: string | null): string {
  if (!mime) return '📎'
  if (mime.startsWith('image/')) return '🖼️'
  if (mime.startsWith('video/')) return '🎥'
  if (mime === 'application/pdf') return '📕'
  if (mime.includes('word') || mime.includes('document')) return '📝'
  if (mime.includes('sheet') || mime.includes('excel')) return '📊'
  if (mime.includes('zip') || mime.includes('archive')) return '🗜️'
  return '📎'
}

// ── Category tile ──────────────────────────────────────────────────────────

function CategoryTile({
  type,
  count,
  selected,
  onClick,
}: {
  type: DocType
  count: number
  selected: boolean
  onClick: () => void
}) {
  const cfg = DOC_TYPES[type]

  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-start rounded-xl border p-4 text-left transition-all ${
        selected
          ? 'border-brand-300 bg-brand-50 ring-1 ring-brand-300'
          : count > 0
          ? 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
          : 'border-gray-100 bg-gray-50 opacity-60 hover:opacity-80'
      }`}
    >
      <span className="text-2xl leading-none">{cfg.emoji}</span>
      <span className={`mt-2 text-xs font-semibold ${selected ? 'text-brand-700' : 'text-gray-800'}`}>
        {cfg.label}
      </span>
      <span className={`mt-0.5 text-xs ${selected ? 'text-brand-600' : 'text-gray-400'}`}>
        {count === 0 ? 'Empty' : `${count} file${count !== 1 ? 's' : ''}`}
      </span>
    </button>
  )
}

// ── Document row ───────────────────────────────────────────────────────────

function triggerDownload(url: string, fileName: string) {
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.rel = 'noreferrer'
  document.body.appendChild(link)
  link.click()
  link.remove()
}

function DocumentRow({
  doc,
  onDownload,
  isDownloading,
}: {
  doc: ProjectDocument
  onDownload: (doc: ProjectDocument) => void
  isDownloading: boolean
}) {
  return (
    <div className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors">
      <span className="shrink-0 text-xl leading-none">{mimeIcon(doc.mime_type)}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-900">{doc.name}</p>
        <p className="text-xs text-gray-400">
          {fmtDate(doc.created_at)}
          {doc.file_size_bytes ? ` · ${fmtBytes(doc.file_size_bytes)}` : ''}
          {doc.version > 1 ? ` · v${doc.version}` : ''}
        </p>
        {doc.description && (
          <p className="mt-0.5 text-xs text-gray-400 truncate">{doc.description}</p>
        )}
      </div>
      {doc.is_client_visible && (
        <span className="shrink-0 rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-600">
          CLIENT
        </span>
      )}
      {doc.tags.length > 0 && (
        <div className="hidden shrink-0 gap-1 lg:flex">
          {doc.tags.slice(0, 2).map((tag) => (
            <span key={tag} className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">
              {tag}
            </span>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => onDownload(doc)}
        disabled={isDownloading}
        className="shrink-0 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
        aria-label={`Download ${doc.name}`}
      >
        {isDownloading ? 'Downloading…' : 'Download'}
      </button>
    </div>
  )
}

function UploadPanel({
  projectId,
  tenantId,
  userId,
  onUploaded,
}: {
  projectId: string
  tenantId: string
  userId: string
  onUploaded: () => void
}) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [type, setType] = useState<DocType>('other')
  const [description, setDescription] = useState('')
  const [isClientVisible, setIsClientVisible] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!file) {
        throw new Error('Choose a file to upload.')
      }
      if (file.size === 0) {
        throw new Error('Choose a non-empty file.')
      }
      if (file.size > MAX_PROJECT_DOCUMENT_SIZE_BYTES) {
        throw new Error('Choose a file smaller than or equal to 25 MB.')
      }

      return uploadProjectDocument(supabase, tenantId, projectId, userId, file, {
        type,
        description,
        isClientVisible,
      })
    },
    onSuccess: async () => {
      setType('other')
      setDescription('')
      setIsClientVisible(false)
      setFile(null)
      setError(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      await queryClient.invalidateQueries({ queryKey: ['project-documents', projectId] })
      onUploaded()
      toast.success('Document uploaded')
    },
    onError: (uploadError: Error) => {
      setError(uploadError.message)
      toast.error(uploadError.message)
    },
  })

  return (
    <form
      className="rounded-xl border border-gray-200 bg-white p-5 shadow-card"
      onSubmit={(event) => {
        event.preventDefault()
        if (uploadMutation.isPending) {
          return
        }
        setError(null)
        uploadMutation.mutate()
      }}
      aria-describedby="project-document-upload-help"
    >
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 pb-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Upload document</h2>
          <p id="project-document-upload-help" className="mt-1 text-xs text-gray-500">
            Add a tenant-scoped file up to 25 MB.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-gray-700">Category</span>
          <select
            value={type}
            onChange={(event) => setType(event.target.value as DocType)}
            disabled={uploadMutation.isPending}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
          >
            {ALL_TYPES.map((docType) => (
              <option key={docType} value={docType}>
                {DOC_TYPES[docType].label}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-gray-700">File</span>
          <input
            ref={fileInputRef}
            type="file"
            onChange={(event) => {
              setError(null)
              setFile(event.target.files?.[0] ?? null)
            }}
            disabled={uploadMutation.isPending}
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
            aria-describedby={error ? 'project-document-upload-error' : undefined}
          />
        </label>

        <label className="block text-sm md:col-span-2">
          <span className="mb-1 block font-medium text-gray-700">Description</span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            disabled={uploadMutation.isPending}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
            placeholder="Optional description"
          />
        </label>

        <label className="flex items-center gap-3 text-sm text-gray-700 md:col-span-2">
          <input
            type="checkbox"
            checked={isClientVisible}
            onChange={(event) => setIsClientVisible(event.target.checked)}
            disabled={uploadMutation.isPending}
            className="h-4 w-4 rounded border-gray-300"
          />
          <span>Visible to client portal users</span>
        </label>
      </div>

      {file && (
        <p className="mt-3 text-xs text-gray-500">
          Selected: {file.name}{file.size ? ` · ${fmtBytes(file.size)}` : ''}
        </p>
      )}

      {error && (
        <p id="project-document-upload-error" className="mt-3 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      <div className="mt-4 flex justify-end">
        <button
          type="submit"
          disabled={uploadMutation.isPending}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
          aria-busy={uploadMutation.isPending}
        >
          {uploadMutation.isPending ? 'Uploading…' : 'Upload document'}
        </button>
      </div>
    </form>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-white py-12 text-center">
      <span className="text-3xl">📄</span>
      <h3 className="mt-3 text-sm font-semibold text-gray-900">No matching documents</h3>
      <p className="mt-1 max-w-xs text-sm text-gray-500">
        Upload a project document or clear the current filter to browse existing files.
      </p>
    </div>
  )
}

// ── Loading skeleton ───────────────────────────────────────────────────────

function DocumentsSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3 lg:grid-cols-6">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="rounded-xl border border-gray-200 bg-white p-4 space-y-2">
            <Skeleton className="h-6 w-6 rounded" />
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-10" />
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
        <Skeleton className="h-4 w-32" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-8 w-8 rounded" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-1/2" />
              <Skeleton className="h-3 w-1/4" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

const ALL_TYPES = Object.keys(DOC_TYPES) as DocType[]

export function DocumentsTab() {
  const { id: projectId } = useParams<{ id: string }>()
  const { isLoading: projectLoading, project } = useOutletContext<OutletCtx>()
  const { activeTenantId, user } = useAuth()
  const toast = useToast()
  const { data, isLoading: docsLoading } = useProjectDocuments(projectId)

  const [selectedType, setSelectedType] = useState<DocType | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  const folders   = data?.folders   ?? []
  const documents = data?.documents ?? []

  const isLoading = projectLoading || docsLoading

  if (isLoading) {
    return <div className="px-5 py-6 lg:px-8"><DocumentsSkeleton /></div>
  }

  // Count documents per type
  const countsByType = ALL_TYPES.reduce<Record<string, number>>((acc, t) => {
    acc[t] = documents.filter((d) => d.type === t).length
    return acc
  }, {})

  // Types with docs first, then others; always include a core set
  const CORE_TYPES: DocType[] = ['plan', 'permit', 'contract', 'change_order', 'photo', 'other']
  const shownTypes = [...new Set([...CORE_TYPES, ...ALL_TYPES])] as DocType[]

  // Filtered document list
  const filteredDocs = selectedType
    ? documents.filter((d) => d.type === selectedType)
    : documents

  const totalDocs = documents.length

  // Active section label
  const sectionLabel = selectedType
    ? DOC_TYPES[selectedType].label
    : 'All Documents'

  async function handleDownload(doc: ProjectDocument) {
    if (!activeTenantId || !projectId) return

    setDownloadingId(doc.id)
    try {
      const download = await getProjectDocumentDownload(supabase, activeTenantId, projectId, doc.id)
      triggerDownload(download.signedUrl, download.fileName)
    } catch (downloadError) {
      toast.error((downloadError as Error).message)
    } finally {
      setDownloadingId(null)
    }
  }

  return (
    <div className="space-y-4 px-5 py-6 lg:px-8">
      {projectId && activeTenantId && user?.id && project && (
        <UploadPanel
          projectId={projectId}
          tenantId={activeTenantId}
          userId={user.id}
          onUploaded={() => setSelectedType(null)}
        />
      )}

      {/* Category tiles */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-card">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-gray-900">Categories</h2>
          {totalDocs > 0 && (
            <span className="text-xs text-gray-500">{totalDocs} total file{totalDocs !== 1 ? 's' : ''}</span>
          )}
        </div>
        <div className="grid grid-cols-3 gap-3 p-4 lg:grid-cols-6">
          {shownTypes.map((type) => (
            <CategoryTile
              key={type}
              type={type}
              count={countsByType[type] ?? 0}
              selected={selectedType === type}
              onClick={() => setSelectedType(selectedType === type ? null : type)}
            />
          ))}
        </div>
        {selectedType && (
          <div className="border-t border-gray-100 px-5 py-2.5 text-xs text-gray-500">
            {DOC_TYPES[selectedType].description}
            <button
              onClick={() => setSelectedType(null)}
              className="ml-2 font-medium text-brand-600 hover:text-brand-700"
            >
              Clear filter
            </button>
          </div>
        )}
      </div>

      {/* Document list */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-card">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-gray-900">{sectionLabel}</h2>
          <span className="text-xs text-gray-500">
            {filteredDocs.length} file{filteredDocs.length !== 1 ? 's' : ''}
          </span>
        </div>

        {filteredDocs.length === 0 ? (
          <div className="p-5">
            <EmptyState />
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredDocs.map((doc) => (
              <DocumentRow
                key={doc.id}
                doc={doc}
                onDownload={handleDownload}
                isDownloading={downloadingId === doc.id}
              />
            ))}
          </div>
        )}
      </div>

      {/* Folder list (if any custom folders exist) */}
      {folders.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-card">
          <div className="border-b border-gray-100 px-5 py-4">
            <h2 className="text-sm font-semibold text-gray-900">Folders</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {folders.map((folder) => (
              <div key={folder.id} className="flex items-center gap-3 px-5 py-3">
                <span className="text-lg">📁</span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">{folder.name}</p>
                  {folder.type && (
                    <p className="text-xs text-gray-400">
                      {DOC_TYPES[folder.type as DocType]?.label ?? folder.type}
                    </p>
                  )}
                </div>
                {folder.is_client_visible && (
                  <span className="rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-600">
                    CLIENT
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
