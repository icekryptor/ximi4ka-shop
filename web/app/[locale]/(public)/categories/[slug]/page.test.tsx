import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import CategoryDetailPage, { dynamic, generateMetadata } from './page'
import * as api from '@/lib/api'

// Островок сортировки ходит в App Router — в юнит-тесте роутера нет.
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('notFound')
  },
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/categories/reagents',
  useSearchParams: () => new URLSearchParams(),
}))

describe('CategoryDetailPage', () => {
  it('is an async Server Component', () => {
    expect(CategoryDetailPage.constructor.name).toBe('AsyncFunction')
  })

  // Страница читает searchParams (сортировка, страница), поэтому её нельзя
  // отдавать из ISR-кеша: при рендере по запросу Next падает с
  // DYNAMIC_SERVER_USAGE (500), если слаг не был пререндерен на сборке — а на
  // своём сервере образ собирается без доступа к api, то есть пререндера нет.
  it('stays dynamic because it reads searchParams', () => {
    expect(dynamic).toBe('force-dynamic')
  })

  describe('generateMetadata', () => {
    afterEach(() => {
      vi.restoreAllMocks()
    })

    const params = Promise.resolve({ locale: 'ru', slug: 'kits' })
    const category = (overrides: Record<string, unknown> = {}) =>
      ({
        id: 'c1',
        slug: 'kits',
        name: 'Наборы',
        translations: {},
        ...overrides,
      }) as unknown as Awaited<ReturnType<typeof api.getCategory>>

    it('добавляет бренд к названию категории, чтобы title не повторял H1', async () => {
      vi.spyOn(api, 'getCategory').mockResolvedValue(category())
      const meta = await generateMetadata({ params })
      expect(meta.title).toBe('Наборы — Химичка')
    })

    it('не добавляет бренд, если итог длиннее 65 символов', async () => {
      const name = 'Очень длинное название категории химических наборов для школьников'
      vi.spyOn(api, 'getCategory').mockResolvedValue(category({ name }))
      const meta = await generateMetadata({ params })
      expect(meta.title).toBe(name)
    })
  })

  // LCP категории — первая картинка товара. Ленивая загрузка откладывает её до
  // раскладки и гидратации (аудит lcp-lazy-loaded), поэтому картинки первого
  // экрана грузятся сразу, а остальные остаются ленивыми.
  describe('загрузка фото карточек', () => {
    afterEach(() => {
      cleanup()
      vi.restoreAllMocks()
    })

    const product = (n: number) => ({
      id: `p${n}`,
      slug: `p-${n}`,
      sku: `S-${n}`,
      name: `Товар ${n}`,
      shortDescription: null,
      priceRub: 100 + n,
      compareAtPriceRub: null,
      stockStatus: 'in_stock',
      isPublished: true,
      longDescriptionBlocks: [],
      createdAt: new Date(2026, 0, 30 - n).toISOString(),
      images: [
        { id: `i${n}`, productId: `p${n}`, url: `/p${n}.png`, alt: `Фото ${n}`, sortOrder: 0 },
      ],
    })

    async function renderCategory(slug: string, count = 12) {
      vi.spyOn(api, 'getCategory').mockResolvedValue({
        id: 'c1',
        slug,
        name: 'Реактивы',
        translations: {},
      } as unknown as Awaited<ReturnType<typeof api.getCategory>>)
      vi.spyOn(api, 'listProductsByCategory').mockResolvedValue({
        data: Array.from({ length: count }, (_, n) => product(n + 1)),
        pagination: { total: count, limit: 12, offset: 0 },
      } as unknown as Awaited<ReturnType<typeof api.listProductsByCategory>>)
      const ui = await CategoryDetailPage({
        params: Promise.resolve({ locale: 'ru', slug }),
        searchParams: Promise.resolve({}),
      })
      const { container } = render(ui)
      return Array.from(container.querySelectorAll('article img'))
    }

    it('компактная сетка: первая картинка priority, первый экран без lazy, десятая lazy', async () => {
      const imgs = await renderCategory('reagents')
      expect(imgs).toHaveLength(12)
      expect(imgs[0]).toHaveAttribute('loading', 'eager')
      expect(imgs[0]).toHaveAttribute('fetchpriority', 'high')
      for (const img of imgs.slice(1, 4)) {
        expect(img).toHaveAttribute('loading', 'eager')
        expect(img).not.toHaveAttribute('fetchpriority')
      }
      for (const img of imgs.slice(4)) {
        expect(img).toHaveAttribute('loading', 'lazy')
      }
      expect(imgs[9]).toHaveAttribute('loading', 'lazy')
    })

    it('сетка наборов: первая картинка priority, вторая eager, десятая lazy', async () => {
      const imgs = await renderCategory('kits')
      expect(imgs[0]).toHaveAttribute('loading', 'eager')
      expect(imgs[0]).toHaveAttribute('fetchpriority', 'high')
      expect(imgs[1]).toHaveAttribute('loading', 'eager')
      expect(imgs[1]).not.toHaveAttribute('fetchpriority')
      expect(imgs[9]).toHaveAttribute('loading', 'lazy')
    })
  })
})
