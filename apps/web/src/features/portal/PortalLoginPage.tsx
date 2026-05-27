import { useState, type FormEvent } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'

export function PortalLoginPage() {
  const [email,   setEmail]   = useState('')
  const [loading, setLoading] = useState(false)
  const [sent,    setSent]    = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const appUrl = (import.meta.env.VITE_APP_URL as string | undefined)?.replace(/\/$/, '')
      ?? window.location.origin

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${appUrl}/portal`,
      },
    })

    if (error) {
      setError(error.message)
    } else {
      setSent(true)
    }
    setLoading(false)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        {/* Branding */}
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 text-2xl font-bold text-white shadow-lg">
            I
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Client Portal</h1>
            <p className="mt-0.5 text-sm text-gray-500">Track your project progress</p>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-panel">
          {sent ? (
            <div className="text-center">
              <div className="mb-3 text-4xl">📧</div>
              <h2 className="mb-1 text-base font-semibold text-gray-900">Check your email</h2>
              <p className="text-sm text-gray-500">
                We sent a sign-in link to <strong>{email}</strong>. Click the link to access your project.
              </p>
              <button
                onClick={() => { setSent(false); setEmail('') }}
                className="mt-4 text-sm text-brand-600 hover:text-brand-700"
              >
                Try a different email
              </button>
            </div>
          ) : (
            <>
              <h2 className="mb-1 text-base font-semibold text-gray-900">Sign in</h2>
              <p className="mb-5 text-sm text-gray-500">
                We'll send a magic link to your email — no password needed.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="email" className="mb-1 block text-sm font-medium text-gray-700">
                    Your email address
                  </label>
                  <input
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    placeholder="you@email.com"
                  />
                </div>

                {error && (
                  <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
                )}

                <Button type="submit" loading={loading} className="w-full">
                  Send sign-in link
                </Button>
              </form>
            </>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-gray-400">
          This portal is for homeowners and clients. <br />
          Are you a builder?{' '}
          <a href="/login" className="text-brand-600 hover:text-brand-700">Sign in here</a>
        </p>
      </div>
    </div>
  )
}
