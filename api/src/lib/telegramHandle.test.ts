import { describe, it, expect } from 'vitest'
import { normalizeTelegramHandle } from './telegramHandle.js'

describe('normalizeTelegramHandle', () => {
  it.each([
    ['maria_ivanova', '@maria_ivanova'],
    ['@maria_ivanova', '@maria_ivanova'],
    ['  @Maria_Ivanova  ', '@Maria_Ivanova'],
    ['https://t.me/maria_ivanova', '@maria_ivanova'],
    ['t.me/maria_ivanova/', '@maria_ivanova'],
    ['telegram.me/maria_ivanova', '@maria_ivanova'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeTelegramHandle(input)).toBe(expected)
  })

  it.each(['mar', 'мария', 'maria ivanova', '@', 'a'.repeat(33), '+79123456789'])(
    'невалидный: %s',
    (input) => {
      expect(normalizeTelegramHandle(input)).toBeNull()
    },
  )
})
