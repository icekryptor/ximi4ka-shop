import { describe, expect, it } from 'vitest'
import { HANDOVER_DAYS, deliveryDates, handoverDateTime, moscowDate } from './deliveryDates'

// 11 ноября 2026, 15:00 по Москве.
const NOON = new Date('2026-11-11T12:00:00Z')
// 11 ноября 23:30 UTC — в Москве уже 12 ноября, 02:30.
const AFTER_MIDNIGHT_MSK = new Date('2026-11-11T23:30:00Z')

describe('moscowDate', () => {
  it('отдаёт дату по Москве, а не по UTC', () => {
    expect(moscowDate(NOON, 0)).toBe('2026-11-11')
    expect(moscowDate(AFTER_MIDNIGHT_MSK, 0)).toBe('2026-11-12')
  })

  it('прибавляет дни через границу месяца', () => {
    expect(moscowDate(new Date('2026-11-29T12:00:00Z'), 3)).toBe('2026-12-02')
  })
})

describe('handoverDateTime', () => {
  it('посылку относим в СДЭК через сутки на сборку — в полдень по Москве', () => {
    expect(HANDOVER_DAYS).toBe(1)
    expect(handoverDateTime(NOON)).toBe('2026-11-12T12:00:00+0300')
    expect(handoverDateTime(AFTER_MIDNIGHT_MSK)).toBe('2026-11-13T12:00:00+0300')
  })
})

describe('deliveryDates', () => {
  it('сегодня + сутки на сборку + срок СДЭК', () => {
    expect(deliveryDates({ periodMin: 1, periodMax: 3 }, NOON)).toEqual({
      today: '2026-11-11',
      dateMin: '2026-11-13',
      dateMax: '2026-11-15',
    })
  })

  it('срок СДЭК 0 дней — выдача в день передачи', () => {
    expect(deliveryDates({ periodMin: 0, periodMax: 0 }, NOON)).toEqual({
      today: '2026-11-11',
      dateMin: '2026-11-12',
      dateMax: '2026-11-12',
    })
  })

  it('известна одна граница — обе даты по ней', () => {
    expect(deliveryDates({ periodMin: 2, periodMax: null }, NOON)).toMatchObject({
      dateMin: '2026-11-14',
      dateMax: '2026-11-14',
    })
    expect(deliveryDates({ periodMin: null, periodMax: 4 }, NOON)).toMatchObject({
      dateMin: '2026-11-16',
      dateMax: '2026-11-16',
    })
  })

  it('верхняя граница не раньше нижней', () => {
    expect(deliveryDates({ periodMin: 5, periodMax: 3 }, NOON)).toMatchObject({
      dateMin: '2026-11-17',
      dateMax: '2026-11-17',
    })
  })

  it('СДЭК не назвал срок — дат нет', () => {
    expect(deliveryDates({ periodMin: null, periodMax: null }, NOON)).toBeNull()
  })
})
