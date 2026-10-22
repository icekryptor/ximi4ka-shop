import type { MetricWithAttribution } from 'web-vitals/attribution'
import { trackEvent } from './track'

// Полевые Web Vitals витрины (RUM): по одному событию web_vital на метрику за
// загрузку страницы — INP, LCP, CLS, FCP, TTFB с атрибуцией. Уходят в
// собственную аналитику (lib/track.ts, sendBeacon), чтобы видеть, какие элементы
// и скрипты тормозят клики у реальных посетителей на телефонах: CrUX даёт только
// общую цифру по сайту.
//
// Сама библиотека грузится динамическим импортом из WebVitalsReporter (root
// layout) после гидратации — в первый бандл она не попадает. Админка не меряется. reportAllChanges: false — значения
// финальные: LCP, CLS и INP приходят при уходе со страницы (вкладка скрыта),
// FCP и TTFB — сразу, как известны.

/** Потолок meta на стороне API (api/src/routes/public/events.ts, MAX_META_CHARS). */
export const WEB_VITAL_META_MAX_CHARS = 1000

// Селектор web-vitals — «предок>…>элемент»; бюджет meta позволяет 100 символов.
const MAX_TARGET_CHARS = 100
const MAX_URL_CHARS = 80
const MAX_INVOKER_CHARS = 60

// API отвергает NUL и одиночные суррогаты (их не хранит jsonb) — с ними пропало
// бы всё событие, поэтому вычищаем их из строк, пришедших из DOM и скриптов.
// Целая пара (эмодзи) совпадает первой альтернативой и остаётся.
const PAIR_OR_UNSTORABLE = /[\ud800-\udbff][\udc00-\udfff]|[\ud800-\udfff]|\u0000/g

function storable(value: string): string {
  return value.replace(PAIR_OR_UNSTORABLE, (m) => (m.length === 2 ? m : ''))
}

const isHighSurrogate = (code: number): boolean => code >= 0xd800 && code <= 0xdbff
const isLowSurrogate = (code: number): boolean => code >= 0xdc00 && code <= 0xdfff

// Начало строки до max символов.
function clip(value: string | undefined, max: number): string | undefined {
  if (!value) return undefined
  const clean = storable(value)
  if (clean.length <= max) return clean || undefined
  const cut = clean.slice(0, max)
  // Усечение не должно рвать суррогатную пару (эмодзи) на границе.
  return isHighSurrogate(cut.charCodeAt(cut.length - 1)) ? cut.slice(0, -1) : cut
}

// Селектор усекаем с головы: сам элемент и ближние предки важнее, чем html>body.
// Хвост начинается с целого звена, если в нём есть «>».
function clipSelector(value: string | undefined): string | undefined {
  if (!value) return undefined
  const clean = storable(value)
  if (clean.length <= MAX_TARGET_CHARS) return clean || undefined
  const tail = clean.slice(-MAX_TARGET_CHARS)
  if (clean[clean.length - MAX_TARGET_CHARS - 1] === '>') return tail
  const boundary = tail.indexOf('>')
  if (boundary !== -1 && boundary < tail.length - 1) return tail.slice(boundary + 1)
  return isLowSurrogate(tail.charCodeAt(0)) ? tail.slice(1) : tail
}

