import type { PublicCloudPayments } from '@ximi4ka-shop/shared'
import { getPublicSettings } from '@/lib/api'

// CloudPayments на витрине: значение из публичных настроек с кешем на сессию (чекаут
// спрашивает api один раз). null — способ недоступен, блок выбора в ЕАЭС не рисуется.

function fetchCloudPayments(fresh = false): Promise<PublicCloudPayments | null> {
  return Promise.resolve()
    .then(() => (fresh ? getPublicSettings({ fresh: true }) : getPublicSettings()))
    .then((settings) => settings?.cloudPayments ?? null)
    .catch(() => null)
}

let cached: Promise<PublicCloudPayments | null> | null = null

export function loadPublicCloudPayments(): Promise<PublicCloudPayments | null> {
  cached ??= fetchCloudPayments()
  return cached
}

/** Перечитать мимо HTTP-кеша: CloudPayments выключили, пока покупатель был на чекауте. */
export function reloadPublicCloudPayments(): Promise<PublicCloudPayments | null> {
  cached = fetchCloudPayments(true)
  return cached
}

export function resetPublicCloudPaymentsCacheForTests(): void {
  cached = null
}
