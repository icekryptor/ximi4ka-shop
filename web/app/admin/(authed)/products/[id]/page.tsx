import { cookies } from 'next/headers'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Product, ProductCategory } from '@ximi4ka-shop/shared'
import type { Paginated } from '@/lib/api'
import { ADMIN_API_URL_SERVER } from '@/lib/adminAuth'
import { ProductEditClient } from './ProductEditClient'

async function fetchProduct(id: string): Promise<Product | null> {
  const store = await cookies()
  const cookieHeader = store.toString()
  const res = await fetch(`${ADMIN_API_URL_SERVER}/api/admin/products/${encodeURIComponent(id)}`, {
    headers: { cookie: cookieHeader },
    cache: 'no-store',
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Fetch product failed: ${res.status}`)
  const body = (await res.json()) as { data: Product }
  return body.data
}

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

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [product, allCategories] = await Promise.all([fetchProduct(id), fetchAllCategories()])
  if (!product) notFound()

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-brand-text">Редактирование: {product.name}</h1>
        <Link href="/admin/products" className="text-sm text-brand-text-secondary hover:underline">
          ← К списку
        </Link>
      </div>
      <ProductEditClient initial={product} allCategories={allCategories} />
    </div>
  )
}
