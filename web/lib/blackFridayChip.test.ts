import { describe, expect, it } from 'vitest'
import { BLACK_FRIDAY_CHIP, hasBlackFridayChip } from './blackFridayChip'

const during = new Date('2026-11-20T12:00:00+03:00')

describe('hasBlackFridayChip', () => {
  it('в даты показа чип есть у всех наборов из списка', () => {
    for (const slug of BLACK_FRIDAY_CHIP.slugs) {
      expect(hasBlackFridayChip(slug, during)).toBe(true)
    }
  })

  it('у товара не из списка чипа нет и в даты акции', () => {
    expect(hasBlackFridayChip('sernaya-kislota', during)).toBe(false)
  })

  it('включается в 00:00 13.11 по Москве (за день до акции) и гаснет в 00:00 29.11', () => {
    const slug = 'himichka-30'
    expect(hasBlackFridayChip(slug, new Date('2026-11-12T23:59:59+03:00'))).toBe(false)
    expect(hasBlackFridayChip(slug, new Date('2026-11-13T00:00:00+03:00'))).toBe(true)
    expect(hasBlackFridayChip(slug, new Date('2026-11-28T23:59:59+03:00'))).toBe(true)
    expect(hasBlackFridayChip(slug, new Date('2026-11-29T00:00:00+03:00'))).toBe(false)
  })
})
