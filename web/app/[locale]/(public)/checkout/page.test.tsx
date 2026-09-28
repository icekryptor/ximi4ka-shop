import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type {
  CdekCity,
  CdekCityPoints,
  CdekPoint,
  CustomerProfile,
  QuoteDestination,
} from '@ximi4ka-shop/shared'
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

const accountMock = vi.hoisted(() => ({
  me: null as import('@ximi4ka-shop/shared').CustomerProfile | null,
  // Тест гонки подменяет это отложенным промисом, чтобы решить самому,
  // когда профиль «приходит с сервера» — уже после того, как покупатель
  // успел сам что-то выбрать в блоке доставки.
  impl: null as (() => Promise<import('@ximi4ka-shop/shared').CustomerProfile | null>) | null,
}))
vi.mock('@/lib/accountApi', () => ({
  getMeOrNull: () => (accountMock.impl ? accountMock.impl() : Promise.resolve(accountMock.me)),
}))

// Город и пункты — как в песочнице СДЭК 25.09.2026 (урезаны).
const MOSCOW: CdekCity = { code: 44, name: 'Москва', fullName: 'Москва, Россия' }
const MSK65: CdekPoint = {
  code: 'MSK65',
  name: 'MSK65, Москва, ул. Динамовская',
  address: 'ул. Динамовская, 1А, 110а',
  location: [37.6634, 55.7335],
  workTime: 'Пн-Пт 10:00-20:00',
}
const MSK310: CdekPoint = {
  code: 'MSK310',
  name: 'MSK310, Москва, пр-т Мира',
  address: 'пр-т Мира, 108',
  location: [37.6385, 55.8061],
  workTime: 'Пн-Вс 09:00-21:00',
}
const MOSCOW_POINTS: CdekCityPoints = {
  city: { code: 44, name: 'Москва', location: [37.6176, 55.7558] },
  points: [MSK310, MSK65],
}

// Карта — внешний скрипт; в тестах вместо неё кнопка, которая отдаёт пункт
// так же, как настоящий onChoose, или строка «карта недоступна».
const mapMock = vi.hoisted(() => ({ available: true }))
vi.mock('@/components/checkout/CdekWidget', () => ({
  CdekWidget: ({ onChoose }: { onChoose: (office: unknown) => void }) =>
    mapMock.available ? (
      <button
        type="button"
        onClick={() =>
          onChoose({
            code: 'MSK65',
            city_code: 44,
            city: 'Москва',
            address: 'ул. Динамовская, 1А, 110а',
            location: [37.6634, 55.7335],
          })
        }
      >
        Выбрать на карте
      </button>
    ) : (
      <p role="status">Карта недоступна — выберите пункт из списка</p>
    ),
}))

// vi.fn типизирован дженериком, а не именованным неиспользуемым параметром —
// без предупреждения @typescript-eslint/no-unused-vars.
const mockSuggest = vi.fn<(q: string) => Promise<CdekCity[]>>(async () => [MOSCOW])
const mockGetPoints = vi.fn<(cityCode: number) => Promise<CdekCityPoints>>(
  async () => MOSCOW_POINTS,
)

