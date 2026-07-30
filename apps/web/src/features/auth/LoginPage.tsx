import { useState, type FormEvent } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'

type Mode = 'login' | 'magic' | 'forgot'

export function LoginPage() {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  function switchMode(next: Mode) {
    setMode(next)
    setError(null)
    setSent(false)
  }

  async function handleLogin(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    setLoading(false)
  }

  async function handleMagicLink(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } })
    if (error) {
      setError(error.message)
    } else {
      setSent(true)
    }
    setLoading(false)
  }

  async function handleForgotPassword(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (error) {
      setError(error.message)
    } else {
      setSent(true)
    }
    setLoading(false)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-1 px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
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
          {sent ? (
            <div className="text-center">
              <div className="mb-3 text-3xl">📧</div>
              <h2 className="mb-1 font-semibold text-gray-900">Check your email</h2>
              <p className="text-sm text-gray-500">
                {mode === 'forgot'
                  ? <>We sent a password reset link to <strong>{email}</strong></>
                  : <>We sent a sign-in link to <strong>{email}</strong></>
                }
              </p>
              <button
                onClick={() => { setSent(false); setMode('login') }}
                className="mt-4 text-sm text-brand-600 hover:text-brand-700"
              >
                Back to sign in
              </button>
            </div>
          ) : (
            <>
              <h2 className="mb-5 text-base font-semibold text-gray-900">
                {mode === 'login' ? 'Sign in' : mode === 'magic' ? 'Send magic link' : 'Reset password'}
              </h2>

              <form
                onSubmit={mode === 'login' ? handleLogin : mode === 'magic' ? handleMagicLink : handleForgotPassword}
                className="space-y-4"
              >
                <div>
                  <label htmlFor="email" className="mb-1 block text-sm font-medium text-gray-700">
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    placeholder="you@goodguybuilders.com"
                  />
                </div>

                {mode === 'login' && (
                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <label htmlFor="password" className="text-sm font-medium text-gray-700">
                        Password
                      </label>
                      <button
                        type="button"
                        onClick={() => switchMode('forgot')}
                        className="text-xs text-brand-600 hover:text-brand-700"
                      >
                        Forgot password?
                      </button>
                    </div>
                    <input
                      id="password"
                      type="password"
                      required
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                      placeholder="••••••••"
                    />
                  </div>
                )}

                {mode === 'forgot' && (
                  <p className="text-sm text-gray-500">
                    Enter your email and we'll send you a link to set a new password.
                  </p>
                )}

                {error && (
                  <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
                )}

                <Button type="submit" loading={loading} className="w-full">
                  {mode === 'login' ? 'Sign in' : mode === 'magic' ? 'Send link' : 'Send reset link'}
                </Button>
              </form>

              <div className="mt-4 text-center space-y-2">
                {mode === 'login' && (
                  <button
                    type="button"
                    onClick={() => switchMode('magic')}
                    className="block w-full text-sm text-brand-600 hover:text-brand-700"
                  >
                    Send a magic link instead
                  </button>
                )}
                {mode !== 'login' && (
                  <button
                    type="button"
                    onClick={() => switchMode('login')}
                    className="block w-full text-sm text-brand-600 hover:text-brand-700"
                  >
                    Back to sign in
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
