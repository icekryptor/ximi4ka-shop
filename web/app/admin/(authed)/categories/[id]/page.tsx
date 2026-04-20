import Link from 'next/link'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import type { ProductCategory } from '@ximi4ka-shop/shared'
import type { Paginated } from '@/lib/api'
import { ADMIN_API_URL_SERVER } from '@/lib/adminAuth'
import { CategoryEditClient } from './CategoryEditClient'

type CategoryWithCount = ProductCategory & { productCount: number }

async function fetchCategory(id: string): Promise<ProductCategory | null> {
  const store = await cookies()
  const cookieHeader = store.toString()
  const res = await fetch(
    `${ADMIN_API_URL_SERVER}/api/admin/categories/${encodeURIComponent(id)}`,
    {
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    },
  )
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Fetch category failed: ${res.status}`)
  const body = (await res.json()) as { data: ProductCategory }
  return body.data
}

async function fetchAllCategories(): Promise<CategoryWithCount[]> {
  const store = await cookies()
  const cookieHeader = store.toString()
  const res = await fetch(`${ADMIN_API_URL_SERVER}/api/admin/categories?limit=200`, {
    headers: { cookie: cookieHeader },
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`Admin categories fetch failed: ${res.status}`)
  }
  const body = (await res.json()) as Paginated<CategoryWithCount>
  return body.data
}

export default async function EditCategoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [category, allCategories] = await Promise.all([fetchCategory(id), fetchAllCategories()])
  if (!category) notFound()

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-brand-text">Редактирование: {category.name}</h1>
        <Link
          href="/admin/categories"
          className="text-sm text-brand-text-secondary hover:underline"
        >
          ← К списку
        </Link>
      </div>
      <CategoryEditClient initial={category} allCategories={allCategories} />
    </div>
  )
}
