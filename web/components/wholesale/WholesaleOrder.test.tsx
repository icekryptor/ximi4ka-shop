import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { SearchResult } from '@ximi4ka-shop/shared'
import { formatRub } from '@/lib/stockLabel'
import { loadCart, OPEN_CART_EVENT } from '@/lib/cart'
import { WholesaleOrder } from './WholesaleOrder'

const mockSearch = vi.fn<(q: string, opts?: unknown) => Promise<SearchResult>>()
vi.mock('@/lib/api', () => ({
  searchCatalog: (q: string, opts?: unknown) => mockSearch(q, opts),
  getPublishedProduct: vi.fn(),
}))

const tube = {
  id: 'p-tube',
  slug: 'probirka',
  name: 'Пробирка',
  priceRub: 29,
  image: null,
  stockStatus: 'in_stock' as const,
  categories: ['equipment'],
}
const reagent = {
  id: 'p-r',
  slug: 'copper-sulfate',
  name: 'Сульфат меди',
  priceRub: 100,
  image: null,
  stockStatus: 'in_stock' as const,
  categories: ['reagents'],
}
const soldOut = {
  ...reagent,
  id: 'p-x',
  slug: 'rare',
  name: 'Редкий реактив',
  stockStatus: 'out_of_stock' as const,
}

// toHaveTextContent нормализует пробелы в тексте элемента, но не в ожидаемой строке,
// а Intl ставит неразрывный пробел — приводим ожидаемое к обычному.
const rub = (value: number) => formatRub(value).replace(/\s/g, ' ')

function type(value: string) {
  fireEvent.change(screen.getByRole('searchbox'), { target: { value } })
}

async function pick(query: string, name: RegExp) {
  type(query)
  const option = await screen.findByRole('option', { name })
  fireEvent.click(option)
}

beforeEach(() => {
  window.localStorage.clear()
  mockSearch.mockReset()
  mockSearch.mockResolvedValue({ products: [tube, reagent, soldOut], posts: [] })
})
afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

describe('WholesaleOrder', () => {
  it('ищет с scope=wholesale и показывает карточки с описанием скидки', async () => {
    render(<WholesaleOrder />)
    type('про')
    await screen.findByRole('option', { name: /Пробирка/ })
    expect(mockSearch).toHaveBeenCalledWith('про', expect.objectContaining({ scope: 'wholesale' }))
    expect(screen.getByRole('option', { name: /партиями от 2 шт/ })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /от 5 шт: −15%/ })).toBeInTheDocument()
  })

  it('товар «нет в наличии» добавить нельзя', async () => {
    render(<WholesaleOrder />)
    type('ре')
    const option = await screen.findByRole('option', { name: /Редкий реактив/ })
    expect(option).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(option)
    expect(screen.queryAllByTestId('wholesale-line')).toHaveLength(0)
  })

  it('добавляет позицию со стартовым количеством и ценой с оптовой скидкой', async () => {
    render(<WholesaleOrder />)
    await pick('про', /Пробирка/)
    const row = screen.getByTestId('wholesale-line')
    expect(within(row).getByText('2')).toBeInTheDocument()
    expect(row).toHaveTextContent(rub(39))
  })

  it('кнопка «+» у пробирок прыгает по ступеням и пересчитывает итог', async () => {
    render(<WholesaleOrder />)
    await pick('про', /Пробирка/)
    fireEvent.click(screen.getByRole('button', { name: 'Увеличить количество' }))
    const row = screen.getByTestId('wholesale-line')
    expect(within(row).getByText('5')).toBeInTheDocument()
    expect(row).toHaveTextContent(rub(99))
  })

  it('итог: без скидки, скидка и к оплате по всему списку', async () => {
    render(<WholesaleOrder />)
    await pick('про', /Пробирка/)
    fireEvent.click(screen.getByRole('button', { name: 'Увеличить количество' }))
    await pick('сул', /Сульфат меди/)
    expect(screen.getByTestId('wholesale-list-total')).toHaveTextContent(rub(645))
    expect(screen.getByTestId('wholesale-savings')).toHaveTextContent(rub(121))
    expect(screen.getByTestId('wholesale-total')).toHaveTextContent(rub(524))
  })

  it('повторный выбор того же товара не дублирует строку', async () => {
    render(<WholesaleOrder />)
    await pick('про', /Пробирка/)
    await pick('про', /Пробирка/)
    expect(screen.getAllByTestId('wholesale-line')).toHaveLength(1)
  })

  it('«Добавить в корзину» кладёт позиции с категориями, открывает корзину и очищает список', async () => {
    const opened = vi.fn()
    window.addEventListener(OPEN_CART_EVENT, opened)
    render(<WholesaleOrder />)
    await pick('про', /Пробирка/)
    fireEvent.click(screen.getByRole('button', { name: 'Увеличить количество' }))
    await pick('сул', /Сульфат меди/)

    fireEvent.click(screen.getByRole('button', { name: 'Добавить в корзину' }))

    const items = loadCart()
    expect(items.find((i) => i.slug === 'probirka')).toMatchObject({
      productId: 'p-tube',
      quantity: 5,
      categories: ['equipment'],
    })
    expect(items.find((i) => i.slug === 'copper-sulfate')).toMatchObject({
      quantity: 5,
      categories: ['reagents'],
    })
    expect(opened).toHaveBeenCalledTimes(1)
    expect(screen.queryAllByTestId('wholesale-line')).toHaveLength(0)
    window.removeEventListener(OPEN_CART_EVENT, opened)
  })

  it('пустой список: кнопка отправки неактивна', () => {
    render(<WholesaleOrder />)
    expect(screen.getByRole('button', { name: 'Добавить в корзину' })).toBeDisabled()
  })

  it('убирает позицию из списка', async () => {
    render(<WholesaleOrder />)
    await pick('про', /Пробирка/)
    fireEvent.click(screen.getByRole('button', { name: /Убрать Пробирка/ }))
    expect(screen.queryAllByTestId('wholesale-line')).toHaveLength(0)
  })
})
