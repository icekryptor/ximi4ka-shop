import Link from 'next/link'
import { cookies } from 'next/headers'
import type { Page } from '@ximi4ka-shop/shared'
import type { Paginated } from '@/lib/api'
import { ADMIN_API_URL_SERVER } from '@/lib/adminAuth'
import { PagesListSearch } from './PagesListSearch'
import { PageDeleteButton } from './PageDeleteButton'

// Server-side list fetch. Cookies are forwarded manually because the admin
// API runs on a separate origin; no-store so admins see fresh data every
// reload. Same pattern as the products list.
async function fetchPages(opts: {
  limit: number
  offset: number
  q?: string
}): Promise<Paginated<Page>> {
  const store = await cookies()
  const cookieHeader = store.toString()
  const params = new URLSearchParams({
    limit: String(opts.limit),
    offset: String(opts.offset),
  })
  if (opts.q) params.set('q', opts.q)
  const res = await fetch(
    `${ADMIN_API_URL_SERVER}/api/admin/pages?${params.toString()}`,
    {
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    },
  )
  if (!res.ok) {
    throw new Error(`Admin pages list failed: ${res.status}`)
  }
  return (await res.json()) as Paginated<Page>
}

const PAGE_SIZE = 20

interface SearchParams {
  q?: string
  offset?: string
}

export default async function AdminPagesPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>
}) {
  const params = (await searchParams) ?? {}
  const q = params.q?.trim() || undefined
  const offset = Number(params.offset ?? 0) || 0

  const { data, pagination } = await fetchPages({
    limit: PAGE_SIZE,
    offset,
    q,
  })

  const hasPrev = offset > 0
  const hasNext = offset + pagination.limit < pagination.total

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-brand-text">Страницы</h1>
        <Link
          href="/admin/pages/new"
          className="px-4 py-2 rounded-full bg-brand text-white font-semibold hover:bg-brand-dark transition"
        >
          Создать страницу
        </Link>
      </div>

      <PagesListSearch initialQuery={q ?? ''} />

      <div className="bg-white rounded-2xl border border-brand-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-brand-bg-soft text-brand-text-secondary text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Slug</th>
              <th className="px-4 py-3 font-medium">Заголовок</th>
              <th className="px-4 py-3 font-medium">Статус</th>
              <th className="px-4 py-3 font-medium">Обновлена</th>
              <th className="px-4 py-3 font-medium">Действия</th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-12 text-center text-brand-text-secondary"
                >
                  {q
                    ? 'Ничего не найдено. Попробуйте другой запрос.'
                    : 'Пока нет страниц. Создайте первую.'}
                </td>
              </tr>
            ) : (
              data.map((p) => (
                <tr
                  key={p.id}
                  className="border-t border-brand-border hover:bg-brand-bg-soft/50"
                >
                  <td className="px-4 py-3 text-brand-text-secondary font-mono text-xs">
                    {p.slug}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/pages/${p.id}`}
                      className="text-brand font-medium hover:underline"
                    >
                      {p.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {p.isPublished ? (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                        Опубликована
                      </span>
                    ) : (
                      <span className="text-xs bg-brand-bg-soft text-brand-text-secondary px-2 py-0.5 rounded-full">
                        Черновик
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-brand-text-secondary">
                    {formatDate(p.updatedAt)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-3">
                      <Link
                        href={`/admin/pages/${p.id}`}
                        className="text-sm text-brand hover:underline"
                      >
                        Редактировать
                      </Link>
                      <PageDeleteButton id={p.id} title={p.title} />
                    </div>
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
          {pagination.total > 0
            ? `Показаны ${offset + 1}–${Math.min(
                offset + pagination.limit,
                pagination.total,
              )}.`
            : ''}
        </div>
        <div className="flex gap-2">
          <PageLink
            disabled={!hasPrev}
            q={q}
            offset={Math.max(0, offset - pagination.limit)}
            label="← Назад"
          />
          <PageLink
            disabled={!hasNext}
            q={q}
            offset={offset + pagination.limit}
            label="Вперёд →"
          />
        </div>
      </div>
    </div>
  )
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ru-RU', {
      dateStyle: 'short',
      timeStyle: 'short',
    })
  } catch {
    return iso
  }
}

function PageLink({
  disabled,
  q,
  offset,
  label,
}: {
  disabled: boolean
  q?: string
  offset: number
  label: string
}) {
  const params = new URLSearchParams()
  if (q) params.set('q', q)
  if (offset > 0) params.set('offset', String(offset))
  const href = `/admin/pages${params.toString() ? `?${params.toString()}` : ''}`
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
