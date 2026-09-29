'use client'

import { useCallback, useEffect, useState } from 'react'
import type { AccountOrderSummary } from '@ximi4ka-shop/shared'
import { getOrders } from '@/lib/accountApi'
import { orderStatusLabel } from '@/lib/orderStatus'
import { formatRub } from '@/lib/stockLabel'
import { Button } from '@/components/ui'
import { ERROR_CLASS } from '@/components/checkout/fieldStyles'
import { OrderDetails } from './OrderDetails'

const DATE = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })

export function OrdersList() {
  const [orders, setOrders] = useState<AccountOrderSummary[] | null>(null)
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Раскрытые заказы; можно держать открытыми сразу несколько.
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set())

  function toggle(orderNumber: string) {
    setOpen((prev) => {
      const next = new Set(prev)
      if (!next.delete(orderNumber)) next.add(orderNumber)
      return next
    })
  }

  const load = useCallback(async (from: string | null) => {
    setLoading(true)
    setError(null)
    try {
      const page = await getOrders(from)
      setOrders((prev) => [...(from ? (prev ?? []) : []), ...page.orders])
      setCursor(page.nextCursor)
    } catch {
      setError('Не удалось загрузить заказы. Обновите страницу.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // Deferred via queueMicrotask so the setState calls inside `load` land in
    // a separate render pass — same pattern RevisionsPanel uses to satisfy
    // react-hooks/set-state-in-effect.
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) void load(null)
    })
    return () => {
      cancelled = true
    }
  }, [load])

  if (orders === null)
    return error ? (
      <p role="alert" className={ERROR_CLASS}>
        {error}
      </p>
    ) : (
      <div className="min-h-[30vh]" />
    )

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-start gap-4">
        <p className="text-xl">Здесь появятся ваши заказы</p>
        <Button href="/catalog">Открыть каталог →</Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-4 list-none p-0 m-0">
        {orders.map((o) => {
          const isOpen = open.has(o.orderNumber)
          const panelId = `order-details-${o.orderNumber}`
          return (
            <li
              key={o.orderNumber}
              className="rounded-[24px] border border-[var(--color-lj-rule)] bg-white/60 transition-colors hover:border-[var(--color-lj-ink)]"
            >
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => toggle(o.orderNumber)}
                className="flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-[24px] p-5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]"
              >
                <span className="flex flex-col gap-1">
                  <span className="font-lj-mono">{o.orderNumber}</span>
                  <span className="text-sm opacity-70">{DATE.format(new Date(o.createdAt))}</span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="rounded-full bg-[var(--color-lj-ink)] px-3 py-1 text-xs text-[var(--color-lj-cream)]">
                    {orderStatusLabel(o.status, o.paymentProvider)}
                  </span>
                  <span className="font-[700]">{formatRub(o.totalRub)}</span>
                  <span aria-hidden="true">{isOpen ? '−' : '+'}</span>
                </span>
              </button>
              {isOpen && (
                <div id={panelId}>
                  <OrderDetails order={o} />
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {error && (
        <p role="alert" className={ERROR_CLASS}>
          {error}
        </p>
      )}
      {cursor && (
        <Button
          type="button"
          variant="secondary"
          loading={loading}
          onClick={() => void load(cursor)}
        >
          Показать ещё
        </Button>
      )}
    </div>
  )
}
