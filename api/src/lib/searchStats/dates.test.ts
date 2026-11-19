import { describe, it, expect } from 'vitest'
import { addDays, daysInclusive, todayMsk } from './dates.js'

describe('даты синхронизации', () => {
  it('todayMsk берёт московский день: 22:30 UTC — уже завтра', () => {
    expect(todayMsk(new Date('2026-10-27T22:30:00Z'))).toBe('2026-10-28')
  })
  it('addDays переходит через границу месяца', () => {
    expect(addDays('2026-10-01', -1)).toBe('2026-09-30')
    expect(addDays('2026-10-28', 7)).toBe('2026-11-04')
  })
  it('daysInclusive считает обе границы', () => {
    expect(daysInclusive('2026-10-01', '2026-10-01')).toBe(1)
    expect(daysInclusive('2026-10-01', '2026-10-30')).toBe(30)
  })
})
