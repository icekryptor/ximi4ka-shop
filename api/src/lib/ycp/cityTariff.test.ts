import { describe, it, expect, vi } from 'vitest'
import { CdekError } from '../cdek/client.js'
import {
  CITY_CHECK_MAX_CONSECUTIVE_FAILURES,
  type CityCheck,
  checkCityTariff,
  cityCheckTtlMs,
  filterServedPickupPoints,
} from './cityTariff.js'
import type { PickupPointEntry } from './pickupPoints.js'

const NOW = new Date('2026-11-19T12:00:00Z')
const DAY = 24 * 60 * 60_000

function entry(id: string, cityCode: number): PickupPointEntry {
  return {
    cityCode,
    point: {
      id,
      name: id,
      address: `адрес ${id}`,
      is_cash_available: false,
      is_card_available: false,
      working_hours: {},
      coordinates: { lat: 55, lon: 37 },
      time_zone: 3,
      display_service_type: 'cdek',
    },
  }
}

const unavailable = () =>
  new CdekError(400, 'err_result_service_empty', 'Выбранный тариф недоступен', [
    { code: 'err_result_service_empty', message: 'Выбранный тариф недоступен' },
  ])

// Калькулятор СДЭК: города из unavailableCities — тариф недоступен, из
// failingCities — сбой СДЭК, остальные — цена.
function fakeCalc(opts: { unavailableCities?: number[]; failingCities?: number[] } = {}) {
  const post = vi.fn(async (_path: string, body: unknown) => {
    const code = (body as { to_location: { code: number } }).to_location.code
    if (opts.unavailableCities?.includes(code)) throw unavailable()
    if (opts.failingCities?.includes(code)) {
      throw new CdekError(0, 'network_error', 'СДЭК недоступен: timeout')
    }
    return { delivery_sum: 300, period_min: 2, period_max: 4 }
  })
  return { post }
}

const deps = (cdek: ReturnType<typeof fakeCalc>, cache = new Map<number, CityCheck>()) => ({
  cdek,
  tariffCode: 136,
  fromCityCode: 44,
  now: NOW,
  cache,
})

describe('checkCityTariff', () => {
  it('спрашивает калькулятор тарифом ПВЗ из города отгрузки в код города пункта', async () => {
    const cdek = fakeCalc()
    expect(
      await checkCityTariff(cdek, 24221, { tariffCode: 136, fromCityCode: 44, now: NOW }),
    ).toBe('served')
    expect(cdek.post).toHaveBeenCalledWith(
      '/calculator/tariff',
      expect.objectContaining({
        tariff_code: 136,
        from_location: { code: 44 },
        to_location: { code: 24221 },
      }),
    )
  })

  it('err_result_service_empty — тариф сюда не возит', async () => {
    const cdek = fakeCalc({ unavailableCities: [24221] })
    expect(
      await checkCityTariff(cdek, 24221, { tariffCode: 136, fromCityCode: 44, now: NOW }),
    ).toBe('unavailable')
  })

  it('код недоступности не первым в списке ошибок — тоже недоступен', async () => {
    const cdek = {
      post: vi.fn(async () => {
        throw new CdekError(400, 'v2_some_warning', 'x', [
          { code: 'v2_some_warning' },
          { code: 'ERR_RESULT_SERVICE_EMPTY' },
        ])
      }),
    }
    expect(await checkCityTariff(cdek, 1, { tariffCode: 136, fromCityCode: 44, now: NOW })).toBe(
      'unavailable',
    )
  })

  it('любой другой сбой СДЭК — неизвестно', async () => {
    const cdek = fakeCalc({ failingCities: [1] })
    expect(await checkCityTariff(cdek, 1, { tariffCode: 136, fromCityCode: 44, now: NOW })).toBe(
      'unknown',
    )
    const weird = { post: vi.fn(async () => ({ errors: [] })) }
    expect(await checkCityTariff(weird, 1, { tariffCode: 136, fromCityCode: 44, now: NOW })).toBe(
      'unknown',
    )
  })
})

