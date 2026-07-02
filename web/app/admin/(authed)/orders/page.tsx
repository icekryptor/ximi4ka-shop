import Link from 'next/link'
import { cookies } from 'next/headers'
import type { OrderStatus } from '@ximi4ka-shop/shared'
import type { Paginated } from '@/lib/api'
import type { AdminOrderSummary } from '@/lib/adminApi'
import { ADMIN_API_URL_SERVER } from '@/lib/adminAuth'
import {
  ORDER_STATUS_BADGE_CLASSES,
  ORDER_STATUS_LABELS,
  PAYMENT_PROVIDER_LABELS,
  formatDateTime,
  formatRub,
} from './orderUi'

// Server-side list fetch — same pattern as the products list: cookies are
// forwarded manually (separate origin), cache: 'no-store' for fresh data.
async function fetchOrders(opts: {
  limit: number
  offset: number
  status?: OrderStatus
}): Promise<Paginated<AdminOrderSummary>> {
  const store = await cookies()
  const cookieHeader = store.toString()
  const params = new URLSearchParams({
    limit: String(opts.limit),
    offset: String(opts.offset),
  })
  if (opts.status) params.set('status', opts.status)
  const res = await fetch(
    `${ADMIN_API_URL_SERVER}/api/admin/orders?${params.toString()}`,
    {
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    },
  )
  if (!res.ok) {
    throw new Error(`Admin orders list failed: ${res.status}`)
  }
  return (await res.json()) as Paginated<AdminOrderSummary>
}

const PAGE_SIZE = 20

const STATUS_FILTERS: Array<{ value: OrderStatus | undefined; label: string }> = [
  { value: undefined, label: 'Все' },
  { value: 'pending', label: ORDER_STATUS_LABELS.pending },
  { value: 'paid', label: ORDER_STATUS_LABELS.paid },
  { value: 'failed', label: ORDER_STATUS_LABELS.failed },
  { value: 'cancelled', label: ORDER_STATUS_LABELS.cancelled },
]

function isOrderStatus(value: string | undefined): value is OrderStatus {
  return (
    value === 'pending' || value === 'paid' || value === 'failed' || value === 'cancelled'
  )
}

interface SearchParams {
  status?: string
  offset?: string
}

function listHref(status: OrderStatus | undefined, offset: number): string {
  const params = new URLSearchParams()
  if (status) params.set('status', status)
  if (offset > 0) params.set('offset', String(offset))
  return `/admin/orders${params.toString() ? `?${params.toString()}` : ''}`
}

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>
}) {
  const params = (await searchParams) ?? {}
  const status = isOrderStatus(params.status) ? params.status : undefined
  const offset = Number(params.offset ?? 0) || 0

  const { data, pagination } = await fetchOrders({ limit: PAGE_SIZE, offset, status })

  const hasPrev = offset > 0
  const hasNext = offset + pagination.limit < pagination.total

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-brand-text">Заказы</h1>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => {
          const active = f.value === status
          return (
            <Link
              key={f.label}
              href={listHref(f.value, 0)}
              className={
                active
                  ? 'px-3 py-1.5 rounded-full bg-brand text-white text-sm font-semibold'
                  : 'px-3 py-1.5 rounded-full bg-white border border-brand-border text-sm text-brand-text-secondary hover:bg-brand-bg-soft'
              }
            >
              {f.label}
            </Link>
          )
        })}
      </div>

      <div className="bg-white rounded-2xl border border-brand-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-brand-bg-soft text-brand-text-secondary text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Номер</th>
              <th className="px-4 py-3 font-medium">Дата</th>
              <th className="px-4 py-3 font-medium">Клиент</th>
              <th className="px-4 py-3 font-medium">Телефон</th>
              <th className="px-4 py-3 font-medium text-right">Сумма</th>
              <th className="px-4 py-3 font-medium">Статус</th>
              <th className="px-4 py-3 font-medium">Провайдер</th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-12 text-center text-brand-text-secondary"
                >
                  {status ? 'Нет заказов в этом статусе.' : 'Пока нет заказов.'}
                </td>
              </tr>
            ) : (
              data.map((o) => (
                <tr
                  key={o.id}
                  className="border-t border-brand-border hover:bg-brand-bg-soft/50"
                >
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
                  <td className="px-4 py-3">{o.customerName}</td>
                  <td className="px-4 py-3 text-brand-text-secondary font-mono text-xs">
                    {o.customerPhone}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatRub(o.totalRub)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${ORDER_STATUS_BADGE_CLASSES[o.status]}`}
                    >
                      {ORDER_STATUS_LABELS[o.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-brand-text-secondary">
                    {PAYMENT_PROVIDER_LABELS[o.paymentProvider] ?? o.paymentProvider}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-brand-text-secondary">
        <div>
          Всего: {pagination.total}.{' '}
          {pagination.total > 0 && (
            <>
              Показаны {offset + 1}–
              {Math.min(offset + pagination.limit, pagination.total)}.
            </>
          )}
        </div>
        <div className="flex gap-2">
          <PageLink
            disabled={!hasPrev}
            href={listHref(status, Math.max(0, offset - pagination.limit))}
            label="← Назад"
          />
          <PageLink
            disabled={!hasNext}
            href={listHref(status, offset + pagination.limit)}
            label="Вперёд →"
          />
        </div>
      </div>
    </div>
  )
}

function PageLink({
  disabled,
  href,
  label,
}: {
  disabled: boolean
  href: string
  label: string
}) {
  if (disabled) {
    return (
      <span className="px-3 py-1.5 rounded-full bg-brand-bg-soft text-brand-text-secondary/50 cursor-not-allowed">
        {label}
      </span>
    )
  }
  return (
    <Link
      href={href}
      className="px-3 py-1.5 rounded-full bg-white border border-brand-border hover:bg-brand-bg-soft"
    >
      {label}
    </Link>
  )
}
