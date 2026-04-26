'use client'

import { useCallback, useSyncExternalStore } from 'react'

export interface CartItem {
  productId: string
  slug: string
  name: string
  priceRub: number
  quantity: number
}

const STORAGE_KEY = 'ximi4ka-shop-cart'
const EVENT_NAME = 'cart-updated'

// Custom event used by the header cart button to signal CartDrawer to open.
// Lives here (next to cart state) rather than in the button component so the
// drawer doesn't have to import from a chrome component just to grab the
// event name.
export const OPEN_CART_EVENT = 'open-cart'

function isCartItem(value: unknown): value is CartItem {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.productId === 'string' &&
    typeof v.slug === 'string' &&
    typeof v.name === 'string' &&
    typeof v.priceRub === 'number' &&
    typeof v.quantity === 'number'
  )
}

const EMPTY_SNAPSHOT: CartItem[] = []
let cachedSnapshot: CartItem[] | null = null

export function loadCart(): CartItem[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isCartItem)
  } catch {
    return []
  }
}

export function saveCart(items: CartItem[]): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  cachedSnapshot = null
  window.dispatchEvent(new CustomEvent(EVENT_NAME))
}

export function addToCart(
  items: CartItem[],
  item: Omit<CartItem, 'quantity'>,
  qty = 1,
): CartItem[] {
  const existing = items.find((i) => i.productId === item.productId)
  if (existing) {
    return items.map((i) =>
      i.productId === item.productId ? { ...i, quantity: i.quantity + qty } : i,
    )
  }
  return [...items, { ...item, quantity: qty }]
}

export function removeFromCart(items: CartItem[], productId: string): CartItem[] {
  return items.filter((i) => i.productId !== productId)
}

export function setQuantity(items: CartItem[], productId: string, qty: number): CartItem[] {
  if (qty <= 0) return removeFromCart(items, productId)
  return items.map((i) => (i.productId === productId ? { ...i, quantity: qty } : i))
}

export function clearCart(): CartItem[] {
  return []
}

export function calculateSubtotal(items: CartItem[]): number {
  return items.reduce((sum, i) => sum + i.priceRub * i.quantity, 0)
}

function getSnapshot(): CartItem[] {
  const fresh = loadCart()
  if (
    cachedSnapshot !== null &&
    cachedSnapshot.length === fresh.length &&
    cachedSnapshot.every((item, i) => {
      const other = fresh[i]
      return (
        other !== undefined &&
        item.productId === other.productId &&
        item.quantity === other.quantity &&
        item.priceRub === other.priceRub &&
        item.slug === other.slug &&
        item.name === other.name
      )
    })
  ) {
    return cachedSnapshot
  }
  cachedSnapshot = fresh
  return fresh
}

function invalidateSnapshot() {
  cachedSnapshot = null
}

function getServerSnapshot(): CartItem[] {
  return EMPTY_SNAPSHOT
}

function subscribe(onChange: () => void): () => void {
  const handler = () => {
    invalidateSnapshot()
    onChange()
  }
  window.addEventListener(EVENT_NAME, handler)
  window.addEventListener('storage', handler)
  return () => {
    window.removeEventListener(EVENT_NAME, handler)
    window.removeEventListener('storage', handler)
  }
}

export function useCart() {
  const items = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  const add = useCallback((item: Omit<CartItem, 'quantity'>, qty?: number) => {
    saveCart(addToCart(loadCart(), item, qty))
  }, [])

  const remove = useCallback((productId: string) => {
    saveCart(removeFromCart(loadCart(), productId))
  }, [])

  const setQty = useCallback((productId: string, qty: number) => {
    saveCart(setQuantity(loadCart(), productId, qty))
  }, [])

  const clear = useCallback(() => {
    saveCart(clearCart())
  }, [])

  const subtotal = calculateSubtotal(items)
  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0)

  return { items, add, remove, setQty, clear, subtotal, itemCount }
}
