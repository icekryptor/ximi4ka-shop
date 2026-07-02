'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { adminDeleteBlogPost, ApiError } from '@/lib/adminApi'

interface Props {
  id: string
  title: string
}

// Row-level delete control for the blog list. window.confirm() is crude but
// matches the existing pages/product pattern — no extra modal dep.
export function BlogPostDeleteButton({ id, title }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function handleClick() {
    if (busy) return
    const ok = window.confirm(
      `Удалить статью «${title}»? Это действие мягкое (soft-delete).`,
    )
    if (!ok) return
    setBusy(true)
    try {
      await adminDeleteBlogPost(id)
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
