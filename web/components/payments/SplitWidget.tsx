'use client'

import { useEffect, useRef, useState } from 'react'
import { YandexPaySdkScript } from '@/components/payments/SplitBadge'
import { splitBadgeAmount } from '@/lib/yandexPay'

// Виджет Ultimate Яндекс Пэй с графиком платежей Сплита (Web SDK,
// pay.yandex.ru/docs/ru/custom/web-sdk/ultimate-widget). Своей кнопки у виджета нет:
// заказ оформляется общей кнопкой чекаута, форму Яндекса открывает paymentUrl от
// сервера. Только Сплит: если он покупателю недоступен, виджет скрывает сам Яндекс.
// Скрипт не загрузился или сессия не создалась — остаётся текст.

export const SPLIT_FALLBACK_TEXT =
  'График платежей покажем в форме Яндекс Пэй после оформления заказа.'

interface YaPaySession {
  mountWidget(
    element: HTMLElement,
    options: { widgetType: unknown; hasCheckoutButton?: boolean },
  ): void
  unmountWidget(element: HTMLElement): void
  destroy?: () => void
}

interface YaPaySdk {
  createSession(
    paymentData: Record<string, unknown>,
    handlers: {
      onPayButtonClick: () => Promise<string>
      onFormOpenError?: (reason: unknown) => void
    },
  ): Promise<YaPaySession>
  CurrencyCode: { Rub: unknown }
  WidgetType: { Ultimate: unknown }
}

const SDK_POLL_MS = 200
const SDK_WAIT_MS = 30_000

function getYaPay(): YaPaySdk | null {
  const sdk = (window as Window & { YaPay?: YaPaySdk }).YaPay
  return sdk && typeof sdk.createSession === 'function' ? sdk : null
}

export function SplitWidget({ merchantId, totalRub }: { merchantId: string; totalRub: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [sdkReady, setSdkReady] = useState(false)
  const amount = splitBadgeAmount(totalRub)
  const key = `${merchantId}:${amount}`
  // Для какой суммы виджет смонтирован; сменилась сумма — снова текст до новой сессии.
  const [mountedFor, setMountedFor] = useState<string | null>(null)

  // onReady приходит не всегда: если pay.js уже грузит плашка с тем же id, next/script
  // второму экземпляру onReady не вызывает. Поэтому сами ждём window.YaPay (до 30 с).
  useEffect(() => {
    if (sdkReady) return
    const startedAt = Date.now()
    let timer = 0
    const check = () => {
      if (getYaPay()) setSdkReady(true)
      else if (Date.now() - startedAt < SDK_WAIT_MS) timer = window.setTimeout(check, SDK_POLL_MS)
    }
    timer = window.setTimeout(check, 0)
    return () => window.clearTimeout(timer)
  }, [sdkReady])

  useEffect(() => {
    const element = ref.current
    const sdk = sdkReady ? getYaPay() : null
    if (!element || !sdk || !amount) return
    let cancelled = false
    let session: YaPaySession | null = null
    sdk
      .createSession(
        {
          version: 4,
          currencyCode: sdk.CurrencyCode.Rub,
          merchantId,
          totalAmount: amount,
          availablePaymentMethods: ['SPLIT'],
        },
        {
          // Кнопки в виджете нет (hasCheckoutButton: false) — обработчик не вызывается.
          onPayButtonClick: () => Promise.reject(new Error('Оплата — кнопкой «Оформить заказ»')),
          onFormOpenError: () => {},
        },
      )
      .then((created) => {
        if (cancelled) {
          created.destroy?.()
          return
        }
        session = created
        created.mountWidget(element, {
          widgetType: sdk.WidgetType.Ultimate,
          hasCheckoutButton: false,
        })
        setMountedFor(`${merchantId}:${amount}`)
      })
      .catch(() => {
        // Сессия не создалась (Сплит недоступен, сеть) — остаётся текст.
      })
    return () => {
      cancelled = true
      if (session) {
        // Чужой скрипт может бросить (элемент уже отсоединён) — чекаут из-за этого не падает.
        try {
          session.unmountWidget(element)
          session.destroy?.()
        } catch {
          // ignore
        }
      }
    }
  }, [sdkReady, merchantId, amount])

  return (
    <div className="flex flex-col gap-2 pl-7">
      {mountedFor !== key && (
        <p className="m-0 font-lj-body text-sm text-[var(--color-lj-ink)] opacity-70">
          {SPLIT_FALLBACK_TEXT}
        </p>
      )}
      <div ref={ref} data-testid="split-widget" />
      <YandexPaySdkScript onReady={() => setSdkReady(true)} />
    </div>
  )
}
