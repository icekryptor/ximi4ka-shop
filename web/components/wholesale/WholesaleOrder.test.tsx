import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { SearchResult } from '@ximi4ka-shop/shared'
import { formatRub } from '@/lib/stockLabel'
import { loadCart, OPEN_CART_EVENT } from '@/lib/cart'
import { WholesaleOrder } from './WholesaleOrder'

const mockSearch = vi.fn<(q: string, opts?: unknown) => Promise<SearchResult>>()
const mockProduct = vi.fn()
const mockCategory = vi.fn()
vi.mock('@/lib/api', () => ({
  searchCatalog: (q: string, opts?: unknown) => mockSearch(q, opts),
  getPublishedProduct: (slug: string) => mockProduct(slug),
  listProductsByCategory: (slug: string, opts?: unknown) => mockCategory(slug, opts),
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

const himichka = {
  id: 'p-h',
  slug: 'himichka-30',
  name: 'Химичка 3.0',
  priceRub: 3099,
  image: null,
  stockStatus: 'in_stock' as const,
  categories: ['kits'],
}
const electro = {
  id: 'p-e',
  slug: 'elektrohimichka',
  name: 'Электрохимичка',
  priceRub: 3099,
  image: null,
  stockStatus: 'in_stock' as const,
  categories: ['kits'],
}
const pairCombo = {
  id: 'p-pair',
  slug: 'himichka-i-elektrohimichka',
  name: 'Химичка и Электрохимичка',
  priceRub: 5678,
  stockStatus: 'in_stock',
  images: [],
  categorySlugs: ['combo'],
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
  mockProduct.mockReset()
  mockCategory.mockReset()
  mockCategory.mockResolvedValue({ data: [], pagination: { limit: 200, offset: 0, total: 0 } })
  mockSearch.mockResolvedValue({
    products: [tube, reagent, soldOut, himichka, electro],
    posts: [],
  })
})
afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

describe('WholesaleOrder', () => {
  it('реактив из мини-каталога получает процентную скидку: 5 шт по 200 ₽ = 850 ₽', async () => {
    mockCategory.mockImplementation((slug: string) =>
      Promise.resolve({
        data:
          slug === 'reagents'
            ? [
                {
                  id: 'r-soda',
                  slug: 'soda',
                  sku: 'S',
                  name: 'Сода',
                  shortDescription: '',
                  priceRub: 200,
                  compareAtPriceRub: null,
                  stockStatus: 'in_stock',
                  images: [],
                },
              ]
            : [],
        pagination: { limit: 200, offset: 0, total: 1 },
      }),
    )
    render(<WholesaleOrder />)

    fireEvent.click(screen.getByRole('tab', { name: 'Реактивы' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Сода: добавить в заказ' }))

    await screen.findByTestId('wholesale-line')
    expect(screen.getByTestId('wholesale-total')).toHaveTextContent(rub(850))
  })

  it('«В заказ» в мини-каталоге добавляет строку в список, как выбор из поиска', async () => {
    mockCategory.mockResolvedValue({
      data: [
        {
          id: 'k-himichka',
          slug: 'himichka-30',
          sku: 'H30',
          name: 'Химичка 30',
          shortDescription: '',
          priceRub: 2990,
          compareAtPriceRub: null,
          stockStatus: 'in_stock',
          images: [{ url: 'https://cdn.test/h30.jpg' }],
        },
      ],
      pagination: { limit: 24, offset: 0, total: 1 },
    })
    render(<WholesaleOrder />)

    fireEvent.click(await screen.findByRole('button', { name: 'Химичка 30: добавить в заказ' }))

    const row = await screen.findByTestId('wholesale-line')
    expect(within(row).getByText('Химичка 30')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Химичка 30: уже в заказе' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })

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

  it('после выбора товара фокус возвращается в поле поиска', async () => {
    render(<WholesaleOrder />)
    await pick('про', /Пробирка/)
    expect(document.activeElement).toBe(screen.getByRole('searchbox'))
  })

  it('предлагает комбо, когда отдельные наборы выходят дороже, и заменяет по кнопке', async () => {
    mockProduct.mockResolvedValue(pairCombo)
    render(<WholesaleOrder />)
    await pick('хи', /Химичка 3\.0/)
    await pick('эл', /Электрохимичка/)
    for (const row of screen.getAllByTestId('wholesale-line')) {
      for (let i = 0; i < 4; i++) {
        fireEvent.click(within(row).getByRole('button', { name: 'Уменьшить количество' }))
      }
    }

    const banner = await screen.findByTestId('combo-suggestion')
    expect(banner).toHaveTextContent('Химичка и Электрохимичка')
    expect(banner).toHaveTextContent(rub(520))

    fireEvent.click(within(banner).getByRole('button', { name: 'Заменить на комбо' }))

    const rows = screen.getAllByTestId('wholesale-line')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toHaveTextContent('Химичка и Электрохимичка')
    expect(screen.getByTestId('wholesale-total')).toHaveTextContent(rub(5678))
    expect(screen.queryByTestId('combo-suggestion')).toBeNull()
  })

  it('не предлагает комбо, если наборы с оптовой скидкой дешевле', async () => {
    mockProduct.mockResolvedValue(pairCombo)
    render(<WholesaleOrder />)
    await pick('хи', /Химичка 3\.0/)
    await pick('эл', /Электрохимичка/)
    // по 5 шт: 28 000 ₽ против 28 390 ₽ за пять комбо

    await waitFor(() => expect(mockProduct).toHaveBeenCalledWith('himichka-i-elektrohimichka'))
    expect(screen.queryByTestId('combo-suggestion')).toBeNull()
  })

  it('без комбо в каталоге (запрос упал) подсказки нет и блок работает', async () => {
    mockProduct.mockRejectedValue(new Error('404'))
    render(<WholesaleOrder />)
    await pick('хи', /Химичка 3\.0/)
    await pick('эл', /Электрохимичка/)
    await waitFor(() => expect(mockProduct).toHaveBeenCalled())
    expect(screen.queryByTestId('combo-suggestion')).toBeNull()
    expect(screen.getAllByTestId('wholesale-line')).toHaveLength(2)
  })
})
