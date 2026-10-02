import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  METRIKA_GOALS,
  ecommerceAdd,
  ecommerceDetail,
  ecommerceRemove,
  reachGoal,
  rememberPendingPurchase,
  reportPurchaseOnce,
  setMetrikaCounterId,
} from './metrika'

type W = Window & { ym?: unknown; dataLayer?: unknown[] }
const w = window as W

const product = { id: 'p1', name: 'Набор «Кристаллы»', price: 1500 }

beforeEach(() => {
  window.localStorage.clear()
  delete w.ym
  delete w.dataLayer
  setMetrikaCounterId(null)
})

afterEach(() => {
  setMetrikaCounterId(null)
})

describe('reachGoal', () => {
  it('is a no-op without a counter id (ym is not touched)', () => {
    const ym = vi.fn()
    w.ym = ym
    reachGoal(METRIKA_GOALS.addToCart)
    expect(ym).not.toHaveBeenCalled()
  })

  it('does not throw and does not create ym without a counter id', () => {
    expect(() => reachGoal('add_to_cart')).not.toThrow()
    expect(w.ym).toBeUndefined()
  })

  it('calls ym(id, "reachGoal", name, params) when the counter id is set', () => {
    const ym = vi.fn()
    w.ym = ym
    setMetrikaCounterId('12345')
    reachGoal('add_to_cart', { quantity: 2 })
    expect(ym).toHaveBeenCalledWith('12345', 'reachGoal', 'add_to_cart', { quantity: 2 })
  })

  it('swallows errors thrown by ym', () => {
    w.ym = () => {
      throw new Error('boom')
    }
    setMetrikaCounterId('12345')
    expect(() => reachGoal('open_cart')).not.toThrow()
  })

  it('queues the call in a ym stub when the Metrika script has not loaded yet', () => {
    setMetrikaCounterId('12345')
    expect(() => reachGoal('open_cart')).not.toThrow()
    expect(typeof w.ym).toBe('function')
    const queue = (w.ym as { a?: ArrayLike<unknown>[] }).a
    expect(Array.from(queue?.[0] ?? [])).toEqual(['12345', 'reachGoal', 'open_cart'])
  })
})

describe('ecommerce packages (dataLayer)', () => {
  beforeEach(() => {
    w.dataLayer = []
    setMetrikaCounterId('12345')
  })

  it('does not push anything without a counter id', () => {
    setMetrikaCounterId(null)
    ecommerceDetail(product)
    expect(w.dataLayer).toEqual([])
  })

  it('detail: one product without quantity', () => {
    ecommerceDetail(product)
    expect(w.dataLayer).toEqual([
      {
        ecommerce: {
          currencyCode: 'RUB',
          detail: { products: [{ id: 'p1', name: 'Набор «Кристаллы»', price: 1500 }] },
        },
      },
    ])
  })

  it('add: products carry quantity', () => {
    ecommerceAdd(product, 3)
    expect(w.dataLayer).toEqual([
      {
        ecommerce: {
          currencyCode: 'RUB',
          add: { products: [{ id: 'p1', name: 'Набор «Кристаллы»', price: 1500, quantity: 3 }] },
        },
      },
    ])
  })

  it('remove: same product shape as add, with quantity', () => {
    ecommerceRemove(product, 2)
    expect(w.dataLayer).toEqual([
      {
        ecommerce: {
          currencyCode: 'RUB',
          remove: { products: [{ id: 'p1', name: 'Набор «Кристаллы»', price: 1500, quantity: 2 }] },
        },
      },
    ])
  })

  it('creates window.dataLayer when it does not exist yet', () => {
    delete w.dataLayer
    ecommerceAdd(product, 1)
    expect(w.dataLayer).toHaveLength(1)
  })
})

describe('reportPurchaseOnce', () => {
  const products = [
    { id: 'p1', name: 'Набор А', price: 1000, quantity: 2 },
    { id: 'p2', name: 'Набор Б', price: 500, quantity: 1 },
  ]

  beforeEach(() => {
    w.dataLayer = []
    w.ym = vi.fn()
    setMetrikaCounterId('12345')
  })

  it('sends ecommerce purchase and the purchase goal for a remembered order', () => {
    rememberPendingPurchase('XM-2026-00042', products)
    expect(reportPurchaseOnce('XM-2026-00042', 3200)).toBe(true)
    expect(w.dataLayer).toEqual([
      {
        ecommerce: {
          currencyCode: 'RUB',
          purchase: {
            actionField: { id: 'XM-2026-00042', revenue: 3200 },
            products,
          },
        },
      },
    ])
    expect(w.ym).toHaveBeenCalledWith('12345', 'reachGoal', 'purchase', {
      order_price: 3200,
      currency: 'RUB',
    })
  })

  it('is idempotent: a reload does not report the same order twice', () => {
    rememberPendingPurchase('XM-2026-00042', products)
    expect(reportPurchaseOnce('XM-2026-00042', 3200)).toBe(true)
    expect(reportPurchaseOnce('XM-2026-00042', 3200)).toBe(false)
    expect(w.dataLayer).toHaveLength(1)
    expect(w.ym).toHaveBeenCalledTimes(1)
  })

  it('is idempotent even if the snapshot is written again after reporting', () => {
    rememberPendingPurchase('XM-2026-00042', products)
    reportPurchaseOnce('XM-2026-00042', 3200)
    rememberPendingPurchase('XM-2026-00042', products)
    expect(reportPurchaseOnce('XM-2026-00042', 3200)).toBe(false)
    expect(w.dataLayer).toHaveLength(1)
  })

  it('reports nothing for an order this browser did not place (no snapshot)', () => {
    expect(reportPurchaseOnce('XM-2026-00099', 1000)).toBe(false)
    expect(w.dataLayer).toEqual([])
    expect(w.ym).not.toHaveBeenCalled()
  })

  it('reports different orders independently', () => {
    rememberPendingPurchase('XM-2026-00001', products)
    rememberPendingPurchase('XM-2026-00002', products)
    expect(reportPurchaseOnce('XM-2026-00001', 100)).toBe(true)
    expect(reportPurchaseOnce('XM-2026-00002', 200)).toBe(true)
    expect(w.dataLayer).toHaveLength(2)
  })

  it('does not consume the snapshot while Metrika is disabled', () => {
    setMetrikaCounterId(null)
    rememberPendingPurchase('XM-2026-00042', products)
    expect(reportPurchaseOnce('XM-2026-00042', 3200)).toBe(false)
    setMetrikaCounterId('12345')
    expect(reportPurchaseOnce('XM-2026-00042', 3200)).toBe(true)
  })

  it('never puts personal data into the purchase package', () => {
    rememberPendingPurchase('XM-2026-00042', products)
    reportPurchaseOnce('XM-2026-00042', 3200)
    const serialized = JSON.stringify([w.dataLayer, (w.ym as ReturnType<typeof vi.fn>).mock.calls])
    expect(serialized).not.toMatch(/phone|email|телефон|address|адрес/i)
  })
})
