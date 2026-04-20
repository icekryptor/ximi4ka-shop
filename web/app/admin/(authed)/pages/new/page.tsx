'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import Link from 'next/link'
import { PageForm } from '@/components/admin/PageForm'
import {
  ApiError,
  adminCreatePage,
  type AdminPageInput,
} from '@/lib/adminApi'

export default function NewPagePage() {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)

  async function handleSubmit(input: AdminPageInput) {
    setSubmitting(true)
    setError(null)
    try {
      const created = await adminCreatePage(input)
      router.push(`/admin/pages/${created.id}`)
      router.refresh()
    } catch (err) {
      if (err instanceof ApiError) setError(err)
      else setError(new ApiError(500, 'network_error', 'Ошибка сети'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-brand-text">Новая страница</h1>
        <Link
          href="/admin/pages"
          className="text-sm text-brand-text-secondary hover:underline"
        >
          ← К списку
        </Link>
      </div>
      <PageForm
        mode="create"
        onSubmit={handleSubmit}
        submitting={submitting}
        error={error}
      />
    </div>
  )
}