// Цены доставки «с сервера»: ПВЗ 390 ₽ за 3–5 дней, курьер 600 ₽ за 2 дня,
// от порога — 0 ₽. Для корзины без адреса — только места и тарифы.
const mockQuoteShipping = vi.fn(async ({ destination }: { destination?: QuoteDestination }) => {
  const subtotalRub = loadCart().reduce((sum, i) => sum + i.priceRub * i.quantity, 0)
  const pvz = destination?.method === 'cdek_pvz'
  const free = subtotalRub >= (pvz ? 3000 : 5000)
  return {
    subtotalRub,
    packages: [
      {
        box: 'small' as const,
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
})

vi.mock('@/lib/api', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/api')>()
  return {
    ...actual,
    quoteShipping: (payload: never) => mockQuoteShipping(payload),
    suggestCdekCities: (q: string) => mockSuggest(q),
    getCdekPoints: (cityCode: number) => mockGetPoints(cityCode),
  }
})

beforeEach(() => {
  window.localStorage.clear()
  window.sessionStorage.clear()
  mockPush.mockReset()
  mockRedirectTo.mockReset()
  mockQuoteShipping.mockClear()
  mockSuggest.mockClear()
  mockGetPoints.mockClear()
  mapMock.available = true
  accountMock.me = null
  accountMock.impl = null
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
const ITEMS = [{ productId: seed[0]!.productId, quantity: 2 }]

function seedCart(items: CartItem[]) {
  act(() => {
    saveCart(items)
  })
}

async function chooseCity() {
  const input = screen.getByRole('combobox', { name: /город/i })
  fireEvent.focus(input)
  fireEvent.change(input, { target: { value: 'Моск' } })
  fireEvent.click(await screen.findByRole('option', { name: 'Москва' }))
  await screen.findByRole('radio', { name: /пункт выдачи сдэк — (390|бесплатно)/i })
}

async function choosePoint(name: RegExp = /MSK310/) {
  const input = await screen.findByRole('combobox', { name: /пункт получения/i })
  fireEvent.focus(input)
  fireEvent.click(screen.getByRole('option', { name }))
}

function fillContacts() {
  fireEvent.change(screen.getByLabelText(/имя/i), { target: { value: 'Мария' } })
  fireEvent.change(screen.getByLabelText(/телефон/i), { target: { value: '9123456789' } })
}

async function fillValidForm() {
  fillContacts()
  await chooseCity()
  await choosePoint()
}

function submit() {
  fireEvent.click(screen.getByRole('button', { name: /оформить заказ/i }))
}

function okCheckoutResponse(orderNumber = 'XM-2026-00042', paymentUrl: string | null = null) {
  return new Response(
    JSON.stringify({ data: { orderNumber, paymentUrl, publicToken: 'tok123' } }),
    {
      status: 201,
    },
  )
}

// Промис, который тест решает вручную — чтобы проверить гонку между ответом
// профиля покупателя и выбором, который он успел сделать в блоке доставки,
// пока этот ответ ещё не пришёл.
function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
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

  it('форма, поле «Город» и расчёт корзины без адреса', async () => {
    seedCart(seed)
    render(<CheckoutPage />)
    expect(screen.getByRole('heading', { name: 'Оформление заказа' })).toBeInTheDocument()
    expect(screen.getByLabelText(/имя/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/телефон/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/комментарий/i)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /доставка сдэк/i })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /город/i })).toBeInTheDocument()
    // Карте нужны места отправления — корзина уходит на расчёт без адреса.
    await vi.waitFor(() => expect(mockQuoteShipping).toHaveBeenCalledWith({ items: ITEMS }))
    expect(screen.getByTestId('summary-shipping')).toHaveTextContent('—')
  })

  it('над заголовком нет декоративной метки «Корзина → Оформление»', () => {
    seedCart(seed)
    render(<CheckoutPage />)
    expect(screen.queryByText(/корзина\s*→\s*оформление/i)).not.toBeInTheDocument()
  })

  it('masks the phone as +7 (XXX) XXX-XX-XX while typing', () => {
    seedCart(seed)
    render(<CheckoutPage />)
    const phone = screen.getByLabelText(/телефон/i)
    fireEvent.change(phone, { target: { value: '89123456789' } })
    expect(phone).toHaveValue('+7 (912) 345-67-89')
  })

  it('после города — цены обоих способов с сервера, в сводке — цена пункта выдачи', async () => {
    seedCart(seed)
    render(<CheckoutPage />)
    await chooseCity()
    expect(
      screen.getByRole('radio', { name: /пункт выдачи сдэк — 390\s₽, 3–5 дн\./i }),
    ).toBeChecked()
    expect(screen.getByRole('radio', { name: /курьер сдэк — 600\s₽, 2 дн\./i })).toBeInTheDocument()
    expect(mockQuoteShipping).toHaveBeenCalledWith({
      items: ITEMS,
      destination: { method: 'cdek_pvz', cityCode: 44, address: 'Москва' },
    })
    expect(mockQuoteShipping).toHaveBeenCalledWith({
      items: ITEMS,
      destination: { method: 'cdek_courier', cityCode: 44, address: 'Москва' },
    })
    expect(screen.getByTestId('summary-shipping')).toHaveTextContent('390')
    expect(screen.getByTestId('summary-total')).toHaveTextContent('2 390')
  })

  it('полный путь без карты: город → пункт из списка → заказ', async () => {
    mapMock.available = false
    const fetchMock = vi.fn(async () => okCheckoutResponse())
    vi.stubGlobal('fetch', fetchMock)
    seedCart(seed)
    render(<CheckoutPage />)
    await fillValidForm()
    expect(screen.getByText('Карта недоступна — выберите пункт из списка')).toBeInTheDocument()

    submit()

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toMatch(/\/api\/checkout$/)
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/)
    expect(JSON.parse(init.body as string)).toEqual({
      items: ITEMS,
      customer: { name: 'Мария', phone: '+79123456789' },
      delivery: {
        method: 'cdek_pvz',
        cityCode: 44,
        deliveryPointCode: 'MSK310',
        address: 'Москва, пр-т Мира, 108',
      },
    })
    await vi.waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/order/XM-2026-00042?new=1#t=tok123')
    })
    expect(loadCart()).toEqual([])
  })

  it('курьер: свои поля, адрес «город, улица, кв.» и индекс', async () => {
    const fetchMock = vi.fn(async () => okCheckoutResponse())
    vi.stubGlobal('fetch', fetchMock)
    seedCart(seed)
    render(<CheckoutPage />)
    fillContacts()
    await chooseCity()
    fireEvent.click(screen.getByRole('radio', { name: /курьер сдэк/i }))
    fireEvent.change(screen.getByLabelText(/улица, дом/i), { target: { value: 'Тверская ул., 1' } })
    fireEvent.change(screen.getByLabelText(/квартира/i), { target: { value: '12' } })
    fireEvent.change(screen.getByLabelText(/индекс/i), { target: { value: '125009' } })

    // Пока курьер пересчитывается по полному адресу — цены нет, оформить нельзя.
    const button = screen.getByRole('button', { name: /оформить заказ/i })
    expect(screen.getByRole('radio', { name: 'Курьер СДЭК — пересчитываем…' })).toBeChecked()
    expect(screen.getByTestId('summary-shipping')).toHaveTextContent('—')
    expect(button).toBeDisabled()

    // 400 мс задержки пересчёта плюс обработка мока — ближе к таймауту по
    // умолчанию (наблюдалось 815 мс), поэтому таймаут увеличен явно.
    await vi.waitFor(
      () => expect(screen.getByTestId('summary-shipping')).toHaveTextContent('600'),
      { timeout: 2000 },
    )
    expect(screen.getByTestId('summary-total')).toHaveTextContent('2 600')
    expect(button).toBeEnabled()
    const courierFull = {
      method: 'cdek_courier',
      cityCode: 44,
      postalCode: '125009',
      address: 'Москва, Тверская ул., 1, кв. 12',
    }
    // Цену посчитали ровно по тому адресу, что уйдёт в заказ.
    expect(mockQuoteShipping).toHaveBeenCalledWith({ items: ITEMS, destination: courierFull })

    submit()

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(init.body as string).delivery).toEqual(courierFull)
  })

  it('курьер: сервер не смог посчитать полный адрес — ошибка, ничего не отправляется', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    seedCart(seed)
    render(<CheckoutPage />)
    fillContacts()
    await chooseCity()
    fireEvent.click(screen.getByRole('radio', { name: /курьер сдэк/i }))
    // Пересчёт по полному адресу — на этот раз сервер не ответил.
    mockQuoteShipping.mockRejectedValueOnce(new Error('502'))
    fireEvent.change(screen.getByLabelText(/улица, дом/i), { target: { value: 'Тверская ул., 1' } })
    fireEvent.change(screen.getByLabelText(/индекс/i), { target: { value: '125009' } })

    await vi.waitFor(
      () =>
        expect(
          screen.getByRole('radio', { name: 'Курьер СДЭК — не удалось рассчитать' }),
        ).toBeChecked(),
      { timeout: 2000 },
    )
    expect(screen.getByTestId('summary-shipping')).toHaveTextContent('—')

    submit()

    expect(
      await screen.findByText('Не удалось рассчитать доставку — нажмите «Повторить расчёт»'),
    ).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('validates required fields in Russian and does not POST', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    seedCart(seed)
    render(<CheckoutPage />)

    submit()

    expect(await screen.findByText('Укажите имя')).toBeInTheDocument()
    expect(screen.getByText(/укажите телефон полностью/i)).toBeInTheDocument()
    expect(screen.getByText('Укажите город')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('после города: без пункта или без улицы — ошибка у своего поля', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    seedCart(seed)
    render(<CheckoutPage />)
    fillContacts()
    await chooseCity()
    await screen.findByRole('combobox', { name: /пункт получения/i })

    submit()
    expect(await screen.findByText('Выберите пункт получения')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: /курьер сдэк/i }))
    submit()
    expect(await screen.findByText('Укажите улицу и дом')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('пункт исчез к оформлению — ошибка у поля, выбор сброшен, список загружается заново', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            error: {
              code: 'delivery_point_unknown',
              message: 'Пункт выдачи не найден — выберите другой',
            },
          }),
          { status: 400 },
        ),
    )
    vi.stubGlobal('fetch', fetchMock)
    seedCart(seed)
    render(<CheckoutPage />)
    await fillValidForm()

    submit()

    expect(await screen.findByText('Пункт выдачи не найден — выберите другой')).toBeInTheDocument()
    await vi.waitFor(() => expect(mockGetPoints).toHaveBeenCalledTimes(2))
    expect(await screen.findByRole('combobox', { name: /пункт получения/i })).toHaveValue('')
    expect(screen.queryByText(/не удалось оформить заказ/i)).toBeNull()
    expect(loadCart()).toHaveLength(1)
  })

  it('«Выбрать» на карте ставит пункт в список', async () => {
    seedCart(seed)
    render(<CheckoutPage />)
    await chooseCity()
    // Пункт с карты сверяется со списком города — ждём, пока он загрузится.
    await screen.findByRole('combobox', { name: /пункт получения/i })
    fireEvent.click(screen.getByRole('button', { name: 'Выбрать на карте' }))
    expect(screen.getByRole('combobox', { name: /пункт получения/i })).toHaveValue(
      'MSK65 · ул. Динамовская, 1А, 110а',
    )
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
    await chooseCity()
    // 3500 ≥ 3000 → ПВЗ бесплатно
    expect(screen.getByRole('radio', { name: /пункт выдачи сдэк — бесплатно/i })).toBeChecked()
    expect(screen.getByTestId('summary-shipping')).toHaveTextContent(/бесплатно/i)
    expect(screen.getByTestId('summary-total')).toHaveTextContent('3 500')
  })

  it('передаёт ник Telegram покупателя в едином виде', async () => {
    const fetchMock = vi.fn(async () => okCheckoutResponse())
    vi.stubGlobal('fetch', fetchMock)
    seedCart(seed)
    render(<CheckoutPage />)
    await fillValidForm()
    fireEvent.change(screen.getByLabelText(/telegram/i), { target: { value: 'maria_ivanova' } })

    submit()

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

    submit()
    expect(await screen.findByText(/не удалось связаться с сервером/i)).toBeInTheDocument()

    submit()
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

    submit()

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

    submit()

    const alert = await screen.findByText(/некоторые товары закончились/i)
    expect(alert).toHaveTextContent(/обновите корзину/i)
    // Cart is preserved so the user can adjust it.
    expect(loadCart()).toHaveLength(1)
    expect(mockPush).not.toHaveBeenCalled()
  })
})

