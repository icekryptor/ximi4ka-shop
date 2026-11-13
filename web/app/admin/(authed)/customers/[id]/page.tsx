import Link from 'next/link'
import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import type { AdminCustomerDetail } from '@ximi4ka-shop/shared'
import { AdminOnly } from '@/components/admin/AdminOnly'
import { ADMIN_API_URL_SERVER } from '@/lib/adminAuth'
import { coinOperationLabel, formatCoins, formatSignedCoins } from '@/lib/coins'
import {
  ORDER_STATUS_BADGE_CLASSES,
  ORDER_STATUS_LABELS,
  formatDateTime,
  formatRub,
} from '../../orders/orderUi'
import { CoinAdjustForm } from './CoinAdjustForm'
import { DETAIL_LIST_LIMIT, customerOrderCashback } from '../customerUi'

async function fetchCustomer(id: string): Promise<AdminCustomerDetail | null> {
  const store = await cookies()
  const res = await fetch(`${ADMIN_API_URL_SERVER}/api/admin/customers/${encodeURIComponent(id)}`, {
    headers: { cookie: store.toString() },
    cache: 'no-store',
  })
  if (res.status === 404) return null
  if (!res.ok) {
    throw new Error(`Admin customer detail failed: ${res.status}`)
  }
  const body = (await res.json()) as { data: AdminCustomerDetail }
  return body.data
}

// Карточка покупателя — только admin (см. orders/page.tsx).
export default async function AdminCustomerDetailPage(props: Parameters<typeof CustomerDetail>[0]) {
  return (
    <AdminOnly>
      <CustomerDetail {...props} />
    </AdminOnly>
  )
}

async function CustomerDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const data = await fetchCustomer(id)
  if (!data) notFound()
  const { customer, coinBalance, transactions, orders } = data

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/customers"
          className="text-sm text-brand-text-secondary hover:text-brand"
        >
          ← Все покупатели
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-brand-text">
          {customer.name || customer.email || 'Покупатель'}
        </h1>
        <p className="mt-1 text-sm text-brand-text-secondary">
          Зарегистрирован {formatDateTime(customer.createdAt)}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6">
          <section className="bg-white rounded-2xl border border-brand-border p-4 text-sm">
            <h2 className="text-lg font-semibold text-brand-text">Профиль</h2>
            <dl className="mt-3 space-y-2">
              <Field label="Имя" value={customer.name} />
              <Field label="E-mail" value={customer.email} />
              <Field
                label="Telegram"
                value={customer.telegramUsername ? `@${customer.telegramUsername}` : null}
              />
              <Field label="Телефон" value={customer.phone} />
            </dl>
          </section>

          <section className="bg-white rounded-2xl border border-brand-border p-4 text-sm">
            <h2 className="text-lg font-semibold text-brand-text">Химикоины</h2>
            <p
              className="mt-2 text-3xl font-bold text-brand-text tabular-nums"
              data-testid="balance"
            >
              {formatCoins(coinBalance)}
            </p>
            <div className="mt-4 border-t border-brand-border pt-4">
              <CoinAdjustForm customerId={customer.id} />
            </div>
          </section>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <section className="bg-white rounded-2xl border border-brand-border overflow-x-auto">
            <h2 className="px-4 pt-4 text-lg font-semibold text-brand-text">История химикоинов</h2>
            {transactions.length >= DETAIL_LIST_LIMIT && (
              <p className="px-4 pt-1 text-xs text-brand-text-secondary">
                Показаны последние {DETAIL_LIST_LIMIT}
              </p>
            )}
            <table className="w-full text-sm mt-2">
              <thead className="bg-brand-bg-soft text-brand-text-secondary text-left">
                <tr>
                  <th className="px-4 py-2 font-medium">Дата</th>
                  <th className="px-4 py-2 font-medium">Операция</th>
                  <th className="px-4 py-2 font-medium text-right">Сумма</th>
                  <th className="px-4 py-2 font-medium">Комментарий</th>
                  <th className="px-4 py-2 font-medium">Заказ</th>
                </tr>
              </thead>
              <tbody>
                {transactions.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-brand-text-secondary">
                      Операций пока нет.
                    </td>
                  </tr>
                ) : (
                  transactions.map((t) => (
                    <tr key={t.id} className="border-t border-brand-border align-top">
                      <td className="px-4 py-3 text-brand-text-secondary whitespace-nowrap">
                        {formatDateTime(t.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        {coinOperationLabel(t.kind, t.orderNumber)}
                        {t.kind === 'admin_adjust' && (
                          <span className="block text-xs text-brand-text-secondary">
                            выполнил администратор
                          </span>
                        )}
                      </td>
                      <td
                        className={`px-4 py-3 text-right tabular-nums font-medium ${
                          t.amount < 0 ? 'text-red-600' : 'text-green-700'
                        }`}
                      >
                        {formatSignedCoins(t.amount)}
                      </td>
                      <td className="px-4 py-3 text-brand-text-secondary">{t.comment ?? '—'}</td>
                      <td className="px-4 py-3">
                        {t.orderId && t.orderNumber ? (
                          <Link
                            href={`/admin/orders/${t.orderId}`}
                            className="text-brand hover:underline font-mono text-xs"
                          >
                            {t.orderNumber}
                          </Link>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>

          <section className="bg-white rounded-2xl border border-brand-border overflow-x-auto">
            <h2 className="px-4 pt-4 text-lg font-semibold text-brand-text">Заказы</h2>
            {orders.length >= DETAIL_LIST_LIMIT && (
              <p className="px-4 pt-1 text-xs text-brand-text-secondary">
                Показаны последние {DETAIL_LIST_LIMIT}
              </p>
            )}
            <table className="w-full text-sm mt-2">
              <thead className="bg-brand-bg-soft text-brand-text-secondary text-left">
                <tr>
                  <th className="px-4 py-2 font-medium">Номер</th>
                  <th className="px-4 py-2 font-medium">Дата</th>
                  <th className="px-4 py-2 font-medium">Статус</th>
                  <th className="px-4 py-2 font-medium text-right">Сумма</th>
                  <th className="px-4 py-2 font-medium">Кэшбек</th>
                </tr>
              </thead>
              <tbody>
                {orders.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-brand-text-secondary">
                      Заказов пока нет.
                    </td>
                  </tr>
                ) : (
                  orders.map((o) => (
                    <tr key={o.id} className="border-t border-brand-border">
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/orders/${o.id}`}
                          className="text-brand font-medium hover:underline font-mono text-xs"
                        >
                          {o.orderNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-brand-text-secondary whitespace-nowrap">
                        {formatDateTime(o.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${ORDER_STATUS_BADGE_CLASSES[o.status]}`}
                        >
                          {ORDER_STATUS_LABELS[o.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatRub(o.totalRub)}</td>
                      <td className="px-4 py-3 text-brand-text-secondary">
                        {customerOrderCashback(o, transactions)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs text-brand-text-secondary">{label}</dt>
      <dd className="text-brand-text">{value || '—'}</dd>
    </div>
  )
}
