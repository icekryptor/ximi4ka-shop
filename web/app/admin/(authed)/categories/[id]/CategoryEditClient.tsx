'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { ProductCategory } from '@ximi4ka-shop/shared'
import { CategoryForm } from '@/components/admin/CategoryForm'
import { ApiError, adminUpdateCategory, type AdminCategoryInput } from '@/lib/adminApi'

interface Props {
  initial: ProductCategory
  allCategories: Array<ProductCategory & { productCount?: number }>
}

export function CategoryEditClient({ initial, allCategories }: Props) {
  const router = useRouter()
  const [category, setCategory] = useState<ProductCategory>(initial)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)
  const [saved, setSaved] = useState(false)

  async function handleSubmit(input: AdminCategoryInput) {
    setSubmitting(true)
    setError(null)
    setSaved(false)
    try {
      const updated = await adminUpdateCategory(category.id, input)
      setCategory(updated)
      setSaved(true)
      router.refresh()
    } catch (err) {
      if (err instanceof ApiError) setError(err)
      else setError(new ApiError(500, 'network_error', 'Ошибка сети'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      {saved && !error ? (
        <div role="status" className="p-3 rounded-xl bg-green-50 text-green-700 text-sm">
          Сохранено
        </div>
      ) : null}
      <CategoryForm
        mode="edit"
        initialValue={category}
        allCategories={allCategories}
        onSubmit={handleSubmit}
        submitting={submitting}
        error={error}
      />
    </>
  )
}
