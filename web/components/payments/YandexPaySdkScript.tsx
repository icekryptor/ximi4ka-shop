'use client'

import Script from 'next/script'

// pay.js Яндекса — только для виджета Сплита (график платежей). Грузится lazyOnload, в простое
// браузера после загрузки страницы, как счётчики в lib/analytics.tsx; Next подключает его один раз
// на страницу (общий id). Оплата от скрипта не зависит.

export const YANDEX_PAY_SDK_URL = 'https://pay.yandex.ru/sdk/v1/pay.js'

export function YandexPaySdkScript({ onReady }: { onReady?: () => void }) {
  return (
    <Script id="yandex-pay-sdk" src={YANDEX_PAY_SDK_URL} strategy="lazyOnload" onReady={onReady} />
  )
}
