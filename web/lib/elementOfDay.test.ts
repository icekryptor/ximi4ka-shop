import { describe, it, expect } from 'vitest'
import { ELEMENTS, dayOfYear, getElementOfDay } from './elementOfDay'

describe('dayOfYear', () => {
  it('returns 1 for January 1st', () => {
    expect(dayOfYear(new Date(2026, 0, 1))).toBe(1)
  })

  it('returns 32 for February 1st', () => {
    expect(dayOfYear(new Date(2026, 1, 1))).toBe(32)
  })

  it('returns 365 for December 31st of a non-leap year', () => {
    expect(dayOfYear(new Date(2026, 11, 31))).toBe(365)
  })

  it('returns 366 for December 31st of a leap year', () => {
    expect(dayOfYear(new Date(2028, 11, 31))).toBe(366)
  })
})

describe('getElementOfDay', () => {
  it('is deterministic: same date → same element', () => {
    const d = new Date(2026, 6, 3)
    expect(getElementOfDay(d)).toBe(getElementOfDay(new Date(2026, 6, 3)))
  })

  it('is stable within a day but changes on consecutive days', () => {
    const morning = new Date(2026, 6, 3, 8, 0)
    const evening = new Date(2026, 6, 3, 23, 59)
    const nextDay = new Date(2026, 6, 4, 0, 1)
    expect(getElementOfDay(morning)).toBe(getElementOfDay(evening))
    expect(getElementOfDay(nextDay)).not.toBe(getElementOfDay(morning))
  })

  it('cycles through the whole list over ELEMENTS.length days', () => {
    const seen = new Set<string>()
    for (let i = 0; i < ELEMENTS.length; i++) {
      seen.add(getElementOfDay(new Date(2026, 0, 1 + i)).symbol)
    }
    expect(seen.size).toBe(ELEMENTS.length)
  })

  it('every element has the fields the footer cell renders', () => {
    for (const el of ELEMENTS) {
      expect(el.number).toBeGreaterThan(0)
      expect(el.symbol).toMatch(/^[A-Z][a-z]?$/)
      expect(el.name.length).toBeGreaterThan(1)
      expect(el.fact.length).toBeGreaterThan(5)
    }
  })
})
