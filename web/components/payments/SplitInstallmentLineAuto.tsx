'use client'

import { SplitInstallmentLine } from '@/components/payments/SplitInstallmentLine'
import { usePublicYandexPay } from '@/lib/yandexPay'

/** Чип для клиентских корзин: показывается, когда Сплит включён на сайте (настройки — кеш на сессию). */
export function SplitInstallmentLineAuto({ priceRub }: { priceRub: number }) {
  const yandexPay = usePublicYandexPay()
  return yandexPay?.split ? <SplitInstallmentLine priceRub={priceRub} /> : null
}
