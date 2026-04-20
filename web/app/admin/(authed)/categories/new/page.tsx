import Link from 'next/link'
import { cookies } from 'next/headers'
import type { ProductCategory } from '@ximi4ka-shop/shared'
import type { Paginated } from '@/lib/api'
import { ADMIN_API_URL_SERVER } from '@/lib/adminAuth'
import { CategoryCreateClient } from './CategoryCreateClient'

type CategoryWithCount = ProductCategory & { productCount: number }

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

export default async function NewCategoryPage() {
  const allCategories = await fetchAllCategories()

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-brand-text">Новая категория</h1>
        <Link
          href="/admin/categories"
          className="text-sm text-brand-text-secondary hover:underline"
        >
          ← К списку
        </Link>
      </div>
      <CategoryCreateClient allCategories={allCategories} />
    </div>
  )
}
