'use client'

import Script from 'next/script'
import { splitBadgeAmount, usePublicYandexPay } from '@/lib/yandexPay'

// Плашка Сплита от Яндекса (Web SDK, тег yandex-pay-badge type="bnpl"). pay.js
// грузится lazyOnload — в простое браузера после загрузки страницы, как счётчики в
// lib/analytics.tsx; Next подключает его один раз на страницу (общий id). Оплата от
// скрипта не зависит. Плашка персональная: Яндекс рисует её только вошедшему в Яндекс
// посетителю с лимитом Сплита, остальным — пусто; поэтому место под неё не резервируем.

export const YANDEX_PAY_SDK_URL = 'https://pay.yandex.ru/sdk/v1/pay.js'

export type SplitBadgeSource = 'item' | 'cart' | 'checkout'

export function YandexPaySdkScript({ onReady }: { onReady?: () => void }) {
  return (
    <Script id="yandex-pay-sdk" src={YANDEX_PAY_SDK_URL} strategy="lazyOnload" onReady={onReady} />
  )
}

interface SplitBadgeProps {
  merchantId: string | null | undefined
  amountRub: number
  source: SplitBadgeSource
  size?: 's' | 'm'
  className?: string
}

export function SplitBadge({
  merchantId,
  amountRub,
  source,
  size = 'm',
  className,
}: SplitBadgeProps) {
  const id = merchantId?.trim()
  const amount = splitBadgeAmount(amountRub)
  if (!id || !amount) return null
  return (
    <div data-testid="split-badge" className={className}>
      <yandex-pay-badge
        type="bnpl"
        amount={amount}
        merchant-id={id}
        source={source}
        size={size}
        theme="light"
      />
      <YandexPaySdkScript />
    </div>
  )
}

/** Плашка для клиентских корзин: Merchant ID — из публичных настроек (кеш на сессию). */
export function SplitBadgeAuto(props: Omit<SplitBadgeProps, 'merchantId'>) {
  const yandexPay = usePublicYandexPay()
  return <SplitBadge merchantId={yandexPay?.merchantId} {...props} />
}
