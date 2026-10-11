import {
  ANALYTICS_EVENT_TYPES,
  type AnalyticsEventType,
} from '@ximi4ka-shop/shared/types/analytics'

// Собственная аналитика витрины для дашборда админки: те же цели, что уходят в
// Метрику (см. reachGoal в metrika.ts), плюс случайный visitorId из localStorage.
// Без IP и персональных данных. Любой сбой молча глотается: трекер не должен
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

export interface TrackedEvent {
  type: AnalyticsEventType
  visitorId: string
  path: string
  meta?: Record<string, unknown>
}

export function resetTrackerForTests(): void {
  memoryVisitorId = null
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

function visitorId(): string | null {
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
  const id = visitorId()
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
