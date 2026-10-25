'use client'

import { useEffect, useRef, useState } from 'react'
import Script from 'next/script'
import { splitBadgeAmount, usePublicYandexPay } from '@/lib/yandexPay'

// Плашка Сплита от Яндекса (Web SDK, тег yandex-pay-badge type="bnpl"). pay.js
// грузится lazyOnload — в простое браузера после загрузки страницы, как счётчики в
// lib/analytics.tsx; Next подключает его один раз на страницу (общий id). Оплата от
// скрипта не зависит. Плашка персональная: Яндекс рисует её только вошедшему в Яндекс
// посетителю с лимитом Сплита, остальным — пусто; поэтому место под неё не резервируем.

export const YANDEX_PAY_SDK_URL = 'https://pay.yandex.ru/sdk/v1/pay.js'

export type SplitBadgeSource = 'main' | 'listing' | 'item' | 'cart' | 'checkout'

export function YandexPaySdkScript({ onReady }: { onReady?: () => void }) {
  return (
    <Script id="yandex-pay-sdk" src={YANDEX_PAY_SDK_URL} strategy="lazyOnload" onReady={onReady} />
  )
}

interface SplitBadgeProps {
  merchantId: string | null | undefined
  amountRub: number
  source: SplitBadgeSource
  /** m — корзина, чекаут; s — карточки в списках. */
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

/**
 * Плашка для карточек в каталоге и на главной: настройки, pay.js и бейдж — только когда
 * карточка подходит к экрану (за 200 px), как мини-каталог опта: если Яндекс плашку нарисует,
 * низ карточки сдвинется ещё вне экрана. Без IntersectionObserver — сразу.
 */
export function SplitBadgeLazy({
  amountRub,
  source,
  className,
}: Omit<SplitBadgeProps, 'merchantId' | 'size'>) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === 'undefined')

  useEffect(() => {
    const element = ref.current
    if (visible || !element) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: '200px' },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [visible])

  return (
    <div ref={ref} data-testid="split-badge-slot" data-source={source} className={className}>
      {visible && <SplitBadgeAuto amountRub={amountRub} source={source} size="s" />}
    </div>
  )
}
