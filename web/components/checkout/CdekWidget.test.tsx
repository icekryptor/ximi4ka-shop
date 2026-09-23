import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// next/script в тестах: сразу вызываем onReady, как будто скрипт загрузился.
vi.mock('next/script', () => ({
  default: ({ onReady }: { onReady?: () => void }) => {
    onReady?.()
    return null
  },
}))

import { CdekWidget } from './CdekWidget'

const props = {
  goods: [{ weight: 180, length: 10, width: 10, height: 4 }],
  servicePath: 'https://shop/api/public/cdek/widget?subtotal=1000',
  tariffs: { pvz: 136, courier: 137 },
  onChoose: vi.fn(),
}

describe('<CdekWidget>', () => {
  const ORIGINAL_KEY = process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY
  const ORIGINAL_GEO_KEY = process.env.NEXT_PUBLIC_YANDEX_GEOCODER_API_KEY
  let ctor: ReturnType<typeof vi.fn>
  // Экземпляр виджета так, как его устраивает 4.0.0: геокодер хранит готовый
  // адрес запроса с ключом карты.
  let instance: { yandexApi: { geocodeSrc: string } }

  beforeEach(() => {
    instance = {
      yandexApi: { geocodeSrc: 'https://geocode-maps.yandex.ru/1.x/?apikey=ya-key&lang=ru_RU' },
    }
    // Вызывается через new: возвращённый объект становится экземпляром.
    ctor = vi.fn(function () {
      return instance
    })
    ;(window as unknown as { CDEKWidget: unknown }).CDEKWidget = ctor
  })
  afterEach(() => {
    if (ORIGINAL_KEY == null) delete process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY
    else process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY = ORIGINAL_KEY
    if (ORIGINAL_GEO_KEY == null) delete process.env.NEXT_PUBLIC_YANDEX_GEOCODER_API_KEY
    else process.env.NEXT_PUBLIC_YANDEX_GEOCODER_API_KEY = ORIGINAL_GEO_KEY
    delete (window as unknown as { CDEKWidget?: unknown }).CDEKWidget
  })

  it('без ключа Яндекс.Карт не грузит виджет и объясняет, что делать', () => {
    delete process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY
    render(<CdekWidget {...props} />)
    expect(screen.getByRole('status')).toHaveTextContent(/карта недоступна/i)
    expect(ctor).not.toHaveBeenCalled()
  })

  it('создаёт виджет с нашими местами, прокси, тарифами и ключом', () => {
    process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY = 'ya-key'
    render(<CdekWidget {...props} />)
    expect(ctor).toHaveBeenCalledTimes(1)
    const config = ctor.mock.calls[0][0]
    expect(config).toMatchObject({
      apiKey: 'ya-key',
      servicePath: props.servicePath,
      goods: props.goods,
      tariffs: { office: [136], door: [137] },
      canChoose: true,
      lang: 'rus',
      currency: 'RUB',
    })
    expect(typeof config.onChoose).toBe('function')
  })

  it('передаёт выбор покупателя наружу', () => {
    process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY = 'ya-key'
    const onChoose = vi.fn()
    render(<CdekWidget {...props} onChoose={onChoose} />)
    const tariff = { tariff_code: 136, period_min: 3, period_max: 5 }
    const address = {
      city_code: 270,
      city: 'Новосибирск',
      code: 'NSK1',
      address: 'ул. Кривощековская, 15',
    }
    ctor.mock.calls[0][0].onChoose('office', tariff, address)
    expect(onChoose).toHaveBeenCalledWith('office', tariff, address)
  })

  it('центр карты — координаты, а не строка: иначе геокодер вызовется до подмены ключа', () => {
    process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY = 'ya-key'
    render(<CdekWidget {...props} />)
    const { defaultLocation } = ctor.mock.calls[0][0]
    expect(Array.isArray(defaultLocation)).toBe(true)
    expect(defaultLocation).toHaveLength(2)
  })

  it('подставляет отдельный ключ HTTP Геокодера, если он задан', () => {
    process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY = 'ya-key'
    process.env.NEXT_PUBLIC_YANDEX_GEOCODER_API_KEY = 'geo-key'
    render(<CdekWidget {...props} />)
    const url = new URL(instance.yandexApi.geocodeSrc)
    expect(url.searchParams.get('apikey')).toBe('geo-key')
    expect(url.searchParams.get('lang')).toBe('ru_RU')
  })

  it('без ключа геокодера оставляет общий ключ карты', () => {
    process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY = 'ya-key'
    delete process.env.NEXT_PUBLIC_YANDEX_GEOCODER_API_KEY
    render(<CdekWidget {...props} />)
    expect(new URL(instance.yandexApi.geocodeSrc).searchParams.get('apikey')).toBe('ya-key')
  })

  it('не падает, если у виджета другая внутренняя структура', () => {
    process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY = 'ya-key'
    process.env.NEXT_PUBLIC_YANDEX_GEOCODER_API_KEY = 'geo-key'
    ctor.mockImplementation(function () {
      return {}
    })
    expect(() => render(<CdekWidget {...props} />)).not.toThrow()
  })
})
