// Клиентские события Яндекс.Метрики: цели (reachGoal) и электронная
// коммерция через dataLayer. Всё безопасно без Метрики: нет ID счётчика
// (не задан в настройках сайта, SSR) — функции ничего не делают и не трогают
// window. В параметры не попадают персональные данные: только номер заказа,
// id/название/цена/количество товаров и суммы.

/**
 * Идентификаторы целей. В интерфейсе Метрики заводятся как «JavaScript-событие»
 * с тем же идентификатором (Цели → Добавить цель → JavaScript-событие).
 */
export const METRIKA_GOALS = {
  addToCart: 'add_to_cart',
  beginCheckout: 'begin_checkout',
  purchase: 'purchase',
  openCart: 'open_cart',
} as const

export interface MetrikaProduct {
  id: string
  name: string
  price: number
  quantity?: number
}

const CURRENCY = 'RUB'
const PENDING_PURCHASE_PREFIX = 'ximi4ka-metrika-purchase:'
const SENT_PURCHASE_PREFIX = 'ximi4ka-metrika-purchase-sent:'
// Снимок и отметка живут 2 суток: дольше они не нужны, а localStorage не растёт.
const PURCHASE_TTL_MS = 2 * 24 * 60 * 60 * 1000

type MetrikaWindow = Window & {
  ym?: ((...args: unknown[]) => void) & { a?: unknown[] }
  dataLayer?: unknown[]
}

let counterId: string | null = null

/** Вызывается из MetrikaCounterId: включает отправку событий для этого счётчика. */
export function setMetrikaCounterId(id: string | null): void {
  counterId = id
}

function metrikaWindow(): MetrikaWindow | null {
  if (typeof window === 'undefined' || counterId === null) return null
  return window as MetrikaWindow
}

/**
 * Достижение цели. Если скрипт Метрики ещё не загрузился, звонок встаёт в
 * очередь той же заглушки `ym`, что создаёт код счётчика (m[i].a), — tag.js
 * разберёт её при загрузке.
 */
export function reachGoal(goal: string, params?: Record<string, unknown>): void {
  const w = metrikaWindow()
  if (!w) return
  try {
    if (typeof w.ym !== 'function') {
      const queue: ((...args: unknown[]) => void) & { a?: unknown[] } = function () {
        // eslint-disable-next-line prefer-rest-params -- как в коде счётчика: tag.js ждёт сырой arguments
        ;(queue.a = queue.a || []).push(arguments)
      }
      w.ym = queue
    }
    if (params === undefined) w.ym(counterId, 'reachGoal', goal)
    else w.ym(counterId, 'reachGoal', goal, params)
  } catch {
    // Аналитика не должна ломать магазин.
  }
}

function pushEcommerce(action: string, payload: Record<string, unknown>): void {
  const w = metrikaWindow()
  if (!w) return
  try {
    const layer = (w.dataLayer = w.dataLayer || [])
    layer.push({ ecommerce: { currencyCode: CURRENCY, [action]: payload } })
  } catch {
    // см. выше
  }
}

function productFields(p: MetrikaProduct): Record<string, unknown> {
  const out: Record<string, unknown> = { id: p.id, name: p.name, price: p.price }
  if (p.quantity !== undefined) out.quantity = p.quantity
  return out
}

/** Просмотр карточки товара. */
export function ecommerceDetail(p: Omit<MetrikaProduct, 'quantity'>): void {
  pushEcommerce('detail', { products: [productFields(p)] })
}

// add и remove несут одинаковый набор полей (в т.ч. quantity): Метрика требует
// согласованности, иначе в отчётах появляются отрицательные значения.
export function ecommerceAdd(p: Omit<MetrikaProduct, 'quantity'>, quantity: number): void {
  pushEcommerce('add', { products: [productFields({ ...p, quantity })] })
}

export function ecommerceRemove(p: Omit<MetrikaProduct, 'quantity'>, quantity: number): void {
  pushEcommerce('remove', { products: [productFields({ ...p, quantity })] })
}

function safeStorage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

/**
 * Запоминает состав только что оформленного заказа (до очистки корзины):
 * страница заказа не знает товаров, а покупку отправляет по этому снимку.
 * Заодно снимок — признак, что заказ оформил именно этот браузер: открытая
 * по чужой ссылке страница заказа покупку не засчитает.
 */
