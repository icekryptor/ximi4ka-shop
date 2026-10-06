// SEO-текст и FAQ категории (seoBlocks) выводятся после сетки товаров и только
// на первой странице пагинации — иначе текст дублировался бы на ?page=2.
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { cleanup, render, within } from '@testing-library/react'
import type { Product, ProductCategory } from '@ximi4ka-shop/shared'

vi.mock('@/lib/api', () => ({
  ApiError: class ApiError extends Error {
    constructor(
      public status: number,
      public code: string,
      message: string,
    ) {
      super(message)
    }
  },
  getCategory: vi.fn(),
  listProductsByCategory: vi.fn(),
}))

// Клиентский островок сортировки и карточки к теме теста не относятся.
vi.mock('./_components/CategoryFilterBarMount', () => ({
  CategoryFilterBarMount: () => <div data-testid="filter-bar" />,
}))
vi.mock('@/components/ProductCard', () => ({
  ProductCard: ({ product }: { product: Product }) => (
    <article data-testid="product-card">{product.name}</article>
  ),
}))

import CategoryDetailPage from './page'
import { getCategory, listProductsByCategory } from '@/lib/api'

const SEO_BLOCKS = [
  { type: 'paragraph', html: '<h2>Какие реактивы есть в каталоге</h2>' },
  {
    type: 'paragraph',
    html: '<p>Растворы для опытов, например <a href="/product/sernaya-kislota">серная кислота</a>.</p>',
  },
  {
    type: 'faq',
    items: [{ question: 'Нужно ли разбавлять реактивы?', answer: 'Растворы продаются готовыми.' }],
  },
]

function category(overrides: Partial<ProductCategory> = {}): ProductCategory {
  return {
    id: 'c1',
    slug: 'reagents',
    name: 'Реактивы',
    parentId: null,
    metaTitle: null,
    metaDescription: null,
    sortOrder: 0,
    translations: {},
    seoBlocks: SEO_BLOCKS,
    ...overrides,
  }
}

function product(id: string, name: string): Product {
  return {
    id,
    slug: id,
    name,
    priceRub: 100,
    images: [],
    createdAt: '2026-01-01T00:00:00.000Z',
  } as unknown as Product
}

async function renderPage(
  searchParams: Record<string, string> = {},
  { locale = 'ru' }: { locale?: string } = {},
) {
  const ui = await CategoryDetailPage({
    params: Promise.resolve({ locale, slug: 'reagents' }),
    searchParams: Promise.resolve(searchParams),
  })
  return render(ui)
}

function faqJsonLd(container: HTMLElement) {
  return Array.from(container.querySelectorAll('script[type="application/ld+json"]'))
    .map((s) => JSON.parse(s.textContent ?? '{}'))
    .find((d) => d['@type'] === 'FAQPage')
}

describe('CategoryDetailPage: seoBlocks', () => {
  beforeEach(() => {
    vi.mocked(getCategory).mockResolvedValue(category())
    vi.mocked(listProductsByCategory).mockResolvedValue({
      data: [product('p1', 'Серная кислота 7%'), product('p2', 'Соляная кислота 10%')],
      // 30 товаров при PAGE_SIZE 12 — три страницы пагинации.
      pagination: { limit: 12, offset: 0, total: 30 },
    })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('на первой странице выводит заголовок, текст со ссылкой и FAQ с разметкой FAQPage', async () => {
    const { container } = await renderPage()

    expect(
      within(container).getByRole('heading', { level: 2, name: 'Какие реактивы есть в каталоге' }),
    ).toBeInTheDocument()
    const link = within(container).getByRole('link', { name: 'серная кислота' })
    expect(link).toHaveAttribute('href', '/product/sernaya-kislota')
    expect(within(container).getByText('Нужно ли разбавлять реактивы?')).toBeInTheDocument()

    const ld = faqJsonLd(container)
    expect(ld.mainEntity).toHaveLength(1)
    expect(ld.mainEntity[0].name).toBe('Нужно ли разбавлять реактивы?')
  })

  it('выводит текст после сетки товаров и до финального призыва', async () => {
    const { container } = await renderPage()

    const card = container.querySelector('[data-testid="product-card"]')!
    const seo = container.querySelector('[data-seo-blocks]')!
    expect(seo).not.toBeNull()
    expect(card.compareDocumentPosition(seo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const cta = within(container).getByText('Изучите другие категории')
    expect(seo.compareDocumentPosition(cta) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('page=1 и сортировка не прячут текст: это та же первая страница', async () => {
    const { container } = await renderPage({ page: '1', sort: 'price-asc' })
    expect(container.querySelector('[data-seo-blocks]')).not.toBeNull()
  })

  it('мусорный page (abc, 0, -3) трактуется как первая страница и показывает текст', async () => {
    for (const page of ['abc', '0', '-3']) {
      const { container, unmount } = await renderPage({ page })
      expect(container.querySelector('[data-seo-blocks]'), `page=${page}`).not.toBeNull()
      unmount()
    }
  })

  it('на второй и последующих страницах текста и FAQPage нет — товары остаются', async () => {
    for (const page of ['2', '3']) {
      const { container, unmount } = await renderPage({ page })
      expect(container.querySelector('[data-seo-blocks]'), `page=${page}`).toBeNull()
      expect(within(container).queryByText('Какие реактивы есть в каталоге')).toBeNull()
      expect(faqJsonLd(container)).toBeUndefined()
      expect(within(container).getAllByTestId('product-card').length).toBeGreaterThan(0)
      unmount()
    }
  })

  it('без seoBlocks (null, нет поля, пустой массив) ничего не выводит', async () => {
    for (const seoBlocks of [null, undefined, []]) {
      vi.mocked(getCategory).mockResolvedValue(category({ seoBlocks }))
      const { container, unmount } = await renderPage()
      expect(container.querySelector('[data-seo-blocks]')).toBeNull()
      expect(faqJsonLd(container)).toBeUndefined()
      unmount()
    }
  })

  it('если в seoBlocks нет ни одного валидного блока, пустой секции не остаётся', async () => {
    vi.mocked(getCategory).mockResolvedValue(
      category({ seoBlocks: [{ type: 'unknown' }, 'мусор', null] }),
    )
    const { container } = await renderPage()
    expect(container.querySelector('[data-seo-blocks]')).toBeNull()
  })

  it('в английской локали без перевода берёт русские блоки, с переводом — переведённые', async () => {
    const fallback = await renderPage({}, { locale: 'en' })
    expect(fallback.container.querySelector('[data-seo-blocks]')).not.toBeNull()
    expect(within(fallback.container).getByText('Какие реактивы есть в каталоге')).toBeTruthy()
    fallback.unmount()

    vi.mocked(getCategory).mockResolvedValue(
      category({
        translations: { en: { seoBlocks: [{ type: 'paragraph', html: '<h2>What we sell</h2>' }] } },
      }),
    )
    const translated = await renderPage({}, { locale: 'en' })
    expect(within(translated.container).getByText('What we sell')).toBeTruthy()
    expect(within(translated.container).queryByText('Какие реактивы есть в каталоге')).toBeNull()
  })
})
