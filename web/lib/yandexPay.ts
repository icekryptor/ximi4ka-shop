import { useEffect, useState } from 'react'
import type { CheckoutPaymentMethod, PublicYandexPay } from '@ximi4ka-shop/shared'
import { getPublicSettings } from '@/lib/api'

// Яндекс Пэй на витрине: подписи способов, сумма плашки и yandexPay из публичных
// настроек с кешем на сессию (корзины и чекаут спрашивают api один раз). Только для
// клиентских компонентов — здесь хук; серверная карточка товара берёт настройки сама.

export const PAYMENT_METHOD_LABELS: Record<CheckoutPaymentMethod, string> = {
  tbank: 'Картой — Т-Банк',
  yandex_pay: 'Яндекс Пэй',
  yandex_split: 'Сплит — оплата частями',
}

export function isYandexMethod(method: CheckoutPaymentMethod): boolean {
  return method === 'yandex_pay' || method === 'yandex_split'
}

/** Сумма для плашки строкой «2490.00»; ноль, минус и не-число — плашки нет. */
export function splitBadgeAmount(amountRub: number): string | null {
  return Number.isFinite(amountRub) && amountRub > 0 ? amountRub.toFixed(2) : null
}

function fetchYandexPay(): Promise<PublicYandexPay | null> {
  return Promise.resolve()
    .then(() => getPublicSettings())
    .then((settings) => settings?.yandexPay ?? null)
    .catch(() => null)
}

let cached: Promise<PublicYandexPay | null> | null = null

export function loadPublicYandexPay(): Promise<PublicYandexPay | null> {
  cached ??= fetchYandexPay()
  return cached
}

/** Перечитать: Яндекс выключили, пока покупатель был на чекауте. */
export function reloadPublicYandexPay(): Promise<PublicYandexPay | null> {
  cached = fetchYandexPay()
  return cached
}

export function resetPublicYandexPayCacheForTests(): void {
  cached = null
}

/** yandexPay для клиентского компонента; undefined — ещё загружается. */
export function usePublicYandexPay(): PublicYandexPay | null | undefined {
  const [yandexPay, setYandexPay] = useState<PublicYandexPay | null | undefined>(undefined)
  useEffect(() => {
    let cancelled = false
    void loadPublicYandexPay().then((value) => {
      if (!cancelled) setYandexPay(value)
    })
    return () => {
      cancelled = true
    }
  }, [])
  return yandexPay
}
