import { describe, it, expect, vi } from 'vitest'
import {
  DeadlineError,
  deliveryDateInterval,
  fallbackQuote,
  moscowDate,
  parseYcpOptionId,
  withDeadline,
  ycpOptionId,
} from './deliveryOptions.js'

const CONFIG = { fromCityCode: 44, tariffPvz: 136, tariffCourier: 137 }

describe('id варианта доставки', () => {
  it('детерминирован и разбирается обратно', () => {
    expect(ycpOptionId('cdek_pvz', 136, 44)).toBe('pvz-136-44')
    expect(ycpOptionId('cdek_courier', 137, null)).toBe('courier-137-0')
    expect(parseYcpOptionId('pvz-136-44')).toEqual({
      method: 'cdek_pvz',
      tariffCode: 136,
      cityCode: 44,
    })
    expect(parseYcpOptionId('courier-137-0')).toEqual({
      method: 'cdek_courier',
      tariffCode: 137,
      cityCode: null,
    })
  })

  it.each(['', 'pvz-136', 'x-1-2', 'pvz-136-44-1', 'option-12345'])(
    'чужой id «%s» → null',
    (id) => {
      expect(parseYcpOptionId(id)).toBeNull()
    },
  )

  it('без id → null', () => {
    expect(parseYcpOptionId(undefined)).toBeNull()
  })
})

describe('сроки доставки', () => {
  it('дата — по Москве', () => {
    // 22:30 UTC 11-го — уже 01:30 12-го в Москве.
    expect(moscowDate(new Date('2026-10-11T22:30:00Z'), 0)).toBe('2026-10-12')
    expect(moscowDate(new Date('2026-10-11T09:00:00Z'), 3)).toBe('2026-10-14')
  })

  it('день передачи в СДЭК + срок калькулятора; без срока — ориентировочный', () => {
    const now = new Date('2026-10-11T09:00:00Z')
    expect(deliveryDateInterval({ periodMin: 2, periodMax: 4 }, now)).toEqual({
      start_interval: { date: '2026-10-14' },
      end_interval: { date: '2026-10-16' },
      time_zone: 3,
    })
    expect(deliveryDateInterval({ periodMin: null, periodMax: null }, now)).toEqual({
      start_interval: { date: '2026-10-15' },
      end_interval: { date: '2026-10-19' },
      time_zone: 3,
    })
  })
})

describe('fallbackQuote', () => {
  it('фиксированная ставка и порог бесплатной доставки, как на сайте', () => {
    expect(fallbackQuote('cdek_pvz', 1500, CONFIG)).toMatchObject({
      tariffCode: 136,
      customerPriceRub: 350,
      source: 'fallback',
    })
    expect(fallbackQuote('cdek_pvz', 3000, CONFIG).customerPriceRub).toBe(0)
    expect(fallbackQuote('cdek_courier', 4999, CONFIG).customerPriceRub).toBe(500)
  })
})

describe('withDeadline', () => {
  it('быстрый ответ проходит, медленный обрывается DeadlineError', async () => {
    const cdek = {
      get: vi.fn(async () => 'ok'),
      post: vi.fn(() => new Promise(() => undefined)),
    }
    const limited = withDeadline(cdek as never, 30)
    await expect(limited.get('/x')).resolves.toBe('ok')
    const started = Date.now()
    await expect(limited.post('/y', {})).rejects.toBeInstanceOf(DeadlineError)
    expect(Date.now() - started).toBeLessThan(500)
  })
})
