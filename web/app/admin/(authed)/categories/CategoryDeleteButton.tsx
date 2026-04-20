'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { adminDeleteCategory, ApiError } from '@/lib/adminApi'

interface Props {
  id: string
  name: string
  productCount: number
}

// Client-side delete control for the category tree list. Blocks (via disabled
// + tooltip) if the category still has products linked; the server enforces
// the same rule with a 409 that we surface as a Russian message if the
// client-side guard ever gets bypassed.
export function CategoryDeleteButton({ id, name, productCount }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  const disabled = busy || productCount > 0
  const tooltip = productCount > 0 ? 'Сначала отвяжите товары от категории' : undefined

  async function handleClick() {
    if (disabled) return
    const ok = window.confirm(`Удалить категорию «${name}»?`)
    if (!ok) return
    setBusy(true)
    try {
      await adminDeleteCategory(id)
      router.refresh()
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.code === 'category_has_products'
            ? 'Категория имеет связанные товары — удалить нельзя.'
            : err.message
          : 'Ошибка удаления'
      window.alert(msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      title={tooltip}
      className="ml-4 text-sm text-red-600 hover:underline disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed"
    >
      {busy ? '...' : 'Удалить'}
    </button>
  )
}
