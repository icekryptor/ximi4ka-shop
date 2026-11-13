import { describe, it, expect } from 'vitest'
import { BLACK_FRIDAY, isBlackFridayActive } from './blackFriday'

describe('isBlackFridayActive', () => {
  it('выключена до полуночи 13.11 по Москве', () => {
    expect(isBlackFridayActive(new Date('2026-11-12T23:59:59+03:00'))).toBe(false)
  })

  it('включается ровно в 00:00 13.11 по Москве — за день до цен, как анонс', () => {
    expect(isBlackFridayActive(new Date('2026-11-13T00:00:00+03:00'))).toBe(true)
  })

  it('работает весь последний день — 28.11 до полуночи', () => {
    expect(isBlackFridayActive(new Date('2026-11-28T23:59:59+03:00'))).toBe(true)
  })

  it('выключается в 00:00 29.11 по Москве', () => {
    expect(isBlackFridayActive(new Date('2026-11-29T00:00:00+03:00'))).toBe(false)
  })

  it('считает по Москве, а не по часовому поясу сервера', () => {
    // 12.11 21:30 UTC = 13.11 00:30 МСК — баннер уже показан
    expect(isBlackFridayActive(new Date('2026-11-12T21:30:00Z'))).toBe(true)
  })
})

describe('BLACK_FRIDAY', () => {
  it('ведёт в категорию наборов', () => {
    expect(BLACK_FRIDAY.href).toBe('/categories/kits')
  })

  it('в ленте — суть акции, даты и призыв', () => {
    const text = BLACK_FRIDAY.tapeItems.join(' ')
    expect(text).toContain('Чёрная пятница')
    expect(text).toContain('2023')
    expect(text).toContain('14.11')
    expect(text).toContain('28.11')
    expect(text).toContain('Налетай!')
  })
})
