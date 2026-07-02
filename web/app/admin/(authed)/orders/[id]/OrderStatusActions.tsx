'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { OrderStatus } from '@ximi4ka-shop/shared'
import { adminSetOrderStatus, ApiError } from '@/lib/adminApi'

// Manual transition buttons for the order detail page. Only pending/failed/
// cancelled orders can be touched; a paid order is settled and read-only.
export function OrderStatusActions({
  orderId,
  status,
}: {
  orderId: string
  status: OrderStatus
}) {
  const router = useRouter()
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState<'paid' | 'cancelled' | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (status === 'paid') return null

  async function transition(target: 'paid' | 'cancelled') {
    setBusy(target)
    setError(null)
    try {
      await adminSetOrderStatus(orderId, {
        status: target,
        ...(comment.trim() ? { comment: comment.trim() } : {}),
      })
      setComment('')
      router.refresh()
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Не удалось изменить статус заказа',
      )
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-3">
      <label className="block text-sm text-brand-text-secondary">
        Комментарий к изменению статуса (необязательно)
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={2}
          maxLength={1000}
          placeholder="Например: оплата по счёту, платёжка №42"
          className="mt-1 w-full rounded-xl border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none focus:ring-2 focus:ring-brand/40"
        />
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => transition('paid')}
          disabled={busy !== null}
          className="px-4 py-2 rounded-full bg-brand text-white font-semibold hover:bg-brand-dark transition disabled:opacity-50"
        >
          {busy === 'paid' ? 'Сохраняем…' : 'Отметить оплаченным'}
        </button>
        {status !== 'cancelled' && (
          <button
            type="button"
            onClick={() => transition('cancelled')}
            disabled={busy !== null}
            className="px-4 py-2 rounded-full bg-white border border-red-200 text-red-600 font-semibold hover:bg-red-50 transition disabled:opacity-50"
          >
            {busy === 'cancelled' ? 'Отменяем…' : 'Отменить заказ'}
          </button>
        )}
      </div>
    </div>
  )
}
