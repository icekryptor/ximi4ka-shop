import { describe, it, expect } from 'vitest'
import { ANALYTICS_EVENT_TYPES, MAX_STATS_DAYS } from './analytics.js'

describe('analytics types', () => {
  it('белый список событий — те же цели, что уходят в Метрику, без purchase', () => {
    expect([...ANALYTICS_EVENT_TYPES]).toEqual([
      'add_to_cart',
      'open_cart',
      'begin_checkout',
      'material_lead',
    ])
  })

  it('максимальный период статистики — 366 дней', () => {
    expect(MAX_STATS_DAYS).toBe(366)
  })
})
