import Link from 'next/link'
import { cookies } from 'next/headers'
import type { ProductCategory } from '@ximi4ka-shop/shared'
import type { Paginated } from '@/lib/api'
import { ADMIN_API_URL_SERVER } from '@/lib/adminAuth'
import { ProductCreateClient } from './ProductCreateClient'

async function fetchAllCategories(): Promise<ProductCategory[]> {
  const store = await cookies()
  const cookieHeader = store.toString()
  const res = await fetch(`${ADMIN_API_URL_SERVER}/api/admin/categories?limit=200`, {
    headers: { cookie: cookieHeader },
    cache: 'no-store',
  })
  // Список категорий — удобство формы, а не её основа: при сбое товар остаётся
  // редактируемым (его категории форма при этом сохраняет как есть).
  if (!res.ok) return []
  const body = (await res.json()) as Paginated<ProductCategory>
  return body.data
}

export default async function NewProductPage() {
  const allCategories = await fetchAllCategories()

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-brand-text">Новый товар</h1>
        <Link href="/admin/products" className="text-sm text-brand-text-secondary hover:underline">
          ← К списку
        </Link>
      </div>
      <ProductCreateClient allCategories={allCategories} />
    </div>
  )
}
