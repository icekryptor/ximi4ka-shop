'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { adminDeleteProduct, ApiError } from '@/lib/adminApi'

// Row-level "Редактировать" + "Удалить" controls. The delete flow does a
// window.confirm() — it's crude but matches the task's "soft-delete
// confirmation" requirement without a heavier modal library.
export function ProductRowActions({ id, name }: { id: string; name: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function handleDelete() {
    if (busy) return
    const ok = window.confirm(`Удалить товар «${name}»?`)
    if (!ok) return
    setBusy(true)
    try {
      await adminDeleteProduct(id)
      router.refresh()
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Ошибка удаления'
      window.alert(msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex gap-2">
      <Link
        href={`/admin/products/${id}`}
        className="text-sm text-brand hover:underline"
      >
        Редактировать
      </Link>
      <button
        type="button"
        onClick={handleDelete}
        disabled={busy}
        className="text-sm text-red-600 hover:underline disabled:opacity-50"
      >
        {busy ? '...' : 'Удалить'}
      </button>
    </div>
  )
}
