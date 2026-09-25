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

// Виджет СДЭК — внешний скрипт с картой; в тестах вместо него две кнопки,
// которые отдают выбор так же, как настоящий onChoose.
const OFFICE = {
  city_code: 270,
  city: 'Новосибирск',
  code: 'NSK1',
  address: 'ул. Кривощековская, 15',
}
const DOOR = { formatted: 'Москва, Тверская улица, 1', postal_code: '125009', city: 'Москва' }

vi.mock('@/components/checkout/CdekWidget', () => ({
  CdekWidget: ({ onChoose }: { onChoose: (...args: unknown[]) => void }) => (
    <div>
      <button type="button" onClick={() => onChoose('office', { tariff_code: 136 }, OFFICE)}>
        Выбрать ПВЗ на карте
      </button>
      <button type="button" onClick={() => onChoose('door', { tariff_code: 137 }, DOOR)}>
        Доставить курьером
      </button>
    </div>
  ),
}))

// Цены доставки «с сервера»: ПВЗ 390 ₽ за 3–5 дней, курьер 600 ₽ за 2 дня,
// от порога — 0 ₽. Для корзины без адреса — только места и тарифы.
const mockQuoteShipping = vi.fn(
  async ({ destination }: { destination?: { method: 'cdek_pvz' | 'cdek_courier' } }) => {
    const subtotalRub = loadCart().reduce((sum, i) => sum + i.priceRub * i.quantity, 0)
    const pvz = destination?.method === 'cdek_pvz'
    const free = subtotalRub >= (pvz ? 3000 : 5000)
    return {
      subtotalRub,
      packages: [
        {
          box: 'small',
          weightG: 180,
          lengthCm: 10,
          widthCm: 10,
          heightCm: 4,
          estimated: false,
          items: [],
        },
      ],
      tariffs: { pvz: 136, courier: 137 },
      quote: destination
        ? {
            method: destination.method,
            tariffCode: pvz ? 136 : 137,
            customerPriceRub: free ? 0 : pvz ? 390 : 600,
            cdekPriceRub: pvz ? 390 : 600,
            periodMin: pvz ? 3 : 2,
            periodMax: pvz ? 5 : 2,
            free,
            source: 'cdek' as const,
          }
        : null,
    }
  },
)

vi.mock('@/lib/api', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/api')>()
  return { ...actual, quoteShipping: (payload: never) => mockQuoteShipping(payload) }
})

