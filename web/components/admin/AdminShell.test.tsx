import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { AdminShell } from './AdminShell'

const mockPathname = vi.fn<() => string>(() => '/admin')
const mockReplace = vi.fn<(path: string) => void>()
const mockRefresh = vi.fn<() => void>()

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname(),
  useRouter: () => ({ replace: mockReplace, refresh: mockRefresh }),
}))

beforeEach(() => {
  mockPathname.mockReturnValue('/admin')
  mockReplace.mockReset()
  mockRefresh.mockReset()
  document.cookie = 'ximi4ka_shop_csrf=test-csrf; path=/'
  globalThis.fetch = vi.fn(async () =>
    new Response('{}', { status: 200 }),
  ) as typeof fetch
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const admin = { id: 'u-1', email: 'admin@example.com', role: 'admin' }

describe('AdminShell', () => {
  it('renders all 8 sidebar nav items with correct hrefs', () => {
    render(
      <AdminShell admin={admin}>
        <div>content</div>
      </AdminShell>,
    )
    const nav = screen.getByRole('navigation', { name: 'Админ навигация' })
    const labels: Array<[string, string]> = [
      ['Главная', '/admin'],
      ['Товары', '/admin/products'],
      ['Категории', '/admin/categories'],
      ['Страницы', '/admin/pages'],
      ['Заказы', '/admin/orders'],
      ['Редиректы', '/admin/redirects'],
      ['Медиа', '/admin/media'],
      ['Настройки', '/admin/settings'],
    ]
    for (const [label, href] of labels) {
      expect(within(nav).getByRole('link', { name: label })).toHaveAttribute('href', href)
    }
  })

  it('renders admin email and role in the topbar', () => {
    render(
      <AdminShell admin={admin}>
        <div>content</div>
      </AdminShell>,
    )
    expect(screen.getByText('admin@example.com')).toBeInTheDocument()
    expect(screen.getByText('admin')).toBeInTheDocument()
  })

  it('marks the exact /admin link active on dashboard', () => {
    mockPathname.mockReturnValue('/admin')
    render(
      <AdminShell admin={admin}>
        <div>content</div>
      </AdminShell>,
    )
    const nav = screen.getByRole('navigation', { name: 'Админ навигация' })
    expect(within(nav).getByRole('link', { name: 'Главная' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(within(nav).getByRole('link', { name: 'Товары' })).not.toHaveAttribute(
      'aria-current',
    )
  })

  it('does not mark /admin active on /admin/products (exact match)', () => {
    mockPathname.mockReturnValue('/admin/products')
    render(
      <AdminShell admin={admin}>
        <div>content</div>
      </AdminShell>,
    )
    const nav = screen.getByRole('navigation', { name: 'Админ навигация' })
    expect(within(nav).getByRole('link', { name: 'Главная' })).not.toHaveAttribute(
      'aria-current',
    )
    expect(within(nav).getByRole('link', { name: 'Товары' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('treats nested product route as active "Товары"', () => {
    mockPathname.mockReturnValue('/admin/products/some-product')
    render(
      <AdminShell admin={admin}>
        <div>content</div>
      </AdminShell>,
    )
    const nav = screen.getByRole('navigation', { name: 'Админ навигация' })
    expect(within(nav).getByRole('link', { name: 'Товары' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('renders children in the main area', () => {
    render(
      <AdminShell admin={admin}>
        <div data-testid="child">hello child</div>
      </AdminShell>,
    )
    expect(screen.getByTestId('child')).toHaveTextContent('hello child')
  })

  it('clicking "Выйти" calls logout endpoint with CSRF header and redirects', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
    globalThis.fetch = fetchMock as unknown as typeof fetch

    render(
      <AdminShell admin={admin}>
        <div>content</div>
      </AdminShell>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Выйти' }))

    // Let the async handler resolve.
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const [url, init] = call
    expect(url).toMatch(/\/api\/auth\/logout$/)
    expect(init.method).toBe('POST')
    expect(init.credentials).toBe('include')
    expect((init.headers as Record<string, string>)['X-CSRF-Token']).toBe('test-csrf')

    await vi.waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/admin/login')
    })
    expect(mockRefresh).toHaveBeenCalled()
  })
})
