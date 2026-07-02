import Link from 'next/link'
import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import type { OrderDto } from '@ximi4ka-shop/shared'
import { ADMIN_API_URL_SERVER } from '@/lib/adminAuth'
import { OrderStatusActions } from './OrderStatusActions'
import {
  DELIVERY_METHOD_LABELS,
  HISTORY_ACTOR_LABELS,
  ORDER_STATUS_BADGE_CLASSES,
  ORDER_STATUS_LABELS,
  PAYMENT_PROVIDER_LABELS,
  formatDateTime,
  formatRub,
} from '../orderUi'

async function fetchOrder(id: string): Promise<OrderDto | null> {
  const store = await cookies()
  const res = await fetch(
    `${ADMIN_API_URL_SERVER}/api/admin/orders/${encodeURIComponent(id)}`,
    {
      headers: { cookie: store.toString() },
      cache: 'no-store',
    },
  )
  if (res.status === 404) return null
  if (!res.ok) {
    throw new Error(`Admin order detail failed: ${res.status}`)
  }
  const body = (await res.json()) as { data: OrderDto }
  return body.data
}

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const order = await fetchOrder(id)
  if (!order) notFound()

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/orders"
          className="text-sm text-brand-text-secondary hover:text-brand"
        >
          ← Все заказы
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-brand-text font-mono">
            {order.orderNumber}
          </h1>
          <span
            className={`text-sm px-3 py-1 rounded-full ${ORDER_STATUS_BADGE_CLASSES[order.status]}`}
          >
            {ORDER_STATUS_LABELS[order.status]}
          </span>
        </div>
        <p className="mt-1 text-sm text-brand-text-secondary">
          Создан {formatDateTime(order.createdAt)}
          {order.paidAt ? ` · Оплачен ${formatDateTime(order.paidAt)}` : ''}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {/* Состав заказа — из product_snapshot, а не из актуальных товаров */}
          <section className="bg-white rounded-2xl border border-brand-border overflow-hidden">
            <h2 className="px-4 pt-4 text-lg font-semibold text-brand-text">
              Состав заказа
            </h2>
            <table className="w-full text-sm mt-2">
              <thead className="bg-brand-bg-soft text-brand-text-secondary text-left">
                <tr>
                  <th className="px-4 py-2 font-medium">Товар</th>
                  <th className="px-4 py-2 font-medium">SKU</th>
                  <th className="px-4 py-2 font-medium text-right">Цена</th>
                  <th className="px-4 py-2 font-medium text-right">Кол-во</th>
                  <th className="px-4 py-2 font-medium text-right">Сумма</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item) => (
                  <tr key={item.id} className="border-t border-brand-border">
                    <td className="px-4 py-3">{item.productSnapshot.name}</td>
                    <td className="px-4 py-3 text-brand-text-secondary font-mono text-xs">
                      {item.productSnapshot.sku ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatRub(item.unitPriceRub)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {item.quantity}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatRub(item.unitPriceRub * item.quantity)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="text-sm">
                <tr className="border-t border-brand-border">
                  <td colSpan={4} className="px-4 py-2 text-right text-brand-text-secondary">
                    Товары
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {formatRub(order.subtotalRub)}
                  </td>
                </tr>
                <tr>
                  <td colSpan={4} className="px-4 py-2 text-right text-brand-text-secondary">
                    Доставка
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {order.shippingRub === 0 ? 'Бесплатно' : formatRub(order.shippingRub)}
                  </td>
                </tr>
                <tr className="border-t border-brand-border font-semibold">
                  <td colSpan={4} className="px-4 py-3 text-right">
                    Итого
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatRub(order.totalRub)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </section>

          {/* Таймлайн статусов */}
          <section className="bg-white rounded-2xl border border-brand-border p-4">
            <h2 className="text-lg font-semibold text-brand-text">Таймлайн статусов</h2>
            <ol className="mt-3 space-y-3">
              <li className="flex gap-3 text-sm">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-border" />
                <div>
                  <div className="text-brand-text">
                    Заказ создан — {ORDER_STATUS_LABELS.pending.toLowerCase()}
                  </div>
                  <div className="text-xs text-brand-text-secondary">
                    {formatDateTime(order.createdAt)}
                  </div>
                </div>
              </li>
              {(order.statusHistory ?? []).map((entry, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                      entry.to === 'paid'
                        ? 'bg-green-500'
                        : entry.to === 'failed'
                          ? 'bg-red-500'
                          : 'bg-brand-border'
                    }`}
                  />
                  <div>
                    <div className="text-brand-text">
                      {ORDER_STATUS_LABELS[entry.to]}
                      <span className="text-brand-text-secondary">
                        {' '}
                        · {HISTORY_ACTOR_LABELS[entry.by] ?? entry.by}
                      </span>
                    </div>
                    <div className="text-xs text-brand-text-secondary">
                      {formatDateTime(entry.at)}
                    </div>
                    {entry.comment && (
                      <div className="mt-1 text-xs text-brand-text-secondary italic">
                        «{entry.comment}»
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <div className="space-y-6">
          {/* Клиент */}
          <section className="bg-white rounded-2xl border border-brand-border p-4 text-sm">
            <h2 className="text-lg font-semibold text-brand-text">Клиент</h2>
            <dl className="mt-3 space-y-2">
              <div>
                <dt className="text-xs text-brand-text-secondary">Имя</dt>
                <dd className="text-brand-text">{order.customerName}</dd>
              </div>
              <div>
                <dt className="text-xs text-brand-text-secondary">Телефон</dt>
                <dd className="text-brand-text font-mono text-xs">
                  {order.customerPhone}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-brand-text-secondary">E-mail</dt>
                <dd className="text-brand-text">{order.customerEmail || '—'}</dd>
              </div>
            </dl>
          </section>

          {/* Доставка */}
          <section className="bg-white rounded-2xl border border-brand-border p-4 text-sm">
            <h2 className="text-lg font-semibold text-brand-text">Доставка</h2>
            <dl className="mt-3 space-y-2">
              <div>
                <dt className="text-xs text-brand-text-secondary">Способ</dt>
                <dd className="text-brand-text">
                  {DELIVERY_METHOD_LABELS[order.deliveryMethod] ?? order.deliveryMethod}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-brand-text-secondary">Адрес</dt>
                <dd className="text-brand-text">{order.deliveryAddress.address}</dd>
              </div>
              {order.deliveryAddress.comment && (
                <div>
                  <dt className="text-xs text-brand-text-secondary">Комментарий</dt>
                  <dd className="text-brand-text">{order.deliveryAddress.comment}</dd>
                </div>
              )}
            </dl>
          </section>

          {/* Оплата */}
          <section className="bg-white rounded-2xl border border-brand-border p-4 text-sm">
            <h2 className="text-lg font-semibold text-brand-text">Оплата</h2>
            <dl className="mt-3 space-y-2">
              <div>
                <dt className="text-xs text-brand-text-secondary">Провайдер</dt>
                <dd className="text-brand-text">
                  {PAYMENT_PROVIDER_LABELS[order.paymentProvider] ?? order.paymentProvider}
                </dd>
              </div>
              {order.paymentIntentId && (
                <div>
                  <dt className="text-xs text-brand-text-secondary">ID платежа</dt>
                  <dd className="text-brand-text font-mono text-xs">
                    {order.paymentIntentId}
                  </dd>
                </div>
              )}
              {order.paymentUrl && (
                <div>
                  <dt className="text-xs text-brand-text-secondary">Платёжная ссылка</dt>
                  <dd>
                    <a
                      href={order.paymentUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-brand hover:underline break-all text-xs"
                    >
                      {order.paymentUrl}
                    </a>
                  </dd>
                </div>
              )}
            </dl>
          </section>

          {/* Действия */}
          <section className="bg-white rounded-2xl border border-brand-border p-4">
            <h2 className="text-lg font-semibold text-brand-text">Действия</h2>
            <div className="mt-3">
              {order.status === 'paid' ? (
                <p className="text-sm text-brand-text-secondary">
                  Заказ оплачен — ручное изменение статуса недоступно.
                </p>
              ) : (
                <OrderStatusActions orderId={order.id} status={order.status} />
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
