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
    new window.CDEKWidget({
      root: rootId,
      apiKey,
      servicePath,
      from: 'Москва',
      defaultLocation: 'Москва',
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
