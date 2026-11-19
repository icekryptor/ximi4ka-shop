'use client'

import { etaDayLabel, etaRangeLabel, useDeliveryEta } from '@/lib/deliveryEta'
import { formatDeliveryDates } from '@/lib/shipping'
import { ETA_CHIP_RESERVE, EtaChip, etaChipTitle } from './DeliveryEtaChip'

interface Period {
  periodMin: number | null
  periodMax: number | null
}

// Даты выбранного способа — та же формула, что в подписи способа доставки.
function periodLabel(period: Period | null): string | null {
  return period ? formatDeliveryDates(period.periodMin, period.periodMax, new Date()) : null
}

// Чип срока в сводке заказа на чекауте. Способ доставки рассчитан — показываем
// его даты (у курьера и пункта они разные). Пока цены нет — срок до пункта в
// выбранном городе; город не выбран — самый ранний срок, как на витрине.
// Город здесь не спрашиваем: он выбирается в блоке доставки слева.
export function CheckoutEtaChip({ period }: { period: Period | null }) {
  const { city, eta } = useDeliveryEta()
  const chosen = periodLabel(period)
  const label =
    chosen ?? (eta ? (city ? etaRangeLabel(eta) : etaDayLabel(eta.dateMin, eta.today)) : undefined)

  if (label === undefined) {
    return (
      <div
        data-testid="delivery-eta"
        data-state={eta === null ? 'none' : 'loading'}
        className={ETA_CHIP_RESERVE}
      />
    )
  }
  return (
    <div data-testid="delivery-eta" data-state="ready" className={`flex ${ETA_CHIP_RESERVE}`}>
      <EtaChip
        label={label}
        title={chosen ? 'Срок доставки выбранным способом' : etaChipTitle(city?.name)}
      />
    </div>
  )
}
