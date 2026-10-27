'use client'

import type { CheckoutPaymentMethod } from '@ximi4ka-shop/shared'
import { LABEL_CLASS } from '@/components/checkout/fieldStyles'

// Оплата при доставке в страны ЕАЭС: Т-Банк принимает «Мир» и российские Visa /
// Mastercard, карты банков этих стран — через CloudPayments. Подписи однозначные, чтобы
// покупатель с «Миром» не выбрал способ с надбавкой случайно. UnionPay не обещаем.
const METHODS: Array<Extract<CheckoutPaymentMethod, 'tbank' | 'cloudpayments'>> = [
  'tbank',
  'cloudpayments',
]

function label(method: (typeof METHODS)[number], surchargePercent: number): string {
  if (method === 'tbank') return 'Картой «Мир» или российской Visa / Mastercard'
  const base = 'Visa / Mastercard банка Беларуси, Казахстана, Армении или Киргизии'
  return surchargePercent > 0 ? `${base} — +${surchargePercent}% к заказу` : base
}

interface Props {
  value: CheckoutPaymentMethod
  onChange: (method: CheckoutPaymentMethod) => void
  surchargePercent: number
}

export function CisPaymentMethodField({ value, onChange, surchargePercent }: Props) {
  return (
    <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
      <legend className={`${LABEL_CLASS} mb-2`}>Способ оплаты</legend>
      {METHODS.map((method) => (
        <label
          key={method}
          className="flex cursor-pointer items-center gap-3 font-lj-body text-base text-[var(--color-lj-ink)]"
        >
          <input
            type="radio"
            name="checkout-payment-method"
            value={method}
            checked={value === method}
            onChange={() => onChange(method)}
            className="accent-[var(--color-lj-ink)]"
          />
          {label(method, surchargePercent)}
        </label>
      ))}
    </fieldset>
  )
}
