import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'

// next/script: onReady — после монтирования, как у уже загруженного
// скрипта; script.outcome меняет исход для отдельных тестов. onReady
// запоминаем, чтобы вызвать его «с опозданием» из теста.
const script = vi.hoisted(() => ({
  outcome: 'ready' as 'ready' | 'error' | 'pending',
  onReady: null as null | (() => void),
}))
vi.mock('next/script', async () => {
  const { useEffect } = await import('react')
  return {
    default: function MockScript({
      onReady,
      onError,
    }: {
      onReady?: () => void
      onError?: (e: unknown) => void
    }) {
      // Запоминаем в эффекте, а не в рендере: мутация внешнего объекта в
      // рендере — нарушение правил хуков.
      useEffect(() => {
        script.onReady = onReady ?? null
      })
      useEffect(() => {
        if (script.outcome === 'ready') onReady?.()
        if (script.outcome === 'error') onError?.(new Error('CDN недоступен'))
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [])
      return null
    },
  }
})

import {
  CdekWidget,
  MAP_READY_TIMEOUT_MS,
  MAP_UNAVAILABLE_TEXT,
  SELECT_RETRY_FOR_MS,
  SELECT_RETRY_MS,
} from './CdekWidget'

interface WidgetConfig {
  apiKey: string
  servicePath: string
  goods: unknown
  tariffs: unknown
  hideDeliveryOptions: unknown
  forceFilters: unknown
  defaultLocation: unknown
  canChoose: boolean
  onReady: () => void
  onChoose: (mode: string, tariff: unknown, target: unknown) => void
}

// Экземпляр виджета так, как его устраивает 4.0.0: геокодер хранит готовый
// адрес запроса с ключом карты; методы — те, которыми пользуемся.
function fakeWidget() {
  return {
    yandexApi: { geocodeSrc: 'https://geocode-maps.yandex.ru/1.x/?apikey=ya-key&lang=ru_RU' },
    updateLocation: vi.fn<(location: [number, number], zoom: number) => Promise<void>>(
      async () => {},
    ),
    selectOffice: vi.fn<(code: string) => void>(() => {}),
    clearSelection: vi.fn<() => void>(() => {}),
    destroy: vi.fn(),
  }
}

const CITY: [number, number] = [37.6176, 55.7558]
const POINT = { code: 'MSK65', location: [37.6634, 55.7335] as [number, number] }
const OFFICE = {
  code: 'MSK310',
  city_code: 44,
  city: 'Москва',
  address: 'пр-т Мира, 108',
  location: [37.6385, 55.8061] as [number, number],
}

const props = {
  goods: [{ weight: 180, length: 10, width: 10, height: 4 }],
  servicePath: 'https://shop/api/public/cdek/widget?subtotal=1000',
  tariffPvz: 136,
  cityLocation: null,
  selectedPoint: null,
  onChoose: vi.fn(),
}

describe('<CdekWidget>', () => {
  const ORIGINAL_KEY = process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY
  const ORIGINAL_GEO_KEY = process.env.NEXT_PUBLIC_YANDEX_GEOCODER_API_KEY
  let instance: ReturnType<typeof fakeWidget>
  let ctor: ReturnType<typeof vi.fn>
  const config = () => ctor.mock.calls[0]![0] as WidgetConfig

  function renderReady(extra: Partial<typeof props> = {}) {
    const view = render(<CdekWidget {...props} {...extra} />)
    act(() => config().onReady())
    return view
  }

  // Скрипт https://api-maps.yandex.ru/... подключает сам @cdek-it/widget, не
  // наш next/script: единственный способ узнать, что Яндекс отклонил ключ
  // (403), — поймать `error` на этом <script>. Событие не всплывает, поэтому
  // диспатчим прямо на созданном элементе — виджет слушает document на
  // погружении.
  function dispatchScriptError(src: string) {
    const el = document.createElement('script')
    el.src = src
    document.body.appendChild(el)
    act(() => {
      el.dispatchEvent(new Event('error'))
    })
    el.remove()
  }

  beforeEach(() => {
    script.outcome = 'ready'
    script.onReady = null
    process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY = 'ya-key'
    instance = fakeWidget()
    // Вызывается через new: возвращённый объект становится экземпляром.
    ctor = vi.fn(function () {
      return instance
    })
    ;(window as unknown as { CDEKWidget: unknown }).CDEKWidget = ctor
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    if (ORIGINAL_KEY == null) delete process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY
    else process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY = ORIGINAL_KEY
    if (ORIGINAL_GEO_KEY == null) delete process.env.NEXT_PUBLIC_YANDEX_GEOCODER_API_KEY
    else process.env.NEXT_PUBLIC_YANDEX_GEOCODER_API_KEY = ORIGINAL_GEO_KEY
    delete (window as unknown as { CDEKWidget?: unknown }).CDEKWidget
  })

  it('без ключа Яндекс.Карт — строка вместо карты, виджет не грузится', () => {
    delete process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY
    render(<CdekWidget {...props} />)
    expect(screen.getByRole('status')).toHaveTextContent(MAP_UNAVAILABLE_TEXT)
    expect(MAP_UNAVAILABLE_TEXT).toBe('Карта недоступна — выберите пункт из списка')
    expect(ctor).not.toHaveBeenCalled()
  })

  it('скрипт не загрузился (onError) — строка вместо карты', () => {
    script.outcome = 'error'
    delete (window as unknown as { CDEKWidget?: unknown }).CDEKWidget
    render(<CdekWidget {...props} />)
    expect(screen.getByRole('status')).toHaveTextContent(MAP_UNAVAILABLE_TEXT)
  })

  it('10 с без готовности виджета — строка вместо карты, экземпляр убран', () => {
    vi.useFakeTimers()
    render(<CdekWidget {...props} />)
    act(() => vi.advanceTimersByTime(MAP_READY_TIMEOUT_MS - 1))
    expect(screen.queryByRole('status')).toBeNull()
    act(() => vi.advanceTimersByTime(1))
    expect(screen.getByRole('status')).toHaveTextContent(MAP_UNAVAILABLE_TEXT)
    expect(instance.destroy).toHaveBeenCalledTimes(1)
  })

  it('виджет успел подготовиться — строка не появляется', () => {
    vi.useFakeTimers()
    renderReady()
    act(() => vi.advanceTimersByTime(MAP_READY_TIMEOUT_MS * 2))
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('после 10 с запоздавший onReady скрипта виджет уже не создаёт', () => {
    vi.useFakeTimers()
    script.outcome = 'pending'
    delete (window as unknown as { CDEKWidget?: unknown }).CDEKWidget
    render(<CdekWidget {...props} />)
    act(() => vi.advanceTimersByTime(MAP_READY_TIMEOUT_MS))
    expect(screen.getByRole('status')).toHaveTextContent(MAP_UNAVAILABLE_TEXT)
    // Скрипт всё-таки догрузился и зовёт onReady последнего рендера.
    ;(window as unknown as { CDEKWidget: unknown }).CDEKWidget = ctor
    act(() => script.onReady?.())
    expect(ctor).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent(MAP_UNAVAILABLE_TEXT)
  })

  it('конструктор виджета упал — строка вместо карты, страница не падает', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    ctor.mockImplementation(function () {
      throw new Error('битая сборка')
    })
    expect(() => render(<CdekWidget {...props} />)).not.toThrow()
    expect(screen.getByRole('status')).toHaveTextContent(MAP_UNAVAILABLE_TEXT)
  })

  it('Яндекс отклонил ключ: виджет позвал onReady, но скрипт api-maps.yandex.ru упал', () => {
    render(<CdekWidget {...props} />)
    act(() => config().onReady())
    expect(screen.queryByRole('status')).toBeNull()
    dispatchScriptError('https://api-maps.yandex.ru/v3/?lang=ru_RU&apikey=bad-key')
    expect(screen.getByRole('status')).toHaveTextContent(MAP_UNAVAILABLE_TEXT)
    expect(instance.destroy).toHaveBeenCalledTimes(1)
  })

  it('ошибка чужого скрипта карту не трогает', () => {
    renderReady()
    dispatchScriptError('https://cdn.example.com/some-other-script.js')
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('создаёт виджет с нашими местами, прокси, тарифом ПВЗ и ключом', () => {
    render(<CdekWidget {...props} />)
    expect(ctor).toHaveBeenCalledTimes(1)
    expect(config()).toMatchObject({
      apiKey: 'ya-key',
      servicePath: props.servicePath,
      goods: props.goods,
      canChoose: true,
      lang: 'rus',
      currency: 'RUB',
    })
  })

  it('только ПВЗ: курьерской вкладки и постаматов на карте нет', () => {
    render(<CdekWidget {...props} />)
    expect(config()).toMatchObject({
      tariffs: { office: [136], door: [], pickup: [] },
      hideDeliveryOptions: { office: false, door: true },
      forceFilters: { type: 'PVZ' },
    })
  })

  it('отдаёт наружу пункт, выбранный на карте; выбор курьера игнорирует', () => {
    const onChoose = vi.fn()
    render(<CdekWidget {...props} onChoose={onChoose} />)
    config().onChoose('office', { tariff_code: 136 }, OFFICE)
    config().onChoose('door', null, { formatted: 'Москва, Тверская, 1' })
    expect(onChoose).toHaveBeenCalledTimes(1)
    expect(onChoose).toHaveBeenCalledWith(OFFICE)
  })

  it('центр карты — координаты: выбранный пункт, иначе город, иначе Москва', () => {
    const a = render(<CdekWidget {...props} cityLocation={CITY} selectedPoint={POINT} />)
    expect(config().defaultLocation).toEqual(POINT.location)
    a.unmount()
    const b = render(<CdekWidget {...props} cityLocation={CITY} />)
    expect((ctor.mock.calls[1]![0] as WidgetConfig).defaultLocation).toEqual(CITY)
    b.unmount()
    render(<CdekWidget {...props} />)
    const fallback = (ctor.mock.calls[2]![0] as WidgetConfig).defaultLocation
    expect(Array.isArray(fallback)).toBe(true)
    expect(fallback).toHaveLength(2)
  })

  it('список → карта: центр на пункте, selectOffice сразу и каждые 300 мс до 3 с', () => {
    vi.useFakeTimers()
    const view = renderReady()
    view.rerender(<CdekWidget {...props} selectedPoint={POINT} />)
    expect(instance.updateLocation).toHaveBeenCalledWith(POINT.location, 17)
    expect(instance.selectOffice).toHaveBeenCalledTimes(1)
    act(() => vi.advanceTimersByTime(SELECT_RETRY_MS))
    expect(instance.selectOffice).toHaveBeenCalledTimes(2)
    act(() => vi.advanceTimersByTime(SELECT_RETRY_FOR_MS))
    const calls = 1 + SELECT_RETRY_FOR_MS / SELECT_RETRY_MS
    expect(instance.selectOffice).toHaveBeenCalledTimes(calls)
    act(() => vi.advanceTimersByTime(5_000))
    expect(instance.selectOffice).toHaveBeenCalledTimes(calls)
    expect(instance.selectOffice).toHaveBeenCalledWith('MSK65')
  })

  it('до готовности виджета карту не трогаем, после — догоняем выбранный пункт', () => {
    render(<CdekWidget {...props} selectedPoint={POINT} />)
    expect(instance.updateLocation).not.toHaveBeenCalled()
    act(() => config().onReady())
    expect(instance.updateLocation).toHaveBeenCalledWith(POINT.location, 17)
  })

  it('смена города — центр города, масштаб 10; с выбранным пунктом карту ведёт пункт', () => {
    const view = renderReady()
    view.rerender(<CdekWidget {...props} cityLocation={CITY} />)
    expect(instance.updateLocation).toHaveBeenLastCalledWith(CITY, 10)
    instance.updateLocation.mockClear()
    view.rerender(<CdekWidget {...props} cityLocation={[30.3, 59.9]} selectedPoint={POINT} />)
    expect(instance.updateLocation).not.toHaveBeenCalledWith([30.3, 59.9], 10)
    expect(instance.updateLocation).toHaveBeenCalledWith(POINT.location, 17)
  })

  it('пункт сброшен (правка города или отказ сервера) — карта снимает старое выделение', () => {
    const view = render(<CdekWidget {...props} cityLocation={CITY} selectedPoint={POINT} />)
    act(() => config().onReady())
    expect(instance.clearSelection).not.toHaveBeenCalled()
    view.rerender(<CdekWidget {...props} cityLocation={CITY} />)
    expect(instance.clearSelection).toHaveBeenCalledTimes(1)
    expect(instance.updateLocation).toHaveBeenCalledWith(CITY, 10)
  })

  it('пункт, выбранный на самой карте, не центрируется и не выбирается повторно', () => {
    const view = renderReady()
    act(() => config().onChoose('office', { tariff_code: 136 }, OFFICE))
    view.rerender(
      <CdekWidget {...props} selectedPoint={{ code: OFFICE.code, location: OFFICE.location }} />,
    )
    expect(instance.updateLocation).not.toHaveBeenCalled()
    expect(instance.selectOffice).not.toHaveBeenCalled()
  })

  it.each([
    ['нажал на карту', (el: HTMLElement) => fireEvent.pointerDown(el)],
    ['крутит колесо', (el: HTMLElement) => fireEvent.wheel(el)],
    ['жмёт клавиши на карте', (el: HTMLElement) => fireEvent.keyDown(el, { key: '+' })],
    ['коснулся карты пальцем', (el: HTMLElement) => fireEvent.touchStart(el)],
  ])('покупатель %s — повтор selectOffice прекращается и не спорит с ним', (_what, touch) => {
    vi.useFakeTimers()
    const view = renderReady()
    view.rerender(<CdekWidget {...props} selectedPoint={POINT} />)
    touch(screen.getByLabelText('Карта пунктов выдачи СДЭК'))
    act(() => vi.advanceTimersByTime(SELECT_RETRY_FOR_MS))
    expect(instance.selectOffice).toHaveBeenCalledTimes(1)
  })

  it('скрипт уже загружен — виджет создаётся при монтировании, без onReady скрипта', () => {
    script.outcome = 'pending'
    render(<CdekWidget {...props} />)
    expect(ctor).toHaveBeenCalledTimes(1)
  })

  it('размонтирование уничтожает экземпляр: хранилище у виджетов общее', () => {
    const view = render(<CdekWidget {...props} />)
    view.unmount()
    expect(instance.destroy).toHaveBeenCalledTimes(1)
  })

  it('подставляет отдельный ключ HTTP Геокодера, если он задан', () => {
    process.env.NEXT_PUBLIC_YANDEX_GEOCODER_API_KEY = 'geo-key'
    render(<CdekWidget {...props} />)
    const url = new URL(instance.yandexApi.geocodeSrc)
    expect(url.searchParams.get('apikey')).toBe('geo-key')
    expect(url.searchParams.get('lang')).toBe('ru_RU')
  })

  it('без ключа геокодера оставляет общий ключ карты', () => {
    delete process.env.NEXT_PUBLIC_YANDEX_GEOCODER_API_KEY
    render(<CdekWidget {...props} />)
    expect(new URL(instance.yandexApi.geocodeSrc).searchParams.get('apikey')).toBe('ya-key')
  })

  it('не падает, если у виджета другая внутренняя структура', () => {
    process.env.NEXT_PUBLIC_YANDEX_GEOCODER_API_KEY = 'geo-key'
    ctor.mockImplementation(function () {
      return {}
    })
    expect(() => render(<CdekWidget {...props} />)).not.toThrow()
  })
})
