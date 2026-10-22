import { describe, it, expect } from 'vitest'
import { ANALYTICS_EVENT_TYPES, ANALYTICS_GOAL_TYPES, MAX_STATS_DAYS } from './analytics.js'

describe('analytics types', () => {
  it('цели — те же, что уходят в Метрику, без purchase', () => {
    expect([...ANALYTICS_GOAL_TYPES]).toEqual([
      'add_to_cart',
      'open_cart',
      'begin_checkout',
      'material_lead',
    ])
  })

  it('белый список событий — цели и полевые Web Vitals (web_vital)', () => {
    expect([...ANALYTICS_EVENT_TYPES]).toEqual([...ANALYTICS_GOAL_TYPES, 'web_vital'])
  })

  it('типы влезают в колонку analytics_events.type (varchar(32))', () => {
    for (const type of ANALYTICS_EVENT_TYPES) expect(type.length).toBeLessThanOrEqual(32)
  })

  it('максимальный период статистики — 366 дней', () => {
    expect(MAX_STATS_DAYS).toBe(366)
  })
})
