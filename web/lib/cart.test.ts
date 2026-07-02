import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import {
  type CartItem,
  addToCart,
  calculateSubtotal,
  clearCart,
  loadCart,
  removeFromCart,
  saveCart,
  setQuantity,
  useCart,
} from './cart'

const itemA: Omit<CartItem, 'quantity'> = {
  productId: 'a',
  slug: 'kit-a',
  name: 'Набор A',
  priceRub: 1000,
}

const itemB: Omit<CartItem, 'quantity'> = {
  productId: 'b',
  slug: 'kit-b',
  name: 'Набор B',
  priceRub: 2500,
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('addToCart', () => {
  it('adds a new item with quantity 1 by default', () => {
    const result = addToCart([], itemA)
    expect(result).toEqual([{ ...itemA, quantity: 1 }])
  })

  it('adds with explicit quantity', () => {
    const result = addToCart([], itemA, 3)
    expect(result).toEqual([{ ...itemA, quantity: 3 }])
  })

  it('increments quantity when same productId exists', () => {
    const start: CartItem[] = [{ ...itemA, quantity: 2 }]
    const result = addToCart(start, itemA, 2)
    expect(result).toEqual([{ ...itemA, quantity: 4 }])
  })

  it('appends different product without touching existing', () => {
    const start: CartItem[] = [{ ...itemA, quantity: 1 }]
    const result = addToCart(start, itemB, 1)
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ ...itemA, quantity: 1 })
    expect(result[1]).toEqual({ ...itemB, quantity: 1 })
  })
})

describe('removeFromCart', () => {
  it('removes by productId', () => {
    const start: CartItem[] = [
      { ...itemA, quantity: 1 },
      { ...itemB, quantity: 2 },
    ]
    expect(removeFromCart(start, 'a')).toEqual([{ ...itemB, quantity: 2 }])
  })

  it('no-op when productId not present', () => {
    const start: CartItem[] = [{ ...itemA, quantity: 1 }]
    expect(removeFromCart(start, 'missing')).toEqual(start)
  })
})

describe('setQuantity', () => {
  it('updates quantity', () => {
    const start: CartItem[] = [{ ...itemA, quantity: 1 }]
    expect(setQuantity(start, 'a', 7)).toEqual([{ ...itemA, quantity: 7 }])
  })

  it('removes item when quantity is 0', () => {
    const start: CartItem[] = [
      { ...itemA, quantity: 1 },
      { ...itemB, quantity: 1 },
    ]
    expect(setQuantity(start, 'a', 0)).toEqual([{ ...itemB, quantity: 1 }])
  })

  it('removes item when quantity is negative', () => {
    const start: CartItem[] = [{ ...itemA, quantity: 1 }]
    expect(setQuantity(start, 'a', -5)).toEqual([])
  })
})

describe('clearCart', () => {
  it('returns empty array', () => {
    expect(clearCart()).toEqual([])
  })
})

describe('calculateSubtotal', () => {
  it('sums price × qty across items', () => {
    const items: CartItem[] = [
      { ...itemA, quantity: 2 },
      { ...itemB, quantity: 3 },
    ]
    expect(calculateSubtotal(items)).toBe(2 * 1000 + 3 * 2500)
  })

  it('returns 0 for empty cart', () => {
    expect(calculateSubtotal([])).toBe(0)
  })
})

describe('loadCart / saveCart', () => {
  it('loadCart returns empty array when localStorage empty', () => {
    expect(loadCart()).toEqual([])
  })

  it('loadCart returns empty array when JSON is malformed', () => {
    window.localStorage.setItem('ximi4ka-shop-cart', '{not json')
    expect(loadCart()).toEqual([])
  })

  it('loadCart returns empty array when stored value is not an array', () => {
    window.localStorage.setItem('ximi4ka-shop-cart', JSON.stringify({ foo: 'bar' }))
    expect(loadCart()).toEqual([])
  })

  it('loadCart filters out invalid items', () => {
    window.localStorage.setItem(
      'ximi4ka-shop-cart',
      JSON.stringify([
        { ...itemA, quantity: 1 },
        { productId: 'x' }, // missing fields
        null,
        'string',
      ]),
    )
    expect(loadCart()).toEqual([{ ...itemA, quantity: 1 }])
  })

  it('saveCart persists and dispatches cart-updated event', () => {
    const spy = vi.fn()
    window.addEventListener('cart-updated', spy)
    saveCart([{ ...itemA, quantity: 1 }])
    const raw = window.localStorage.getItem('ximi4ka-shop-cart')
    expect(JSON.parse(raw ?? '[]')).toEqual([{ ...itemA, quantity: 1 }])
    expect(spy).toHaveBeenCalledTimes(1)
    window.removeEventListener('cart-updated', spy)
  })

  it('round-trips items through save/load', () => {
    const cart: CartItem[] = [
      { ...itemA, quantity: 2 },
      { ...itemB, quantity: 1 },
    ]
    saveCart(cart)
    expect(loadCart()).toEqual(cart)
  })
})

