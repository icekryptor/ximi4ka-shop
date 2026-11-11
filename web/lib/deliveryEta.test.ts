import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DeliveryDates } from '@ximi4ka-shop/shared/types/deliveryDates'

const mockGetEta = vi.fn<(cityCode?: number) => Promise<DeliveryDates | null>>()
vi.mock('@/lib/api', () => ({
  getDeliveryEta: (cityCode?: number) => mockGetEta(cityCode),
}))

import {
  ETA_CLIENT_TTL_MS,
  etaDayLabel,
  etaRangeLabel,
  loadDeliveryEta,
  resetDeliveryEtaCacheForTests,
} from './deliveryEta'

const TODAY = '2026-11-11'

describe('etaDayLabel', () => {
  it('на следующий день — «завтра», через день — «послезавтра»', () => {
    expect(etaDayLabel('2026-11-12', TODAY)).toBe('завтра')
    expect(etaDayLabel('2026-11-13', TODAY)).toBe('послезавтра')
  })

  it('дальше — дата: число и месяц', () => {
    expect(etaDayLabel('2026-11-14', TODAY)).toBe('14 ноября')
    expect(etaDayLabel('2026-12-02', TODAY)).toBe('2 декабря')
  })

  it('«завтра» и «послезавтра» считаются по календарю, через границу месяца и года', () => {
    expect(etaDayLabel('2026-12-01', '2026-11-30')).toBe('завтра')
    expect(etaDayLabel('2027-01-01', '2026-12-30')).toBe('послезавтра')
    expect(etaDayLabel('2027-01-03', '2026-12-30')).toBe('3 января')
  })

  it('в тот же день — «сегодня»', () => {
    expect(etaDayLabel(TODAY, TODAY)).toBe('сегодня')
  })
})

describe('etaRangeLabel', () => {
  it('одна дата — как в чипе', () => {
    expect(etaRangeLabel({ today: TODAY, dateMin: '2026-11-13', dateMax: '2026-11-13' })).toBe(
      'послезавтра',
    )
  })

  it('вилка в одном месяце — «14–16 ноября»', () => {
    expect(etaRangeLabel({ today: TODAY, dateMin: '2026-11-14', dateMax: '2026-11-16' })).toBe(
      '14–16 ноября',
    )
  })

  it('вилка через границу месяца — обе даты целиком', () => {
    expect(etaRangeLabel({ today: TODAY, dateMin: '2026-11-29', dateMax: '2026-12-02' })).toBe(
      '29 ноября – 2 декабря',
    )
  })
})

describe('loadDeliveryEta', () => {
  afterEach(() => {
    resetDeliveryEtaCacheForTests()
    mockGetEta.mockReset()
  })

  const eta: DeliveryDates = { today: TODAY, dateMin: '2026-11-13', dateMax: '2026-11-15' }

  it('один запрос на город: все чипы страницы делят один ответ', async () => {
    mockGetEta.mockResolvedValue(eta)
    const [a, b] = await Promise.all([loadDeliveryEta(424), loadDeliveryEta(424)])
    expect(a).toEqual(eta)
    expect(b).toEqual(eta)
    expect(mockGetEta).toHaveBeenCalledTimes(1)
    expect(mockGetEta).toHaveBeenCalledWith(424)
  })

  it('без города и с городом — разные запросы', async () => {
    mockGetEta.mockResolvedValue(eta)
    await loadDeliveryEta(null)
    await loadDeliveryEta(424)
    expect(mockGetEta).toHaveBeenCalledTimes(2)
    expect(mockGetEta).toHaveBeenNthCalledWith(1, undefined)
  })

  it('сбой запроса — срока нет, следующий показ пробует снова', async () => {
    mockGetEta.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(eta)
    expect(await loadDeliveryEta(424)).toBeNull()
    expect(await loadDeliveryEta(424)).toEqual(eta)
  })

  it('сервер ответил «срока нет» — не запоминаем: следующий показ спрашивает снова', async () => {
    mockGetEta.mockResolvedValueOnce(null).mockResolvedValue(eta)
    expect(await loadDeliveryEta(424)).toBeNull()
    expect(await loadDeliveryEta(424)).toEqual(eta)
    expect(mockGetEta).toHaveBeenCalledTimes(2)
  })

  it('ответ живёт недолго: вкладка, открытая с вечера, утром спросит срок заново', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(new Date('2026-11-11T18:00:00Z'))
      mockGetEta.mockResolvedValue(eta)
      await loadDeliveryEta(424)
      vi.setSystemTime(Date.now() + ETA_CLIENT_TTL_MS - 1000)
      await loadDeliveryEta(424)
      expect(mockGetEta).toHaveBeenCalledTimes(1)
      vi.setSystemTime(Date.now() + 2000)
      await loadDeliveryEta(424)
      expect(mockGetEta).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })
})
