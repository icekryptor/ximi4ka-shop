import { describe, it, expect } from 'vitest'
import {
  EASE_OUT_QUART_CSS,
  EASE_OUT_EXPO_CSS,
  TICKER_DURATION_S_LJ,
  ROTATE_SLOW_S,
  ROTATE_GHOST_S,
  COUNTUP_DURATION_MS,
  STATBAR_DURATION_S,
} from './motion'

describe('Lab Journal motion constants', () => {
  it('exports easing CSS strings', () => {
    expect(EASE_OUT_QUART_CSS).toBe('cubic-bezier(0.25, 1, 0.5, 1)')
    expect(EASE_OUT_EXPO_CSS).toBe('cubic-bezier(0.19, 1, 0.22, 1)')
  })

  it('exports duration constants in expected ranges', () => {
    expect(TICKER_DURATION_S_LJ).toBe(50)
    expect(ROTATE_SLOW_S).toBe(80)
    expect(ROTATE_GHOST_S).toBe(200)
    expect(COUNTUP_DURATION_MS).toBe(1800)
    expect(STATBAR_DURATION_S).toBe(1.2)
  })
})
