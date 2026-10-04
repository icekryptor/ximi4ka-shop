import type { ProductCategory } from '@ximi4ka-shop/shared'
import type { BreadcrumbItem } from './jsonLd'
import { DEFAULT_LOCALE, pickField, type Locale } from './i18n'

/** Путь с префиксом локали: `/catalog` → `/en/catalog`, `/` → `/en`. Для ru без префикса. */
export function localeHref(locale: Locale, path: string): string {
  if (locale === DEFAULT_LOCALE) return path
  return path === '/' ? `/${locale}` : `/${locale}${path}`
}

/**
 * Основная категория товара — первая из списка категорий, в которую товар
 * входит. Список приходит от api уже в порядке sortOrder, поэтому «первая» —
 * та, что стоит выше в каталоге. Нет категорий или id не нашлись — undefined.
 */
export function primaryCategory(
  categoryIds: string[] | undefined,
  categories: ProductCategory[],
): ProductCategory | undefined {
  if (!categoryIds || categoryIds.length === 0) return undefined
  const ids = new Set(categoryIds)
  return categories.find((c) => ids.has(c.id))
}

/** Главная → Каталог → [Категория →] Товар. Без категории звено пропускается. */
export function productBreadcrumbs(args: {
  locale: Locale
  name: string
  slug: string
  category?: ProductCategory
}): BreadcrumbItem[] {
  const { locale, name, slug, category } = args
  return [
    { name: 'Главная', href: localeHref(locale, '/') },
    { name: 'Каталог', href: localeHref(locale, '/catalog') },
    ...(category
      ? [
          {
            name: pickField<string>(category, 'name', locale) ?? category.name,
            href: localeHref(locale, `/categories/${category.slug}`),
          },
        ]
      : []),
    { name, href: localeHref(locale, `/product/${slug}`) },
  ]
}
