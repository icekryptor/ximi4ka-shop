import {
  ANALYTICS_EVENT_TYPES,
  type AnalyticsEventType,
} from '@ximi4ka-shop/shared/types/analytics'

// Собственная аналитика витрины для дашборда админки: те же цели, что уходят в
// Метрику (см. reachGoal в metrika.ts), плюс случайный visitorId из localStorage.
// Полевые Web Vitals (web_vital, lib/webVitals.ts) visitorId не заводят — см.
// ephemeralVisitorId. Без IP и персональных данных. Любой сбой молча глотается: трекер не должен
// мешать каталогу и оформлению заказа.
const VISITOR_KEY = 'ximi4ka-visitor-id'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EVENTS_URL = `${(process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001').replace(
  /\/$/,
  '',
)}/api/public/events`

// Если localStorage недоступен, id живёт до перезагрузки страницы: иначе каждое
// событие считалось бы новой корзиной.
let memoryVisitorId: string | null = null
// Временный id одной загрузки страницы для web_vital (см. ephemeralVisitorId).
let pageLoadId: string | null = null

export interface TrackedEvent {
  type: AnalyticsEventType
  visitorId: string
  path: string
  meta?: Record<string, unknown>
}

export function resetTrackerForTests(): void {
  memoryVisitorId = null
  pageLoadId = null
}

function isTrackable(name: string): name is AnalyticsEventType {
  return (ANALYTICS_EVENT_TYPES as readonly string[]).includes(name)
}

function newId(): string | null {
  try {
    return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : null
  } catch {
    return null
  }
}

// uuid v4 без crypto.randomUUID (его нет вне https и в старых браузерах).
function fallbackId(): string {
  const bytes = new Uint8Array(16)
  try {
    crypto.getRandomValues(bytes)
  } catch {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256)
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function existingVisitorId(): string | null {
  if (memoryVisitorId) return memoryVisitorId
  try {
    const stored = window.localStorage.getItem(VISITOR_KEY)
    if (stored && UUID_RE.test(stored)) {
      memoryVisitorId = stored
      return stored
    }
  } catch {
    // хранилище недоступно — идём дальше с id в памяти
  }
  return null
}

// Web Vitals меряются на каждой загрузке страницы — ради них постоянный id в
// localStorage не заводим: есть id от целей — берём его, нет — временный id
// этой загрузки, который нигде не сохраняется.
function ephemeralVisitorId(): string {
  const existing = existingVisitorId()
  if (existing) return existing
  pageLoadId ??= newId() ?? fallbackId()
  return pageLoadId
}

function visitorId(): string | null {
  const existing = existingVisitorId()
  if (existing) return existing
  const id = newId()
  if (!id) return null
  memoryVisitorId = id
  try {
    window.localStorage.setItem(VISITOR_KEY, id)
  } catch {
    // см. выше
  }
  return id
}

export function buildEvent(name: string, meta?: Record<string, unknown>): TrackedEvent | null {
  if (!isTrackable(name)) return null
  const id = name === 'web_vital' ? ephemeralVisitorId() : visitorId()
  if (!id) return null
  return {
    type: name,
    visitorId: id,
    path: window.location.pathname,
    ...(meta !== undefined ? { meta } : {}),
  }
}

export function trackEvent(name: string, meta?: Record<string, unknown>): void {
  if (typeof window === 'undefined') return
  try {
    const event = buildEvent(name, meta)
    if (!event) return
    const body = JSON.stringify(event)
    if (
      typeof navigator.sendBeacon === 'function' &&
      navigator.sendBeacon(EVENTS_URL, new Blob([body], { type: 'application/json' }))
    ) {
      return
    }
    void fetch(EVENTS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
      credentials: 'omit',
    }).catch(() => {})
  } catch {
    // Аналитика не должна ломать магазин.
  }
}
