'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { ProductCategory } from '@ximi4ka-shop/shared'
import { ProductForm } from '@/components/admin/ProductForm'
import { ApiError, adminCreateProduct, type AdminProductInput } from '@/lib/adminApi'

export function ProductCreateClient({ allCategories }: { allCategories: ProductCategory[] }) {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)

  async function handleSubmit(input: AdminProductInput) {
    setSubmitting(true)
    setError(null)
    try {
      const created = await adminCreateProduct(input)
      router.push(`/admin/products/${created.id}`)
      router.refresh()
    } catch (err) {
      if (err instanceof ApiError) setError(err)
      else setError(new ApiError(500, 'network_error', 'Ошибка сети'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ProductForm
      mode="create"
      allCategories={allCategories}
      onSubmit={handleSubmit}
      submitting={submitting}
      error={error}
    />
  )
}