// Адрес без query и hash: в query бывают токены и метки, а длину мы бережём.
// Свой сайт — только путь. next/image прячет саму картинку в параметре url.
function shortUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  let url: URL
  try {
    url = new URL(raw, window.location.href)
  } catch {
    return clip(raw.split(/[?#]/)[0], MAX_URL_CHARS)
  }
  if (url.pathname === '/_next/image') {
    const inner = url.searchParams.get('url')
    if (inner) {
      try {
        url = new URL(inner, window.location.href)
      } catch {
        return clip(inner.split(/[?#]/)[0], MAX_URL_CHARS)
      }
    }
  }
  // data:, blob: — сам адрес огромный и ничего не говорит, хватает схемы.
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return url.protocol
  const base = url.origin === window.location.origin ? url.pathname : url.origin + url.pathname
  return clip(base, MAX_URL_CHARS)
}

// Адрес внутри invoker («IMG[src=…?token=…].onload»): query и hash отрезаем.
function withoutQueries(value: string): string {
  return value
    .replace(/\[src=([^\]?#]*)[?#][^\]]*\]/gi, '[src=$1]')
    .replace(/(https?:\/\/[^\s\]?#]*)[?#][^\s\]]*/gi, '$1')
}

function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value)
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

// У скриптов (classic-script, module-script) invoker — их адрес, у инлайн-скрипта —
// адрес самой страницы вместе с query и hash (/order/N?new=1#t=…, utm, yclid).
// Такие invoker идут через shortUrl, остальные (BUTTON.onclick,
// Window.setTimeout) — как есть, с отрезанными query у адресов внутри.
function scriptInvoker(script: PerformanceScriptTiming): string | undefined {
  const { invoker, invokerType } = script
  if (!invoker) return undefined
  if (invokerType === 'classic-script' || invokerType === 'module-script' || isHttpUrl(invoker)) {
    return shortUrl(invoker)
  }
  return clip(withoutQueries(invoker), MAX_INVOKER_CHARS)
}

const ms = (value: number): number => Math.round(value)

function dropUndefined(meta: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(meta).filter(([, v]) => v !== undefined))
}

// Тип события, на которое ушло больше всего обработки (click, pointerup,
// keydown...); без записей — тип взаимодействия из атрибуции (pointer/keyboard).
function heaviestEventType(entries: readonly PerformanceEventTiming[]): string | undefined {
  let best: PerformanceEventTiming | undefined
  for (const e of entries) {
    if (!best || e.processingEnd - e.processingStart > best.processingEnd - best.processingStart) {
      best = e
    }
  }
  return best?.name
}

function details(metric: MetricWithAttribution): Record<string, unknown> {
  switch (metric.name) {
    case 'INP': {
      const a = metric.attribution
      const script = a.longestScript?.entry
      return {
        target: clipSelector(a.interactionTarget),
        type: heaviestEventType(metric.entries) ?? a.interactionType,
        inputDelay: ms(a.inputDelay),
        processing: ms(a.processingDuration),
        presentation: ms(a.presentationDelay),
        // Клик во время загрузки — отдельная причина медленного INP.
        loadState: a.loadState,
        ...(script
          ? {
              scriptUrl: shortUrl(script.sourceURL),
              scriptInvoker: scriptInvoker(script),
              scriptDuration: ms(script.duration),
            }
          : {}),
      }
    }
    case 'LCP': {
      const a = metric.attribution
      return {
        target: clipSelector(a.target),
        url: shortUrl(a.url),
        ttfb: ms(a.timeToFirstByte),
        loadDelay: ms(a.resourceLoadDelay),
        loadDuration: ms(a.resourceLoadDuration),
        renderDelay: ms(a.elementRenderDelay),
      }
    }
    case 'CLS':
      return { target: clipSelector(metric.attribution.largestShiftTarget) }
    default:
      // FCP и TTFB: хватает значения и типа навигации.
      return {}
  }
}

/** Компактная meta события web_vital; всегда укладывается в лимит API. */
export function vitalMeta(metric: MetricWithAttribution, page?: string): Record<string, unknown> {
  const base = dropUndefined({
    name: metric.name,
    // CLS — доля без единиц, остальные — миллисекунды.
    value: metric.name === 'CLS' ? Math.round(metric.value * 1000) / 1000 : ms(metric.value),
    rating: metric.rating,
    navigationType: metric.navigationType,
    page: clip(page, MAX_PAGE_CHARS),
  })
  const meta = dropUndefined({ ...base, ...details(metric) })
  // Подстраховка: экранирование в JSON раздувает управляющие символы вшестеро.
  return JSON.stringify(meta).length <= WEB_VITAL_META_MAX_CHARS ? meta : base
}

// Страница метрики. path события trackEvent ставит в момент отправки, а LCP, CLS
// и INP уходят позже — часто когда сайт уже перешёл на другую страницу без
// перезагрузки. Поэтому TTFB, FCP, LCP и CLS относим к странице входа (их
// меряет только она), а INP — к странице, открытой в момент взаимодействия:
// WebVitalsReporter отмечает каждую смену адреса (notePage).
const MAX_PAGE_CHARS = 100
const MAX_PAGE_MARKS = 200
let landingPage = ''
let pageMarks: Array<{ t: number; page: string }> = []

/** Отметка смены страницы (время — по часам performance.now, как interactionTime). */
export function notePage(pathname: string, t: number = performance.now()): void {
  const current = pageMarks.length > 0 ? pageMarks[pageMarks.length - 1].page : landingPage
  if (pathname === current) return
  pageMarks.push({ t, page: pathname })
  if (pageMarks.length > MAX_PAGE_MARKS) pageMarks = pageMarks.slice(-MAX_PAGE_MARKS)
}

function pageAt(t: number): string {
  let page = landingPage
  for (const mark of pageMarks) {
    if (mark.t > t) break
    page = mark.page
  }
  return page
}

// Админку не меряем: это не витрина, и её клики исказили бы INP магазина.
function isAdminPage(page: string): boolean {
  return page === '/admin' || page.startsWith('/admin/')
}

export function reportWebVital(metric: MetricWithAttribution): void {
  const page = metric.name === 'INP' ? pageAt(metric.attribution.interactionTime) : landingPage
  if (isAdminPage(page)) return
  trackEvent('web_vital', vitalMeta(metric, page))
}

let started = false

/** Только для тестов: состояние модульное. */
export function resetWebVitalsForTests(): void {
  started = false
  landingPage = ''
  pageMarks = []
}

/**
 * Подписывается на метрики один раз за жизнь страницы (StrictMode и смена языка
 * перемонтируют layout). Не загрузился чанк (сеть, блокировщик) — страница
 * работает без RUM.
 */
export async function startWebVitals(): Promise<void> {
  if (started || typeof window === 'undefined') return
  // Вход сразу в админку — библиотеку не грузим вовсе.
  if (isAdminPage(window.location.pathname)) return
  started = true
  landingPage = window.location.pathname
  try {
    const { onCLS, onFCP, onINP, onLCP, onTTFB } = await import('web-vitals/attribution')
    const opts = { reportAllChanges: false }
    onTTFB(reportWebVital, opts)
    onFCP(reportWebVital, opts)
    onLCP(reportWebVital, opts)
    onCLS(reportWebVital, opts)
    onINP(reportWebVital, opts)
  } catch {
    // см. выше
  }
}
