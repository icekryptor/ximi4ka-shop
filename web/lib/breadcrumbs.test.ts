import { describe, it, expect } from 'vitest'
import type { ProductCategory } from '@ximi4ka-shop/shared'
import { localeHref, primaryCategory, productBreadcrumbs } from './breadcrumbs'

function makeCategory(overrides: Partial<ProductCategory> = {}): ProductCategory {
  return {
    id: 'c1',
    slug: 'himicheskie-nabory',
    name: 'Химические наборы',
    parentId: null,
    metaTitle: null,
    metaDescription: null,
    sortOrder: 0,
    translations: {},
    ...overrides,
  }
}

describe('localeHref', () => {
  it('leaves paths of the default locale as is', () => {
    expect(localeHref('ru', '/')).toBe('/')
    expect(localeHref('ru', '/catalog')).toBe('/catalog')
  })

  it('prefixes non-default locales', () => {
    expect(localeHref('en', '/')).toBe('/en')
    expect(localeHref('en', '/catalog')).toBe('/en/catalog')
  })
})

describe('primaryCategory', () => {
  const first = makeCategory({ id: 'c1', slug: 'first', sortOrder: 0 })
  const second = makeCategory({ id: 'c2', slug: 'second', sortOrder: 1 })

  it('returns the first category of the list that the product belongs to', () => {
    // Список категорий приходит от api уже отсортированным по sortOrder.
    expect(primaryCategory(['c2', 'c1'], [first, second])).toBe(first)
    expect(primaryCategory(['c2'], [first, second])).toBe(second)
  })

  it('returns undefined when the product has no categories', () => {
    expect(primaryCategory([], [first, second])).toBeUndefined()
    expect(primaryCategory(undefined, [first, second])).toBeUndefined()
  })

  it('returns undefined when none of the ids is known', () => {
    expect(primaryCategory(['zzz'], [first, second])).toBeUndefined()
  })
})

describe('productBreadcrumbs', () => {
  it('builds Главная → Каталог → Категория → Товар when the category is known', () => {
    const chain = productBreadcrumbs({
      locale: 'ru',
      name: 'Химичка 3.0',
      slug: 'himichka-30',
      category: makeCategory(),
    })
    expect(chain).toEqual([
      { name: 'Главная', href: '/' },
      { name: 'Каталог', href: '/catalog' },
      { name: 'Химические наборы', href: '/categories/himicheskie-nabory' },
      { name: 'Химичка 3.0', href: '/product/himichka-30' },
    ])
  })

  it('builds Главная → Каталог → Товар without a category', () => {
    const chain = productBreadcrumbs({ locale: 'ru', name: 'Химичка 3.0', slug: 'himichka-30' })
    expect(chain).toEqual([
      { name: 'Главная', href: '/' },
      { name: 'Каталог', href: '/catalog' },
      { name: 'Химичка 3.0', href: '/product/himichka-30' },
    ])
  })

  it('keeps links in the current locale and uses the translated category name', () => {
    const chain = productBreadcrumbs({
      locale: 'en',
      name: 'Kit',
      slug: 'kit',
      category: makeCategory({ translations: { en: { name: 'Chemistry kits' } } }),
    })
    expect(chain).toEqual([
      { name: 'Главная', href: '/en' },
      { name: 'Каталог', href: '/en/catalog' },
      { name: 'Chemistry kits', href: '/en/categories/himicheskie-nabory' },
      { name: 'Kit', href: '/en/product/kit' },
    ])
  })
})
