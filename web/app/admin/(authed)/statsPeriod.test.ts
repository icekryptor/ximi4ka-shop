import { describe, it, expect } from 'vitest'
import { addDays, resolvePeriod, todayMsk } from './statsPeriod'

const NOW = new Date('2026-10-11T09:00:00Z') // 12:00 по Москве

describe('todayMsk', () => {
  it('день определяется по Москве, а не по UTC', () => {
    expect(todayMsk(new Date('2026-10-10T21:30:00Z'))).toBe('2026-10-11')
    expect(todayMsk(new Date('2026-10-10T20:59:59Z'))).toBe('2026-10-10')
  })
})

describe('addDays', () => {
  it('переходит через границу месяца и года', () => {
    expect(addDays('2026-10-01', -1)).toBe('2026-09-30')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })
})

describe('resolvePeriod', () => {
  it('по умолчанию — неделя: 7 дней, включая сегодня', () => {
    expect(resolvePeriod({}, NOW)).toEqual({
      preset: 'week',
      from: '2026-10-05',
      to: '2026-10-11',
    })
  })

  it('месяц — 30 дней, включая сегодня', () => {
    expect(resolvePeriod({ preset: 'month' }, NOW)).toEqual({
      preset: 'month',
      from: '2026-09-12',
      to: '2026-10-11',
    })
  })

  it('свой период принимается как есть', () => {
    expect(resolvePeriod({ preset: 'custom', from: '2026-09-01', to: '2026-09-15' }, NOW)).toEqual({
      preset: 'custom',
      from: '2026-09-01',
      to: '2026-09-15',
    })
  })

  it('один день — допустимый период', () => {
    expect(resolvePeriod({ preset: 'custom', from: '2026-09-01', to: '2026-09-01' }, NOW)).toEqual({
      preset: 'custom',
      from: '2026-09-01',
      to: '2026-09-01',
    })
  })

  it.each([
    ['from позже to', { preset: 'custom', from: '2026-09-15', to: '2026-09-01' }],
    ['мусор вместо даты', { preset: 'custom', from: 'foo', to: '2026-09-01' }],
    ['несуществующая дата', { preset: 'custom', from: '2026-02-31', to: '2026-03-05' }],
    ['нет to', { preset: 'custom', from: '2026-09-01' }],
    ['длиннее 366 дней', { preset: 'custom', from: '2025-10-06', to: '2026-10-07' }],
    ['неизвестный пресет', { preset: 'year' }],
  ])('откатывается на неделю: %s', (_name, params) => {
    expect(resolvePeriod(params, NOW)).toEqual({
      preset: 'week',
      from: '2026-10-05',
      to: '2026-10-11',
    })
  })

  it('quarter — 90 дней, включая сегодня', () => {
    expect(resolvePeriod({ preset: 'quarter' }, new Date('2026-10-28T09:00:00Z'))).toEqual({
      preset: 'quarter',
      from: '2026-07-31',
      to: '2026-10-28',
    })
  })

  it('ровно 366 дней допустимо', () => {
    expect(
      resolvePeriod({ preset: 'custom', from: '2025-10-07', to: '2026-10-07' }, NOW).preset,
    ).toBe('custom')
  })
})
