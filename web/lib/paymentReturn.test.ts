import { describe, it, expect } from 'vitest'
import { paymentReturnPath } from './paymentReturn'

describe('paymentReturnPath', () => {
  it('sends the buyer to their order page', () => {
    expect(paymentReturnPath({ OrderId: 'XM-2026-00042', Success: 'true' }, 'success')).toBe(
      '/order/XM-2026-00042?new=1',
    )
    expect(paymentReturnPath({ OrderId: 'XM-2026-00042' }, 'fail')).toBe(
      '/order/XM-2026-00042?payment=failed',
    )
  })

  it('falls back to the tracking form for missing or foreign order ids', () => {
    expect(paymentReturnPath({}, 'success')).toBe('/orders/track')
    expect(paymentReturnPath({ OrderId: '//evil.example' }, 'success')).toBe('/orders/track')
    expect(paymentReturnPath({ OrderId: ['XM-2026-1', 'XM-2026-2'] }, 'fail')).toBe('/orders/track')
  })
})
