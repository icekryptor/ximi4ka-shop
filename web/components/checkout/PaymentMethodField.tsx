'use client'

import type { CheckoutPaymentMethod } from '@ximi4ka-shop/shared'
import { LABEL_CLASS } from '@/components/checkout/fieldStyles'
import Image from 'next/image'
import { SplitInstallmentLine } from '@/components/payments/SplitInstallmentLine'
import { SPLIT_FALLBACK_TEXT, SplitWidget } from '@/components/payments/SplitWidget'
import { PAYMENT_METHOD_LABELS } from '@/lib/yandexPay'

// Отдельного «Яндекс Пэй» нет — нужен именно Сплит; карта остаётся запасной в форме Яндекса.
const METHODS: CheckoutPaymentMethod[] = ['tbank', 'yandex_split']

// Значки способов: у карты — нейтральная иконка (логотипа Т-Банка в ассетах нет), у Сплита —
// официальный значок из макета владельца.
function MethodIcon({ method }: { method: CheckoutPaymentMethod }) {
  if (method === 'yandex_split') {
    // Обёртка шириной с иконку карты — подписи способов начинаются на одной линии.
    return (
      <span className="inline-flex w-6 shrink-0 justify-center">
        <Image
          src="/img/brand/yandex-split-icon.svg"
          alt=""
          width={18}
          height={18}
          unoptimized
          className="h-[18px] w-[18px]"
        />
      </span>
    )
  }
  return (
    <svg
      data-testid="payment-icon-card"
      aria-hidden="true"
      viewBox="0 0 24 18"
      className="h-[18px] w-6 shrink-0 text-[var(--color-lj-ink)]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <rect x="1" y="1" width="22" height="16" rx="3" />
      <path d="M1 6h22" />
      <path d="M5 12.5h5" strokeLinecap="round" />
    </svg>
  )
}

interface Props {
  value: CheckoutPaymentMethod
  onChange: (method: CheckoutPaymentMethod) => void
  /** Merchant ID боевого режима; null (песочница) — без плашки и виджета, только текст. */
  merchantId: string | null
  totalRub: number
}

// Блок «Способ оплаты» (правая колонка, над кнопкой оформления): радиокнопки со значками. У Сплита —
// чип «N ₽ × 4 платежа» на сумму заказа, а при выбранном Сплите — виджет графика платежей.
export function PaymentMethodField({ value, onChange, merchantId, totalRub }: Props) {
  return (
    <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
      <legend className={`${LABEL_CLASS} mb-2`}>Способ оплаты</legend>
      {METHODS.map((method) => (
        <div key={method} className="flex flex-col gap-2">
          <label className="flex cursor-pointer items-center gap-3 font-lj-body text-base text-[var(--color-lj-ink)]">
            <input
              type="radio"
              name="checkout-payment-method"
              value={method}
              checked={value === method}
              onChange={() => onChange(method)}
              className="accent-[var(--color-lj-ink)]"
            />
            <MethodIcon method={method} />
            {PAYMENT_METHOD_LABELS[method]}
          </label>
          {method === 'yandex_split' && (
            <span className="pl-7">
              <SplitInstallmentLine priceRub={totalRub} />
            </span>
          )}
          {method === 'yandex_split' &&
            value === 'yandex_split' &&
            (merchantId ? (
              <SplitWidget merchantId={merchantId} totalRub={totalRub} />
            ) : (
              <p className="m-0 pl-7 font-lj-body text-sm text-[var(--color-lj-ink)] opacity-70">
                {SPLIT_FALLBACK_TEXT}
              </p>
            ))}
        </div>
      ))}
    </fieldset>
  )
}
