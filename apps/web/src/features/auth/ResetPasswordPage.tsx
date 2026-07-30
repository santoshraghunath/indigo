import { useState, useEffect, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'

type State = 'checking' | 'ready' | 'expired' | 'done'

export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [state, setState] = useState<State>('checking')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let settled = false

    // PASSWORD_RECOVERY fires when Supabase processes the recovery tokens from
    // the URL hash (type=recovery). This is the primary signal.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' && !settled) {
        settled = true
        setState('ready')
      }
    })

    // Fallback: if the event doesn't fire within 2s, check for an existing
    // session (e.g. page refresh after token was already consumed).
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      supabase.auth.getSession().then(({ data: { session } }) => {
        setState(session ? 'ready' : 'expired')
      })
    }, 2000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timer)
    }
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }

    setLoading(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) {
      setError(updateError.message)
      setLoading(false)
      return
    }

    // Sign out so the user logs in fresh with their new password
    await supabase.auth.signOut()
    setState('done')
    setTimeout(() => navigate('/login', { replace: true }), 2000)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-1 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600 text-xl font-bold text-white shadow-lg">
            I
          </div>
          <div className="text-center">
            <h1 className="text-xl font-semibold text-gray-900">Indigo</h1>
            <p className="text-sm text-gray-500">Good Guy Builders</p>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-panel">
          {state === 'checking' && (
            <div className="py-4 text-center">
              <p className="text-sm text-gray-500">Verifying reset link…</p>
            </div>
          )}

          {state === 'expired' && (
            <div className="text-center">
              <div className="mb-3 text-3xl">⏰</div>
              <h2 className="mb-1 font-semibold text-gray-900">Link expired</h2>
              <p className="mb-4 text-sm text-gray-500">
                This reset link has expired or has already been used.
              </p>
              <button
                type="button"
                onClick={() => navigate('/login')}
                className="text-sm text-brand-600 hover:text-brand-700"
              >
                Back to sign in
              </button>
            </div>
          )}

          {state === 'done' && (
            <div className="text-center">
              <div className="mb-3 text-3xl">✅</div>
              <h2 className="mb-1 font-semibold text-gray-900">Password updated</h2>
              <p className="text-sm text-gray-500">Redirecting you to sign in…</p>
            </div>
          )}

          {state === 'ready' && (
            <>
              <h2 className="mb-5 text-base font-semibold text-gray-900">Set new password</h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="password" className="mb-1 block text-sm font-medium text-gray-700">
                    New password
                  </label>
                  <input
                    id="password"
                    type="password"
                    required
                    autoComplete="new-password"
                    autoFocus
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    placeholder="Min. 8 characters"
                  />
                </div>
                <div>
                  <label htmlFor="confirm" className="mb-1 block text-sm font-medium text-gray-700">
                    Confirm password
                  </label>
                  <input
                    id="confirm"
                    type="password"
                    required
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    placeholder="••••••••"
                  />
                </div>

                {error && (
                  <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
                )}

                <Button type="submit" loading={loading} className="w-full">
                  Set new password
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
