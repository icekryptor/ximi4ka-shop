'use client'

import { useEffect, useRef, useState } from 'react'
import type {
  CdekCity,
  CdekCityPoints,
  CdekPoint,
  DeliveryDestination,
  DeliveryMethod,
  DeliveryQuote,
} from '@ximi4ka-shop/shared'
import { getCdekPoints, quoteShipping } from '@/lib/api'
import {
  EMPTY_COURIER_ADDRESS,
  courierDestination,
  isPostalCode,
  pvzDestination,
  quoteDestination,
  type CourierAddress,
  type WidgetOffice,
} from '@/lib/shipping'

export const CITY_STORAGE_KEY = 'ximi4ka-checkout-city'
// Пересчёт курьера по полному адресу ждёт, пока покупатель допечатает: на
// каждую букву в СДЭК не ходим.
export const COURIER_REQUOTE_DELAY_MS = 400

const METHODS: readonly DeliveryMethod[] = ['cdek_pvz', 'cdek_courier']
const EMPTY_POINTS: CdekPoint[] = []

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface QuoteView {
  status: LoadStatus
  quote: DeliveryQuote | null
  // Идёт пересчёт курьера по полному адресу: цена по городу уже не та, что
  // спишет сервер.
  refining: boolean
}

export interface CdekDeliveryModel {
  city: CdekCity | null
  method: DeliveryMethod
  pointsStatus: LoadStatus
  points: CdekPoint[]
  // Центр последнего загруженного города: пока грузится список нового (или
  // покупатель перепечатывает город), карта стоит на месте.
  cityLocation: [number, number] | null
  // Список пунктов уже загружался в этом визите — карта не пропадает, пока
  // покупатель меняет город.
  pointsSeen: boolean
  point: CdekPoint | null
  courier: CourierAddress
  quotes: Record<DeliveryMethod, QuoteView>
  // Расчёт выбранного способа — для сводки и кнопки «Оформить».
  quote: DeliveryQuote | null
  quoting: boolean
  // «Куда везём» для заказа; null — чего-то не хватает. Для курьера — ровно
  // тот destination, по которому посчитана цена.
  destination: DeliveryDestination | null
  mapNotice: string | null
  pointError: string | null
  setCity: (city: CdekCity | null) => void
  setMethod: (method: DeliveryMethod) => void
  setPoint: (point: CdekPoint) => void
  setCourier: (address: CourierAddress) => void
  chooseOnMap: (office: WidgetOffice) => void
  retryPoints: () => void
  retryQuotes: () => void
  rejectPoint: (message: string) => void
}

// Сохранённый город (спека §5.1): только код и название, без персональных
// данных (§7). Хранилище может быть недоступно (приватный режим) или
// содержать мусор — тогда сохранённого города просто нет.
export function loadSavedCity(): CdekCity | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(CITY_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<CdekCity> | null
    if (
      !parsed ||
      typeof parsed.code !== 'number' ||
      !Number.isInteger(parsed.code) ||
      parsed.code <= 0 ||
      typeof parsed.name !== 'string' ||
      parsed.name === '' ||
      typeof parsed.fullName !== 'string'
    ) {
      return null
    }
    return { code: parsed.code, name: parsed.name, fullName: parsed.fullName }
  } catch {
    return null
  }
}

export function saveCity(city: CdekCity | null): void {
  try {
    if (city) {
      window.localStorage.setItem(
        CITY_STORAGE_KEY,
        JSON.stringify({ code: city.code, name: city.name, fullName: city.fullName }),
      )
    } else {
      window.localStorage.removeItem(CITY_STORAGE_KEY)
    }
  } catch {
    // Хранилище недоступно — город просто не запомнится.
  }
}

// Ответ засчитывается только под своим ключом (город и попытка, для цен ещё и
// корзина, для курьера — полный адрес): поздний ответ по прошлому городу или
// адресу не перетрёт новый.
const pointsKeyOf = (cityCode: number, attempt: number) => `${cityCode}#${attempt}`
const quotesKeyOf = (cityCode: number, cartKey: string, attempt: number) =>
  `${cityCode}#${cartKey}#${attempt}`

interface PointsResult {
  key: string
  data: CdekCityPoints | null // null — СДЭК или сеть не ответили
}

interface QuotesResult {
  key: string
  byMethod: Partial<Record<DeliveryMethod, DeliveryQuote | null>> // null — ошибка
}

