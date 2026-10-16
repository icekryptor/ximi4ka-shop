'use client'

import { useEffect, useState } from 'react'
import type { AccountMaterial } from '@ximi4ka-shop/shared'
import { getMaterials } from '@/lib/accountApi'
import { accountMaterialDownloadUrl } from '@/lib/materialUrls'
import { MaterialsDownloads } from '@/components/MaterialsDownloads'
import { ERROR_CLASS } from '@/components/checkout/fieldStyles'

// Список материалов покупателя («Мои материалы»): выданное за покупки и вручную.
export function MaterialsList() {
  const [items, setItems] = useState<AccountMaterial[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    getMaterials()
      .then((data) => {
        if (!cancelled) setItems(data)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (error) {
    return (
      <p role="alert" className={ERROR_CLASS}>
        Не удалось загрузить материалы. Обновите страницу.
      </p>
    )
  }
  if (items === null) return <p className="m-0 opacity-60">Загружаем…</p>
  if (items.length === 0) {
    return (
      <p data-testid="materials-empty" className="m-0 opacity-70">
        Пока здесь пусто. Электронные материалы появятся после покупки набора.
      </p>
    )
  }
  return (
    <MaterialsDownloads
      items={items}
      hrefFor={accountMaterialDownloadUrl}
      tone="light"
      heading={null}
    />
  )
}
