'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { ProductCategory } from '@ximi4ka-shop/shared'
import { CategoryForm } from '@/components/admin/CategoryForm'
import { ApiError, adminCreateCategory, type AdminCategoryInput } from '@/lib/adminApi'

interface Props {
  allCategories: Array<ProductCategory & { productCount?: number }>
}

export function CategoryCreateClient({ allCategories }: Props) {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)

  async function handleSubmit(input: AdminCategoryInput) {
    setSubmitting(true)
    setError(null)
    try {
      const created = await adminCreateCategory(input)
      router.push(`/admin/categories/${created.id}`)
      router.refresh()
    } catch (err) {
      if (err instanceof ApiError) setError(err)
      else setError(new ApiError(500, 'network_error', 'Ошибка сети'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <CategoryForm
      mode="create"
      allCategories={allCategories}
      onSubmit={handleSubmit}
      submitting={submitting}
      error={error}
    />
  )
}
