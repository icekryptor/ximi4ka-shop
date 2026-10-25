import { describe, it, expect } from 'vitest'
import type { Order } from '../../entities/Order.js'
import { applyPaymentStatus } from './orderStatus.js'

describe('applyPaymentStatus: автор yandex_pay', () => {
  it('пишет в историю смену статуса от Яндекс Пэй', () => {
    const order = { status: 'pending', paidAt: null, statusHistory: [] } as unknown as Order
    const now = new Date('2026-10-24T12:00:00Z')
    expect(applyPaymentStatus(order, 'paid', 'yandex_pay', now)).toBe(true)
    expect(order.paidAt).toEqual(now)
    expect(order.statusHistory).toEqual([
      { from: 'pending', to: 'paid', at: now.toISOString(), by: 'yandex_pay' },
    ])
  })
})
