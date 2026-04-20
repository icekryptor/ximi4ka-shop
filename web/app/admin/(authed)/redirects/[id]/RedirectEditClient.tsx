'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { RedirectForm } from '@/components/admin/RedirectForm'
import {
  ApiError,
  adminDeleteRedirect,
  adminUpdateRedirect,
  type AdminRedirectInput,
  type Redirect,
} from '@/lib/adminApi'

export function RedirectEditClient({ initial }: { initial: Redirect }) {
  const router = useRouter()
  const [row, setRow] = useState<Redirect>(initial)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)

  async function handleSubmit(input: AdminRedirectInput) {
    setSubmitting(true)
    setError(null)
    try {
      const updated = await adminUpdateRedirect(row.id, input)
      setRow(updated)
      router.refresh()
    } catch (err) {
      if (err instanceof ApiError) setError(err)
      else setError(new ApiError(500, 'network_error', 'Ошибка сети'))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete() {
    if (deleteBusy) return
    const ok = window.confirm(`Удалить редирект «${row.fromPath}»?`)
    if (!ok) return
    setDeleteBusy(true)
    try {
      await adminDeleteRedirect(row.id)
      router.push('/admin/redirects')
      router.refresh()
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Ошибка удаления'
      window.alert(msg)
      setDeleteBusy(false)
    }
  }

  return (
    <>
      <div className="flex items-center gap-3 p-4 rounded-xl bg-white border border-brand-border">
        <span className="text-sm text-brand-text-secondary">
          Хиты:{' '}
          <span className="font-mono text-brand-text">{row.hitCount}</span>
        </span>
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleteBusy}
          className="ml-auto px-4 py-2 rounded-full text-sm font-medium bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50"
        >
          {deleteBusy ? 'Удаление...' : 'Удалить'}
        </button>
      </div>
      <RedirectForm
        mode="edit"
        initialValue={row}
        onSubmit={handleSubmit}
        submitting={submitting}
        error={error}
      />
    </>
  )
}
