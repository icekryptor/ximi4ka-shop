import { describe, it, expect } from 'vitest'
import { avatarInitial, coinsWord, formatCoins } from './coins'

describe('coins helpers', () => {
  it('coinsWord склоняет по числу', () => {
    expect(coinsWord(1)).toBe('химикоин')
    expect(coinsWord(3)).toBe('химикоина')
    expect(coinsWord(5)).toBe('химикоинов')
    expect(coinsWord(11)).toBe('химикоинов')
    expect(coinsWord(21)).toBe('химикоин')
    expect(coinsWord(0)).toBe('химикоинов')
  })
  it('formatCoins разделяет разряды', () => {
    expect(formatCoins(1900)).toBe('1 900')
    expect(formatCoins(12345)).toBe('12 345')
    expect(formatCoins(190)).toBe('190')
  })
  it('avatarInitial берёт заглавную букву имени или почты', () => {
    expect(avatarInitial('рената', null)).toBe('Р')
    expect(avatarInitial(null, 'buyer@test.local')).toBe('B')
    expect(avatarInitial('  ', null)).toBe('?')
  })
})
