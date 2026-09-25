'use client'

import Script from 'next/script'
import { useEffect, useId, useRef, useState } from 'react'
import type { WidgetOffice } from '@/lib/shipping'

// Версия закреплена точно: у протокола между виджетом и нашим прокси
// (api/src/routes/public/cdek-widget.ts) нет отдельной спецификации, и новая
// версия может его поменять. Обновлять вместе с WIDGET_SERVICE_VERSION.
const WIDGET_SRC = 'https://cdn.jsdelivr.net/npm/@cdek-it/widget@4.0.0/dist/cdek-widget.umd.js'

// selectOffice находит только пункты, уже загруженные для видимой области, а
// виджет подгружает их примерно через 500 мс после сдвига карты. Узнать, что
// пункт нашёлся, нельзя (метод ничего не возвращает), поэтому повторяем его
// каждые 300 мс до 3 с (спека §5.2); повтор уже выбранного пункта ничего не
// меняет.
export const SELECT_RETRY_MS = 300
export const SELECT_RETRY_FOR_MS = 3_000
// Действия покупателя на карте, после которых повтор selectOffice
// прекращается: мышь, палец, колесо, клавиши масштаба.
const USER_MAP_EVENTS = ['pointerdown', 'touchstart', 'wheel', 'keydown'] as const

// Сколько ждём готовности виджета, прежде чем показать строку вместо карты:
// завис скрипт или Яндекс не отдал карту (§5.2). Чекаут без карты не
// блокируется — пункт выбирают из списка.
export const MAP_READY_TIMEOUT_MS = 10_000
export const MAP_UNAVAILABLE_TEXT = 'Карта недоступна — выберите пункт из списка'

type LngLat = [number, number]

// То, чем пользуемся у экземпляра @cdek-it/widget 4.0.0
// (dist/cdek-widget.es.d.ts). Масштаб: 10 — город, 17 — дом.
interface WidgetInstance {
  updateLocation(location: LngLat, zoom?: 10 | 15 | 17): Promise<void>
  selectOffice(code: string): void
  destroy(): void
}

export interface CdekWidgetProps {
  goods: { weight: number; length: number; width: number; height: number }[]
  servicePath: string
  tariffPvz: number
  // Центр выбранного города; null — город не выбран или СДЭК не знает координат.
  cityLocation: LngLat | null
  selectedPoint: { code: string; location: LngLat } | null
  onChoose: (office: WidgetOffice) => void
}

// Центр Москвы, [долгота, широта] — формат defaultLocation у виджета.
// Координаты, а не строка 'Москва': строку виджет геокодирует прямо в
// конструкторе, до того как мы успеем подставить ключ геокодера (см. ниже).
const MOSCOW_CENTER: LngLat = [37.6176, 55.7558]

// Виджет 4.0.0 подписывает одним apiKey и загрузку карты (JavaScript API), и
// запросы к HTTP Геокодеру (поиск). В кабинете Яндекса это два разных ключа,
// а отдельной опции у виджета нет, поэтому адрес геокодера переписываем на
// готовом экземпляре. Поле yandexApi.geocodeSrc в сборке не минифицировано;
// версия виджета закреплена, так что поле не уедет без нашего ведома. Если
// структура другая — молча оставляем общий ключ.
function applyGeocoderKey(widget: unknown, geocoderKey: string | undefined): void {
  if (!geocoderKey) return
  const api = (widget as { yandexApi?: { geocodeSrc?: unknown } } | null)?.yandexApi
  if (!api || typeof api.geocodeSrc !== 'string') return
  try {
    const url = new URL(api.geocodeSrc)
    url.searchParams.set('apikey', geocoderKey)
    api.geocodeSrc = url.toString()
  } catch {
    // Не URL — не трогаем.
  }
}

function destroyWidget(ref: { current: WidgetInstance | null }): void {
  const widget = ref.current
  ref.current = null
  try {
    widget?.destroy()
  } catch {
    // Виджет не успел смонтироваться — убирать нечего.
  }
}

// Префикс скрипта Яндекс.Карт, который @cdek-it/widget подключает сам (не
// через наш next/script): по нему отличаем его ошибку загрузки от чужой.
const YANDEX_MAPS_SCRIPT_PREFIX = 'https://api-maps.yandex.ru'

declare global {
  interface Window {
    CDEKWidget?: new (config: Record<string, unknown>) => unknown
    // Яндекс.Карты v3 кладут себя сюда при успешной инициализации. Ключ,
    // отклонённый Яндексом (403, протух, исчерпана квота), не мешает
    // @cdek-it/widget всё равно вызвать onReady — карту он не поднимет, но
    // готовым себя всё равно считает. window.ymaps3 остаётся undefined —
    // используем это как проверку «карта правда поднялась», а не просто
    // «виджет позвал onReady».
    ymaps3?: unknown
  }
}

