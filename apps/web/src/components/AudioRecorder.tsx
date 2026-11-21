import { useState, useRef, useEffect, useCallback } from 'react'

// Whisper's hard limit is 25 MB. Enforced server-side by OpenAI.
const MAX_BYTES = 25 * 1024 * 1024

type Phase = 'idle' | 'requesting' | 'recording' | 'stopped' | 'file_ready'

export interface AudioReadyPayload {
  blob:     Blob
  filename: string
  mimeType: string
}

interface Props {
  onAudioReady: (payload: AudioReadyPayload) => void
  disabled?:    boolean
  className?:   string
}

function formatSeconds(s: number): string {
  const m   = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

function mimeToExt(mimeType: string): string {
  const base = mimeType.split(';')[0].trim()
  const map: Record<string, string> = {
    'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'mp4',
    'audio/mpeg': 'mp3',  'audio/wav': 'wav',  'audio/flac': 'flac',
    'audio/x-m4a': 'm4a', 'audio/m4a': 'm4a',
  }
  return map[base] ?? 'webm'
}

export function AudioRecorder({ onAudioReady, disabled, className = '' }: Props) {
  const [phase,    setPhase]    = useState<Phase>('idle')
  const [elapsed,  setElapsed]  = useState(0)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [audioUrl,  setAudioUrl]  = useState<string | null>(null)
  const [fileName,  setFileName]  = useState('')
  const [error,     setError]     = useState<string | null>(null)

  const recorderRef  = useRef<MediaRecorder | null>(null)
  const chunksRef    = useRef<Blob[]>([])
  const timerRef     = useRef<ReturnType<typeof setInterval> | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (audioUrl) URL.revokeObjectURL(audioUrl)
    }
  }, [audioUrl])

  const reset = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    setAudioBlob(null)
    setAudioUrl(null)
    setElapsed(0)
    setError(null)
    setFileName('')
    setPhase('idle')
  }, [audioUrl])

  const startRecording = useCallback(async () => {
    setError(null)
    setPhase('requesting')

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setError('Microphone access was denied. Upload an audio file instead.')
      setPhase('idle')
      return
    }

    const preferredMime = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/ogg;codecs=opus',
    ].find(m => MediaRecorder.isTypeSupported(m)) ?? ''

    const recorder = new MediaRecorder(
      stream,
      preferredMime ? { mimeType: preferredMime } : {},
    )
    recorderRef.current = recorder
    chunksRef.current   = []

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }

    recorder.onstop = () => {
      stream.getTracks().forEach(t => t.stop())
      const mimeType = recorder.mimeType || 'audio/webm'
      const blob     = new Blob(chunksRef.current, { type: mimeType })
      const url      = URL.createObjectURL(blob)
      setAudioBlob(blob)
      setAudioUrl(url)
      setPhase('stopped')
      if (timerRef.current) clearInterval(timerRef.current)
    }

    recorder.start(250) // 250 ms timeslice for smooth data chunks
    setElapsed(0)
    setPhase('recording')
    timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000)
  }, [])

  const stopRecording = useCallback(() => {
    recorderRef.current?.stop()
  }, [])

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting same file
    if (!file) return

    if (file.size > MAX_BYTES) {
      setError(`File is ${(file.size / 1024 / 1024).toFixed(1)} MB — maximum is 25 MB (OpenAI Whisper limit).`)
      return
    }

    setError(null)
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    setAudioBlob(file)
    setAudioUrl(URL.createObjectURL(file))
    setFileName(file.name)
    setPhase('file_ready')
  }, [audioUrl])

  const handleUse = useCallback(() => {
    if (!audioBlob) return

    if (audioBlob.size > MAX_BYTES) {
      setError(`Recording is ${(audioBlob.size / 1024 / 1024).toFixed(1)} MB — maximum is 25 MB (OpenAI Whisper limit).`)
      return
    }

    const mimeType = audioBlob.type || 'audio/webm'
    const ext      = mimeToExt(mimeType)
    const filename = phase === 'file_ready' ? fileName : `recording.${ext}`
    onAudioReady({ blob: audioBlob, filename, mimeType })
  }, [audioBlob, phase, fileName, onAudioReady])

  const isDisabled = disabled || phase === 'requesting'

  return (
    <div className={`flex flex-col gap-3 ${className}`}>

      {/* ── Idle: show record + upload ─────────────────────────────────────── */}
      {phase === 'idle' && (
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={startRecording}
            disabled={isDisabled}
            className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-lg bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <span className="size-2 rounded-full bg-white/70" aria-hidden />
            Record visit
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isDisabled}
            className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-lg border border-surface-3 text-sm font-medium text-zinc-600 hover:bg-surface-1 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Upload audio
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*,.m4a,.mp3,.mp4,.wav,.webm,.ogg,.flac"
            className="sr-only"
            onChange={handleFileChange}
            aria-label="Upload audio file"
          />
        </div>
      )}

      {/* ── Requesting mic permission ──────────────────────────────────────── */}
      {phase === 'requesting' && (
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <span className="size-4 rounded-full border-2 border-brand-400 border-t-transparent animate-spin" aria-hidden />
          Requesting microphone…
        </div>
      )}

      {/* ── Recording ─────────────────────────────────────────────────────── */}
      {phase === 'recording' && (
        <div className="flex items-center gap-3">
          <span className="size-2.5 rounded-full bg-red-500 animate-pulse" aria-label="Recording" />
          <span className="font-mono text-sm font-medium tabular-nums text-zinc-700 w-10" aria-live="polite">
            {formatSeconds(elapsed)}
          </span>
          <button
            type="button"
            onClick={stopRecording}
            className="inline-flex items-center px-4 py-2.5 min-h-[44px] rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-600 transition-colors"
          >
            Stop
          </button>
        </div>
      )}

      {/* ── Stopped / file ready ───────────────────────────────────────────── */}
      {(phase === 'stopped' || phase === 'file_ready') && audioUrl && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-zinc-500 truncate">
            {phase === 'file_ready' ? fileName : `Recorded — ${formatSeconds(elapsed)}`}
          </p>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio controls src={audioUrl} className="w-full max-w-sm h-10" preload="metadata" />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleUse}
              disabled={isDisabled}
              className="inline-flex items-center px-4 py-2.5 min-h-[44px] rounded-lg bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 disabled:opacity-40 transition-colors"
            >
              Transcribe
            </button>
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center px-4 py-2.5 min-h-[44px] rounded-lg border border-surface-3 text-sm font-medium text-zinc-600 hover:bg-surface-1 transition-colors"
            >
              {phase === 'file_ready' ? 'Change file' : 'Re-record'}
            </button>
          </div>
        </div>
      )}

      {/* ── Error ─────────────────────────────────────────────────────────── */}
      {error && (
        <p className="text-sm text-red-600" role="alert">{error}</p>
      )}
    </div>
  )
}
