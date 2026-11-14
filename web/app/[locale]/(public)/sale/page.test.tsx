import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import SalePage, { dynamic } from './page'
import * as api from '@/lib/api'
import * as splitInstallments from '@/lib/splitInstallments'

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('notFound')
  },
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`)
  },
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/sale',
  useSearchParams: () => new URLSearchParams(),
}))

const product = (slug: string, name: string) => ({
  id: `id-${slug}`,
  slug,
  sku: slug.toUpperCase(),
  name,
  shortDescription: null,
  priceRub: 1000,
  compareAtPriceRub: null,
  stockStatus: 'in_stock',
  isPublished: true,
  longDescriptionBlocks: [],
  createdAt: '2026-07-04T00:00:00Z',
  images: [
    { id: `img-${slug}`, productId: `id-${slug}`, url: `/${slug}.png`, alt: name, sortOrder: 0 },
  ],
})

type Listed = Awaited<ReturnType<typeof api.listProductsByCategory>>
type One = Awaited<ReturnType<typeof api.getPublishedProduct>>

const KITS = [
  product('himichka-30', 'Химичка 3.0'),
  product('elektrohimichka', 'Электрохимичка'),
  product('mini-himichka', 'Мини-Химичка'),
  product('bolshoi-nabor-dlya-oge', 'Химичка ОГЭ'),
]
const COMBO_CATEGORY = [
  product('himichka-i-elektrohimichka', 'Химичка и Электрохимичка'),
  product('vse-tri-nabora', 'Все три набора!'),
  product('zapas-vseh-reaktivov', 'Запас всех реактивов'),
]
const EXTRA: Record<string, ReturnType<typeof product>> = {
  'all-4-kits': product('all-4-kits', 'Все четыре набора!'),
  'zapas-reaktivov-1': product('zapas-reaktivov-1', 'Запас всех реактивов по 1 шт'),
}

describe('SalePage', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-20T12:00:00+03:00'))
    vi.spyOn(splitInstallments, 'fetchSplitAvailable').mockResolvedValue(false)
    vi.spyOn(api, 'listProductsByCategory').mockImplementation(async (slug: string) => {
      const data = slug === 'kits' ? KITS : slug === 'combo' ? COMBO_CATEGORY : []
      return { data, pagination: { total: data.length, limit: 50, offset: 0 } } as unknown as Listed
    })
    vi.spyOn(api, 'getPublishedProduct').mockImplementation(async (slug: string) => {
      const p = EXTRA[slug]
      if (!p) throw new Error('404')
      return p as unknown as One
    })
  })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('рендерится на запрос — даты акции и цены из api', () => {
    expect(dynamic).toBe('force-dynamic')
  })

  async function renderSale() {
    const ui = await SalePage({ params: Promise.resolve({ locale: 'ru' }) })
    render(ui)
  }

  function cardTitles(heading: string): string[] {
    const section = screen.getByRole('heading', { level: 2, name: heading }).closest('section')!
    return within(section)
      .getAllByRole('heading', { level: 3 })
      .map((h) => h.textContent ?? '')
  }

  it('показывает все четыре набора', async () => {
    await renderSale()
    expect(cardTitles('Наборы')).toEqual([
      'Химичка 3.0',
      'Электрохимичка',
      'Мини-Химичка',
      'Химичка ОГЭ',
    ])
  })

  it('в комбо — категория плюс «Все четыре набора!» и «Все реактивы по 1 шт», крупные первыми', async () => {
    await renderSale()
    expect(cardTitles('Комбо')).toEqual([
      'Все четыре набора!',
      'Все три набора!',
      'Химичка и Электрохимичка',
      'Запас всех реактивов',
      'Запас всех реактивов по 1 шт',
    ])
  })

  it('не падает, если дополнительного комбо нет в api', async () => {
    vi.mocked(api.getPublishedProduct).mockRejectedValue(new Error('404'))
    await renderSale()
    expect(cardTitles('Комбо')).toHaveLength(3)
  })

  it('после акции уводит в наборы', async () => {
    vi.setSystemTime(new Date('2026-11-29T00:00:00+03:00'))
    await expect(SalePage({ params: Promise.resolve({ locale: 'ru' }) })).rejects.toThrow(
      'redirect:/categories/kits',
    )
  })
})
