'use client'

import { useMemo, useSyncExternalStore } from 'react'
import { wholesaleLineTotals } from './wholesale'
import { getPublishedProduct } from './api'
import { METRIKA_GOALS, ecommerceAdd, ecommerceRemove, reachGoal } from './metrika'
import { afterNextPaint } from './afterPaint'

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

// Лимит количества в одной строке — как max у CheckoutSchema (api/src/routes/
// checkout.schemas.ts). Дубль wholesaleStaging.MAX_QTY: тот модуль импортирует
// корзину, обратный импорт дал бы цикл.
export const MAX_LINE_QTY = 99

const clampQty = (qty: number): number => Math.min(qty, MAX_LINE_QTY)

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
  // Кэш снапшота не сбрасываем: getSnapshot сверяет сырую строку, и запись того
  // же JSON (например, докачка категорий без изменений) не перерисует подписчиков.
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
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
        ? { ...fresh, ...(categories ? { categories } : {}), quantity: clampQty(i.quantity + qty) }
        : i,
    )
  }
  return [...items, { ...fresh, quantity: clampQty(qty) }]
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
  return items.map((i) => (i.productId === productId ? { ...i, quantity: clampQty(qty) } : i))
}

export function clearCart(): CartItem[] {
  return []
}

// Категории, уже полученные по слагу: товар, удалённый из корзины и добавленный
// снова без категорий, берёт их отсюда без похода в сеть.
const categoryCache = new Map<string, string[]>()
// Слаги с запросом «в полёте»: функцию зовут из нескольких мест, без этого одна
// и та же позиция уходила бы в сеть повторно. Из набора слаг убирается в finally,
// так что неудавшийся запрос можно повторить следующим вызовом.
const categoryInFlight = new Set<string>()

/** Только для тестов: кэш модульный, между тестами его надо сбрасывать. */
export function resetCategoryCacheForTests(): void {
  categoryCache.clear()
  categoryInFlight.clear()
}

/**
 * Докачивает категории позициям корзины, у которых их нет (корзины старого
 * формата, товары, добавленные из карточек каталога). Нет сети или товар снят —
 * позиция остаётся как есть: в превью не будет процентной скидки, а сервер при
 * оформлении посчитает сам.
 */
export async function backfillCartCategories(): Promise<void> {
  const missing = loadCart().filter((i) => i.categories === undefined)
  await Promise.all(
    missing.map(async (item) => {
      const apply = (categories: string[]) =>
        saveCart(loadCart().map((i) => (i.productId === item.productId ? { ...i, categories } : i)))
      const cached = categoryCache.get(item.slug)
      if (cached) {
        apply(cached)
        return
      }
      if (categoryInFlight.has(item.slug)) return
      categoryInFlight.add(item.slug)
      try {
        const product = await getPublishedProduct(item.slug)
        const categories = product.categorySlugs ?? []
        categoryCache.set(item.slug, categories)
        apply(categories)
      } catch {
        // см. комментарий выше: тихо остаёмся без категорий.
      } finally {
        categoryInFlight.delete(item.slug)
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

function getServerSnapshot(): CartItem[] {
  return EMPTY_SNAPSHOT
}

// Обработчик кэш не сбрасывает: getSnapshot сам сверяет сырую строку, и на одно
// изменение строка разбирается один раз. Сброс здесь давал JSON.parse на каждого
// подписчика — на /catalog их больше сотни, и клик «В корзину» долго обрабатывался.
function subscribe(onChange: () => void): () => void {
  window.addEventListener(EVENT_NAME, onChange)
  window.addEventListener('storage', onChange)
  return () => {
    window.removeEventListener(EVENT_NAME, onChange)
    window.removeEventListener('storage', onChange)
  }
}

// id товара в Метрике — productId: он же в detail и purchase.
function metrikaProduct(item: Pick<CartItem, 'productId' | 'name' | 'priceRub'>) {
  return { id: item.productId, name: item.name, price: item.priceRub }
}

// Действия корзины — функции модуля: ссылки стабильны без useCallback, и им не
// нужна подписка на снапшот. События Метрики шлют действия, а не кнопки: так
// покрыты все места корзины (карточки, страница товара, drawer, страница
// корзины). clear() событий не шлёт — его зовёт чекаут после оформления заказа,
// это не удаление.
// Запись корзины синхронная, а события уходят после отрисовки кадра
// (afterNextPaint): клик «В корзину» откликается, не дожидаясь dataLayer, ym и
// sendBeacon. После этих действий посетитель остаётся на странице, событие не теряется.
const CART_ACTIONS = {
  add: (item: Omit<CartItem, 'quantity'>, qty?: number): void => {
    const current = loadCart()
    saveCart(addToCart(current, item, qty))
    const quantity = qty ?? 1
    const product = metrikaProduct(item)
    afterNextPaint(() => {
      ecommerceAdd(product, quantity)
      reachGoal(METRIKA_GOALS.addToCart, { product_id: product.id, quantity })
    })
  },

  remove: (productId: string): void => {
    const current = loadCart()
    const existing = current.find((i) => i.productId === productId)
    saveCart(removeFromCart(current, productId))
    if (!existing) return
    const product = metrikaProduct(existing)
    afterNextPaint(() => ecommerceRemove(product, existing.quantity))
  },

  setQty: (productId: string, qty: number): void => {
    const current = loadCart()
    const existing = current.find((i) => i.productId === productId)
    saveCart(setQuantity(current, productId, qty))
    if (!existing) return
    const delta = Math.max(qty, 0) - existing.quantity
    if (delta === 0) return
    const product = metrikaProduct(existing)
    afterNextPaint(() => {
      if (delta > 0) ecommerceAdd(product, delta)
      else ecommerceRemove(product, -delta)
    })
  },

  clear: (): void => {
    saveCart(clearCart())
  },
}

export type CartActions = typeof CART_ACTIONS

/**
 * Только действия корзины, без подписки на её содержимое: компонент не
 * перерисовывается при каждом изменении корзины. Кнопкам «В корзину» больше
 * ничего не нужно — на /catalog их больше сотни.
 */
export function useCartActions(): CartActions {
  return CART_ACTIONS
}

export function useCart() {
  const items = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const totals = useMemo(() => cartTotals(items), [items])
  const itemCount = useMemo(() => items.reduce((sum, i) => sum + i.quantity, 0), [items])

  return { items, ...CART_ACTIONS, subtotal: totals.subtotalRub, totals, itemCount }
}
