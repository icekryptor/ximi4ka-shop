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
  workerProblem = null,
}: {
  orderId: string
  orderStatus: OrderStatus
  shipment: CdekShipmentDto | null
  enabled: boolean
  // Флаг включён, но обработчик очереди не поднялся (сломанная настройка).
  workerProblem?: string | null
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Обработчику всё равно некому отдать запись — кнопка только плодила бы
  // висящие «в очереди» без единого шанса уйти в СДЭК (F1).
  const workerStopped = enabled && !!workerProblem
  const paidOrShipped = orderStatus === 'paid' || orderStatus === 'shipped'
  const canRetry =
    enabled &&
    !workerStopped &&
    (shipment
      ? paidOrShipped &&
        (shipment.state === 'failed' || (shipment.state === 'queued' && shipment.attempts > 0))
      : // Без записи — только для оплаченного: отправленный без записи почти
        // наверняка заведён в СДЭК вручную, до автосоздания (F4).
        orderStatus === 'paid')
  // Реальное состояние записи показываем независимо от флага (F5) — «нет
  // записи» описываем по-разному: не заводили вовсе (флаг выключен) или флаг
  // включён, но автосоздания для этого заказа не было (F4, например заказ
  // оплачен до включения этапа 4).
  const status = shipment
    ? STATE_LABELS[shipment.state]
    : enabled
      ? 'не создавался автоматически'
      : 'автосоздание выключено'
  const pending = shipment && (shipment.state === 'queued' || shipment.state === 'registering')
  const failed = shipment && shipment.state === 'failed'

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
      {/* Для ошибки nextAttemptAt уже не актуально (повтор — вручную), поэтому
          показываем только число попыток, без времени следующей. */}
      {failed && shipment.attempts > 0 && (
        <p className="text-brand-text-secondary">{`попыток: ${shipment.attempts}`}</p>
      )}
      {/* F5: флаг выключен, но запись уже есть — статус выше показывает её
          настоящее состояние, здесь только поясняем, почему новых попыток
          не будет. Без записи это же и так сказано в status — дублировать
          незачем. */}
      {!enabled && shipment && <p className="text-brand-text-secondary">автосоздание выключено</p>}
      {workerStopped && (
        <p className="text-red-600">{`Автосоздание не работает: ${workerProblem}`}</p>
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
