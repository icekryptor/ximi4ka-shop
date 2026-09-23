'use client'

import Script from 'next/script'
import { useEffect, useId, useRef } from 'react'
import type { WidgetDoorAddress, WidgetOfficeAddress, WidgetTariff } from '@/lib/shipping'

// Версия закреплена точно: у протокола между виджетом и нашим прокси
// (api/src/routes/public/cdek-widget.ts) нет отдельной спецификации, и новая
// версия может его поменять. Обновлять вместе с WIDGET_SERVICE_VERSION.
const WIDGET_SRC = 'https://cdn.jsdelivr.net/npm/@cdek-it/widget@4.0.0/dist/cdek-widget.umd.js'

interface Props {
  goods: { weight: number; length: number; width: number; height: number }[]
  servicePath: string
  tariffs: { pvz: number; courier: number }
  onChoose: (
    mode: 'office' | 'door',
    tariff: WidgetTariff,
    address: WidgetOfficeAddress | WidgetDoorAddress,
  ) => void
}

// Центр Москвы, [долгота, широта] — формат defaultLocation у виджета.
// Координаты, а не строка 'Москва': строку виджет геокодирует прямо в
// конструкторе, до того как мы успеем подставить ключ геокодера (см. ниже).
const MOSCOW_CENTER: [number, number] = [37.6176, 55.7558]

// Виджет 4.0.0 подписывает одним apiKey и загрузку карты (JavaScript API), и
// запросы к HTTP Геокодеру (поиск, адрес курьера). В кабинете Яндекса это два
// разных ключа, а отдельной опции у виджета нет, поэтому адрес геокодера
// переписываем на готовом экземпляре. Поле yandexApi.geocodeSrc в сборке не
// минифицировано; версия виджета закреплена, так что поле не уедет без нашего
// ведома. Если структура другая — молча оставляем общий ключ.
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

declare global {
  interface Window {
    CDEKWidget?: new (config: Record<string, unknown>) => unknown
  }
}

// Карта СДЭК с выбором ПВЗ или адреса для курьера. Виджет — ванильный
// скрипт, грузится только в браузере и создаётся один раз: его настройки
// после создания не меняются.
export function CdekWidget({ goods, servicePath, tariffs, onChoose }: Props) {
  const rootId = `cdek-map-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const created = useRef(false)
  const onChooseRef = useRef(onChoose)
  useEffect(() => {
    onChooseRef.current = onChoose
  }, [onChoose])

  const apiKey = process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY

  function create() {
    if (created.current || !window.CDEKWidget) return
    created.current = true
    const widget = new window.CDEKWidget({
      root: rootId,
      apiKey,
      servicePath,
      from: 'Москва',
      defaultLocation: MOSCOW_CENTER,
      canChoose: true,
      goods,
      lang: 'rus',
      currency: 'RUB',
      tariffs: { office: [tariffs.pvz], door: [tariffs.courier] },
      // Наличные и карта в ПВЗ не нужны — заказ оплачен онлайн.
      hideFilters: { have_cash: true, have_cashless: true, is_dressing_room: true },
      onChoose: (
        mode: 'office' | 'door',
        tariff: WidgetTariff,
        address: WidgetOfficeAddress | WidgetDoorAddress,
      ) => onChooseRef.current(mode, tariff, address),
    })
    applyGeocoderKey(widget, process.env.NEXT_PUBLIC_YANDEX_GEOCODER_API_KEY)
  }

  if (!apiKey) {
    return (
      <p
        role="status"
        className="border border-[var(--color-lj-rule)] px-4 py-6 font-lj-body text-base text-[var(--color-lj-ink)] opacity-80"
      >
        Карта недоступна: не настроен ключ Яндекс.Карт. Напишите нам — оформим доставку вручную.
      </p>
    )
  }

  return (
    <>
      <Script src={WIDGET_SRC} strategy="afterInteractive" onReady={create} />
      <div
        id={rootId}
        className="w-full h-[560px] border border-[var(--color-lj-rule)] bg-white"
        aria-label="Карта пунктов выдачи СДЭК"
      />
    </>
  )
}