describe('чекаут для вошедшего покупателя', () => {
  const profile = {
    id: '1',
    email: 'ivan@example.com',
    telegramUsername: 'ivan_tg',
    hasTelegram: true,
    name: 'Иван',
    phone: '+79001234567',
    lastDelivery: null,
  }

  it('подставляет контакты из профиля и не показывает подсказку входа', async () => {
    accountMock.me = profile
    seedCart(seed)
    render(<CheckoutPage />)
    expect(await screen.findByDisplayValue('Иван')).toBeInTheDocument()
    expect(screen.getByLabelText(/телефон/i)).toHaveValue('+7 (900) 123-45-67')
    expect(screen.getByLabelText(/email/i)).toHaveValue('ivan@example.com')
    expect(screen.getByLabelText(/^telegram/i)).toHaveValue('@ivan_tg')
    expect(screen.queryByText(/чтобы заказ сохранился/)).toBeNull()
  })

  it('гостю — подсказка войти со ссылкой назад на чекаут', async () => {
    seedCart(seed)
    render(<CheckoutPage />)
    const link = await screen.findByRole('link', { name: 'Войдите' })
    expect(link).toHaveAttribute('href', '/account/login?next=/checkout')
  })

  it('пункт выдачи из прошлого заказа выбирается, когда загрузится список города', async () => {
    accountMock.me = {
      ...profile,
      lastDelivery: {
        method: 'cdek_pvz',
        cityCode: 44,
        cityName: 'Москва',
        deliveryPointCode: 'MSK65',
        postalCode: null,
        courierStreet: null,
      },
    }
    seedCart(seed)
    render(<CheckoutPage />)
    await vi.waitFor(() => expect(mockGetPoints).toHaveBeenCalledWith(44))
    await vi.waitFor(() =>
      expect(screen.getByRole('combobox', { name: /пункт получения/i })).toHaveValue(
        'MSK65 · ул. Динамовская, 1А, 110а',
      ),
    )
  })

  it('город из localStorage другой — доставку из прошлого заказа не трогаем', async () => {
    window.localStorage.setItem(
      'ximi4ka-checkout-city',
      JSON.stringify({ code: 137, name: 'Санкт-Петербург', fullName: 'Санкт-Петербург, Россия' }),
    )
    accountMock.me = {
      ...profile,
      lastDelivery: {
        method: 'cdek_courier',
        cityCode: 44,
        cityName: 'Москва',
        deliveryPointCode: null,
        postalCode: '101000',
        courierStreet: 'ул. Ленина, 1',
      },
    }
    seedCart(seed)
    render(<CheckoutPage />)
    expect(await screen.findByDisplayValue('Иван')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('ул. Ленина, 1')).toBeNull()
  })

  it('выбор покупателя до ответа профиля не перебивается доставкой из прошлого заказа', async () => {
    const deferred = createDeferred<CustomerProfile | null>()
    accountMock.impl = () => deferred.promise
    seedCart(seed)
    render(<CheckoutPage />)

    // Покупатель уже выбрал город и способ, пока профиль ещё грузится.
    await chooseCity()
    fireEvent.click(screen.getByRole('radio', { name: /курьер/i }))
    fireEvent.change(screen.getByLabelText(/улица, дом/i), {
      target: { value: 'ул. Своя, 5' },
    })

    // Профиль приходит с доставкой из другого заказа — другой город и способ.
    deferred.resolve({
      ...profile,
      lastDelivery: {
        method: 'cdek_pvz',
        cityCode: 999,
        cityName: 'Другой город',
        deliveryPointCode: 'ZZZ',
        postalCode: null,
        courierStreet: null,
      },
    })
    // Контакты подставляются в любом случае — по этому и ждём, что профиль
    // долетел и его эффект отработал.
    await screen.findByDisplayValue('Иван')

    expect(screen.getByRole('combobox', { name: /город/i })).toHaveValue('Москва')
    expect(screen.getByRole('radio', { name: /курьер/i })).toBeChecked()
    expect(screen.getByLabelText(/улица, дом/i)).toHaveValue('ул. Своя, 5')
  })
})