beforeEach(() => {
  window.localStorage.clear()
  window.sessionStorage.clear()
  mockPush.mockReset()
  mockRedirectTo.mockReset()
  mockQuoteShipping.mockClear()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// Subtotal 2000 ₽ — ниже обоих порогов бесплатной доставки.
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

async function chooseOffice() {
  fireEvent.click(await screen.findByRole('button', { name: /выбрать пвз/i }))
  await screen.findByText(/3–5 дн/)
}

async function fillValidForm() {
  fireEvent.change(screen.getByLabelText(/имя/i), { target: { value: 'Мария' } })
  fireEvent.change(screen.getByLabelText(/телефон/i), {
    target: { value: '9123456789' },
  })
  await chooseOffice()
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

  it('renders the heading, form fields and the СДЭК map', async () => {
    seedCart(seed)
    render(<CheckoutPage />)
    expect(screen.getByRole('heading', { name: 'Оформление заказа' })).toBeInTheDocument()
    expect(screen.getByLabelText(/имя/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/телефон/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/комментарий/i)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /доставка сдэк/i })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /выбрать пвз/i })).toBeInTheDocument()
    // Карте нужны места отправления — корзина уходит на расчёт без адреса.
    expect(mockQuoteShipping).toHaveBeenCalledWith({
      items: [{ productId: seed[0]!.productId, quantity: 2 }],
    })
    // До выбора точки доставка не посчитана.
    expect(screen.getByTestId('summary-shipping')).toHaveTextContent('—')
  })

  it('masks the phone as +7 (XXX) XXX-XX-XX while typing', () => {
    seedCart(seed)
    render(<CheckoutPage />)
    const phone = screen.getByLabelText(/телефон/i)
    fireEvent.change(phone, { target: { value: '89123456789' } })
    expect(phone).toHaveValue('+7 (912) 345-67-89')
  })

  it('после выбора ПВЗ показывает адрес, срок и цену доставки с сервера', async () => {
    seedCart(seed)
    render(<CheckoutPage />)
    await chooseOffice()

    expect(screen.getByTestId('delivery-choice')).toHaveTextContent(
      'Новосибирск, ул. Кривощековская, 15',
    )
    expect(screen.getByTestId('delivery-choice')).toHaveTextContent('3–5 дн.')
    expect(screen.getByTestId('summary-shipping')).toHaveTextContent('390')
    expect(screen.getByTestId('summary-total')).toHaveTextContent('2 390')
    expect(mockQuoteShipping).toHaveBeenLastCalledWith({
      items: [{ productId: seed[0]!.productId, quantity: 2 }],
      destination: {
        method: 'cdek_pvz',
        cityCode: 270,
        deliveryPointCode: 'NSK1',
        address: 'Новосибирск, ул. Кривощековская, 15',
      },
    })
  })

  it('курьер: спрашивает квартиру и считает свою цену', async () => {
    seedCart(seed)
    render(<CheckoutPage />)
    fireEvent.click(await screen.findByRole('button', { name: /курьером/i }))
    await screen.findByText(/2 дн/)
    expect(screen.getByLabelText(/квартира/i)).toBeInTheDocument()
    expect(screen.getByTestId('summary-shipping')).toHaveTextContent('600')
    expect(screen.getByTestId('summary-total')).toHaveTextContent('2 600')
  })

  it('shows «Бесплатно» when the subtotal clears the free-shipping threshold', async () => {
    seedCart([
      {
        productId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        slug: 'kit-b',
        name: 'Набор B',
        priceRub: 3500,
        quantity: 1,
      },
    ])
    render(<CheckoutPage />)
    await chooseOffice()
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
    expect(screen.getByText(/выберите пункт выдачи или адрес/i)).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('submits the order with an Idempotency-Key, clears the cart and routes to the status page', async () => {
    const fetchMock = vi.fn(async () => okCheckoutResponse())
    vi.stubGlobal('fetch', fetchMock)
    seedCart(seed)
    render(<CheckoutPage />)
    await fillValidForm()

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
      delivery: {
        method: 'cdek_pvz',
        cityCode: 270,
        deliveryPointCode: 'NSK1',
        address: 'Новосибирск, ул. Кривощековская, 15',
      },
    })

    await vi.waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/order/XM-2026-00042?new=1')
    })
    expect(loadCart()).toEqual([])
  })

  it('курьерский заказ уходит с геокодированным адресом и квартирой', async () => {
    const fetchMock = vi.fn(async () => okCheckoutResponse())
    vi.stubGlobal('fetch', fetchMock)
    seedCart(seed)
    render(<CheckoutPage />)
    fireEvent.change(screen.getByLabelText(/имя/i), { target: { value: 'Мария' } })
    fireEvent.change(screen.getByLabelText(/телефон/i), { target: { value: '9123456789' } })
    fireEvent.click(await screen.findByRole('button', { name: /курьером/i }))
    await screen.findByText(/2 дн/)
    fireEvent.change(screen.getByLabelText(/квартира/i), { target: { value: 'кв. 12' } })

    fireEvent.click(screen.getByRole('button', { name: /оформить заказ/i }))

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(init.body as string).delivery).toEqual({
      method: 'cdek_courier',
      postalCode: '125009',
      address: 'Москва, Тверская улица, 1, кв. 12',
    })
  })

  it('передаёт ник Telegram покупателя в едином виде', async () => {
    const fetchMock = vi.fn(async () => okCheckoutResponse())
    vi.stubGlobal('fetch', fetchMock)
    seedCart(seed)
    render(<CheckoutPage />)
    await fillValidForm()
    fireEvent.change(screen.getByLabelText(/telegram/i), { target: { value: 'maria_ivanova' } })

    fireEvent.click(screen.getByRole('button', { name: /оформить заказ/i }))

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(init.body as string).customer).toEqual({
      name: 'Мария',
      phone: '+79123456789',
      telegram: '@maria_ivanova',
    })
  })

  it('reuses the same Idempotency-Key when retrying after a network failure', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('failed to fetch'))
      .mockResolvedValueOnce(okCheckoutResponse())
    vi.stubGlobal('fetch', fetchMock)
    seedCart(seed)
    render(<CheckoutPage />)
    await fillValidForm()

    fireEvent.click(screen.getByRole('button', { name: /оформить заказ/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/не удалось связаться с сервером/i)

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
    await fillValidForm()

    fireEvent.click(screen.getByRole('button', { name: /оформить заказ/i }))

    await vi.waitFor(() => {
      expect(mockRedirectTo).toHaveBeenCalledWith('https://securepay.tinkoff.ru/pay/1')
    })
    expect(mockPush).not.toHaveBeenCalled()
    expect(loadCart()).toEqual([])
  })

  it('shows the server message on 409 (availability changed)', async () => {
    const fetchMock = vi.fn(
      async () =>
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
    await fillValidForm()

    fireEvent.click(screen.getByRole('button', { name: /оформить заказ/i }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/некоторые товары закончились/i)
    expect(alert).toHaveTextContent(/обновите корзину/i)
    // Cart is preserved so the user can adjust it.
    expect(loadCart()).toHaveLength(1)
    expect(mockPush).not.toHaveBeenCalled()
  })
})
