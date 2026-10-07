import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { Product } from '@ximi4ka-shop/shared'
import { WholesaleCatalog } from './WholesaleCatalog'

const listProductsByCategory = vi.fn()

vi.mock('@/lib/api', () => ({
  listProductsByCategory: (...args: unknown[]) => listProductsByCategory(...args),
}))

function product(overrides: Partial<Product> & Pick<Product, 'id' | 'slug' | 'name'>): Product {
  return {
    sku: overrides.id,
    shortDescription: '',
    priceRub: 1000,
    compareAtPriceRub: null,
    stockStatus: 'in_stock',
    images: [{ url: `https://cdn.test/${overrides.slug}.jpg` }],
    ...overrides,
  } as Product
}

const KITS = [
  product({ id: 'k1', slug: 'himichka-30', name: 'Химичка 30', priceRub: 2990 }),
  // Набор без оптового правила — в каталог не попадает.
  product({ id: 'k2', slug: 'obychnyi-nabor', name: 'Обычный набор' }),
  product({
    id: 'k3',
    slug: 'elektrohimichka',
    name: 'Электрохимичка',
    stockStatus: 'out_of_stock',
  }),
]
const REAGENTS = [
  product({ id: 'r1', slug: 'soda', name: 'Сода', priceRub: 150 }),
  // Набор, который заодно лежит в реактивах, во вкладке «Реактивы» не показываем.
  product({ id: 'r9', slug: 'elektrohimichka', name: 'Набор из реактивов' }),
]

function mockApi() {
  listProductsByCategory.mockImplementation((slug: string) =>
    Promise.resolve({
      data: slug === 'kits' ? KITS : slug === 'reagents' ? REAGENTS : [],
      pagination: { limit: 24, offset: 0, total: 0 },
    }),
  )
}

