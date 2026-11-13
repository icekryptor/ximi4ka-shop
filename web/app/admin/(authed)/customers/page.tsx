import Link from 'next/link'
import { cookies } from 'next/headers'
import type { AdminCustomersPage } from '@ximi4ka-shop/shared'
import { AdminOnly } from '@/components/admin/AdminOnly'
import { ADMIN_API_URL_SERVER } from '@/lib/adminAuth'
import { formatCoins } from '@/lib/coins'
import { CUSTOMERS_PAGE_SIZE, customersHref, firstParam } from './customerUi'

async function fetchCustomers(q: string, page: number): Promise<AdminCustomersPage> {
  const store = await cookies()
  const params = new URLSearchParams()
  if (q) params.set('q', q)
  params.set('page', String(page))
  const res = await fetch(`${ADMIN_API_URL_SERVER}/api/admin/customers?${params.toString()}`, {
    headers: { cookie: store.toString() },
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`Admin customers list failed: ${res.status}`)
  }
  const body = (await res.json()) as { data: AdminCustomersPage }
  return body.data
}

interface SearchParams {
  q?: string | string[]
  page?: string | string[]
}

// Покупатели (почта, Telegram, баланс) — только admin (см. orders/page.tsx).
export default async function AdminCustomersPage(props: Parameters<typeof CustomersContent>[0]) {
  return (
    <AdminOnly>
      <CustomersContent {...props} />
    </AdminOnly>
  )
}

async function CustomersContent({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const params = (await searchParams) ?? {}
  const q = (firstParam(params.q) ?? '').trim().slice(0, 100)
  const parsed = Math.trunc(Number(firstParam(params.page) ?? 1))
  const page = Number.isFinite(parsed) && parsed >= 1 ? Math.min(parsed, 100000) : 1

  const { items, total } = await fetchCustomers(q, page)

  const from = (page - 1) * CUSTOMERS_PAGE_SIZE + 1
  const to = Math.min(page * CUSTOMERS_PAGE_SIZE, total)
  const hasPrev = page > 1
  const hasNext = page * CUSTOMERS_PAGE_SIZE < total

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-brand-text">Покупатели</h1>

      <form method="get" action="/admin/customers" role="search" className="flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q}
          maxLength={100}
          placeholder="Почта или Telegram"
          aria-label="Поиск по почте или Telegram"
          className="w-full max-w-sm rounded-full border border-brand-border bg-white px-4 py-2 text-sm text-brand-text focus:outline-none focus:ring-2 focus:ring-brand/40"
        />
        <button
          type="submit"
          className="px-4 py-2 rounded-full bg-brand text-white text-sm font-semibold hover:bg-brand-dark transition"
        >
          Найти
        </button>
        {q && (
          <Link
            href="/admin/customers"
            className="px-4 py-2 rounded-full bg-white border border-brand-border text-sm text-brand-text-secondary hover:bg-brand-bg-soft"
          >
            Сбросить
          </Link>
        )}
      </form>

      <div className="bg-white rounded-2xl border border-brand-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-brand-bg-soft text-brand-text-secondary text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Почта</th>
              <th className="px-4 py-3 font-medium">Telegram</th>
              <th className="px-4 py-3 font-medium">Имя</th>
              <th className="px-4 py-3 font-medium text-right">Баланс</th>
              <th className="px-4 py-3 font-medium text-right">Заказов</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-brand-text-secondary">
                  {q ? 'Никого не нашли.' : 'Пока нет покупателей.'}
                </td>
              </tr>
            ) : (
              items.map((c) => (
                <tr key={c.id} className="border-t border-brand-border hover:bg-brand-bg-soft/50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/customers/${c.id}`}
                      className="text-brand font-medium hover:underline"
                    >
                      {c.email ?? '—'}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-brand-text-secondary">
                    {c.telegramUsername ? `@${c.telegramUsername}` : '—'}
                  </td>
                  <td className="px-4 py-3">{c.name ?? '—'}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatCoins(c.coinBalance)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{c.ordersCount}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-brand-text-secondary">
        <div>
          Всего: {total}.{' '}
          {total > 0 && items.length > 0 && (
            <>
              Показаны {from}–{to}.
            </>
          )}
        </div>
        <div className="flex gap-2">
          <PageLink disabled={!hasPrev} href={customersHref(q, page - 1)} label="← Назад" />
          <PageLink disabled={!hasNext} href={customersHref(q, page + 1)} label="Вперёд →" />
        </div>
      </div>
    </div>
  )
}

function PageLink({ disabled, href, label }: { disabled: boolean; href: string; label: string }) {
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
