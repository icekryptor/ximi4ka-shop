'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { adminDeletePage, ApiError } from '@/lib/adminApi'

interface Props {
  id: string
  title: string
}

// Row-level delete control for the pages list. window.confirm() is crude but
// matches the existing product/category pattern — no extra modal dep.
export function PageDeleteButton({ id, title }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function handleClick() {
    if (busy) return
    const ok = window.confirm(
      `Удалить страницу «${title}»? Это действие мягкое (soft-delete).`,
    )
    if (!ok) return
    setBusy(true)
    try {
      await adminDeletePage(id)
      router.refresh()
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Ошибка удаления'
      window.alert(msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      className="text-sm text-red-600 hover:underline disabled:opacity-50"
    >
      {busy ? '...' : 'Удалить'}
    </button>
  )
}
