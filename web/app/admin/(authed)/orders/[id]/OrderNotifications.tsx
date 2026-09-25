'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { NotificationChannel, OrderEventKey, OrderNotificationDto } from '@ximi4ka-shop/shared'
import { adminRetryOrderNotifications, ApiError } from '@/lib/adminApi'
import { formatDateTime } from '../orderUi'

const CHANNEL_LABELS: Record<NotificationChannel, string> = {
  sheets: 'Google Таблица',
  telegram: 'Telegram',
}

const EVENT_LABELS: Record<OrderEventKey, string> = {
  created: 'новый заказ',
  'status:paid': 'оплачен',
  'status:shipped': 'отправлен',
  'status:cancelled': 'отменён',
  'status:failed': 'оплата не прошла',
}

function stateLabel(n: OrderNotificationDto): string {
  if (n.sentAt) return `доставлено ${formatDateTime(n.sentAt)}`
  if (n.failedAt) return `не доставлено: ${n.lastError ?? 'без описания'}`
  if (n.attempts > 0) return `повтор ${formatDateTime(n.nextAttemptAt)}, попыток: ${n.attempts}`
  return 'в очереди'
}

// Куда и что ушло по заказу: таблица и рабочий чат. Кнопка возвращает
// несданные записи в очередь (docs/superpowers/specs/2026-09-25-order-notifications-design.md).
export function OrderNotifications({
  orderId,
  notifications,
}: {
  orderId: string
  notifications: OrderNotificationDto[]
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hasFailed = notifications.some((n) => n.failedAt)

  async function retry() {
    setBusy(true)
    setError(null)
    try {
      await adminRetryOrderNotifications(orderId)
      router.refresh()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось поставить уведомления в очередь')
    } finally {
      setBusy(false)
    }
  }

  if (notifications.length === 0) {
    return <p className="text-sm text-brand-text-secondary">Уведомлений по заказу ещё не было.</p>
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-2 text-sm">
        {notifications.map((n) => (
          <li key={`${n.channel}:${n.eventKey}`} className="flex flex-col">
            <span className="text-brand-text">{`${CHANNEL_LABELS[n.channel]} · ${EVENT_LABELS[n.eventKey]}`}</span>
            <span className={n.failedAt ? 'text-red-600' : 'text-brand-text-secondary'}>
              {stateLabel(n)}
            </span>
          </li>
        ))}
      </ul>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {hasFailed && (
        <button
          type="button"
          onClick={retry}
          disabled={busy}
          className="px-4 py-2 rounded-full bg-white border border-brand-border text-brand-text font-semibold hover:bg-brand-bg-soft transition disabled:opacity-50"
        >
          {busy ? 'Ставим в очередь…' : 'Отправить ещё раз'}
        </button>
      )}
    </div>
  )
}
