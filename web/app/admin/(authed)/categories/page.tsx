import Link from 'next/link'
import { cookies } from 'next/headers'
import type { ProductCategory } from '@ximi4ka-shop/shared'
import type { Paginated } from '@/lib/api'
import { ADMIN_API_URL_SERVER } from '@/lib/adminAuth'
import { buildCategoryTree, flattenTree } from '@/lib/categoryTree'
import { CategoryDeleteButton } from './CategoryDeleteButton'

type CategoryWithCount = ProductCategory & { productCount: number }

// Server-side fetch. Mirrors the products page pattern: cookies are
// forwarded manually because the admin API runs on its own origin.
async function fetchCategories(): Promise<Paginated<CategoryWithCount>> {
  const store = await cookies()
  const cookieHeader = store.toString()
  const res = await fetch(`${ADMIN_API_URL_SERVER}/api/admin/categories?limit=200`, {
    headers: { cookie: cookieHeader },
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`Admin categories list failed: ${res.status}`)
  }
  return (await res.json()) as Paginated<CategoryWithCount>
}

export default async function AdminCategoriesPage() {
  const { data, pagination } = await fetchCategories()
  const tree = buildCategoryTree(data)
  const flat = flattenTree(tree)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-brand-text">Категории</h1>
        <Link
          href="/admin/categories/new"
          className="px-4 py-2 rounded-full bg-brand text-white font-semibold hover:bg-brand-dark transition"
        >
          Создать категорию
        </Link>
      </div>

      <div className="bg-white rounded-2xl border border-brand-border">
        {flat.length === 0 ? (
          <div className="px-4 py-12 text-center text-brand-text-secondary">
            Пока нет категорий. Создайте первую.
          </div>
        ) : (
          <ul>
            {flat.map((node) => (
              <li
                key={node.id}
                className="flex items-center py-3 px-4 border-b border-brand-border last:border-b-0"
                style={{ paddingLeft: `${16 + node.depth * 24}px` }}
              >
                <span className="font-medium text-brand-text">{node.name}</span>
                <span className="ml-2 text-xs text-brand-text-secondary font-mono">
                  /{node.slug}
                </span>
                <span className="ml-auto text-sm text-brand-text-secondary">
                  {node.productCount ?? 0} товаров
                </span>
                <Link
                  href={`/admin/categories/${node.id}`}
                  className="ml-4 text-sm text-brand hover:underline"
                >
                  Редактировать
                </Link>
                <CategoryDeleteButton
                  id={node.id}
                  name={node.name}
                  productCount={node.productCount ?? 0}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="text-sm text-brand-text-secondary">Всего: {pagination.total}.</div>
    </div>
  )
}
