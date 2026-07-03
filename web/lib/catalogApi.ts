import type { Product, ProductCategory } from '@ximi4ka-shop/shared'
import {
  listCategories,
  listPublishedProducts,
  type ProductWithCategories,
} from '@/lib/api'

// Отдельный каталожный слой поверх существующих публичных эндпоинтов
// (api.ts не редактируем). Тянет все опубликованные товары с
// include=categories и все категории, затем группирует товары по категориям
// на сервере — новых серверных роутов не добавляем.

export interface CatalogGroup {
  category: ProductCategory
  products: Product[]
}

export interface CatalogData {
  groups: CatalogGroup[]
  /** productId → count по категории (productCount для плиток). */
  counts: Record<string, number>
  totalProducts: number
}

// Порядок вывода групп в витрине: наборы и комбо крупно сверху, затем
// компактные группы. Слаги не из списка идут после, в порядке sortOrder
// категории (как отдаёт API).
const GROUP_ORDER = ['kits', 'combo', 'reagents', 'equipment', 'print']

function orderIndex(slug: string): number {
  const i = GROUP_ORDER.indexOf(slug)
  return i === -1 ? GROUP_ORDER.length : i
}

export const COMPACT_SLUGS = new Set(['reagents', 'equipment', 'print'])

export function densityForSlug(slug: string): 'kit' | 'compact' {
  return COMPACT_SLUGS.has(slug) ? 'compact' : 'kit'
}

/**
 * Собирает данные каталога: все товары, сгруппированные по категориям, и
 * счётчики. Все сетевые сбои деградируют до пустого каталога — витрина
 * покажет заглушку, а не 500.
 */
export async function fetchCatalog(): Promise<CatalogData> {
  const [productsRes, categoriesRes] = await Promise.all([
    listPublishedProducts({ limit: 1000, include: 'categories' })
      .then((r) => r.data as ProductWithCategories[])
      .catch(() => [] as ProductWithCategories[]),
    listCategories({ limit: 100 })
      .then((r) => r.data)
      .catch(() => [] as ProductCategory[]),
  ])

  const counts: Record<string, number> = {}
  const byCategory = new Map<string, Product[]>()
  for (const p of productsRes) {
    for (const cid of p.categoryIds ?? []) {
      counts[cid] = (counts[cid] ?? 0) + 1
      const bucket = byCategory.get(cid)
      if (bucket) bucket.push(p)
      else byCategory.set(cid, [p])
    }
  }

  const groups: CatalogGroup[] = categoriesRes
    .map((category) => ({
      category,
      products: byCategory.get(category.id) ?? [],
    }))
    // Пустые категории в витрине не показываем.
    .filter((g) => g.products.length > 0)
    .sort((a, b) => orderIndex(a.category.slug) - orderIndex(b.category.slug))

  return { groups, counts, totalProducts: productsRes.length }
}
