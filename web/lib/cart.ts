'use client'

import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { wholesaleLineTotals } from './wholesale'
import { getPublishedProduct } from './api'
import { METRIKA_GOALS, ecommerceAdd, ecommerceRemove, reachGoal } from './metrika'

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
  /**
   * Цена «до» (compareAtPriceRub товара) на момент добавления — только
   * если она выше priceRub. Нужна, чтобы показать скидку в подытоге.
   */
  compareAtPriceRub?: number
  /**
   * Слаги категорий товара — по ним считается процентная оптовая скидка.
   * Optional: корзины, сохранённые до введения поля, его не имеют;
   * backfillCartCategories докачивает категории по слагу.
   */
  categories?: string[]
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
  if (typeof v.compareAtPriceRub === 'number' && v.compareAtPriceRub > v.priceRub) {
    item.compareAtPriceRub = v.compareAtPriceRub
  }
  if (Array.isArray(v.categories) && v.categories.every((c) => typeof c === 'string')) {
    item.categories = v.categories as string[]
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
    return parsed.map(normalizeCartItem).filter((item): item is CartItem => item !== null)
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
  const fresh = withCompareAt(item)
  const existing = items.find((i) => i.productId === item.productId)
  if (existing) {
    // Повторное добавление обновляет снимок цены — в корзине актуальная.
    // Категории переносим из старой записи, если новая их не принесла.
    const categories = fresh.categories ?? existing.categories
    return items.map((i) =>
      i.productId === item.productId
        ? { ...fresh, ...(categories ? { categories } : {}), quantity: i.quantity + qty }
        : i,
    )
  }
  return [...items, { ...fresh, quantity: qty }]
}

// Цена «до» имеет смысл, только если она выше текущей.
function withCompareAt<T extends { priceRub: number; compareAtPriceRub?: number | null }>(
  item: T,
): Omit<T, 'compareAtPriceRub'> & { compareAtPriceRub?: number } {
  const { compareAtPriceRub, ...rest } = item
  return compareAtPriceRub != null && compareAtPriceRub > item.priceRub
    ? { ...rest, compareAtPriceRub }
    : rest
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

// Слаги, по которым категории уже запрошены: функцию зовут из нескольких мест,
// без этого одна и та же позиция уходила бы в сеть повторно.
const categoryRequests = new Set<string>()

/**
 * Докачивает категории позициям корзины, у которых их нет (корзины старого
 * формата). Нет сети или товар снят — позиция остаётся как есть: в превью не
 * будет процентной скидки, а сервер при оформлении посчитает сам.
 */
export async function backfillCartCategories(): Promise<void> {
  const missing = loadCart().filter(
    (i) => i.categories === undefined && !categoryRequests.has(i.slug),
  )
  await Promise.all(
    missing.map(async (item) => {
      categoryRequests.add(item.slug)
      try {
        const product = await getPublishedProduct(item.slug)
        const categories = product.categorySlugs ?? []
        saveCart(loadCart().map((i) => (i.productId === item.productId ? { ...i, categories } : i)))
      } catch {
        // см. комментарий выше: тихо остаёмся без категорий.
      }
    }),
  )
}

export function calculateSubtotal(items: CartItem[]): number {
  return items.reduce((sum, i) => sum + i.priceRub * i.quantity, 0)
}

export interface CartTotals {
  /** Товары по ценам «до» (где их нет — по текущим). */
  goodsRub: number
  /** Товары по текущим ценам — так считает сервер (subtotal заказа). */
  subtotalRub: number
  /** Оптовая скидка: наборы, проценты на реагенты, партии (web/lib/wholesale.ts, зеркало сервера). */
  wholesaleRub: number
  /** Вся скидка для покупателя: разница с ценой «до» + оптовая. */
  discountRub: number
  /** К оплате за товары: goodsRub − discountRub = subtotalRub − wholesaleRub. */
  totalRub: number
}

export function cartTotals(items: CartItem[]): CartTotals {
  const lineTotals = wholesaleLineTotals(items)
  let goodsRub = 0
  let subtotalRub = 0
  let wholesaleRub = 0
  for (const i of items) {
    const listRub = i.priceRub * i.quantity
    goodsRub += (i.compareAtPriceRub ?? i.priceRub) * i.quantity
    subtotalRub += listRub
    wholesaleRub += listRub - (lineTotals.get(i.slug) ?? listRub)
  }
  const totalRub = subtotalRub - wholesaleRub
  return { goodsRub, subtotalRub, wholesaleRub, discountRub: goodsRub - totalRub, totalRub }
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

// id товара в Метрике — productId: он же в detail и purchase.
function metrikaProduct(item: Pick<CartItem, 'productId' | 'name' | 'priceRub'>) {
  return { id: item.productId, name: item.name, price: item.priceRub }
}

export function useCart() {
  const items = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  // События Метрики шлёт хук, а не кнопки: так покрыты все места корзины
  // (карточки, страница товара, drawer, страница корзины). clear() событий
  // не шлёт — его зовёт чекаут после оформления заказа, это не удаление.
  const add = useCallback((item: Omit<CartItem, 'quantity'>, qty?: number) => {
    const current = loadCart()
    saveCart(addToCart(current, item, qty))
    const quantity = qty ?? 1
    ecommerceAdd(metrikaProduct(item), quantity)
    reachGoal(METRIKA_GOALS.addToCart, { product_id: item.productId, quantity })
  }, [])

  const remove = useCallback((productId: string) => {
    const current = loadCart()
    const existing = current.find((i) => i.productId === productId)
    saveCart(removeFromCart(current, productId))
    if (existing) ecommerceRemove(metrikaProduct(existing), existing.quantity)
  }, [])

  const setQty = useCallback((productId: string, qty: number) => {
    const current = loadCart()
    const existing = current.find((i) => i.productId === productId)
    saveCart(setQuantity(current, productId, qty))
    if (!existing) return
    const delta = Math.max(qty, 0) - existing.quantity
    if (delta > 0) ecommerceAdd(metrikaProduct(existing), delta)
    else if (delta < 0) ecommerceRemove(metrikaProduct(existing), -delta)
  }, [])

  const clear = useCallback(() => {
    saveCart(clearCart())
  }, [])

  const totals = useMemo(() => cartTotals(items), [items])
  const itemCount = useMemo(() => items.reduce((sum, i) => sum + i.quantity, 0), [items])

  return { items, add, remove, setQty, clear, subtotal: totals.subtotalRub, totals, itemCount }
}
