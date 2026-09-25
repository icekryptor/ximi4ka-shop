import { beforeEach, describe, it, expect, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type {
  CdekCity,
  CdekCityPoints,
  CdekPoint,
  DeliveryQuote,
  QuoteDestination,
} from '@ximi4ka-shop/shared'
import type { ShippingQuoteResponse } from '@/lib/api'

const mockSuggest = vi.fn<(q: string) => Promise<CdekCity[]>>()
const mockGetPoints =
  vi.fn<(cityCode: number, opts?: { signal?: AbortSignal }) => Promise<CdekCityPoints>>()
const mockQuote =
  vi.fn<
    (payload: { items: unknown; destination?: QuoteDestination }) => Promise<ShippingQuoteResponse>
  >()

vi.mock('@/lib/api', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/api')>()
  return {
    ...actual,
    suggestCdekCities: (q: string) => mockSuggest(q),
    getCdekPoints: (cityCode: number, opts?: { signal?: AbortSignal }) =>
      mockGetPoints(cityCode, opts),
    quoteShipping: (payload: { items: unknown; destination?: QuoteDestination }) =>
      mockQuote(payload),
  }
})

// Карта: показывает, что получила, и отдаёт пункт кнопкой, как настоящий onChoose.
const mapOffice = vi.hoisted(() => ({ current: null as unknown }))
vi.mock('@/components/checkout/CdekWidget', () => ({
  CdekWidget: ({
    selectedPoint,
    cityLocation,
    onChoose,
  }: {
    selectedPoint: { code: string } | null
    cityLocation: [number, number] | null
    onChoose: (office: unknown) => void
  }) => (
    <div
      data-testid="map"
      data-point={selectedPoint?.code ?? ''}
      data-city={cityLocation ? cityLocation.join(',') : ''}
    >
      <button type="button" onClick={() => onChoose(mapOffice.current)}>
        Выбрать на карте
      </button>
    </div>
  ),
}))

import { CdekDelivery, type DeliveryErrors } from './CdekDelivery'
import { CITY_STORAGE_KEY, useCdekDelivery } from './useCdekDelivery'

const MOSCOW: CdekCity = { code: 44, name: 'Москва', fullName: 'Москва, Россия' }
const SPB: CdekCity = { code: 137, name: 'Санкт-Петербург', fullName: 'Санкт-Петербург, Россия' }
const MOSCOW_CENTER: [number, number] = [37.6176, 55.7558]
const SPB_CENTER: [number, number] = [30.3141, 59.9386]
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
const SPB1: CdekPoint = {
  code: 'SPB1',
  name: 'SPB1, Санкт-Петербург, Невский пр-т',
  address: 'Невский пр-т, 1',
  location: [30.3141, 59.9386],
  workTime: 'Пн-Вс 10:00-22:00',
}

function pointsOf(city: CdekCity, points: CdekPoint[], location: [number, number]): CdekCityPoints {
  return { city: { code: city.code, name: city.name, location }, points }
}

const SHIPPING: ShippingQuoteResponse = {
  subtotalRub: 2000,
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
  quote: null,
  tariffs: { pvz: 136, courier: 137 },
}

// Цены «с сервера»: ПВЗ 390 ₽, курьер по городу 600 ₽, курьер по полному
// адресу (в адресе есть улица — запятая после города) 650 ₽: так видно, какой
// расчёт попал в сводку.
function quoteFor(destination: QuoteDestination): DeliveryQuote {
  const pvz = destination.method === 'cdek_pvz'
  const fullAddress = !pvz && destination.address.includes(',')
  const price = pvz ? 390 : fullAddress ? 650 : 600
  return {
    method: destination.method,
    tariffCode: pvz ? 136 : 137,
    customerPriceRub: price,
    cdekPriceRub: price,
    periodMin: pvz ? 3 : 2,
    periodMax: pvz ? 5 : 2,
    free: false,
    source: 'cdek',
  }
}

const ITEMS = [{ productId: 'p1', quantity: 2 }]

