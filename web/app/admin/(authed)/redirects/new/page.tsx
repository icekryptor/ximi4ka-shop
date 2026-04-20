'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import Link from 'next/link'
import { RedirectForm } from '@/components/admin/RedirectForm'
import {
  ApiError,
  adminCreateRedirect,
  type AdminRedirectInput,
} from '@/lib/adminApi'

export default function NewRedirectPage() {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)

  async function handleSubmit(input: AdminRedirectInput) {
    setSubmitting(true)
    setError(null)
    try {
      const created = await adminCreateRedirect(input)
      router.push(`/admin/redirects/${created.id}`)
      router.refresh()
    } catch (err) {
      if (err instanceof ApiError) setError(err)
      else setError(new ApiError(500, 'network_error', 'Ошибка сети'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-brand-text">Новый редирект</h1>
        <Link
          href="/admin/redirects"
          className="text-sm text-brand-text-secondary hover:underline"
        >
          ← К списку
        </Link>
      </div>
      <RedirectForm
        mode="create"
        onSubmit={handleSubmit}
        submitting={submitting}
        error={error}
      />
    </div>
  )
}