export function rememberPendingPurchase(orderNumber: string, products: MetrikaProduct[]): void {
  if (typeof window === 'undefined') return
  const storage = safeStorage()
  if (!storage) return
  purgeExpired(storage)
  try {
    storage.setItem(
      PENDING_PURCHASE_PREFIX + orderNumber,
      JSON.stringify({ ts: Date.now(), products }),
    )
  } catch {
    // переполненное/закрытое хранилище — покупку просто не отправим
  }
}

/** Заказ провален/отменён — покупки не будет, снимок не нужен. */
export function forgetPendingPurchase(orderNumber: string): void {
  if (typeof window === 'undefined') return
  try {
    safeStorage()?.removeItem(PENDING_PURCHASE_PREFIX + orderNumber)
  } catch {
    // см. выше
  }
}

// Запись в хранилище — JSON с полем ts. Старый формат (без ts, не JSON-объект)
// считается просроченным.
function readTs(raw: string | null): number | null {
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null
    const ts = (parsed as { ts?: unknown }).ts
    return typeof ts === 'number' && Number.isFinite(ts) ? ts : null
  } catch {
    return null
  }
}

function isFresh(ts: number | null, now: number): boolean {
  return ts !== null && now - ts <= PURCHASE_TTL_MS
}

// Удаляет просроченные снимки и отметки (и записи в старом формате).
function purgeExpired(storage: Storage): void {
  try {
    const now = Date.now()
    const stale: string[] = []
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i)
      if (!key) continue
      if (!key.startsWith(PENDING_PURCHASE_PREFIX) && !key.startsWith(SENT_PURCHASE_PREFIX)) {
        continue
      }
      if (!isFresh(readTs(storage.getItem(key)), now)) stale.push(key)
    }
    for (const key of stale) storage.removeItem(key)
  } catch {
    // чистка best-effort
  }
}

// Товары из снимка: мусор (не строки/не числа) отбрасываем.
function readPendingPurchase(storage: Storage, orderNumber: string): MetrikaProduct[] | null {
  try {
    const raw = storage.getItem(PENDING_PURCHASE_PREFIX + orderNumber)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const list = (parsed as { products?: unknown }).products
    if (!Array.isArray(list)) return null
    const products: MetrikaProduct[] = []
    for (const item of list) {
      if (typeof item !== 'object' || item === null) continue
      const p = item as Record<string, unknown>
      if (
        typeof p.id === 'string' &&
        typeof p.name === 'string' &&
        typeof p.price === 'number' &&
        Number.isFinite(p.price) &&
        typeof p.quantity === 'number' &&
        Number.isFinite(p.quantity)
      ) {
        products.push({ id: p.id, name: p.name, price: p.price, quantity: p.quantity })
      }
    }
    return products.length > 0 ? products : null
  } catch {
    return null
  }
}

/**
 * Отправляет покупку (ecommerce purchase + цель purchase) не более одного
 * раза на номер заказа: защита от перезагрузки страницы — отметка в
 * localStorage ставится ДО отправки. Возвращает true, если событие ушло.
 */
export function reportPurchaseOnce(orderNumber: string, revenueRub: number): boolean {
  if (!metrikaWindow()) return false
  const storage = safeStorage()
  if (!storage) return false
  purgeExpired(storage)
  const products = readPendingPurchase(storage, orderNumber)
  if (!products) return false
  try {
    if (storage.getItem(SENT_PURCHASE_PREFIX + orderNumber)) return false
    storage.setItem(SENT_PURCHASE_PREFIX + orderNumber, JSON.stringify({ ts: Date.now() }))
  } catch {
    // Не смогли поставить отметку — лучше недосчитать, чем задвоить.
    return false
  }
  try {
    storage.removeItem(PENDING_PURCHASE_PREFIX + orderNumber)
  } catch {
    // Отметка уже стоит — повтора не будет, снимок уберёт чистка по сроку.
  }
  pushEcommerce('purchase', {
    actionField: { id: orderNumber, revenue: revenueRub },
    products: products.map(productFields),
  })
  reachGoal(METRIKA_GOALS.purchase, { order_price: revenueRub, currency: CURRENCY })
  return true
}