// Блок доставки как на странице; destination, quoting и цена — в разметку,
// чтобы проверять то, что уйдёт в заказ и в сводку.
function Harness({ errors = {} }: { errors?: DeliveryErrors }) {
  const delivery = useCdekDelivery(ITEMS)
  return (
    <>
      <CdekDelivery delivery={delivery} shipping={SHIPPING} errors={errors} />
      <output data-testid="destination">{JSON.stringify(delivery.destination)}</output>
      <output data-testid="quoting">{String(delivery.quoting)}</output>
      <output data-testid="quote">{delivery.quote?.customerPriceRub ?? ''}</output>
      <button
        type="button"
        onClick={() => delivery.rejectPoint('Пункт выдачи не найден — выберите другой')}
      >
        сервер отклонил пункт
      </button>
    </>
  )
}

function destination() {
  return JSON.parse(screen.getByTestId('destination').textContent!)
}

function cityInput() {
  return screen.getByRole('combobox', { name: /город/i })
}

async function chooseCity(city: CdekCity) {
  mockSuggest.mockResolvedValue([city])
  fireEvent.focus(cityInput())
  fireEvent.change(cityInput(), { target: { value: city.name.slice(0, 4) } })
  fireEvent.click(await screen.findByRole('option', { name: city.name }))
}

async function choosePoint(name: RegExp) {
  const input = await screen.findByRole('combobox', { name: /пункт получения/i })
  fireEvent.focus(input)
  fireEvent.click(screen.getByRole('option', { name }))
}

// Вызовы расчёта курьера по полному адресу (а не по одному городу).
function fullCourierQuotes() {
  return mockQuote.mock.calls.filter(
    ([p]) => p.destination?.method === 'cdek_courier' && p.destination.address.includes(','),
  )
}

beforeEach(() => {
  window.localStorage.clear()
  mockSuggest.mockReset()
  mockGetPoints.mockReset()
  mockQuote.mockReset()
  mockGetPoints.mockImplementation(async (code) =>
    code === 44
      ? pointsOf(MOSCOW, [MSK310, MSK65], MOSCOW_CENTER)
      : pointsOf(SPB, [SPB1], SPB_CENTER),
  )
  mockQuote.mockImplementation(async ({ destination: d }) => ({
    ...SHIPPING,
    quote: d ? quoteFor(d) : null,
  }))
  mapOffice.current = null
})

