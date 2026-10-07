import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'

// Настоящий блок заказа на главной: проверяем, что карусель каталога есть и там.
vi.mock('@/lib/api', () => ({
  searchCatalog: vi.fn().mockResolvedValue({ products: [], posts: [] }),
  getPublishedProduct: vi.fn().mockRejectedValue(new Error('404')),
  listCategories: vi.fn().mockResolvedValue({ data: [{ slug: 'kits', name: 'Наборы' }] }),
  listProductsByCategory: vi.fn().mockResolvedValue({
    data: [
      {
        id: 'p-h',
        slug: 'himichka-30',
        name: 'Химичка 3.0',
        priceRub: 3099,
        stockStatus: 'in_stock',
      },
      {
        id: 'p-e',
        slug: 'elektrohimichka',
        name: 'Электрохимичка',
        priceRub: 3099,
        stockStatus: 'in_stock',
      },
      {
        id: 'p-m',
        slug: 'mini-himichka',
        name: 'Мини-Химичка',
        priceRub: 1699,
        stockStatus: 'in_stock',
      },
      {
        id: 'p-o',
        slug: 'bolshoi-nabor-dlya-oge',
        name: 'Набор для ОГЭ',
        priceRub: 3490,
        stockStatus: 'in_stock',
      },
    ],
  }),
}))

import { WholesaleHomeSection } from './WholesaleHomeSection'

// Блок «уже в зоне видимости»: наблюдатель сразу сообщает о пересечении.
class VisibleObserver {
  constructor(private cb: IntersectionObserverCallback) {}
  observe(el: Element) {
    this.cb([{ isIntersecting: true, target: el } as IntersectionObserverEntry], this as never)
  }
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return []
  }
}

beforeEach(() => vi.stubGlobal('IntersectionObserver', VisibleObserver))
afterEach(() => vi.unstubAllGlobals())

describe('WholesaleHomeSection с каруселью каталога', () => {
  it('в секции на главной есть вкладки, карточки и добавление в список', async () => {
    render(<WholesaleHomeSection href="/opt" />)
    expect(await screen.findByRole('tab', { name: 'Наборы' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    const card = (await screen.findByText('Мини-Химичка')).closest('article') as HTMLElement
    fireEvent.click(within(card).getByRole('button', { name: /В список/ }))
    expect(screen.getByTestId('wholesale-line')).toHaveTextContent('Мини-Химичка')
  })
})
