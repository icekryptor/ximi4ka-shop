'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import type { ProductCategory } from '@ximi4ka-shop/shared'

// Порядок вывода: корневые категории по sortOrder/названию, под каждой — её
// подкатегории с отступом. Фильтр — точное совпадение, как на витрине.
export function orderCategoriesAsTree(
  categories: ProductCategory[],
): Array<{ category: ProductCategory; depth: number }> {
  const byParent = new Map<string | null, ProductCategory[]>()
  const ids = new Set(categories.map((c) => c.id))
  for (const c of categories) {
    // Родитель не найден — показываем как корневую, чтобы не потерять.
    const parent = c.parentId && ids.has(c.parentId) ? c.parentId : null
    const list = byParent.get(parent) ?? []
    list.push(c)
    byParent.set(parent, list)
  }
  const out: Array<{ category: ProductCategory; depth: number }> = []
  const walk = (parent: string | null, depth: number) => {
    const list = (byParent.get(parent) ?? []).sort(
      (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'ru'),
    )
    for (const c of list) {
      out.push({ category: c, depth })
      if (depth < 10) walk(c.id, depth + 1)
    }
  }
  walk(null, 0)
  return out
}

export function ProductsCategoryFilter({
  categories,
  value,
}: {
  categories: ProductCategory[]
  value: string
}) {
  const router = useRouter()
  const params = useSearchParams()
  const [pending, startTransition] = useTransition()

  function change(id: string) {
    const next = new URLSearchParams(params?.toString() ?? '')
    if (id) next.set('category', id)
    else next.delete('category')
    next.delete('offset') // другая выборка — с первой страницы
    startTransition(() => {
      router.push(`/admin/products${next.toString() ? `?${next.toString()}` : ''}`)
    })
  }

  return (
    <select
      aria-label="Категория"
      value={value}
      disabled={pending}
      onChange={(e) => change(e.target.value)}
      className="input max-w-xs"
    >
      <option value="">Все категории</option>
      {orderCategoriesAsTree(categories).map(({ category, depth }) => (
        <option key={category.id} value={category.id}>
          {'  '.repeat(depth * 2)}
          {category.name}
          {category.productCount !== undefined ? ` (${category.productCount})` : ''}
        </option>
      ))}
    </select>
  )
}