describe('<CdekDelivery>', () => {
  it('после выбора города — пункты города и цены обоих способов с сервера', async () => {
    render(<Harness />)
    await chooseCity(MOSCOW)
    expect(
      await screen.findByRole('radio', { name: /Пункт выдачи СДЭК — 390\s₽, 3–5 дн\./ }),
    ).toBeChecked()
    expect(screen.getByRole('radio', { name: /Курьер СДЭК — 600\s₽, 2 дн\./ })).not.toBeChecked()
    expect(mockGetPoints).toHaveBeenCalledWith(44, expect.anything())
    expect(mockQuote).toHaveBeenCalledWith({
      items: ITEMS,
      destination: { method: 'cdek_pvz', cityCode: 44, address: 'Москва' },
    })
    expect(mockQuote).toHaveBeenCalledWith({
      items: ITEMS,
      destination: { method: 'cdek_courier', cityCode: 44, address: 'Москва' },
    })
  })

  it('пункт из списка — в заказ уходит код пункта и «город, адрес пункта»', async () => {
    render(<Harness />)
    await chooseCity(MOSCOW)
    expect(destination()).toBeNull()
    await choosePoint(/MSK310/)
    expect(destination()).toEqual({
      method: 'cdek_pvz',
      cityCode: 44,
      deliveryPointCode: 'MSK310',
      address: 'Москва, пр-т Мира, 108',
    })
  })

  it('смена города сбрасывает пункт, адрес курьера не трогает, цены пересчитываются', async () => {
    render(<Harness />)
    await chooseCity(MOSCOW)
    fireEvent.click(await screen.findByRole('radio', { name: /Курьер СДЭК/ }))
    fireEvent.change(screen.getByLabelText(/улица, дом/i), { target: { value: 'Тверская ул., 1' } })
    fireEvent.click(screen.getByRole('radio', { name: /Пункт выдачи СДЭК/ }))
    await choosePoint(/MSK65/)

    await chooseCity(SPB)

    expect(destination()).toBeNull()
    expect(mockQuote).toHaveBeenCalledWith({
      items: ITEMS,
      destination: { method: 'cdek_pvz', cityCode: 137, address: 'Санкт-Петербург' },
    })
    fireEvent.click(await screen.findByRole('radio', { name: /Курьер СДЭК/ }))
    expect(screen.getByLabelText(/улица, дом/i)).toHaveValue('Тверская ул., 1')
    expect(destination()).toEqual({
      method: 'cdek_courier',
      cityCode: 137,
      address: 'Санкт-Петербург, Тверская ул., 1',
    })
  })

  it('выбор в списке уходит на карту; «Выбрать» на карте ставит пункт в список', async () => {
    render(<Harness />)
    await chooseCity(MOSCOW)
    const map = await screen.findByTestId('map')
    await vi.waitFor(() => expect(map).toHaveAttribute('data-city', MOSCOW_CENTER.join(',')))
    await choosePoint(/MSK65/)
    expect(map).toHaveAttribute('data-point', 'MSK65')

    mapOffice.current = {
      code: 'MSK310',
      city_code: 44,
      city: 'Москва',
      address: 'пр-т Мира, 108',
      location: MSK310.location,
    }
    fireEvent.click(screen.getByRole('button', { name: 'Выбрать на карте' }))
    expect(screen.getByRole('combobox', { name: /пункт получения/i })).toHaveValue(
      'MSK310 · пр-т Мира, 108',
    )
    expect(destination()).toMatchObject({ deliveryPointCode: 'MSK310' })
  })

  it('карта не пересоздаётся при смене города и стоит на прошлом городе, пока грузится новый', async () => {
    let resolveSpb!: (value: CdekCityPoints) => void
    render(<Harness />)
    await chooseCity(MOSCOW)
    const map = await screen.findByTestId('map')
    await vi.waitFor(() => expect(map).toHaveAttribute('data-city', MOSCOW_CENTER.join(',')))

    mockGetPoints.mockImplementation(
      () =>
        new Promise<CdekCityPoints>((resolve) => {
          resolveSpb = resolve
        }),
    )
    // Первая буква нового города сбрасывает город — карта остаётся тем же элементом.
    mockSuggest.mockResolvedValue([SPB])
    fireEvent.focus(cityInput())
    fireEvent.change(cityInput(), { target: { value: 'Санк' } })
    expect(screen.getByTestId('map')).toBe(map)
    expect(map).toHaveAttribute('data-city', MOSCOW_CENTER.join(','))

    fireEvent.click(await screen.findByRole('option', { name: 'Санкт-Петербург' }))
    expect(screen.getByTestId('map')).toBe(map)
    expect(map).toHaveAttribute('data-city', MOSCOW_CENTER.join(','))

    await act(async () => {
      resolveSpb(pointsOf(SPB, [SPB1], SPB_CENTER))
    })
    expect(screen.getByTestId('map')).toBe(map)
    expect(map).toHaveAttribute('data-city', SPB_CENTER.join(','))
  })

  it('до первого выбора города карты нет', () => {
    render(<Harness />)
    expect(screen.queryByTestId('map')).toBeNull()
  })

  it('пункт с карты, пока список грузится, — «Список ещё загружается»', async () => {
    let resolvePoints!: (value: CdekCityPoints) => void
    mockGetPoints.mockImplementation(
      () =>
        new Promise<CdekCityPoints>((resolve) => {
          resolvePoints = resolve
        }),
    )
    render(<Harness />)
    await chooseCity(MOSCOW)
    mapOffice.current = { ...MSK65, city_code: 44, city: 'Москва' }
    fireEvent.click(await screen.findByRole('button', { name: 'Выбрать на карте' }))
    expect(
      screen.getByText('Список ещё загружается — попробуйте через секунду'),
    ).toBeInTheDocument()
    expect(destination()).toBeNull()

    await act(async () => {
      resolvePoints(pointsOf(MOSCOW, [MSK65], MOSCOW_CENTER))
    })
    fireEvent.click(screen.getByRole('button', { name: 'Выбрать на карте' }))
    expect(destination()).toMatchObject({ deliveryPointCode: 'MSK65' })
    expect(screen.queryByText(/Список ещё загружается/)).toBeNull()
  })

  it('пункт с карты из другого города отклоняется с подсказкой', async () => {
    render(<Harness />)
    await chooseCity(MOSCOW)
    // Ждём список: пока он грузится, подсказка другая (тест выше).
    await screen.findByRole('combobox', { name: /пункт получения/i })
    mapOffice.current = { ...SPB1, city_code: 137, city: 'Санкт-Петербург' }
    fireEvent.click(screen.getByRole('button', { name: 'Выбрать на карте' }))
    expect(screen.getByText('Этот пункт в другом городе — смените город')).toBeInTheDocument()
    expect(destination()).toBeNull()
  })

  it('пункты не загрузились — «Повторить», курьер доступен', async () => {
    mockGetPoints.mockRejectedValueOnce(new Error('502'))
    render(<Harness />)
    await chooseCity(MOSCOW)
    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось загрузить пункты выдачи')
    expect(screen.getByRole('radio', { name: /Курьер СДЭК/ })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }))
    expect(await screen.findByRole('combobox', { name: /пункт получения/i })).toBeInTheDocument()
  })

  it('в городе нет ПВЗ — подсказка выбрать курьера, карты нет', async () => {
    mockGetPoints.mockResolvedValue(pointsOf(MOSCOW, [], MOSCOW_CENTER))
    render(<Harness />)
    await chooseCity(MOSCOW)
    expect(
      await screen.findByText('В этом городе нет пунктов выдачи СДЭК — выберите курьера'),
    ).toBeInTheDocument()
    expect(screen.queryByTestId('map')).toBeNull()
  })

  it('расчёт не удался — «не удалось рассчитать» и «Повторить расчёт»', async () => {
    mockQuote.mockRejectedValueOnce(new Error('500')).mockRejectedValueOnce(new Error('500'))
    render(<Harness />)
    await chooseCity(MOSCOW)
    expect(
      await screen.findByRole('radio', { name: /Пункт выдачи СДЭК — не удалось рассчитать/ }),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Повторить расчёт' }))
    expect(
      await screen.findByRole('radio', { name: /Пункт выдачи СДЭК — 390/ }),
    ).toBeInTheDocument()
  })

  it('курьер: полный адрес пересчитывается тем же destination, что уйдёт в заказ', async () => {
    render(<Harness />)
    await chooseCity(MOSCOW)
    fireEvent.click(await screen.findByRole('radio', { name: /Курьер СДЭК — 600/ }))
    fireEvent.change(screen.getByLabelText(/улица, дом/i), { target: { value: 'Тверская ул., 1' } })

    // До ответа — «пересчитываем», цены нет, оформить нельзя.
    expect(screen.getByRole('radio', { name: 'Курьер СДЭК — пересчитываем…' })).toBeChecked()
    expect(screen.getByTestId('quoting')).toHaveTextContent('true')
    expect(screen.getByTestId('quote')).toHaveTextContent('')

    expect(await screen.findByRole('radio', { name: /Курьер СДЭК — 650\s₽/ })).toBeChecked()
    expect(screen.getByTestId('quoting')).toHaveTextContent('false')
    expect(screen.getByTestId('quote')).toHaveTextContent('650')
    expect(fullCourierQuotes().at(-1)![0].destination).toEqual(destination())
    expect(destination()).toEqual({
      method: 'cdek_courier',
      cityCode: 44,
      address: 'Москва, Тверская ул., 1',
    })
  })

  it('пересчёт ждёт, пока покупатель допечатает: одна правка за другой — один запрос', async () => {
    render(<Harness />)
    await chooseCity(MOSCOW)
    fireEvent.click(await screen.findByRole('radio', { name: /Курьер СДЭК/ }))
    const street = screen.getByLabelText(/улица, дом/i)
    fireEvent.change(street, { target: { value: 'Т' } })
    fireEvent.change(street, { target: { value: 'Тверская' } })
    fireEvent.change(street, { target: { value: 'Тверская ул., 1' } })
    await screen.findByRole('radio', { name: /Курьер СДЭК — 650/ })
    expect(fullCourierQuotes()).toHaveLength(1)
  })

  it('недописанный индекс — по нему не считаем; шесть цифр — пересчёт с индексом', async () => {
    render(<Harness />)
    await chooseCity(MOSCOW)
    fireEvent.click(await screen.findByRole('radio', { name: /Курьер СДЭК/ }))
    fireEvent.change(screen.getByLabelText(/улица, дом/i), { target: { value: 'Тверская ул., 1' } })
    await screen.findByRole('radio', { name: /Курьер СДЭК — 650/ })

    fireEvent.change(screen.getByLabelText(/индекс/i), { target: { value: '1250' } })
    await new Promise((resolve) => setTimeout(resolve, 500))
    expect(fullCourierQuotes()).toHaveLength(1)

    fireEvent.change(screen.getByLabelText(/индекс/i), { target: { value: '125009' } })
    await vi.waitFor(() => expect(fullCourierQuotes()).toHaveLength(2))
    expect(fullCourierQuotes()[1]![0].destination).toEqual({
      method: 'cdek_courier',
      cityCode: 44,
      postalCode: '125009',
      address: 'Москва, Тверская ул., 1',
    })
    expect(await screen.findByRole('radio', { name: /Курьер СДЭК — 650/ })).toBeChecked()
  })

  it('сервер не нашёл пункт — выбор сброшен, ошибка у поля, список грузится заново', async () => {
    render(<Harness />)
    await chooseCity(MOSCOW)
    await choosePoint(/MSK65/)
    fireEvent.click(screen.getByRole('button', { name: 'сервер отклонил пункт' }))
    expect(await screen.findByText('Пункт выдачи не найден — выберите другой')).toBeInTheDocument()
    expect(destination()).toBeNull()
    await vi.waitFor(() => expect(mockGetPoints).toHaveBeenCalledTimes(2))
    expect(await screen.findByRole('combobox', { name: /пункт получения/i })).toHaveValue('')
  })

  it('поздний ответ по прошлому городу не перетирает пункты нового', async () => {
    let resolveMoscow!: (value: CdekCityPoints) => void
    mockGetPoints.mockImplementation((code) =>
      code === 44
        ? new Promise<CdekCityPoints>((resolve) => {
            resolveMoscow = resolve
          })
        : Promise.resolve(pointsOf(SPB, [SPB1], SPB_CENTER)),
    )
    render(<Harness />)
    await chooseCity(MOSCOW)
    await chooseCity(SPB)
    const input = await screen.findByRole('combobox', { name: /пункт получения/i })
    await act(async () => {
      resolveMoscow(pointsOf(MOSCOW, [MSK65], MOSCOW_CENTER))
    })
    fireEvent.focus(input)
    expect(screen.getByRole('option', { name: /SPB1/ })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /MSK65/ })).toBeNull()
  })

  it('город запоминается и подставляется при следующем визите', async () => {
    render(<Harness />)
    await chooseCity(MOSCOW)
    expect(JSON.parse(window.localStorage.getItem(CITY_STORAGE_KEY)!)).toEqual({
      code: 44,
      name: 'Москва',
      fullName: 'Москва, Россия',
    })
    cleanup()
    mockGetPoints.mockClear()

    render(<Harness />)
    expect(cityInput()).toHaveValue('Москва')
    await vi.waitFor(() => expect(mockGetPoints).toHaveBeenCalledWith(44, expect.anything()))
    expect(mockSuggest).toHaveBeenCalledTimes(1) // только при первом выборе
  })

  it('мусор в хранилище или хранилище недоступно — блок работает без сохранённого города', async () => {
    window.localStorage.setItem(CITY_STORAGE_KEY, '{"code":"44","name":"Москва"}')
    render(<Harness />)
    expect(cityInput()).toHaveValue('')
    cleanup()

    window.localStorage.setItem(CITY_STORAGE_KEY, 'не json')
    render(<Harness />)
    expect(cityInput()).toHaveValue('')
    cleanup()

    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })
    render(<Harness />)
    await chooseCity(MOSCOW)
    expect(
      await screen.findByRole('radio', { name: /Пункт выдачи СДЭК — 390/ }),
    ).toBeInTheDocument()
    getItem.mockRestore()
    setItem.mockRestore()
  })

  it('ошибки формы — у своих полей и пропадают, когда поле заполнено', async () => {
    const { rerender } = render(<Harness errors={{ city: 'Укажите город' }} />)
    expect(screen.getByText('Укажите город')).toBeInTheDocument()
    await chooseCity(MOSCOW)
    rerender(<Harness errors={{ city: 'Укажите город', point: 'Выберите пункт получения' }} />)
    expect(screen.queryByText('Укажите город')).toBeNull()
    expect(await screen.findByText('Выберите пункт получения')).toBeInTheDocument()
    await choosePoint(/MSK65/)
    expect(screen.queryByText('Выберите пункт получения')).toBeNull()
  })
})
