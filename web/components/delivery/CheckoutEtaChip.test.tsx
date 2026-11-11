import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import type { CdekCity } from '@ximi4ka-shop/shared'
import type { DeliveryDates } from '@ximi4ka-shop/shared/types/deliveryDates'

const mockGetEta = vi.fn<(cityCode?: number) => Promise<DeliveryDates | null>>()
vi.mock('@/lib/api', () => ({
  getDeliveryEta: (cityCode?: number) => mockGetEta(cityCode),
}))

import { saveCity } from '@/lib/deliveryCity'
import { resetDeliveryEtaCacheForTests } from '@/lib/deliveryEta'
import { CheckoutEtaChip } from './CheckoutEtaChip'

const KAZAN: CdekCity = { code: 424, name: 'Казань', fullName: 'Казань, Татарстан, Россия' }
const TODAY = '2026-11-11'
const FASTEST: DeliveryDates = { today: TODAY, dateMin: '2026-11-13', dateMax: '2026-11-14' }
const TO_KAZAN: DeliveryDates = { today: TODAY, dateMin: '2026-11-15', dateMax: '2026-11-17' }

beforeEach(() => {
  // 11 ноября 2026 по Москве.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-11T12:00:00Z'))
  mockGetEta.mockImplementation(async (cityCode) => (cityCode === 424 ? TO_KAZAN : FASTEST))
})
afterEach(() => {
  vi.useRealTimers()
  window.localStorage.clear()
  resetDeliveryEtaCacheForTests()
  mockGetEta.mockReset()
})

describe('CheckoutEtaChip', () => {
  it('способ доставки рассчитан — те же даты, что у выбранного способа', async () => {
    saveCity(KAZAN)
    // Курьер: 2 дня + сутки на сборку — не срок до пункта из общего запроса.
    render(<CheckoutEtaChip period={{ periodMin: 2, periodMax: 2 }} />)
    expect(await screen.findByTestId('delivery-eta-chip')).toHaveTextContent('14 ноября')
  })

  it('способ с вилкой срока — вилка дат', async () => {
    saveCity(KAZAN)
    render(<CheckoutEtaChip period={{ periodMin: 3, periodMax: 5 }} />)
    expect(await screen.findByTestId('delivery-eta-chip')).toHaveTextContent('15–17 ноября')
  })

  it('город выбран, цена ещё считается — вилка дат до города', async () => {
    saveCity(KAZAN)
    render(<CheckoutEtaChip period={null} />)
    expect(await screen.findByTestId('delivery-eta-chip')).toHaveTextContent('15–17 ноября')
    expect(mockGetEta).toHaveBeenCalledWith(424)
  })

  it('город не выбран — самый ранний срок, как на витрине', async () => {
    render(<CheckoutEtaChip period={null} />)
    const chip = await screen.findByTestId('delivery-eta-chip')
    expect(chip).toHaveTextContent('Доставка: послезавтра')
    expect(chip).not.toHaveTextContent('14 ноября')
  })

  it('СДЭК срок не назвал — чипа нет, место под него остаётся', async () => {
    mockGetEta.mockResolvedValue(null)
    render(<CheckoutEtaChip period={{ periodMin: null, periodMax: null }} />)
    await waitFor(() =>
      expect(screen.getByTestId('delivery-eta')).toHaveAttribute('data-state', 'none'),
    )
    expect(screen.queryByTestId('delivery-eta-chip')).not.toBeInTheDocument()
    expect(screen.getByTestId('delivery-eta').className).toContain('min-h-[28px]')
  })
})
