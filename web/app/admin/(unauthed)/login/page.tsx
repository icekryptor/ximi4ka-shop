'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ADMIN_API_URL_CLIENT } from '@/lib/adminAuth'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch(`${ADMIN_API_URL_CLIENT}/api/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (res.ok) {
        // refresh() re-fetches server components so the auth guard in
        // /admin/(authed)/layout.tsx picks up the fresh cookie on the next
        // navigation.
        router.replace('/admin')
        router.refresh()
        return
      }
      const body = (await res.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null
      setError(body?.error?.message ?? 'Не удалось войти')
    } catch {
      setError('Не удалось связаться с сервером')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        aria-label="Вход в админку"
        className="bg-white rounded-3xl p-8 w-full max-w-md shadow-sm border border-brand-border"
      >
        <h1 className="text-2xl font-bold mb-6 text-brand-text">Вход в админку</h1>
        {error ? (
          <div
            role="alert"
            className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm"
          >
            {error}
          </div>
        ) : null}
        <label className="block mb-4">
          <span className="block text-sm font-medium text-brand-text-secondary mb-1">
            Email
          </span>
          <input
            type="email"
            required
            autoFocus
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-brand-border focus:outline-none focus:border-brand"
          />
        </label>
        <label className="block mb-6">
          <span className="block text-sm font-medium text-brand-text-secondary mb-1">
            Пароль
          </span>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-brand-border focus:outline-none focus:border-brand"
          />
        </label>
        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3 rounded-full bg-brand text-white font-semibold hover:bg-brand-dark transition disabled:opacity-50"
        >
          {submitting ? 'Вход...' : 'Войти'}
        </button>
      </form>
    </div>
  )
}
