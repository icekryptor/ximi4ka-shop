import { cookies } from 'next/headers'
import Link from 'next/link'
import type { Paginated } from '@/lib/api'
import type { Media } from '@/lib/adminApi'
import { ADMIN_API_URL_SERVER } from '@/lib/adminAuth'
import { MediaSearch } from './MediaSearch'
import { MediaFilterChips } from './MediaFilterChips'
import { MediaUploadButton } from './MediaUploadButton'
import { MediaCard } from './MediaCard'

// Server-side list fetch. Same cookie-forwarding pattern as the pages/products
// admin lists — admin API is on a separate origin and cache: 'no-store' gives
// admins fresh data every reload.
async function fetchMedia(opts: {
  limit: number
  offset: number
  q?: string
  mimePrefix?: string
}): Promise<Paginated<Media>> {
  const store = await cookies()
  const cookieHeader = store.toString()
  const params = new URLSearchParams({
    limit: String(opts.limit),
    offset: String(opts.offset),
  })
  if (opts.q) params.set('q', opts.q)
  if (opts.mimePrefix) params.set('mimePrefix', opts.mimePrefix)
  const res = await fetch(
    `${ADMIN_API_URL_SERVER}/api/admin/media?${params.toString()}`,
    {
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    },
  )
  if (!res.ok) {
    throw new Error(`Admin media list failed: ${res.status}`)
  }
  return (await res.json()) as Paginated<Media>
}

const PAGE_SIZE = 40

interface SearchParams {
  q?: string
  offset?: string
  type?: 'all' | 'image'
}

export default async function AdminMediaPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>
}) {
  const params = (await searchParams) ?? {}
  const q = params.q?.trim() || undefined
  const offset = Number(params.offset ?? 0) || 0
  const type = params.type === 'image' ? 'image' : 'all'
  const mimePrefix = type === 'image' ? 'image/' : undefined

  const { data, pagination } = await fetchMedia({
    limit: PAGE_SIZE,
    offset,
    q,
    mimePrefix,
  })

  const hasPrev = offset > 0
  const hasNext = offset + pagination.limit < pagination.total

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-brand-text">Медиа</h1>
        <MediaUploadButton />
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <MediaSearch initialQuery={q ?? ''} />
        <MediaFilterChips active={type} />
      </div>

      {data.length === 0 ? (
        <div className="bg-white rounded-2xl border border-brand-border py-16 text-center text-brand-text-secondary">
          {q
            ? 'Ничего не найдено. Попробуйте другой запрос.'
            : 'Библиотека пуста. Загрузите первый файл.'}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {data.map((m) => (
            <MediaCard key={m.id} media={m} />
          ))}
        </div>
      )}

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
            type={type}
            offset={Math.max(0, offset - pagination.limit)}
            label="← Назад"
          />
          <PageLink
            disabled={!hasNext}
            q={q}
            type={type}
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
  type,
  offset,
  label,
}: {
  disabled: boolean
  q?: string
  type: 'all' | 'image'
  offset: number
  label: string
}) {
  const params = new URLSearchParams()
  if (q) params.set('q', q)
  if (type !== 'all') params.set('type', type)
  if (offset > 0) params.set('offset', String(offset))
  const href = `/admin/media${params.toString() ? `?${params.toString()}` : ''}`
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
