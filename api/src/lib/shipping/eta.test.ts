import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest'
import { ETA_FAILURE_TTL_MS, clearEtaCache, deliveryEta } from './eta.js'
import { deliveryConfigFromEnv } from './quote.js'

const config = deliveryConfigFromEnv({})
// 11 ноября 2026, 15:00 по Москве.
const now = () => new Date('2026-11-11T12:00:00Z')

function cdekReturning(result: unknown) {
  return { post: vi.fn().mockResolvedValue(result) }
}

describe('deliveryEta', () => {
  beforeEach(() => clearEtaCache())

  it('город выбран — сегодня + сутки на сборку + срок СДЭК до ПВЗ этого города', async () => {
    const cdek = cdekReturning({ total_sum: 300, calendar_min: 2, calendar_max: 4 })
    const eta = await deliveryEta({ cityCode: 424 }, { cdek, config, now })
    expect(eta).toEqual({ today: '2026-11-11', dateMin: '2026-11-14', dateMax: '2026-11-16' })
    expect(cdek.post).toHaveBeenCalledWith(
      '/calculator/tariff',
      expect.objectContaining({
        tariff_code: 136,
        date: '2026-11-12T12:00:00+0300',
        from_location: { code: 44 },
        to_location: { code: 424 },
      }),
    )
  })

  it('город не выбран — самый быстрый срок: доставка по городу отправки', async () => {
    const cdek = cdekReturning({ total_sum: 160, calendar_min: 1, calendar_max: 1 })
    const eta = await deliveryEta({}, { cdek, config, now })
    expect(eta).toMatchObject({ dateMin: '2026-11-13' })
    expect(cdek.post.mock.calls[0][1].to_location).toEqual({ code: 44 })
  })

  it('срок по городу кешируется: второй запрос в СДЭК не идёт', async () => {
    const cdek = cdekReturning({ total_sum: 300, period_min: 2, period_max: 4 })
    await deliveryEta({ cityCode: 424 }, { cdek, config, now })
    await deliveryEta({ cityCode: 424 }, { cdek, config, now })
    expect(cdek.post).toHaveBeenCalledTimes(1)
    await deliveryEta({ cityCode: 270 }, { cdek, config, now })
    expect(cdek.post).toHaveBeenCalledTimes(2)
  })

  it('на следующий день срок считается заново: день передачи посылки другой', async () => {
    const cdek = cdekReturning({ total_sum: 300, calendar_min: 2, calendar_max: 4 })
    await deliveryEta({ cityCode: 424 }, { cdek, config, now })
    const tomorrow = () => new Date('2026-11-12T12:00:00Z')
    const eta = await deliveryEta({ cityCode: 424 }, { cdek, config, now: tomorrow })
    expect(cdek.post).toHaveBeenCalledTimes(2)
    expect(eta).toMatchObject({ today: '2026-11-12', dateMin: '2026-11-15' })
  })

  describe('сбой СДЭК', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(now())
    })
    afterEach(() => vi.useRealTimers())

    it('срока нет; сбой помнится пару минут — лежащий СДЭК не добиваем запросами', async () => {
      const cdek = {
        post: vi
          .fn()
          .mockRejectedValueOnce(new Error('timeout'))
          .mockResolvedValue({ total_sum: 300, calendar_min: 2, calendar_max: 4 }),
      }
      expect(await deliveryEta({ cityCode: 424 }, { cdek, config, now })).toBeNull()
      expect(await deliveryEta({ cityCode: 424 }, { cdek, config, now })).toBeNull()
      expect(cdek.post).toHaveBeenCalledTimes(1)

      vi.setSystemTime(now().getTime() + ETA_FAILURE_TTL_MS + 1)
      expect(await deliveryEta({ cityCode: 424 }, { cdek, config, now })).toMatchObject({
        dateMin: '2026-11-14',
      })
      expect(cdek.post).toHaveBeenCalledTimes(2)
    })

    it('СДЭК не назвал срок (или не знает город) — даты нет, повторно не спрашиваем', async () => {
      const cdek = cdekReturning({ total_sum: 300 })
      expect(await deliveryEta({ cityCode: 999 }, { cdek, config, now })).toBeNull()
      expect(await deliveryEta({ cityCode: 999 }, { cdek, config, now })).toBeNull()
      expect(cdek.post).toHaveBeenCalledTimes(1)
    })
  })

  it('одновременные запросы по одному городу ждут один ответ СДЭК', async () => {
    let release!: (value: unknown) => void
    const cdek = {
      post: vi.fn().mockReturnValue(new Promise((resolve) => (release = resolve))),
    }
    const both = Promise.all([
      deliveryEta({ cityCode: 424 }, { cdek, config, now }),
      deliveryEta({ cityCode: 424 }, { cdek, config, now }),
    ])
    release({ total_sum: 300, calendar_min: 2, calendar_max: 4 })
    const [a, b] = await both
    expect(a).toEqual(b)
    expect(a).toMatchObject({ dateMin: '2026-11-14' })
    expect(cdek.post).toHaveBeenCalledTimes(1)
  })
})