describe('filterServedPickupPoints', () => {
  it('убирает пункты города, куда тариф не возит, остальные оставляет по порядку', async () => {
    const cdek = fakeCalc({ unavailableCities: [24221] })
    const result = await filterServedPickupPoints(
      [entry('MSK1', 44), entry('PIT4', 24221), entry('MSK2', 44), entry('SPB1', 137)],
      deps(cdek),
    )
    expect(result.entries.map((e) => e.point.id)).toEqual(['MSK1', 'MSK2', 'SPB1'])
    expect(result.removedPoints).toBe(1)
    // Один запрос на город, а не на пункт.
    expect(cdek.post).toHaveBeenCalledTimes(3)
  })

  it('сбой СДЭК по городу — пункт остаётся, в кеш не попадает', async () => {
    const cache = new Map<number, CityCheck>()
    const cdek = fakeCalc({ failingCities: [24221] })
    const result = await filterServedPickupPoints([entry('PIT4', 24221)], deps(cdek, cache))
    expect(result.entries.map((e) => e.point.id)).toEqual(['PIT4'])
    expect(result.unknownCities).toBe(1)
    expect(cache.has(24221)).toBe(false)
    expect(result.fresh.size).toBe(0)
  })

  it('свежий результат из кеша — без запроса к СДЭК; устаревший — перепроверяет', async () => {
    const cache = new Map<number, CityCheck>([
      [24221, { served: false, checkedAt: new Date(NOW.getTime() - DAY) }],
      [44, { served: true, checkedAt: new Date(NOW.getTime() - 30 * DAY) }],
    ])
    const cdek = fakeCalc()
    const result = await filterServedPickupPoints(
      [entry('MSK1', 44), entry('PIT4', 24221)],
      deps(cdek, cache),
    )
    expect(result.entries.map((e) => e.point.id)).toEqual(['MSK1'])
    expect(cdek.post).toHaveBeenCalledTimes(1)
    expect(cdek.post.mock.calls[0][1]).toMatchObject({ to_location: { code: 44 } })
    expect(result.fresh.get(44)).toEqual({ served: true, checkedAt: NOW })
    expect(cache.get(44)).toEqual({ served: true, checkedAt: NOW })
  })

  it('СДЭК лежит — после серии сбоев перестаёт спрашивать и оставляет все пункты', async () => {
    const cities = Array.from({ length: 50 }, (_, i) => 1000 + i)
    const cdek = fakeCalc({ failingCities: cities })
    const result = await filterServedPickupPoints(
      cities.map((c) => entry(`P${c}`, c)),
      deps(cdek),
    )
    expect(result.entries).toHaveLength(50)
    expect(result.unknownCities).toBe(50)
    // Параллельные запросы могли уже уйти, но не все пятьдесят.
    expect(cdek.post.mock.calls.length).toBeLessThan(CITY_CHECK_MAX_CONSECUTIVE_FAILURES + 8)
  })

  it('калькулятор бросает не-CdekError — пункт остаётся', async () => {
    const cdek = {
      post: vi.fn(async () => {
        throw new Error('boom')
      }),
    }
    const result = await filterServedPickupPoints([entry('X', 5)], {
      ...deps(fakeCalc()),
      cdek,
    })
    expect(result.entries).toHaveLength(1)
  })
})

describe('cityCheckTtlMs', () => {
  it('от 6 до 8 суток, разный у соседних городов — перепроверки не сбиваются в одну', () => {
    const ttls = Array.from({ length: 200 }, (_, i) => cityCheckTtlMs(i))
    expect(Math.min(...ttls)).toBeGreaterThanOrEqual(6 * DAY)
    expect(Math.max(...ttls)).toBeLessThanOrEqual(8 * DAY)
    expect(new Set(ttls).size).toBeGreaterThan(10)
  })
})
