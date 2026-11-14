'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import type { ProductCategory } from '@ximi4ka-shop/shared'
import { adminListCategories } from '@/lib/adminApi'
import { buildCategoryTree, flattenTree } from '@/lib/categoryTree'

export type CategoriesState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; categories: ProductCategory[] }

// Список всех категорий для формы товара. Пока он не загружен (или не
// загрузился), форма не отправляет categoryIds — иначе сохранение стёрло бы
// связи товара, которых админ даже не видел.
export function useAdminCategories(): CategoriesState {
  const [state, setState] = useState<CategoriesState>({ status: 'loading' })
  useEffect(() => {
    let cancelled = false
    adminListCategories()
      .then((res) => {
        if (!cancelled) setState({ status: 'ready', categories: res.data })
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' })
      })
    return () => {
      cancelled = true
    }
  }, [])
  return state
}

interface Props {
  state: CategoriesState
  value: string[]
  onChange: (next: string[]) => void
}

// Мультивыбор категорий деревом: подкатегории с отступом под родителем.
// Витрина показывает товар только в отмеченных категориях — родительская
// не наследует товары подкатегорий, поэтому её отмечают отдельно.
export function ProductCategoriesField({ state, value, onChange }: Props) {
  const rows = useMemo(
    () => (state.status === 'ready' ? flattenTree(buildCategoryTree(state.categories)) : []),
    [state],
  )
  const selected = useMemo(() => new Set(value), [value])
  const selectedNames = rows.filter((r) => selected.has(r.id)).map((r) => r.name)

  function toggle(id: string, checked: boolean) {
    if (checked) onChange(selected.has(id) ? value : [...value, id])
    else onChange(value.filter((v) => v !== id))
  }

  if (state.status === 'loading') {
    return <p className="text-sm text-brand-text-secondary">Загрузка категорий…</p>
  }
  if (state.status === 'error') {
    return (
      <p role="alert" className="text-sm text-red-700">
        Не удалось загрузить категории. При сохранении категории товара не изменятся.
      </p>
    )
  }
  if (rows.length === 0) {
    return (
      <p className="text-sm text-brand-text-secondary">
        Категорий пока нет —{' '}
        <Link href="/admin/categories/new" className="underline">
          создайте первую
        </Link>
        .
      </p>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-brand-text-secondary">
        Товар появится на странице каждой отмеченной категории. Родительская категория не показывает
        товары подкатегорий — отмечайте её отдельно.
      </p>
      <div
        role="group"
        aria-label="Категории товара"
        className="max-h-80 overflow-y-auto rounded-xl border border-brand-border p-2"
      >
        {rows.map((c) => (
          <label
            key={c.id}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-brand-text hover:bg-brand-bg-soft"
            style={{ paddingLeft: `${0.5 + c.depth * 1.25}rem` }}
          >
            <input
              type="checkbox"
              checked={selected.has(c.id)}
              onChange={(e) => toggle(c.id, e.target.checked)}
            />
            <span>{c.name}</span>
          </label>
        ))}
      </div>
      <p className="text-sm text-brand-text-secondary" aria-live="polite">
        {selectedNames.length === 0
          ? 'Категории не выбраны — товар не попадёт ни в одну категорию.'
          : `Выбрано: ${selectedNames.join(', ')}`}
      </p>
    </div>
  )
}
