import { useEffect, useRef, useState, type RefObject } from 'react'
import type { Product, SearchProductResult } from '@ximi4ka-shop/shared'
import { listCategories, listProductsByCategory } from '@/lib/api'

/**
 * Вкладки оптового каталога: категории, у которых есть оптовые скидки, в
 * заданном порядке. Комбо и печатной продукции здесь нет — скидок у них нет.
 * Названия приходят из API категорий; запасные совпадают с текущими, чтобы
 * подписи не мигали, пока ответ не пришёл (или если он не придёт).
 */
const TABS = [
  { slug: 'kits', fallback: 'Наборы' },
  { slug: 'reagents', fallback: 'Реактивы' },
  { slug: 'equipment', fallback: 'Лабораторное оборудование' },
] as const

export const DEFAULT_TAB = TABS[0].slug

/** С запасом на рост каталога; список категории — один запрос, а не страницы. */
const CATEGORY_LIMIT = 100

export interface CatalogTab {
  slug: string
  name: string
}

export type CatalogTabState =
  | { status: 'error' }
  | { status: 'ready'; items: SearchProductResult[] }

/**
 * Товар категории в том же виде, что подсказка поиска: дальше он идёт в
 * `toStagedLine`. Категории — слаг вкладки: по нему движок решает, положена ли
 * процентная скидка (наборы и партии определяются по слагу товара).
 */
function toPickerItem(product: Product, categorySlug: string): SearchProductResult {
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    priceRub: product.priceRub,
    image: product.images?.[0]?.url ?? null,
    stockStatus: product.stockStatus,
    categories: [categorySlug],
  }
}

/**
 * Данные карусели. Ничего не грузит, пока блок не оказался в зоне видимости
 * (IntersectionObserver; без него — сразу после гидратации): блок стоит ниже
 * первого экрана, и запросы не должны с ним конкурировать. Товары кешируются
 * по вкладке в памяти — повторное переключение не перезапрашивает.
 */
export function useWholesaleCatalog(rootRef: RefObject<HTMLElement | null>) {
  // Без IntersectionObserver ждать нечего. На сервере true, на клиенте с
  // наблюдателем — false; на разметку это не влияет (в обоих случаях скелетон).
  const [started, setStarted] = useState(() => typeof IntersectionObserver === 'undefined')
  const [names, setNames] = useState<Readonly<Record<string, string>> | null>(null)
  const [selected, setSelected] = useState<string>(DEFAULT_TAB)
  const [byTab, setByTab] = useState<Readonly<Record<string, CatalogTabState>>>({})
  const [retryTick, setRetryTick] = useState(0)
  const requested = useRef(new Set<string>())
  const categoriesRequested = useRef(false)

  useEffect(() => {
    const el = rootRef.current
    if (started || !el) return
    const observer = new IntersectionObserver(
      (entries, self) => {
        if (!entries.some((e) => e.isIntersecting)) return
        self.disconnect()
        setStarted(true)
      },
      { rootMargin: '200px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [started, rootRef])

  // Названия вкладок. Не ответили — остаются запасные, вкладки работают.
  useEffect(() => {
    if (!started || categoriesRequested.current) return
    categoriesRequested.current = true
    listCategories({ limit: 50 })
      .then((res) => setNames(Object.fromEntries(res.data.map((c) => [c.slug, c.name]))))
      .catch(() => {
        // запасные названия остаются
      })
  }, [started])

  const tabs: CatalogTab[] = TABS.filter((t) => !names || t.slug in names).map((t) => ({
    slug: t.slug,
    name: names?.[t.slug] ?? t.fallback,
  }))
  const active = tabs.some((t) => t.slug === selected) ? selected : (tabs[0]?.slug ?? null)

  // retryTick в зависимостях: после «Повторить» эффект проходит заново.
  useEffect(() => {
    if (!started || !active || requested.current.has(active)) return
    requested.current.add(active)
    const slug = active
    listProductsByCategory(slug, { limit: CATEGORY_LIMIT })
      .then((res) =>
        setByTab((cur) => ({
          ...cur,
          [slug]: { status: 'ready', items: res.data.map((p) => toPickerItem(p, slug)) },
        })),
      )
      .catch(() => setByTab((cur) => ({ ...cur, [slug]: { status: 'error' } })))
  }, [started, active, retryTick])

  const retry = (slug: string) => {
    requested.current.delete(slug)
    setByTab((cur) => {
      const next = { ...cur }
      delete next[slug]
      return next
    })
    setRetryTick((t) => t + 1)
  }

  return {
    tabs,
    active,
    select: setSelected,
    /** null — ещё грузится. */
    state: active ? (byTab[active] ?? null) : null,
    retry,
  }
}
