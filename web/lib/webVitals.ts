import type { MetricWithAttribution } from 'web-vitals/attribution'
import { trackEvent } from './track'

// Полевые Web Vitals витрины (RUM): по одному событию web_vital на метрику за
// загрузку страницы — INP, LCP, CLS, FCP, TTFB с атрибуцией. Уходят в
// собственную аналитику (lib/track.ts, sendBeacon), чтобы видеть, какие элементы
// и скрипты тормозят клики у реальных посетителей на телефонах: CrUX даёт только
// общую цифру по сайту.
//
// Сама библиотека грузится динамическим импортом из WebVitalsReporter после
// гидратации — в первый бандл она не попадает. reportAllChanges: false — значения
// финальные: LCP, CLS и INP приходят при уходе со страницы (вкладка скрыта),
// FCP и TTFB — сразу, как известны.

/** Потолок meta на стороне API (api/src/routes/public/events.ts, MAX_META_CHARS). */
export const WEB_VITAL_META_MAX_CHARS = 1000

const MAX_TARGET_CHARS = 80
const MAX_URL_CHARS = 80
const MAX_INVOKER_CHARS = 60

// API отвергает NUL и одиночные суррогаты (их не хранит jsonb) — с ними пропало
// бы всё событие, поэтому вычищаем их из строк, пришедших из DOM и скриптов.
// Целая пара (эмодзи) совпадает первой альтернативой и остаётся.
const PAIR_OR_UNSTORABLE = /[\ud800-\udbff][\udc00-\udfff]|[\ud800-\udfff]|\u0000/g

function clip(value: string | undefined, max: number): string | undefined {
  if (!value) return undefined
  const clean = value.replace(PAIR_OR_UNSTORABLE, (m) => (m.length === 2 ? m : ''))
  if (clean.length <= max) return clean || undefined
  const cut = clean.slice(0, max)
  // Усечение не должно рвать суррогатную пару (эмодзи) на границе.
  const last = cut.charCodeAt(cut.length - 1)
  return last >= 0xd800 && last <= 0xdbff ? cut.slice(0, -1) : cut
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
        target: clip(a.interactionTarget, MAX_TARGET_CHARS),
        type: heaviestEventType(metric.entries) ?? a.interactionType,
        inputDelay: ms(a.inputDelay),
        processing: ms(a.processingDuration),
        presentation: ms(a.presentationDelay),
        // Клик во время загрузки — отдельная причина медленного INP.
        loadState: a.loadState,
        ...(script
          ? {
              scriptUrl: shortUrl(script.sourceURL),
              scriptInvoker: clip(script.invoker, MAX_INVOKER_CHARS),
              scriptDuration: ms(script.duration),
            }
          : {}),
      }
    }
    case 'LCP': {
      const a = metric.attribution
      return {
        target: clip(a.target, MAX_TARGET_CHARS),
        url: shortUrl(a.url),
        ttfb: ms(a.timeToFirstByte),
        loadDelay: ms(a.resourceLoadDelay),
        loadDuration: ms(a.resourceLoadDuration),
        renderDelay: ms(a.elementRenderDelay),
      }
    }
    case 'CLS':
      return { target: clip(metric.attribution.largestShiftTarget, MAX_TARGET_CHARS) }
    default:
      // FCP и TTFB: хватает значения и типа навигации.
      return {}
  }
}

/** Компактная meta события web_vital; всегда укладывается в лимит API. */
export function vitalMeta(metric: MetricWithAttribution): Record<string, unknown> {
  const base = {
    name: metric.name,
    // CLS — доля без единиц, остальные — миллисекунды.
    value: metric.name === 'CLS' ? Math.round(metric.value * 1000) / 1000 : ms(metric.value),
    rating: metric.rating,
    navigationType: metric.navigationType,
  }
  const meta = dropUndefined({ ...base, ...details(metric) })
  // Подстраховка: экранирование в JSON раздувает управляющие символы вшестеро.
  return JSON.stringify(meta).length <= WEB_VITAL_META_MAX_CHARS ? meta : base
}

export function reportWebVital(metric: MetricWithAttribution): void {
  trackEvent('web_vital', vitalMeta(metric))
}

let started = false

/** Только для тестов: флаг запуска модульный. */
export function resetWebVitalsForTests(): void {
  started = false
}

/**
 * Подписывается на метрики один раз за жизнь страницы (StrictMode и смена языка
 * перемонтируют layout). Не загрузился чанк (сеть, блокировщик) — страница
 * работает без RUM.
 */
export async function startWebVitals(): Promise<void> {
  if (started || typeof window === 'undefined') return
  started = true
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
