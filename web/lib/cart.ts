'use client'

import { useCallback, useMemo, useSyncExternalStore } from 'react'

export interface CartItem {
  productId: string
  slug: string
  name: string
  priceRub: number
  quantity: number
  /**
   * URL первой картинки товара для миниатюры в drawer. Optional: записи,
   * сохранённые до введения поля (старый формат localStorage), его не имеют —
   * normalizeCartItem принимает оба формата.
   */
  image?: string
}

const STORAGE_KEY = 'ximi4ka-shop-cart'
const EVENT_NAME = 'cart-updated'

// Custom event used by the header cart button to signal CartDrawer to open.
// Lives here (next to cart state) rather than in the button component so the
// drawer doesn't have to import from a chrome component just to grab the
// event name.
export const OPEN_CART_EVENT = 'open-cart'

/**
 * Мгновенно открывает CartDrawer (чистый клиентский рендер, без навигации).
 * Кнопка корзины в шапке и любые будущие триггеры зовут этот хелпер вместо
 * ручного dispatchEvent.
 */
export function openCartDrawer(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(OPEN_CART_EVENT))
}

/**
 * Валидация + миграция одной записи из localStorage. Возвращает null для
 * мусора; для валидных записей нормализует поле `image`: строка сохраняется,
 * любой другой тип отбрасывается (фолбэк на старый формат без картинки),
 * сам товар при этом не теряется.
 */
function normalizeCartItem(value: unknown): CartItem | null {
  if (typeof value !== 'object' || value === null) return null
  const v = value as Record<string, unknown>
  if (
    typeof v.productId !== 'string' ||
    typeof v.slug !== 'string' ||
    typeof v.name !== 'string' ||
    typeof v.priceRub !== 'number' ||
    typeof v.quantity !== 'number'
  ) {
    return null
  }
  const item: CartItem = {
    productId: v.productId,
    slug: v.slug,
    name: v.name,
    priceRub: v.priceRub,
    quantity: v.quantity,
  }
  if (typeof v.image === 'string' && v.image !== '') {
    item.image = v.image
  }
  return item
}

const EMPTY_SNAPSHOT: CartItem[] = []
let cachedSnapshot: CartItem[] | null = null
let cachedRaw: string | null = null

export function loadCart(): CartItem[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map(normalizeCartItem)
      .filter((item): item is CartItem => item !== null)
  } catch {
    return []
  }
}

export function saveCart(items: CartItem[]): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  invalidateSnapshot()
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

// Кэш снапшота ключуется сырой строкой из localStorage: дорогая работа
// (JSON.parse + пересборка массива + прежнее глубокое сравнение на каждый
// рендер каждого подписчика) выполняется только когда строка реально
// изменилась. Дешёвый getItem + сравнение строк остаётся — так кэш не
// протухает даже при прямой записи в localStorage мимо saveCart.
// useSyncExternalStore требует стабильной ссылки — кэш её и обеспечивает.
function getSnapshot(): CartItem[] {
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (cachedSnapshot === null || raw !== cachedRaw) {
    cachedRaw = raw
    cachedSnapshot = raw === null ? EMPTY_SNAPSHOT : loadCart()
  }
  return cachedSnapshot
}

function invalidateSnapshot() {
  cachedSnapshot = null
  cachedRaw = null
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

  const subtotal = useMemo(() => calculateSubtotal(items), [items])
  const itemCount = useMemo(
    () => items.reduce((sum, i) => sum + i.quantity, 0),
    [items],
  )

  return { items, add, remove, setQty, clear, subtotal, itemCount }
}
