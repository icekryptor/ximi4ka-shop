import type { PublicCloudPayments } from '@ximi4ka-shop/shared'
import { getCloudPaymentsCheckoutPreview, getPublicSettings } from '@/lib/api'

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

// Проверка тестовым терминалом на проде: публичные настройки в режиме «Тест» отдают null
// (они кешируются для всех), поэтому админ открывает чекаут с ?cp_test=1, и витрина
// спрашивает админ-эндпоинт с cookie сессии. Без cp_test=1 лишних запросов нет.
export function isCloudPaymentsPreviewRequested(search: string): boolean {
  return new URLSearchParams(search).get('cp_test') === '1'
}

/** Процент для админа в режиме «Тест»; не админ (401), сбой или мусор — null. */
export function loadCloudPaymentsAdminPreview(): Promise<PublicCloudPayments | null> {
  return Promise.resolve()
    .then(() => getCloudPaymentsCheckoutPreview())
    .then((value) =>
      value && typeof value.surchargePercent === 'number'
        ? { surchargePercent: value.surchargePercent }
        : null,
    )
    .catch(() => null)
}

export function resetPublicCloudPaymentsCacheForTests(): void {
  cached = null
}
