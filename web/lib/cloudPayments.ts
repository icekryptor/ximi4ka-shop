import type { PublicCloudPayments } from '@ximi4ka-shop/shared'
import { getPublicSettings } from '@/lib/api'

// CloudPayments на витрине: значение из публичных настроек с кешем на сессию (чекаут
// спрашивает api один раз). null — способ недоступен, блок выбора в ЕАЭС не рисуется.

function fetchCloudPayments(): Promise<PublicCloudPayments | null> {
  return Promise.resolve()
    .then(() => getPublicSettings())
    .then((settings) => settings?.cloudPayments ?? null)
    .catch(() => null)
}

let cached: Promise<PublicCloudPayments | null> | null = null

export function loadPublicCloudPayments(): Promise<PublicCloudPayments | null> {
  cached ??= fetchCloudPayments()
  return cached
}

export function resetPublicCloudPaymentsCacheForTests(): void {
  cached = null
}
