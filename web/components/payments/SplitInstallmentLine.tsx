import { formatRub } from '@/lib/stockLabel'
import { SPLIT_PAYMENTS, splitPaymentRub } from '@/lib/splitInstallments'

// Строка под ценой набора. Это реклама финансовой услуги (38-ФЗ, ст. 28): рядом с суммой —
// кто даёт услугу и что нужно одобрение; формулировку согласует владелец.
export function SplitInstallmentLine({ priceRub }: { priceRub: number }) {
  const payment = splitPaymentRub(priceRub)
  if (payment === null) return null
  return (
    <p
      data-testid="split-installments"
      className="m-0 font-lj-body text-[0.8125rem] leading-snug text-[var(--color-lj-ink)] opacity-70"
    >
      Сплит от Яндекса: {SPLIT_PAYMENTS} платежа по {formatRub(payment)}, при одобрении
    </p>
  )
}