describe('WholesaleCatalog', () => {
  beforeEach(() => {
    listProductsByCategory.mockReset()
    mockApi()
  })
  afterEach(cleanup)

  it('показывает вкладки категорий и грузит первую', async () => {
    render(<WholesaleCatalog onPick={vi.fn()} stagedIds={new Set()} />)

    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((t) => t.textContent)).toEqual(['Наборы', 'Реактивы', 'Оборудование'])
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')

    expect(await screen.findByText('Химичка 30')).toBeInTheDocument()
    expect(listProductsByCategory).toHaveBeenCalledWith(
      'kits',
      expect.objectContaining({ limit: 200 }),
    )
  })

  it('оставляет только товары с оптовым правилом и показывает скидку', async () => {
    render(<WholesaleCatalog onPick={vi.fn()} stagedIds={new Set()} />)

    await screen.findByText('Химичка 30')
    expect(screen.queryByText('Обычный набор')).not.toBeInTheDocument()
    // Бейдж у обоих наборов с оптовым правилом (Химичка 30 и Электрохимичка).
    expect(screen.getAllByText('от 5 шт: −299 ₽ с набора')).toHaveLength(2)
  })

  it('переключает вкладку и грузит категорию один раз', async () => {
    render(<WholesaleCatalog onPick={vi.fn()} stagedIds={new Set()} />)
    await screen.findByText('Химичка 30')

    fireEvent.click(screen.getByRole('tab', { name: 'Реактивы' }))
    expect(await screen.findByText('Сода')).toBeInTheDocument()
    expect(screen.getByText('от 5 шт: −15%')).toBeInTheDocument()
    expect(screen.queryByText('Химичка 30')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'Наборы' }))
    expect(await screen.findByText('Химичка 30')).toBeInTheDocument()
    expect(listProductsByCategory).toHaveBeenCalledTimes(2)
  })

  it('«В заказ» передаёт товар в список в формате поиска', async () => {
    const onPick = vi.fn()
    render(<WholesaleCatalog onPick={onPick} stagedIds={new Set()} />)
    await screen.findByText('Химичка 30')

    fireEvent.click(screen.getByRole('button', { name: 'Химичка 30: добавить в заказ' }))

    expect(onPick).toHaveBeenCalledWith({
      id: 'k1',
      slug: 'himichka-30',
      name: 'Химичка 30',
      priceRub: 2990,
      image: 'https://cdn.test/himichka-30.jpg',
      stockStatus: 'in_stock',
      categories: ['kits'],
    })
  })

  it('товар, который уже в заказе, помечен и не добавляется повторно', async () => {
    const onPick = vi.fn()
    render(<WholesaleCatalog onPick={onPick} stagedIds={new Set(['k1'])} />)
    await screen.findByText('Химичка 30')

    const button = screen.getByRole('button', { name: 'Химичка 30: уже в заказе' })
    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(button).toHaveTextContent('В заказе')
    fireEvent.click(button)
    expect(onPick).not.toHaveBeenCalled()
  })

  it('после «В заказ» фокус остаётся на кнопке и добавление озвучивается', async () => {
    render(<WholesaleCatalog onPick={vi.fn()} stagedIds={new Set()} />)
    await screen.findByText('Химичка 30')

    const button = screen.getByRole('button', { name: 'Химичка 30: добавить в заказ' })
    button.focus()
    fireEvent.click(button)

    expect(document.activeElement).toBe(button)
    expect(screen.getByRole('status')).toHaveTextContent('Химичка 30 добавлен в заказ')
  })

  it('набор из групп скидок не попадает во вкладку реактивов', async () => {
    render(<WholesaleCatalog onPick={vi.fn()} stagedIds={new Set()} />)
    await screen.findByText('Химичка 30')

    fireEvent.click(screen.getByRole('tab', { name: 'Реактивы' }))
    expect(await screen.findByText('Сода')).toBeInTheDocument()
    expect(screen.queryByText('Набор из реактивов')).not.toBeInTheDocument()
  })

  it('поздний ответ уже закрытой вкладки не показывается в другой', async () => {
    let resolveReagents: (v: unknown) => void = () => {}
    listProductsByCategory.mockImplementation((slug: string) =>
      slug === 'reagents'
        ? new Promise((resolve) => {
            resolveReagents = resolve
          })
        : Promise.resolve({ data: KITS, pagination: { limit: 200, offset: 0, total: 3 } }),
    )
    render(<WholesaleCatalog onPick={vi.fn()} stagedIds={new Set()} />)
    await screen.findByText('Химичка 30')

    fireEvent.click(screen.getByRole('tab', { name: 'Реактивы' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Наборы' }))
    resolveReagents({ data: REAGENTS, pagination: { limit: 200, offset: 0, total: 2 } })

    expect(await screen.findByText('Химичка 30')).toBeInTheDocument()
    expect(screen.queryByText('Сода')).not.toBeInTheDocument()
  })

  it('товар не в наличии нельзя добавить', async () => {
    render(<WholesaleCatalog onPick={vi.fn()} stagedIds={new Set()} />)
    await screen.findByText('Электрохимичка')

    const card = screen.getByText('Электрохимичка').closest('li') as HTMLElement
    expect(
      within(card).getByRole('button', { name: 'Электрохимичка: нет в наличии' }),
    ).toBeDisabled()
    expect(within(card).getByRole('button')).toHaveTextContent('Нет в наличии')
  })

  it('пустая категория показывает сообщение', async () => {
    render(<WholesaleCatalog onPick={vi.fn()} stagedIds={new Set()} />)
    await screen.findByText('Химичка 30')

    fireEvent.click(screen.getByRole('tab', { name: 'Оборудование' }))
    expect(await screen.findByText('В этой категории пока нет товаров')).toBeInTheDocument()
  })

  it('при ошибке предлагает повторить и загружает снова', async () => {
    listProductsByCategory.mockRejectedValueOnce(new Error('network'))
    render(<WholesaleCatalog onPick={vi.fn()} stagedIds={new Set()} />)

    const retry = await screen.findByRole('button', { name: 'Повторить' })
    expect(screen.getByText('Не удалось загрузить каталог')).toBeInTheDocument()

    fireEvent.click(retry)
    expect(await screen.findByText('Химичка 30')).toBeInTheDocument()
    expect(listProductsByCategory).toHaveBeenCalledTimes(2)
  })

  it('стрелки листают карусель на одну карточку', async () => {
    render(<WholesaleCatalog onPick={vi.fn()} stagedIds={new Set()} />)
    await screen.findByText('Химичка 30')

    const track = screen.getByTestId('wholesale-catalog-track')
    const scrollBy = vi.fn()
    Object.defineProperty(track, 'scrollBy', { value: scrollBy, configurable: true })
    Object.defineProperty(track, 'clientWidth', { value: 600, configurable: true })
    Object.defineProperty(track, 'scrollWidth', { value: 1200, configurable: true })
    fireEvent.scroll(track)

    const next = screen.getByRole('button', { name: 'Следующие товары' })
    await waitFor(() => expect(next).toBeEnabled())
    expect(screen.getByRole('button', { name: 'Предыдущие товары' })).toBeDisabled()

    fireEvent.click(next)
    expect(scrollBy).toHaveBeenCalledWith(expect.objectContaining({ left: expect.any(Number) }))
    expect(scrollBy.mock.calls[0][0].left).toBeGreaterThan(0)

    // После прокрутки «назад» оживает, у правого края «вперёд» гаснет.
    track.scrollLeft = 600
    fireEvent.scroll(track)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Предыдущие товары' })).toBeEnabled(),
    )
    expect(next).toBeDisabled()
  })

  it('вкладки переключаются стрелками клавиатуры', async () => {
    render(<WholesaleCatalog onPick={vi.fn()} stagedIds={new Set()} />)
    await screen.findByText('Химичка 30')

    fireEvent.keyDown(screen.getByRole('tab', { name: 'Наборы' }), { key: 'ArrowRight' })
    expect(screen.getByRole('tab', { name: 'Реактивы' })).toHaveAttribute('aria-selected', 'true')
    expect(await screen.findByText('Сода')).toBeInTheDocument()
  })
})
