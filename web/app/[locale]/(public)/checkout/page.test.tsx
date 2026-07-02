import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import CheckoutPage from './page'
import { loadCart, saveCart, type CartItem } from '@/lib/cart'

const mockPush = vi.fn<(path: string) => void>()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

const mockRedirectTo = vi.fn<(url: string) => void>()

vi.mock('@/lib/checkout', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/checkout')>()
  return { ...actual, redirectTo: (url: string) => mockRedirectTo(url) }
})

beforeEach(() => {
  window.localStorage.clear()
  window.sessionStorage.clear()
  mockPush.mockReset()
  mockRedirectTo.mockReset()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// Subtotal 2000 ₽ — below both free-shipping thresholds, so the delivery
// price switch is observable: ПВЗ 350 ₽ vs курьер 500 ₽.
const seed: CartItem[] = [
  {
    productId: '3c6c508a-9f55-4d0f-a53e-0f0e0a0b0c0d',
    slug: 'kit-a',
    name: 'Набор A',
    priceRub: 1000,
    quantity: 2,
  },
]

function seedCart(items: CartItem[]) {
  act(() => {
    saveCart(items)
  })
}

function fillValidForm() {
  fireEvent.change(screen.getByLabelText(/имя/i), { target: { value: 'Мария' } })
  fireEvent.change(screen.getByLabelText(/телефон/i), {
    target: { value: '9123456789' },
  })
  fireEvent.change(screen.getByLabelText(/адрес/i), {
    target: { value: 'Москва, ул. Ленина, 1' },
  })
}

function okCheckoutResponse(orderNumber = 'XM-2026-00042', paymentUrl: string | null = null) {
  return new Response(JSON.stringify({ data: { orderNumber, paymentUrl } }), {
    status: 201,
  })
}

describe('/checkout page', () => {
  it('shows the empty-cart state with a catalog CTA when the cart is empty', () => {
    render(<CheckoutPage />)
    expect(screen.getByText(/корзина пуста/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /открыть каталог/i })).toHaveAttribute(
      'href',
      '/categories',
    )
  })

  it('renders the heading and all form fields', () => {
    seedCart(seed)
    render(<CheckoutPage />)
    expect(
      screen.getByRole('heading', { name: 'Оформление заказа' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText(/имя/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/телефон/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/адрес/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/комментарий/i)).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /пункт выдачи/i })).toBeChecked()
    expect(screen.getByRole('radio', { name: /курьером/i })).not.toBeChecked()
  })

  it('masks the phone as +7 (XXX) XXX-XX-XX while typing', () => {
    seedCart(seed)
    render(<CheckoutPage />)
    const phone = screen.getByLabelText(/телефон/i)
    fireEvent.change(phone, { target: { value: '89123456789' } })
    expect(phone).toHaveValue('+7 (912) 345-67-89')
  })

  it('recalculates delivery and total when switching СДЭК method', () => {
    seedCart(seed)
    render(<CheckoutPage />)
    // ПВЗ по умолчанию: 2000 + 350
    expect(screen.getByTestId('summary-shipping')).toHaveTextContent('350')
    expect(screen.getByTestId('summary-total')).toHaveTextContent('2 350')

    fireEvent.click(screen.getByRole('radio', { name: /курьером/i }))
    expect(screen.getByTestId('summary-shipping')).toHaveTextContent('500')
    expect(screen.getByTestId('summary-total')).toHaveTextContent('2 500')
  })

  it('shows «Бесплатно» when the subtotal clears the free-shipping threshold', () => {
    seedCart([
      { productId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', slug: 'kit-b', name: 'Набор B', priceRub: 3500, quantity: 1 },
    ])
    render(<CheckoutPage />)
    // 3500 ≥ 3000 → ПВЗ бесплатно
    expect(screen.getByTestId('summary-shipping')).toHaveTextContent(/бесплатно/i)
    expect(screen.getByTestId('summary-total')).toHaveTextContent('3 500')
  })

  it('validates required fields in Russian and does not POST', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    seedCart(seed)
    render(<CheckoutPage />)

    fireEvent.click(screen.getByRole('button', { name: /оформить заказ/i }))

    expect(await screen.findByText('Укажите имя')).toBeInTheDocument()
    expect(screen.getByText(/укажите телефон полностью/i)).toBeInTheDocument()
    expect(screen.getByText('Укажите адрес доставки')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('submits the order with an Idempotency-Key, clears the cart and routes to the status page', async () => {
    const fetchMock = vi.fn(async () => okCheckoutResponse())
    vi.stubGlobal('fetch', fetchMock)
    seedCart(seed)
    render(<CheckoutPage />)
    fillValidForm()

    fireEvent.click(screen.getByRole('button', { name: /оформить заказ/i }))

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toMatch(/\/api\/checkout$/)
    expect(init.method).toBe('POST')
    const headers = init.headers as Record<string, string>
    expect(headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/)
    expect(JSON.parse(init.body as string)).toEqual({
      items: [{ productId: seed[0]!.productId, quantity: 2 }],
      customer: { name: 'Мария', phone: '+79123456789' },
      delivery: { method: 'cdek_pvz', address: 'Москва, ул. Ленина, 1' },
    })

    await vi.waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/order/XM-2026-00042?new=1')
    })
    expect(loadCart()).toEqual([])
  })

  it('reuses the same Idempotency-Key when retrying after a network failure', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('failed to fetch'))
      .mockResolvedValueOnce(okCheckoutResponse())
    vi.stubGlobal('fetch', fetchMock)
    seedCart(seed)
    render(<CheckoutPage />)
    fillValidForm()

    fireEvent.click(screen.getByRole('button', { name: /оформить заказ/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /не удалось связаться с сервером/i,
    )

    fireEvent.click(screen.getByRole('button', { name: /оформить заказ/i }))
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))

    const firstKey = (fetchMock.mock.calls[0]![1].headers as Record<string, string>)[
      'Idempotency-Key'
    ]
    const secondKey = (fetchMock.mock.calls[1]![1].headers as Record<string, string>)[
      'Idempotency-Key'
    ]
    expect(secondKey).toBe(firstKey)
  })

  it('redirects to paymentUrl when the provider returns one', async () => {
    const fetchMock = vi.fn(async () =>
      okCheckoutResponse('XM-2026-00043', 'https://securepay.tinkoff.ru/pay/1'),
    )
    vi.stubGlobal('fetch', fetchMock)
    seedCart(seed)
    render(<CheckoutPage />)
    fillValidForm()

    fireEvent.click(screen.getByRole('button', { name: /оформить заказ/i }))

    await vi.waitFor(() => {
      expect(mockRedirectTo).toHaveBeenCalledWith('https://securepay.tinkoff.ru/pay/1')
    })
    expect(mockPush).not.toHaveBeenCalled()
    expect(loadCart()).toEqual([])
  })

  it('shows the server message on 409 (availability changed)', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          error: { code: 'out_of_stock', message: 'Некоторые товары закончились' },
        }),
        { status: 409 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    seedCart(seed)
    render(<CheckoutPage />)
    fillValidForm()

    fireEvent.click(screen.getByRole('button', { name: /оформить заказ/i }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/некоторые товары закончились/i)
    expect(alert).toHaveTextContent(/обновите корзину/i)
    // Cart is preserved so the user can adjust it.
    expect(loadCart()).toHaveLength(1)
    expect(mockPush).not.toHaveBeenCalled()
  })
})
