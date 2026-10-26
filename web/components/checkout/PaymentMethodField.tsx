'use client'

import type { CheckoutPaymentMethod } from '@ximi4ka-shop/shared'
import { LABEL_CLASS } from '@/components/checkout/fieldStyles'
import { SplitBadge } from '@/components/payments/SplitBadge'
import { SPLIT_FALLBACK_TEXT, SplitWidget } from '@/components/payments/SplitWidget'
import { PAYMENT_METHOD_LABELS } from '@/lib/yandexPay'
import { SPLIT_GUIDE_PATH } from '@/lib/splitGuide'

// Отдельного «Яндекс Пэй» нет — нужен именно Сплит; карта остаётся запасной в форме Яндекса.
const METHODS: CheckoutPaymentMethod[] = ['tbank', 'yandex_split']

interface Props {
  value: CheckoutPaymentMethod
  onChange: (method: CheckoutPaymentMethod) => void
  /** Merchant ID боевого режима; null (песочница) — без плашки и виджета, только текст. */
  merchantId: string | null
  totalRub: number
}

// Блок «Способ оплаты»: радиокнопки по образцу «Куда доставить». У Сплита — плашка на
// сумму заказа, а при выбранном Сплите — виджет графика платежей.
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
            {PAYMENT_METHOD_LABELS[method]}
          </label>
          {method === 'yandex_split' && (
            // В новой вкладке: заполненная форма чекаута не теряется.
            <a
              href={SPLIT_GUIDE_PATH}
              target="_blank"
              rel="noopener"
              className="pl-7 font-lj-body text-sm text-[var(--color-lj-ink)] underline underline-offset-4 opacity-70"
            >
              Как оплатить в Сплит
            </a>
          )}
          {method === 'yandex_split' && (
            <SplitBadge
              merchantId={merchantId}
              amountRub={totalRub}
              source="checkout"
              className="pl-7"
            />
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
