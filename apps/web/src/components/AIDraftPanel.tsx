import { useState, useCallback } from 'react'
import { AudioRecorder, type AudioReadyPayload } from './AudioRecorder'
import { uploadAudioForTranscription } from '@indigo/shared'
import { supabase } from '@/lib/supabase'
import { SparklesIcon, XMarkIcon, ChevronDownIcon } from '@/components/ui/Icons'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AIDraftResult {
  title:      string
  intro_text: string
  line_items: Array<{
    item_name:        string
    description:      string
    unit_price_cents: number
    quantity:         number
  }>
}

interface Props {
  tenantId:   string
  authToken:  string
  leadId?:    string
  jobType?:   string
  address?:   string
  onApply:    (draft: AIDraftResult) => void
  onDismiss:  () => void
}

// ── Step indicators ───────────────────────────────────────────────────────────

type Step = 'record' | 'transcribing' | 'transcript' | 'drafting' | 'review'

function StepDot({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className={`h-2 w-2 rounded-full transition-colors ${
        done   ? 'bg-brand-500' :
        active ? 'bg-brand-400 ring-2 ring-brand-200' :
                 'bg-gray-200'
      }`} />
      <span className={`text-xs ${active || done ? 'text-gray-700' : 'text-gray-400'}`}>{label}</span>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function AIDraftPanel({
  tenantId,
  authToken,
  leadId,
  jobType,
  address,
  onApply,
  onDismiss,
}: Props) {
  const [step,        setStep]       = useState<Step>('record')
  const [transcript,  setTranscript] = useState('')
  const [draftResult, setDraftResult] = useState<AIDraftResult | null>(null)
  const [error,       setError]      = useState<string | null>(null)
  const [collapsed,   setCollapsed]  = useState(false)

  // ── Transcription ─────────────────────────────────────────────────────────

  const handleAudioReady = useCallback(async (payload: AudioReadyPayload) => {
    setError(null)
    setStep('transcribing')

    try {
      const storagePath = await uploadAudioForTranscription(
        supabase,
        payload.blob,
        payload.filename,
        tenantId,
      )

      const res = await fetch('/.netlify/functions/transcribe-audio', {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({ tenantId, storagePath }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Transcription failed' })) as { error?: string }
        throw new Error(err.error ?? 'Transcription failed')
      }

      const { transcript: text } = await res.json() as { transcript: string }
      setTranscript(text)
      setStep('transcript')
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err))
      setStep('record')
    }
  }, [tenantId, authToken])

  // ── AI Draft ──────────────────────────────────────────────────────────────

  const handleDraftWithAI = useCallback(async () => {
    setError(null)
    setStep('drafting')

    try {
      const res = await fetch('/.netlify/functions/draft-proposal', {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          tenantId,
          transcript,
          ...(leadId   ? { leadId }   : {}),
          ...(jobType  ? { jobType }  : {}),
          ...(address  ? { address }  : {}),
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Draft failed' })) as { error?: string }
        throw new Error(err.error ?? 'Draft failed')
      }

      const draft = await res.json() as AIDraftResult
      setDraftResult(draft)
      setStep('review')
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err))
      setStep('transcript')
    }
  }, [tenantId, authToken, transcript, leadId, jobType, address])

  // ── Apply draft ───────────────────────────────────────────────────────────

  function handleApply() {
    if (draftResult) {
      onApply(draftResult)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const stepsDone: Record<Step, boolean> = {
    record:       false,
    transcribing: false,
    transcript:   step === 'drafting' || step === 'review',
    drafting:     false,
    review:       step === 'review',
  }

  return (
    <div className="rounded-xl border border-brand-200 bg-brand-50/50 shadow-sm overflow-hidden">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-brand-100">
        <div className="flex items-center gap-2.5">
          <SparklesIcon className="h-4 w-4 text-brand-500" />
          <span className="text-sm font-semibold text-brand-700">Draft with AI</span>
          <div className="hidden sm:flex items-center gap-4 ml-2">
            <StepDot active={step === 'record' || step === 'transcribing'} done={stepsDone.transcript} label="Record" />
            <StepDot active={step === 'transcript'} done={stepsDone.transcript && step !== 'transcript'} label="Transcript" />
            <StepDot active={step === 'drafting'} done={step === 'review'} label="Draft" />
            <StepDot active={step === 'review'} done={false} label="Review" />
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="rounded-lg p-1.5 text-brand-400 hover:bg-brand-100 transition-colors"
            aria-label={collapsed ? 'Expand' : 'Collapse'}
          >
            <ChevronDownIcon className={`h-4 w-4 transition-transform ${collapsed ? '-rotate-90' : ''}`} />
          </button>
          <button
            onClick={onDismiss}
            className="rounded-lg p-1.5 text-brand-400 hover:bg-brand-100 transition-colors"
            aria-label="Close AI Draft panel"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      {!collapsed && (
        <div className="px-5 py-4 space-y-4">

          {/* Error */}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
              <p className="text-sm text-red-700">{error}</p>
              <button
                onClick={() => setError(null)}
                className="mt-1 text-xs font-medium text-red-600 underline hover:text-red-800"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Step: record */}
          {(step === 'record' || step === 'transcribing') && (
            <div>
              <p className="mb-3 text-sm text-gray-600">
                Record the sales visit or upload an audio file. We'll transcribe it and draft a full proposal in seconds.
              </p>
              {step === 'record' && (
                <AudioRecorder onAudioReady={handleAudioReady} />
              )}
              {step === 'transcribing' && (
                <div className="flex items-center gap-3 py-2">
                  <span className="h-5 w-5 rounded-full border-2 border-brand-400 border-t-transparent animate-spin" aria-hidden />
                  <span className="text-sm text-gray-600">Transcribing audio…</span>
                </div>
              )}
            </div>
          )}

          {/* Step: transcript ready */}
          {step === 'transcript' && (
            <div className="space-y-3">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Transcript — review and edit if needed
                </label>
                <textarea
                  className="w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 transition-colors leading-relaxed"
                  rows={8}
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDraftWithAI}
                  className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 min-h-[44px] text-sm font-medium text-white hover:bg-brand-600 transition-colors"
                >
                  <SparklesIcon className="h-4 w-4" />
                  Draft Proposal with AI
                </button>
                <button
                  onClick={() => setStep('record')}
                  className="rounded-lg border border-gray-200 px-4 py-2.5 min-h-[44px] text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Re-record
                </button>
              </div>
            </div>
          )}

          {/* Step: drafting */}
          {step === 'drafting' && (
            <div className="flex items-center gap-3 py-2">
              <span className="h-5 w-5 rounded-full border-2 border-brand-400 border-t-transparent animate-spin" aria-hidden />
              <span className="text-sm text-gray-600">AI is drafting your proposal…</span>
            </div>
          )}

          {/* Step: review draft */}
          {step === 'review' && draftResult && (
            <div className="space-y-4">
              {/* Title preview */}
              <div>
                <p className="mb-1 text-xs font-medium text-gray-500 uppercase tracking-wide">Proposed Title</p>
                <p className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-900">
                  {draftResult.title}
                </p>
              </div>

              {/* Intro preview */}
              <div>
                <p className="mb-1 text-xs font-medium text-gray-500 uppercase tracking-wide">Intro Text</p>
                <p className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap line-clamp-4">
                  {draftResult.intro_text}
                </p>
              </div>

              {/* Line items preview */}
              <div>
                <p className="mb-1.5 text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Line Items ({draftResult.line_items.length})
                </p>
                <div className="rounded-lg border border-gray-200 bg-white overflow-hidden divide-y divide-gray-100">
                  {draftResult.line_items.slice(0, 6).map((item, i) => (
                    <div key={i} className="flex items-start justify-between gap-3 px-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 truncate">{item.item_name}</p>
                        <p className="mt-0.5 text-xs text-gray-500 line-clamp-1">{item.description}</p>
                      </div>
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-gray-900">
                        ${(item.unit_price_cents / 100).toLocaleString()}
                      </span>
                    </div>
                  ))}
                  {draftResult.line_items.length > 6 && (
                    <div className="px-3 py-2 text-xs text-gray-400">
                      +{draftResult.line_items.length - 6} more items
                    </div>
                  )}
                </div>
              </div>

              {/* Notice */}
              <p className="text-xs text-gray-500">
                This will replace any unsaved content in the editor. You can edit everything after applying.
              </p>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleApply}
                  className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-5 py-2.5 min-h-[44px] text-sm font-medium text-white hover:bg-brand-600 transition-colors"
                >
                  Apply to Proposal
                </button>
                <button
                  onClick={() => setStep('transcript')}
                  className="rounded-lg border border-gray-200 px-4 py-2.5 min-h-[44px] text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Regenerate
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
