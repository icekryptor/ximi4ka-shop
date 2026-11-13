import Link from 'next/link'
import { orderCoinsState, type OrderCoinsInput } from './orderCoins'

// Кэшбек заказа: обещано / начислено / недостача / проблема доставки.
export function OrderCoinsPanel({ order }: { order: OrderCoinsInput }) {
  const state = orderCoinsState(order)
  return (
    <section className="bg-white rounded-2xl border border-brand-border p-4 text-sm">
      <h2 className="text-lg font-semibold text-brand-text">Химикоины</h2>
      <div className="mt-3 space-y-2">
        <p className="text-brand-text">{state.headline}</p>
        {state.shortfallWarning && (
          <p
            role="alert"
            className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 font-semibold text-red-700"
          >
            {state.shortfallWarning}
          </p>
        )}
        {state.problem && (
          <p className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-amber-800">
            {state.problem}
          </p>
        )}
        {state.guestNote && <p className="text-brand-text-secondary">{state.guestNote}</p>}
        {order.customerId && (
          <Link
            href={`/admin/customers/${order.customerId}`}
            className="inline-block text-brand hover:underline"
          >
            Карточка покупателя →
          </Link>
        )}
      </div>
    </section>
  )
}