describe('image field — миграция формата localStorage', () => {
  it('loads legacy items without image (old format) untouched', () => {
    window.localStorage.setItem(
      'ximi4ka-shop-cart',
      JSON.stringify([{ ...itemA, quantity: 2 }]),
    )
    expect(loadCart()).toEqual([{ ...itemA, quantity: 2 }])
    expect(loadCart()[0]).not.toHaveProperty('image')
  })

  it('round-trips items with image through save/load', () => {
    const withImage: CartItem = {
      ...itemA,
      quantity: 1,
      image: '/uploads/kit-a-01.webp',
    }
    saveCart([withImage])
    expect(loadCart()).toEqual([withImage])
  })

  it('keeps the item but strips a non-string image value (corrupt data)', () => {
    window.localStorage.setItem(
      'ximi4ka-shop-cart',
      JSON.stringify([{ ...itemA, quantity: 1, image: 42 }]),
    )
    expect(loadCart()).toEqual([{ ...itemA, quantity: 1 }])
  })

  it('strips an empty-string image (falls back to placeholder rendering)', () => {
    window.localStorage.setItem(
      'ximi4ka-shop-cart',
      JSON.stringify([{ ...itemA, quantity: 1, image: '' }]),
    )
    expect(loadCart()[0]).not.toHaveProperty('image')
  })

  it('mixed cart: legacy and new-format items coexist', () => {
    const legacy = { ...itemA, quantity: 1 }
    const modern = { ...itemB, quantity: 2, image: '/uploads/kit-b.webp' }
    window.localStorage.setItem('ximi4ka-shop-cart', JSON.stringify([legacy, modern]))
    expect(loadCart()).toEqual([legacy, modern])
  })

  it('addToCart carries image into the stored item', () => {
    const result = addToCart([], { ...itemA, image: '/uploads/kit-a.webp' })
    expect(result[0]?.image).toBe('/uploads/kit-a.webp')
  })
})

describe('useCart hook', () => {
  it('starts with empty items', () => {
    const { result } = renderHook(() => useCart())
    expect(result.current.items).toEqual([])
    expect(result.current.itemCount).toBe(0)
    expect(result.current.subtotal).toBe(0)
  })

  it('reflects item after add()', () => {
    const { result } = renderHook(() => useCart())
    act(() => {
      result.current.add(itemA)
    })
    expect(result.current.items).toEqual([{ ...itemA, quantity: 1 }])
    expect(result.current.itemCount).toBe(1)
    expect(result.current.subtotal).toBe(1000)
  })

  it('accumulates qty when adding same product', () => {
    const { result } = renderHook(() => useCart())
    act(() => {
      result.current.add(itemA)
      result.current.add(itemA, 2)
    })
    expect(result.current.items).toEqual([{ ...itemA, quantity: 3 }])
  })

  it('setQty updates quantity', () => {
    const { result } = renderHook(() => useCart())
    act(() => {
      result.current.add(itemA)
      result.current.setQty('a', 5)
    })
    expect(result.current.items[0]?.quantity).toBe(5)
  })

  it('remove() removes item', () => {
    const { result } = renderHook(() => useCart())
    act(() => {
      result.current.add(itemA)
      result.current.add(itemB)
      result.current.remove('a')
    })
    expect(result.current.items).toEqual([{ ...itemB, quantity: 1 }])
  })

  it('clear() empties cart', () => {
    const { result } = renderHook(() => useCart())
    act(() => {
      result.current.add(itemA)
      result.current.clear()
    })
    expect(result.current.items).toEqual([])
  })

  it('syncs when cart-updated event fires from elsewhere', () => {
    const { result } = renderHook(() => useCart())
    act(() => {
      saveCart([{ ...itemA, quantity: 2 }])
    })
    expect(result.current.items).toEqual([{ ...itemA, quantity: 2 }])
  })
})