// Карта ПВЗ, которой управляет чекаут (спека §5.2): город и выбранный пункт
// приходят пропсами (список → карта), «Выбрать» на карте уходит в onChoose
// (карта → список). Хранилища виджета (pinia) общие для всех экземпляров,
// поэтому экземпляр один, а при размонтировании он уничтожается.
export function CdekWidget({
  goods,
  servicePath,
  tariffPvz,
  cityLocation,
  selectedPoint,
  onChoose,
}: CdekWidgetProps) {
  const rootId = `cdek-map-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const apiKey = process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY
  const widgetRef = useRef<WidgetInstance | null>(null)
  const [ready, setReady] = useState(false)
  // Как ready, но читаем свежее значение из таймера готовности (эффект не
  // перезапускается при каждой смене ready — см. ниже).
  const readyRef = useRef(false)
  const [unavailable, setUnavailable] = useState(!apiKey)
  // То же, что unavailable, но видно сразу и в колбэках: next/script может
  // вызвать onReady уже после того, как карта признана недоступной, и тогда
  // виджет не должен создаваться.
  const unavailableRef = useRef(!apiKey)
  const onChooseRef = useRef(onChoose)
  // Последние город и пункт: центр при создании виджета и данные для
  // эффектов синхронизации.
  const latestRef = useRef({ cityLocation, selectedPoint })
  // Код пункта, который покупатель выбрал на самой карте: он уже выделен,
  // центрировать и выбирать его заново не нужно.
  const chosenOnMapRef = useRef<string | null>(null)
  const stopRetryRef = useRef<(() => void) | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    onChooseRef.current = onChoose
    latestRef.current = { cityLocation, selectedPoint }
  })

  function create() {
    if (unavailableRef.current || widgetRef.current || !window.CDEKWidget) return
    const { cityLocation: city, selectedPoint: point } = latestRef.current
    let widget: WidgetInstance
    try {
      widget = new window.CDEKWidget({
        root: rootId,
        apiKey,
        servicePath,
        from: 'Москва',
        defaultLocation: point?.location ?? city ?? MOSCOW_CENTER,
        canChoose: true,
        goods,
        lang: 'rus',
        currency: 'RUB',
        // Только ПВЗ: адрес курьера вводится своими полями под городом, чтобы он
        // был в одном месте (§5.2). Постаматы — вне задачи (§3): у них свои
        // тарифы и ячейки, куда наши коробки проходят не всегда.
        tariffs: { office: [tariffPvz], door: [], pickup: [] },
        hideDeliveryOptions: { office: false, door: true },
        forceFilters: { type: 'PVZ' },
        // Наличные и карта в ПВЗ не нужны — заказ оплачен онлайн.
        hideFilters: { have_cash: true, have_cashless: true, is_dressing_room: true, type: true },
        onReady: () => {
          readyRef.current = true
          setReady(true)
        },
        onChoose: (mode: string, _tariff: unknown, target: WidgetOffice) => {
          if (mode !== 'office') return
          chosenOnMapRef.current = target.code
          onChooseRef.current(target)
        },
      }) as WidgetInstance
    } catch (err) {
      // Конструктор упал (битая сборка на CDN, несовместимые настройки) —
      // карты не будет, список работает.
      console.warn('cdek widget: не создался —', err instanceof Error ? err.message : err)
      unavailableRef.current = true
      setUnavailable(true)
      return
    }
    widgetRef.current = widget
    applyGeocoderKey(widget, process.env.NEXT_PUBLIC_YANDEX_GEOCODER_API_KEY)
  }

  // Скрипт уже загружен (карту показали снова, или React в разработке
  // перемонтировал компонент): второго onReady от next/script может не быть,
  // поэтому создаём сами. При размонтировании экземпляр уничтожаем.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- конструктор виджета упал: одна перерисовка в строку «Карта недоступна»
    if (apiKey) create()
    return () => {
      stopRetryRef.current?.()
      destroyWidget(widgetRef)
    }
    // Только на монтирование: create берёт свежие пропсы из latestRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Нет готовности за 10 с — вместо карты строка, список работает (§5.2).
  // Таймер запускаем один раз при монтировании (без зависимостей от ready):
  // отклонённый Яндексом ключ (403, протух, исчерпана квота) не мешает
  // @cdek-it/widget всё равно позвать onReady — карты при этом нет. Поэтому
  // проверяем на срабатывании не только ready, но и window.ymaps3: их
  // обычно ловит слушатель ошибки скрипта ниже (быстрее 10 с), а это —
  // подстраховка на случай, если Яндекс промолчит без события error.
  useEffect(() => {
    if (!apiKey) return
    const timer = setTimeout(() => {
      if (unavailableRef.current) return
      if (readyRef.current && typeof window.ymaps3 !== 'undefined') return
      unavailableRef.current = true
      stopRetryRef.current?.()
      destroyWidget(widgetRef)
      setUnavailable(true)
    }, MAP_READY_TIMEOUT_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Скрипт Яндекс.Карт подключает сам @cdek-it/widget (не наш next/script),
  // и его ошибку не проксирует наружу: отклонённый ключ (403) даёт `error`
  // прямо на этом <script>. Такие события не всплывают, поэтому слушаем на
  // погружении от document. Чужие ошибки скриптов (не Яндекс.Карт) не трогаем.
  useEffect(() => {
    const onScriptError = (event: Event) => {
      const target = event.target
      if (!(target instanceof HTMLScriptElement)) return
      if (!target.src.startsWith(YANDEX_MAPS_SCRIPT_PREFIX)) return
      if (unavailableRef.current) return
      unavailableRef.current = true
      stopRetryRef.current?.()
      destroyWidget(widgetRef)
      setUnavailable(true)
    }
    document.addEventListener('error', onScriptError, true)
    return () => document.removeEventListener('error', onScriptError, true)
  }, [])

  const cityKey = cityLocation ? cityLocation.join(',') : null
  const pointCode = selectedPoint?.code ?? null

  // Смена города — центр города, общий масштаб. Если пункт выбран, карту
  // ведёт он (эффект ниже).
  useEffect(() => {
    const widget = widgetRef.current
    const { cityLocation: city, selectedPoint: point } = latestRef.current
    if (!ready || !widget || !city || point) return
    chosenOnMapRef.current = null
    widget.updateLocation(city, 10).catch(() => {})
  }, [ready, cityKey, pointCode])

  // Список → карта: центр на пункте, затем selectOffice с повтором.
  // selectOffice не вызывает onChoose, петли нет.
  useEffect(() => {
    const widget = widgetRef.current
    const point = latestRef.current.selectedPoint
    if (!ready || !widget || !point) return
    if (chosenOnMapRef.current === point.code) {
      chosenOnMapRef.current = null
      return
    }
    const select = () => {
      try {
        widget.selectOffice(point.code)
      } catch {
        // Виджет ещё не готов принять выбор — попробуем на следующем шаге.
      }
    }
    widget.updateLocation(point.location, 17).catch(() => {})
    select()
    let attempts = 0
    const timer = setInterval(() => {
      attempts += 1
      select()
      if (attempts * SELECT_RETRY_MS >= SELECT_RETRY_FOR_MS) clearInterval(timer)
    }, SELECT_RETRY_MS)
    const stop = () => clearInterval(timer)
    stopRetryRef.current = stop
    return stop
  }, [ready, pointCode])

  // Покупатель сам двигает или масштабирует карту — повтор selectOffice больше
  // не возвращает её к пункту и не спорит с ним. Слушаем на погружении:
  // Яндекс.Карты могут останавливать всплытие своих событий, и обработчики
  // React (onWheel и т. п.) их бы не увидели.
  // Корень карты появляется и пропадает вместе с unavailable.
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const stop = () => stopRetryRef.current?.()
    for (const type of USER_MAP_EVENTS) {
      root.addEventListener(type, stop, { capture: true, passive: true })
    }
    return () => {
      for (const type of USER_MAP_EVENTS) root.removeEventListener(type, stop, { capture: true })
    }
  }, [unavailable])

  if (unavailable) {
    return (
      <p
        role="status"
        className="border border-[var(--color-lj-rule)] px-4 py-6 font-lj-body text-base text-[var(--color-lj-ink)] opacity-80"
      >
        {MAP_UNAVAILABLE_TEXT}
      </p>
    )
  }

  return (
    <>
      <Script
        src={WIDGET_SRC}
        strategy="afterInteractive"
        onReady={create}
        onError={() => {
          unavailableRef.current = true
          setUnavailable(true)
        }}
      />
      <div
        id={rootId}
        ref={rootRef}
        className="w-full h-[420px] md:h-[560px] border border-[var(--color-lj-rule)] bg-white"
        aria-label="Карта пунктов выдачи СДЭК"
      />
    </>
  )
}
