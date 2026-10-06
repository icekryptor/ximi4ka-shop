import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import CatalogPage, { generateMetadata, revalidate } from './page'
import * as catalogApi from '@/lib/catalogApi'

describe('CatalogPage', () => {
  it('is an async Server Component', () => {
    expect(CatalogPage.constructor.name).toBe('AsyncFunction')
  })

  it('enables ISR with a 60-second revalidate window', () => {
    expect(revalidate).toBe(60)
  })

  it('отдаёт title с брендом «Химичка»', async () => {
    const meta = await generateMetadata({ params: Promise.resolve({ locale: 'ru' }) })
    expect(meta.title).toBe('Каталог наборов, реактивов и оборудования — Химичка')
  })

  // Картинки первой группы — в первом экране, ленивая загрузка откладывает LCP.
  // Остальные группы ниже сгиба и остаются ленивыми.
  describe('загрузка фото карточек', () => {
    afterEach(() => {
      cleanup()
      vi.restoreAllMocks()
    })

    const product = (id: string, n: number) => ({
      id,
      slug: id,
      sku: id,
      name: `Товар ${id}`,
      shortDescription: null,
      priceRub: 100 + n,
      compareAtPriceRub: null,
      stockStatus: 'in_stock',
      isPublished: true,
      longDescriptionBlocks: [],
      images: [
        { id: `i-${id}`, productId: id, url: `/${id}.png`, alt: `Фото ${id}`, sortOrder: 0 },
      ],
    })
    const group = (slug: string, prefix: string, count: number) => ({
      category: { id: `c-${slug}`, slug, name: slug },
      products: Array.from({ length: count }, (_, n) => product(`${prefix}${n + 1}`, n)),
    })

    it('первая группа: первая картинка priority, дальше eager и lazy; вторая группа — lazy', async () => {
      vi.spyOn(catalogApi, 'fetchCatalog').mockResolvedValue({
        groups: [group('kits', 'k', 6), group('reagents', 'r', 6)],
        counts: {},
        totalProducts: 12,
      } as unknown as Awaited<ReturnType<typeof catalogApi.fetchCatalog>>)
      const ui = await CatalogPage({ params: Promise.resolve({ locale: 'ru' }) })
      const { container } = render(ui)
      const sections = container.querySelectorAll('section[aria-labelledby]')
      expect(sections).toHaveLength(2)

      const kitImgs = Array.from(sections[0].querySelectorAll('[data-testid="catalog-grid"] img'))
      expect(kitImgs).toHaveLength(6)
      expect(kitImgs[0]).toHaveAttribute('loading', 'eager')
      expect(kitImgs[0]).toHaveAttribute('fetchpriority', 'high')
      expect(kitImgs[1]).toHaveAttribute('loading', 'eager')
      expect(kitImgs[1]).not.toHaveAttribute('fetchpriority')
      expect(kitImgs[5]).toHaveAttribute('loading', 'lazy')

      // Реактивы по умолчанию открываются списком (миниатюры 80px), плиткой —
      // по переключателю; в обоих видах ниже сгиба ничего не приоритезируем.
      const lower = Array.from(sections[1].querySelectorAll('img'))
      expect(lower.length).toBeGreaterThan(0)
      for (const img of lower) {
        expect(img).not.toHaveAttribute('fetchpriority')
      }
    })
  })
})