interface CourierQuoteResult {
  key: string
  quote: DeliveryQuote | null // null — ошибка
}

// Состояние блока «Доставка» чекаута (спека §5): город → способ → пункт или
// адрес курьера. Пункты и цены грузятся при выборе города; смена города
// сбрасывает пункт, но не адрес курьера (§5.1). Цена курьера по полному
// адресу пересчитывается, чтобы совпасть с тем, что спишет сервер.
export function useCdekDelivery(
  items: { productId: string; quantity: number }[],
): CdekDeliveryModel {
  const [city, setCityState] = useState<CdekCity | null>(loadSavedCity)
  const [method, setMethod] = useState<DeliveryMethod>('cdek_pvz')
  const [point, setPointState] = useState<CdekPoint | null>(null)
  const [courier, setCourier] = useState<CourierAddress>(EMPTY_COURIER_ADDRESS)
  const [mapNotice, setMapNotice] = useState<string | null>(null)
  const [pointError, setPointError] = useState<string | null>(null)
  const [pointsAttempt, setPointsAttempt] = useState(0)
  const [quotesAttempt, setQuotesAttempt] = useState(0)
  const [pointsResult, setPointsResult] = useState<PointsResult | null>(null)
  const [quotesResult, setQuotesResult] = useState<QuotesResult | null>(null)
  const [courierQuote, setCourierQuote] = useState<CourierQuoteResult | null>(null)

  const cityCode = city?.code ?? null
  const cityName = city?.name ?? ''
  const cartKey = items.map((i) => `${i.productId}:${i.quantity}`).join(',')

  // Полный адрес курьера — тот же destination, что уйдёт в заказ. Индекс, если
  // введён, должен быть из 6 цифр: с недописанным индексом не пересчитываем.
  const postalCode = courier.postalCode.trim()
  const courierFull =
    city && courier.street.trim() !== '' && (postalCode === '' || isPostalCode(postalCode))
      ? courierDestination(city, courier)
      : null
  const courierKey =
    courierFull && cartKey !== ''
      ? `${JSON.stringify(courierFull)}#${cartKey}#${quotesAttempt}`
      : null

  // Свежие корзина и адрес для отложенных запросов.
  const latestRef = useRef({ items, courierFull })
  useEffect(() => {
    latestRef.current = { items, courierFull }
  })

  useEffect(() => {
    if (cityCode === null) return
    const key = pointsKeyOf(cityCode, pointsAttempt)
    const controller = new AbortController()
    getCdekPoints(cityCode, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setPointsResult({ key, data })
      })
      .catch(() => {
        if (!controller.signal.aborted) setPointsResult({ key, data: null })
      })
    return () => controller.abort()
  }, [cityCode, pointsAttempt])

  useEffect(() => {
    if (cityCode === null || cartKey === '') return
    const key = quotesKeyOf(cityCode, cartKey, quotesAttempt)
    const lines = latestRef.current.items.map((i) => ({
      productId: i.productId,
      quantity: i.quantity,
    }))
    let cancelled = false
    const record = (m: DeliveryMethod, quote: DeliveryQuote | null) => {
      if (cancelled) return
      setQuotesResult((prev) => ({
        key,
        byMethod: { ...(prev?.key === key ? prev.byMethod : {}), [m]: quote },
      }))
    }
    // Цена ПВЗ зависит только от города, поэтому оба способа считаем сразу
    // после выбора города (§5.1, п. 2). Считает по-прежнему только сервер.
    for (const m of METHODS) {
      quoteShipping({
        items: lines,
        destination: quoteDestination(m, { code: cityCode, name: cityName }),
      })
        .then((data) => record(m, data.quote))
        .catch(() => record(m, null))
    }
    return () => {
      cancelled = true
    }
  }, [cityCode, cityName, cartKey, quotesAttempt])

  // Курьера сервер считает по полному адресу (postal_code и address в
  // to_location), и цена может отличаться от расчёта по городу. Показываем и
  // требуем для оформления ровно ту, что спишет сервер.
  useEffect(() => {
    if (courierKey === null) return
    const key = courierKey
    let cancelled = false
    const timer = setTimeout(() => {
      const { items: current, courierFull: destination } = latestRef.current
      if (!destination) return
      quoteShipping({
        items: current.map((i) => ({ productId: i.productId, quantity: i.quantity })),
        destination,
      })
        .then((data) => {
          if (!cancelled) setCourierQuote({ key, quote: data.quote })
        })
        .catch(() => {
          if (!cancelled) setCourierQuote({ key, quote: null })
        })
    }, COURIER_REQUOTE_DELAY_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [courierKey])

  const pointsKey = cityCode === null ? null : pointsKeyOf(cityCode, pointsAttempt)
  const pointsHit = pointsKey !== null && pointsResult?.key === pointsKey ? pointsResult : null
  const pointsStatus: LoadStatus =
    pointsKey === null ? 'idle' : !pointsHit ? 'loading' : pointsHit.data ? 'ready' : 'error'
  const points = pointsHit?.data?.points ?? EMPTY_POINTS
  // Последний ответ, даже по прошлому городу: карта не прыгает в Москву, пока
  // грузится новый список.
  const cityLocation = pointsResult?.data?.city.location ?? null
  const pointsSeen = pointsResult?.data != null

  const quotesKey =
    cityCode === null || cartKey === '' ? null : quotesKeyOf(cityCode, cartKey, quotesAttempt)
  const quotesHit =
    quotesKey !== null && quotesResult?.key === quotesKey ? quotesResult.byMethod : null
  const cityQuoteView = (m: DeliveryMethod): QuoteView => {
    if (quotesKey === null) return { status: 'idle', quote: null, refining: false }
    const q = quotesHit?.[m]
    if (q === undefined) return { status: 'loading', quote: null, refining: false }
    return q
      ? { status: 'ready', quote: q, refining: false }
      : { status: 'error', quote: null, refining: false }
  }
  const courierView: QuoteView =
    courierKey === null
      ? cityQuoteView('cdek_courier')
      : courierQuote?.key !== courierKey
        ? { status: 'loading', quote: null, refining: true }
        : courierQuote.quote
          ? { status: 'ready', quote: courierQuote.quote, refining: false }
          : { status: 'error', quote: null, refining: false }
  const quotes: Record<DeliveryMethod, QuoteView> = {
    cdek_pvz: cityQuoteView('cdek_pvz'),
    cdek_courier: courierView,
  }

  const destination: DeliveryDestination | null = !city
    ? null
    : method === 'cdek_pvz'
      ? point
        ? pvzDestination(city, point)
        : null
      : courierFull

  function setCity(next: CdekCity | null) {
    setCityState(next)
    // Смена города сбрасывает пункт; адрес курьера не трогает (§5.1).
    setPointState(null)
    setPointError(null)
    setMapNotice(null)
    saveCity(next)
  }

  function setPoint(next: CdekPoint) {
    setPointState(next)
    setPointError(null)
    setMapNotice(null)
  }

  // Карта → список (§5.2): пункт с карты ставится, только если он есть в
  // списке города, иначе заказ ушёл бы с пунктом, которого сервер не знает.
  function chooseOnMap(office: WidgetOffice) {
    if (!city) {
      setMapNotice('Сначала выберите город — пункт появится в списке')
      return
    }
    if (pointsStatus === 'loading') {
      setMapNotice('Список ещё загружается — попробуйте через секунду')
      return
    }
    const found = points.find((p) => p.code === office.code)
    if (found) {
      setPoint(found)
      return
    }
    setMapNotice(
      office.city_code !== city.code
        ? 'Этот пункт в другом городе — смените город'
        : 'Этот пункт нельзя выбрать — найдите другой в списке',
    )
  }

  // Сервер не нашёл пункт при оформлении (§4.3, §6): выбор сброшен, ошибка у
  // поля, список города грузится заново.
  function rejectPoint(message: string) {
    setPointState(null)
    setPointError(message)
    setPointsAttempt((n) => n + 1)
  }

  return {
    city,
    method,
    pointsStatus,
    points,
    cityLocation,
    pointsSeen,
    point,
    courier,
    quotes,
    quote: quotes[method].quote,
    quoting: quotes[method].status === 'loading',
    destination,
    mapNotice,
    pointError,
    setCity,
    setMethod,
    setPoint,
    setCourier,
    chooseOnMap,
    retryPoints: () => setPointsAttempt((n) => n + 1),
    retryQuotes: () => setQuotesAttempt((n) => n + 1),
    rejectPoint,
  }
}
