'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { CdekShipmentDto, CdekShipmentState, OrderStatus } from '@ximi4ka-shop/shared'
import { adminRetryCdekShipment, ApiError } from '@/lib/adminApi'
import { formatDateTime } from '../orderUi'

const STATE_LABELS: Record<CdekShipmentState, string> = {
  queued: 'в очереди',
  registering: 'регистрируется',
  created: 'создан',
  failed: 'ошибка',
}

export function cdekTrackingUrl(cdekNumber: string): string {
  return `https://www.cdek.ru/ru/tracking?order_id=${encodeURIComponent(cdekNumber)}`
}

// Заказ в СДЭК создаётся сам после оплаты
// (docs/superpowers/specs/2026-09-25-cdek-auto-orders-design.md §8). Кнопка —
// для ошибки, для очереди после неудач и для оплаченного заказа без записи;
// созданный и регистрирующийся заказ не трогаем — иначе дубль.
export function CdekShipmentPanel({
  orderId,
  orderStatus,
  shipment,
  enabled,
}: {
  orderId: string
  orderStatus: OrderStatus
  shipment: CdekShipmentDto | null
  enabled: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const paid = orderStatus === 'paid' || orderStatus === 'shipped'
  const canRetry =
    enabled &&
    paid &&
    (!shipment ||
      shipment.state === 'failed' ||
      (shipment.state === 'queued' && shipment.attempts > 0))
  const status = !enabled
    ? 'автосоздание выключено'
    : shipment
      ? STATE_LABELS[shipment.state]
      : 'не создавался'
  const pending = shipment && (shipment.state === 'queued' || shipment.state === 'registering')

  async function retry() {
    setBusy(true)
    setError(null)
    try {
      await adminRetryCdekShipment(orderId)
      router.refresh()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось поставить заказ в очередь СДЭК')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2 text-sm">
      <div>
        <p className="text-xs text-brand-text-secondary">СДЭК</p>
        <p className={shipment?.state === 'failed' ? 'text-red-600' : 'text-brand-text'}>
          {status}
        </p>
      </div>
      {shipment?.cdekNumber && (
        <div>
          <p className="text-xs text-brand-text-secondary">Номер СДЭК</p>
          <a
            href={cdekTrackingUrl(shipment.cdekNumber)}
            target="_blank"
            rel="noreferrer"
            className="text-brand hover:underline"
          >
            {shipment.cdekNumber}
          </a>
        </div>
      )}
      {shipment?.lastError && shipment.state !== 'created' && (
        <p className={shipment.state === 'failed' ? 'text-red-600' : 'text-brand-text-secondary'}>
          {shipment.lastError}
        </p>
      )}
      {pending && shipment.attempts > 0 && (
        <p className="text-brand-text-secondary">
          {`попыток: ${shipment.attempts}, следующая ${formatDateTime(shipment.nextAttemptAt)}`}
        </p>
      )}
      {error && <p className="text-red-600">{error}</p>}
      {canRetry && (
        <button
          type="button"
          onClick={retry}
          disabled={busy}
          className="px-4 py-2 rounded-full bg-white border border-brand-border text-brand-text font-semibold hover:bg-brand-bg-soft transition disabled:opacity-50"
        >
          {busy ? 'Ставим в очередь…' : shipment ? 'Создать в СДЭК ещё раз' : 'Создать в СДЭК'}
        </button>
      )}
    </div>
  )
}
