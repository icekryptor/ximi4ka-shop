import type { AttributionTouch, OrderAttribution } from '@ximi4ka-shop/shared'

// Откуда пришёл покупатель. На каждой полной загрузке страницы запоминаем
// касание (метки из адреса и внешний referrer) в localStorage на 30 дней, а
// при оформлении заказа отправляем вместе с ним:
//  - first — самое первое касание (канал);
//  - last — последний заход с метками (yclid, ysclid, utm_*), по нему сверяем
//    рекламу и отправляем конверсии.
// Всё это подсказки для анализа рекламы: клиент может прислать что угодно.

export const ATTRIBUTION_STORAGE_KEY = 'ximi4ka-attribution'
export const ATTRIBUTION_TTL_MS = 30 * 24 * 60 * 60 * 1000

const OWN_DOMAIN = 'ximi4ka.ru'
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const

export interface VisitInput {
  /** Полный адрес страницы входа (window.location.href). */
  href: string
  /** document.referrer. */
  referrer: string
  /** Хост витрины: переходы со своего сайта за источник не считаем. */
  ownHost: string
  now: Date
}

function clip(value: string | null | undefined, max: number): string | undefined {
  const trimmed = value?.trim().slice(0, max)
  return trimmed ? trimmed : undefined
}

function parseUrl(raw: string): URL | null {
  try {
    const url = new URL(raw)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null
  } catch {
    return null
  }
}

function isOwnHost(host: string, ownHost: string): boolean {
  const h = host.toLowerCase()
  return h === ownHost.toLowerCase() || h === OWN_DOMAIN || h.endsWith(`.${OWN_DOMAIN}`)
}

/** Касание по текущему заходу; tagged — есть метки yclid, ysclid или utm_*. */
export function readTouch(input: VisitInput): { touch: AttributionTouch; tagged: boolean } {
  const page = parseUrl(input.href)
  const params = page?.searchParams

  const touch: AttributionTouch = {
    at: input.now.toISOString(),
    landing: clip(page?.pathname, 300) ?? '/',
  }

  const ref = parseUrl(input.referrer)
  if (ref && !isOwnHost(ref.hostname, input.ownHost)) {
    const referrer = clip(ref.origin + ref.pathname, 300)
    if (referrer) touch.referrer = referrer
  }

  let tagged = false
  const yclid = clip(params?.get('yclid'), 100)
  if (yclid) touch.yclid = yclid
  const ysclid = clip(params?.get('ysclid'), 100)
  if (ysclid) touch.ysclid = ysclid
  for (const key of UTM_KEYS) {
    const value = clip(params?.get(key), 200)
    if (value) touch[key] = value
  }
  if (touch.yclid || touch.ysclid || UTM_KEYS.some((key) => touch[key])) tagged = true

  return { touch, tagged }
}

function isFresh(touch: unknown, now: Date): touch is AttributionTouch {
  if (typeof touch !== 'object' || touch === null) return false
  const at = Date.parse((touch as { at?: unknown }).at as string)
  return Number.isFinite(at) && now.getTime() - at <= ATTRIBUTION_TTL_MS
}

/** Сохранённая атрибуция без протухших касаний; undefined — нечего отправлять. */
export function loadAttribution(storage: Storage | null, now: Date): OrderAttribution | undefined {
  if (!storage) return undefined
  try {
    const raw = storage.getItem(ATTRIBUTION_STORAGE_KEY)
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as { first?: unknown; last?: unknown } | null
    if (typeof parsed !== 'object' || parsed === null) return undefined
    const first = isFresh(parsed.first, now) ? parsed.first : undefined
    const last = isFresh(parsed.last, now) ? parsed.last : undefined
    if (!first && !last) return undefined
    return { ...(first ? { first } : {}), ...(last ? { last } : {}) }
  } catch {
    return undefined
  }
}

/** Запоминает заход: первое касание не трогаем, последнее меняем только размеченным. */
export function recordVisit(storage: Storage | null, input: VisitInput): void {
  if (!storage) return
  try {
    const current = loadAttribution(storage, input.now) ?? {}
    const { touch, tagged } = readTouch(input)
    const next: OrderAttribution = {
      first: current.first ?? touch,
      ...(tagged ? { last: touch } : current.last ? { last: current.last } : {}),
    }
    storage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Приватный режим или переполненное хранилище: атрибуция не критична.
  }
}

/** localStorage или null, если браузер его не даёт (бросает при обращении). */
export function safeLocalStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}
