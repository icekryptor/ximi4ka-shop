import { describe, it, expect } from 'vitest'
import {
  ORDER_POLL_INTERVAL_MS,
  ORDER_POLL_MAX_ATTEMPTS,
  orderStatusLabel,
  orderTimelineSteps,
} from './orderStatus'

describe('orderStatusLabel', () => {
  it('distinguishes manual (Принят) from tbank (Ожидает оплаты) while pending', () => {
    expect(orderStatusLabel('pending', 'manual')).toBe('Принят')
    expect(orderStatusLabel('pending', 'tbank')).toBe('Ожидает оплаты')
  })

  it('maps terminal statuses to Russian labels', () => {
    expect(orderStatusLabel('paid', 'tbank')).toBe('Оплачен')
    expect(orderStatusLabel('failed', 'tbank')).toBe('Ошибка оплаты')
    expect(orderStatusLabel('cancelled', 'manual')).toBe('Отменён')
  })
})

describe('orderTimelineSteps', () => {
  it('pending + tbank: Создан ✓ → Ожидает оплаты (active) → Оплачен (upcoming)', () => {
    expect(orderTimelineSteps('pending', 'tbank')).toEqual([
      { label: 'Создан', state: 'done', tone: 'default' },
      { label: 'Ожидает оплаты', state: 'active', tone: 'default' },
      { label: 'Оплачен', state: 'upcoming', tone: 'default' },
    ])
  })

  it('pending + manual: второй шаг называется «Принят»', () => {
    const steps = orderTimelineSteps('pending', 'manual')
    expect(steps[1]).toEqual({ label: 'Принят', state: 'active', tone: 'default' })
  })

  it('paid: все шаги пройдены, «Оплачен» активен с success-тоном', () => {
    expect(orderTimelineSteps('paid', 'tbank')).toEqual([
      { label: 'Создан', state: 'done', tone: 'default' },
      { label: 'Ожидает оплаты', state: 'done', tone: 'default' },
      { label: 'Оплачен', state: 'active', tone: 'success' },
    ])
  })

  it('failed: терминальный шаг «Ошибка оплаты» с danger-тоном', () => {
    const steps = orderTimelineSteps('failed', 'tbank')
    expect(steps[2]).toEqual({ label: 'Ошибка оплаты', state: 'active', tone: 'danger' })
  })

  it('cancelled: терминальный шаг «Отменён» с danger-тоном', () => {
    const steps = orderTimelineSteps('cancelled', 'manual')
    expect(steps[2]).toEqual({ label: 'Отменён', state: 'active', tone: 'danger' })
  })

  it('always renders exactly three steps', () => {
    for (const status of ['pending', 'paid', 'failed', 'cancelled'] as const) {
      for (const provider of ['manual', 'tbank'] as const) {
        expect(orderTimelineSteps(status, provider)).toHaveLength(3)
      }
    }
  })
})

describe('poll constants', () => {
  it('polls every 5 seconds for at most 5 minutes', () => {
    expect(ORDER_POLL_INTERVAL_MS).toBe(5000)
    expect(ORDER_POLL_MAX_ATTEMPTS * ORDER_POLL_INTERVAL_MS).toBe(5 * 60 * 1000)
  })
})
