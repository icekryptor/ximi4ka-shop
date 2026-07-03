import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { SearchResult } from '@ximi4ka-shop/shared'
import { HeaderSearch } from './HeaderSearch'

const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, prefetch: vi.fn() }),
}))

const mockSearch = vi.fn<(q: string, opts?: { signal?: AbortSignal }) => Promise<SearchResult>>()
vi.mock('@/lib/api', () => ({
  searchCatalog: (q: string, opts?: { signal?: AbortSignal }) => mockSearch(q, opts),
}))

const sample: SearchResult = {
  products: [
    { slug: 'himichka-30', name: 'Химичка 3.0', priceRub: 1500, image: 'https://cdn/x.png' },
    { slug: 'slizi', name: 'Слаймы', priceRub: 490, image: null },
  ],
  posts: [{ slug: 'sky', title: 'Почему небо голубое' }],
}

function type(value: string) {
  const input = screen.getByRole('searchbox')
  fireEvent.focus(input)
  fireEvent.change(input, { target: { value } })
  return input
}

beforeEach(() => {
  vi.useFakeTimers()
  mockPush.mockReset()
  mockSearch.mockReset()
  mockSearch.mockResolvedValue(sample)
})

afterEach(() => {
  vi.runOnlyPendingTimers()
  vi.useRealTimers()
  cleanup()
})

describe('HeaderSearch', () => {
  it('renders a combobox with a magnifier input and placeholder', () => {
    render(<HeaderSearch />)
    expect(screen.getByRole('combobox')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Поиск по каталогу…')).toBeInTheDocument()
  })

  it('does not query the API for input shorter than 2 characters', () => {
    render(<HeaderSearch />)
    type('х')
    act(() => vi.advanceTimersByTime(400))
    expect(mockSearch).not.toHaveBeenCalled()
  })

  it('debounces the request (~250ms) and shows product + post results', async () => {
    render(<HeaderSearch />)
    type('химич')

    act(() => vi.advanceTimersByTime(200))
    expect(mockSearch).not.toHaveBeenCalled()

    act(() => vi.advanceTimersByTime(60))
    expect(mockSearch).toHaveBeenCalledWith('химич', expect.objectContaining({ signal: expect.anything() }))

    await act(async () => {
      await Promise.resolve()
    })

    const listbox = screen.getByRole('listbox')
    expect(within(listbox).getByText('Химичка 3.0')).toBeInTheDocument()
    expect(within(listbox).getByText('Слаймы')).toBeInTheDocument()
    expect(within(listbox).getByText('Почему небо голубое')).toBeInTheDocument()
  })

  it('collapses multiple keystrokes into a single request', async () => {
    render(<HeaderSearch />)
    const input = type('х')
    fireEvent.change(input, { target: { value: 'хи' } })
    fireEvent.change(input, { target: { value: 'хим' } })
    act(() => vi.advanceTimersByTime(300))
    expect(mockSearch).toHaveBeenCalledTimes(1)
    expect(mockSearch).toHaveBeenCalledWith('хим', expect.anything())
  })

  it('shows "Ничего не найдено" when there are no matches', async () => {
    mockSearch.mockResolvedValue({ products: [], posts: [] })
    render(<HeaderSearch />)
    type('пусто')
    act(() => vi.advanceTimersByTime(300))
    await act(async () => {
      await Promise.resolve()
    })
    expect(screen.getByRole('listbox')).toHaveTextContent('Ничего не найдено')
  })

  it('navigates the options with arrow keys and reflects aria-activedescendant', async () => {
    render(<HeaderSearch />)
    const input = type('химич')
    act(() => vi.advanceTimersByTime(300))
    await act(async () => {
      await Promise.resolve()
    })

    expect(input).not.toHaveAttribute('aria-activedescendant')

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    const options = screen.getAllByRole('option')
    expect(options[0]).toHaveAttribute('aria-selected', 'true')
    expect(input.getAttribute('aria-activedescendant')).toBe(options[0].id)

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(screen.getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true')

    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true')
  })

  it('Enter on the highlighted option routes to that item', async () => {
    render(<HeaderSearch />)
    const input = type('химич')
    act(() => vi.advanceTimersByTime(300))
    await act(async () => {
      await Promise.resolve()
    })

    fireEvent.keyDown(input, { key: 'ArrowDown' }) // product 0
    fireEvent.keyDown(input, { key: 'ArrowDown' }) // product 1
    fireEvent.keyDown(input, { key: 'ArrowDown' }) // post 0
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(mockPush).toHaveBeenCalledWith('/blog/sky')
  })

  it('product options link to /product/[slug]', async () => {
    render(<HeaderSearch />)
    type('химич')
    act(() => vi.advanceTimersByTime(300))
    await act(async () => {
      await Promise.resolve()
    })
    const productOption = screen.getByRole('option', { name: /Химичка 3.0/ })
    expect(productOption).toHaveAttribute('href', '/product/himichka-30')
  })

  it('Escape closes the preview', async () => {
    render(<HeaderSearch />)
    const input = type('химич')
    act(() => vi.advanceTimersByTime(300))
    await act(async () => {
      await Promise.resolve()
    })
    expect(screen.getByRole('listbox')).toBeInTheDocument()

    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })
})
