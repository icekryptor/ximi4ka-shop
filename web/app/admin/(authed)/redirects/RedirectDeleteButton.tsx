'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { adminDeleteRedirect, ApiError } from '@/lib/adminApi'

interface Props {
  id: string
  fromPath: string
}

// Row-level hard-delete. Same window.confirm() pattern as PageDeleteButton;
// no extra modal dep. Redirects are hard-deleted (vs. soft) because keeping
// orphaned from_path rows around would block re-creating the redirect later.
export function RedirectDeleteButton({ id, fromPath }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function handleClick() {
    if (busy) return
    const ok = window.confirm(`Удалить редирект «${fromPath}»?`)
    if (!ok) return
    setBusy(true)
    try {
      await adminDeleteRedirect(id)
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
