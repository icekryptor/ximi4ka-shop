import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { WholesaleSearch } from './WholesaleSearch'

const searchCatalog = vi.fn()
vi.mock('@/lib/api', () => ({
  searchCatalog: (...args: unknown[]) => searchCatalog(...args),
}))

describe('WholesaleSearch — понятно, что это поиск', () => {
  beforeEach(() => {
    searchCatalog.mockReset()
    searchCatalog.mockResolvedValue({ products: [], posts: [] })
  })
  afterEach(cleanup)

  it('над полем есть видимая подпись, связанная с полем', () => {
    render(<WholesaleSearch onPick={vi.fn()} />)

    const input = screen.getByRole('searchbox')
    expect(screen.getByText('Найдите товар по названию')).toBeInTheDocument()
    expect(input).toHaveAccessibleName('Найдите товар по названию')
  })

  it('плейсхолдер подсказывает примеры запроса', () => {
    render(<WholesaleSearch onPick={vi.fn()} />)

    expect(screen.getByRole('searchbox')).toHaveAttribute('placeholder', 'Пробирка, реактив')
  })

  it('есть кнопка «Найти», она возвращает фокус в поле', () => {
    render(<WholesaleSearch onPick={vi.fn()} />)

    const button = screen.getByRole('button', { name: 'Найти' })
    fireEvent.click(button)
    expect(document.activeElement).toBe(screen.getByRole('searchbox'))
  })

  it('поле лежит внутри формы-поиска', () => {
    render(<WholesaleSearch onPick={vi.fn()} />)

    expect(screen.getByRole('search')).toContainElement(screen.getByRole('searchbox'))
  })

  it('Enter на выбранной подсказке добавляет товар и не отправляет форму', async () => {
    searchCatalog.mockResolvedValue({
      products: [
        {
          id: 'p1',
          slug: 'probirka',
          name: 'Пробирка',
          priceRub: 29,
          image: null,
          stockStatus: 'in_stock',
          categories: ['equipment'],
        },
      ],
      posts: [],
    })
    const onPick = vi.fn()
    render(<WholesaleSearch onPick={onPick} />)
    const input = screen.getByRole('searchbox')

    fireEvent.change(input, { target: { value: 'про' } })
    await screen.findByRole('option', { name: /Пробирка/ })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    const notPrevented = fireEvent.keyDown(input, { key: 'Enter' })

    expect(notPrevented).toBe(false)
    expect(onPick).toHaveBeenCalledTimes(1)
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }))
  })

  it('«Найти» раскрывает выдачу для уже введённого запроса', async () => {
    searchCatalog.mockResolvedValue({
      products: [
        {
          id: 'p1',
          slug: 'probirka',
          name: 'Пробирка',
          priceRub: 29,
          image: null,
          stockStatus: 'in_stock',
          categories: ['equipment'],
        },
      ],
      posts: [],
    })
    render(<WholesaleSearch onPick={vi.fn()} />)
    const input = screen.getByRole('searchbox')

    fireEvent.change(input, { target: { value: 'про' } })
    await screen.findByRole('option', { name: /Пробирка/ })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Найти' }))
    expect(await screen.findByRole('listbox')).toBeInTheDocument()
  })
})
