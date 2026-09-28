'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import type { AccountOrderSummary } from '@ximi4ka-shop/shared'
import { getOrders } from '@/lib/accountApi'
import { orderStatusLabel } from '@/lib/orderStatus'
import { formatRub } from '@/lib/stockLabel'
import { Button } from '@/components/ui'
import { ERROR_CLASS } from '@/components/checkout/fieldStyles'

const DATE = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })

export function OrdersList() {
  const [orders, setOrders] = useState<AccountOrderSummary[] | null>(null)
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
        {orders.map((o) => (
          <li key={o.orderNumber}>
            <Link
              href={`/order/${o.orderNumber}#t=${encodeURIComponent(o.publicToken)}`}
              className="block rounded-[24px] border border-[var(--color-lj-rule)] bg-white/60 p-5 hover:border-[var(--color-lj-ink)] transition-colors"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-lj-mono">{o.orderNumber}</span>
                <span className="rounded-full bg-[var(--color-lj-ink)] px-3 py-1 text-xs text-[var(--color-lj-cream)]">
                  {orderStatusLabel(o.status, o.paymentProvider)}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap justify-between gap-2 opacity-80">
                <span>{DATE.format(new Date(o.createdAt))}</span>
                <span className="font-[700]">{formatRub(o.totalRub)}</span>
              </div>
              <div className="mt-3 flex items-center gap-3">
                {o.items.map((i, idx) =>
                  i.imageUrl ? (
                    <div
                      key={idx}
                      className="w-12 h-12 shrink-0 rounded-xl border border-[var(--color-lj-rule)] bg-[var(--color-lj-cream-shade)] overflow-hidden"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- 48px-миниатюра в списке заказов, как в CartDrawer: next/image здесь только добавил бы обёртку и лоадер */}
                      <img
                        src={i.imageUrl}
                        alt=""
                        loading="lazy"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : (
                    <span key={idx} className="text-sm opacity-70">
                      {i.name} × {i.quantity}
                    </span>
                  ),
                )}
                {o.itemCount > o.items.reduce((n, i) => n + i.quantity, 0) && (
                  <span className="text-sm opacity-60">и ещё…</span>
                )}
              </div>
              {o.shipment?.trackingNumber && (
                <p className="mt-3 text-sm">Трек СДЭК: {o.shipment.trackingNumber}</p>
              )}
            </Link>
          </li>
        ))}
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
