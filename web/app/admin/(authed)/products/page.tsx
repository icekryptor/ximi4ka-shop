import Link from 'next/link'
import { cookies } from 'next/headers'
import type { Product, ProductCategory } from '@ximi4ka-shop/shared'
import type { Paginated } from '@/lib/api'
import { ADMIN_API_URL_SERVER } from '@/lib/adminAuth'
import { ProductsListSearch } from './ProductsListSearch'
import { ProductsCategoryFilter } from './ProductsCategoryFilter'
import { ProductsTable } from './ProductsTable'

// Server-side list fetch. Cookies are forwarded manually because the admin
// API runs on a separate origin and `fetch` on the server doesn't auto-send
// browser cookies. cache: 'no-store' — we want fresh data every time the
// admin reloads the list.
async function adminGet<T>(path: string): Promise<T> {
  const store = await cookies()
  const res = await fetch(`${ADMIN_API_URL_SERVER}${path}`, {
    headers: { cookie: store.toString() },
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`Admin request ${path.split('?')[0]} failed: ${res.status}`)
  }
  return (await res.json()) as T
}

function fetchProducts(opts: {
  limit: number
  offset: number
  q?: string
  categoryId?: string
}): Promise<Paginated<Product>> {
  const params = new URLSearchParams({
    limit: String(opts.limit),
    offset: String(opts.offset),
  })
  if (opts.q) params.set('q', opts.q)
  if (opts.categoryId) params.set('categoryId', opts.categoryId)
  return adminGet<Paginated<Product>>(`/api/admin/products?${params.toString()}`)
}

// Категорий единицы-десятки — берём все одним запросом для фильтра.
function fetchCategories(): Promise<Paginated<ProductCategory>> {
  return adminGet<Paginated<ProductCategory>>('/api/admin/categories?limit=500')
}

const PAGE_SIZE = 50

interface SearchParams {
  q?: string
  offset?: string
  category?: string
}

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>
}) {
  const params = (await searchParams) ?? {}
  const q = params.q?.trim() || undefined
  const offset = Number(params.offset ?? 0) || 0

  const { data: categories } = await fetchCategories()
  // В API уходит только id из списка категорий: мусор в ?category= не должен
  // ронять страницу ответом 400.
  const categoryId = categories.some((c) => c.id === params.category) ? params.category : undefined

  const { data, pagination } = await fetchProducts({
    limit: PAGE_SIZE,
    offset,
    q,
    categoryId,
  })

  const hasPrev = offset > 0
  const hasNext = offset + pagination.limit < pagination.total
  const emptyText = q
    ? 'Ничего не найдено. Попробуйте другой запрос.'
    : categoryId
      ? 'В этой категории товаров нет.'
      : 'Пока нет товаров. Создайте первый.'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-brand-text">Товары</h1>
        <Link
          href="/admin/products/new"
          className="px-4 py-2 rounded-full bg-brand text-white font-semibold hover:bg-brand-dark transition"
        >
          Создать товар
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <ProductsCategoryFilter categories={categories} value={categoryId ?? ''} />
        <div className="flex-1 min-w-72">
          <ProductsListSearch initialQuery={q ?? ''} />
        </div>
      </div>

      <p className="text-xs text-brand-text-secondary">
        Цена, старая цена, наличие, порядок и публикация меняются прямо в таблице: Enter или клик
        мимо поля — сохранить, Esc — отменить. Пустая старая цена снимает зачёркнутую цену.
      </p>

      <ProductsTable products={data} emptyText={emptyText} />

      <div className="flex items-center justify-between text-sm text-brand-text-secondary">
        <div>
          Всего: {pagination.total}.
          {pagination.total > 0
            ? ` Показаны ${offset + 1}–${Math.min(offset + pagination.limit, pagination.total)}.`
            : ''}
        </div>
        <div className="flex gap-2">
          <PageLink
            disabled={!hasPrev}
            q={q}
            categoryId={categoryId}
            offset={Math.max(0, offset - pagination.limit)}
            label="← Назад"
          />
          <PageLink
            disabled={!hasNext}
            q={q}
            categoryId={categoryId}
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
  categoryId,
  offset,
  label,
}: {
  disabled: boolean
  q?: string
  categoryId?: string
  offset: number
  label: string
}) {
  const params = new URLSearchParams()
  if (q) params.set('q', q)
  if (categoryId) params.set('category', categoryId)
  if (offset > 0) params.set('offset', String(offset))
  const href = `/admin/products${params.toString() ? `?${params.toString()}` : ''}`
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
