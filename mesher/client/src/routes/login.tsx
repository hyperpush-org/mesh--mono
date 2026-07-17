import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { loginToMesher, MesherApiError } from '@/lib/mesher-api'

export const Route = createFileRoute('/login')({
  ssr: false,
  component: LoginRoute,
})

function LoginRoute() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      await loginToMesher(email, password)
      await navigate({ to: '/' })
    } catch (reason) {
      setError(
        reason instanceof MesherApiError && reason.status === 401
          ? 'Email or password is incorrect.'
          : 'Sign in is temporarily unavailable.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--background)] px-4 text-[var(--text-primary)]">
      <form
        className="w-full max-w-sm space-y-5 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-7 shadow-2xl"
        onSubmit={submit}
      >
        <div>
          <p className="font-mono text-xs font-semibold tracking-[0.18em] text-[var(--green)]">HYPERPUSH</p>
          <h1 className="mt-2 text-2xl font-semibold">Sign in</h1>
          <p className="mt-1 text-sm text-[var(--text-tertiary)]">Use your organization account to open the dashboard.</p>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium" htmlFor="login-email">Email</label>
          <input
            id="login-email"
            autoComplete="email"
            className="w-full rounded-md border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-[var(--green)]"
            onChange={(event) => setEmail(event.target.value)}
            required
            type="email"
            value={email}
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium" htmlFor="login-password">Password</label>
          <input
            id="login-password"
            autoComplete="current-password"
            className="w-full rounded-md border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-[var(--green)]"
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
        </div>

        <p aria-live="polite" className="min-h-5 text-sm text-[var(--red)]" role={error ? 'alert' : undefined}>{error}</p>

        <button
          className="w-full rounded-md bg-[var(--green)] px-4 py-2 font-semibold text-black transition-opacity disabled:opacity-60"
          disabled={submitting}
          type="submit"
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  )
}
