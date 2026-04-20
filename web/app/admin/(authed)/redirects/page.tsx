import Link from 'next/link'
import { cookies } from 'next/headers'
import type { Paginated } from '@/lib/api'
import { ADMIN_API_URL_SERVER } from '@/lib/adminAuth'
import type { Redirect } from '@/lib/adminApi'
import { RedirectsListControls } from './RedirectsListControls'
import { RedirectDeleteButton } from './RedirectDeleteButton'
import { ImportCsvButton } from './ImportCsvButton'

// Server-side list fetch. Cookies are forwarded manually because the admin
// API runs on a separate origin. No-store so edits made elsewhere (e.g. the
// CSV dialog triggering router.refresh()) show up on next render.
async function fetchRedirects(opts: {
  limit: number
  offset: number
  q?: string
  sort: string
}): Promise<Paginated<Redirect>> {
  const store = await cookies()
  const cookieHeader = store.toString()
  const params = new URLSearchParams({
    limit: String(opts.limit),
    offset: String(opts.offset),
    sort: opts.sort,
  })
  if (opts.q) params.set('q', opts.q)
  const res = await fetch(
    `${ADMIN_API_URL_SERVER}/api/admin/redirects?${params.toString()}`,
    {
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    },
  )
  if (!res.ok) {
    throw new Error(`Admin redirects list failed: ${res.status}`)
  }
  return (await res.json()) as Paginated<Redirect>
}

const PAGE_SIZE = 50

interface SearchParams {
  q?: string
  offset?: string
  sort?: string
}

const VALID_SORTS = new Set(['hits_desc', 'hits_asc', 'from_asc'])

export default async function AdminRedirectsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>
}) {
  const params = (await searchParams) ?? {}
  const q = params.q?.trim() || undefined
  const offset = Number(params.offset ?? 0) || 0
  const sort =
    params.sort && VALID_SORTS.has(params.sort) ? params.sort : 'hits_desc'

  const { data, pagination } = await fetchRedirects({
    limit: PAGE_SIZE,
    offset,
    q,
    sort,
  })

  const hasPrev = offset > 0
  const hasNext = offset + pagination.limit < pagination.total

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-brand-text">Редиректы</h1>
        <div className="flex items-center gap-2">
          <ImportCsvButton />
          <Link
            href="/admin/redirects/new"
            className="px-4 py-2 rounded-full bg-brand text-white font-semibold hover:bg-brand-dark transition"
          >
            Создать редирект
          </Link>
        </div>
      </div>

      <RedirectsListControls initialQuery={q ?? ''} currentSort={sort} />

      <div className="bg-white rounded-2xl border border-brand-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-brand-bg-soft text-brand-text-secondary text-left">
            <tr>
              <th className="px-4 py-3 font-medium">From</th>
              <th className="px-4 py-3 font-medium">To</th>
              <th className="px-4 py-3 font-medium">Код</th>
              <th className="px-4 py-3 font-medium">Хиты</th>
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
                    : 'Пока нет редиректов. Создайте первый или импортируйте CSV.'}
                </td>
              </tr>
            ) : (
              data.map((r) => (
                <tr
                  key={r.id}
                  className="border-t border-brand-border hover:bg-brand-bg-soft/50"
                >
                  <td className="px-4 py-3 font-mono text-xs text-brand-text">
                    {r.fromPath}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-brand-text-secondary">
                    {r.toPath}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-block text-xs bg-brand-bg-soft text-brand-text px-2 py-0.5 rounded-full">
                      {r.statusCode}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-brand-text">
                    {r.hitCount}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-3">
                      <Link
                        href={`/admin/redirects/${r.id}`}
                        className="text-sm text-brand hover:underline"
                      >
                        Редактировать
                      </Link>
                      <RedirectDeleteButton
                        id={r.id}
                        fromPath={r.fromPath}
                      />
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
            sort={sort}
            offset={Math.max(0, offset - pagination.limit)}
            label="← Назад"
          />
          <PageLink
            disabled={!hasNext}
            q={q}
            sort={sort}
            offset={offset + pagination.limit}
            label="Вперёд →"
          />
        </div>
      </div>
    </div>
  )
}

function PageLink({
  disabled,
  q,
  sort,
  offset,
  label,
}: {
  disabled: boolean
  q?: string
  sort: string
  offset: number
  label: string
}) {
  const params = new URLSearchParams()
  if (q) params.set('q', q)
  if (sort && sort !== 'hits_desc') params.set('sort', sort)
  if (offset > 0) params.set('offset', String(offset))
  const href = `/admin/redirects${params.toString() ? `?${params.toString()}` : ''}`
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
