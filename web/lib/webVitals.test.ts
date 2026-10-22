import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MetricWithAttribution } from 'web-vitals/attribution'

vi.mock('web-vitals/attribution', () => ({
  onCLS: vi.fn(),
  onFCP: vi.fn(),
  onINP: vi.fn(),
  onLCP: vi.fn(),
  onTTFB: vi.fn(),
}))

import { onCLS, onFCP, onINP, onLCP, onTTFB } from 'web-vitals/attribution'
import { trackEvent } from './track'
import {
  WEB_VITAL_META_MAX_CHARS,
  notePage,
  reportWebVital,
  resetWebVitalsForTests,
  startWebVitals,
  vitalMeta,
} from './webVitals'

// Метрики собираются вручную: в jsdom нет Event Timing и LCP, а формирование
// meta зависит только от полей объекта метрики.
function metric(fields: Record<string, unknown>): MetricWithAttribution {
  return {
    delta: 0,
    id: 'v5-1',
    entries: [],
    rating: 'good',
    navigationType: 'navigate',
    attribution: {},
    ...fields,
  } as unknown as MetricWithAttribution
}

const origin = window.location.origin

function inp(attribution: Record<string, unknown>, entries: unknown[] = []) {
  return metric({
    name: 'INP',
    value: 311.6,
    rating: 'poor',
    entries,
    attribution: {
      interactionTarget: 'button.lj-btn',
      interactionType: 'pointer',
      inputDelay: 47.6,
      processingDuration: 190.2,
      presentationDelay: 73.8,
      loadState: 'complete',
      longAnimationFrameEntries: [],
      ...attribution,
    },
  })
}

beforeEach(() => {
  vi.mocked(trackEvent).mockClear()
  for (const fn of [onCLS, onFCP, onINP, onLCP, onTTFB]) vi.mocked(fn).mockClear()
  resetWebVitalsForTests()
})

afterEach(() => {
  window.history.replaceState(null, '', '/')
})

function goTo(path: string) {
  window.history.pushState(null, '', path)
}

describe('vitalMeta', () => {
  it('INP: селектор, тип события, подфазы и главный скрипт LoAF', () => {
    const meta = vitalMeta(
      inp(
        {
          longestScript: {
            entry: {
              sourceURL: `${origin}/_next/static/chunks/app.js?v=123#x`,
              invoker: 'BUTTON.onclick',
              duration: 176.4,
            },
            subpart: 'processing-duration',
            intersectingDuration: 170,
          },
        },
        [
          { name: 'pointerdown', processingStart: 10, processingEnd: 12 },
          { name: 'click', processingStart: 20, processingEnd: 200 },
        ],
      ),
    )
    expect(meta).toEqual({
      name: 'INP',
      value: 312,
      rating: 'poor',
      navigationType: 'navigate',
      target: 'button.lj-btn',
      type: 'click',
      inputDelay: 48,
      processing: 190,
      presentation: 74,
      loadState: 'complete',
      scriptUrl: '/_next/static/chunks/app.js',
      scriptInvoker: 'BUTTON.onclick',
      scriptDuration: 176,
    })
  })

  it('INP без записей и без LoAF: тип — из атрибуции, полей скрипта нет', () => {
    const meta = vitalMeta(inp({}))
    expect(meta.type).toBe('pointer')
    expect(meta).not.toHaveProperty('scriptUrl')
    expect(meta).not.toHaveProperty('scriptInvoker')
  })

  it('селектор — хвост до 100 символов целыми звеньями: сам элемент важнее предков', () => {
    // web-vitals строит селектор как «предок>…>элемент».
    const chain = `html>body>${'section.long-class-name>'.repeat(20)}button.lj-btn`
    const meta = vitalMeta(inp({ interactionTarget: chain }))
    const target = meta.target as string
    expect(target.length).toBeLessThanOrEqual(100)
    expect(target).toMatch(/^(section\.long-class-name>)+button\.lj-btn$/)
    const cls = vitalMeta(
      metric({ name: 'CLS', value: 0.2, attribution: { largestShiftTarget: chain } }),
    )
    expect(cls.target).toBe(target)
    const lcp = vitalMeta(
      metric({
        name: 'LCP',
        value: 1000,
        attribution: {
          target: `${'div.wrap>'.repeat(20)}img.hero`,
          timeToFirstByte: 0,
          resourceLoadDelay: 0,
          resourceLoadDuration: 0,
          elementRenderDelay: 0,
        },
      }),
    )
    expect(lcp.target).toMatch(/^(div\.wrap>)+img\.hero$/)
    expect((lcp.target as string).length).toBeLessThanOrEqual(100)
    // Короткий селектор — как есть.
    expect(vitalMeta(inp({ interactionTarget: 'main>button' })).target).toBe('main>button')
  })

  it('url скрипта до 80 без query, invoker-не-адрес до 60', () => {
    const meta = vitalMeta(
      inp({
        longestScript: {
          entry: {
            sourceURL: `https://mc.yandex.ru/${'a'.repeat(200)}.js?token=secret`,
            invokerType: 'event-listener',
            invoker: `BUTTON#${'b'.repeat(200)}.onclick`,
            duration: 50,
          },
        },
      }),
    )
    expect((meta.scriptUrl as string).length).toBe(80)
    expect(meta.scriptUrl).toMatch(/^https:\/\/mc\.yandex\.ru\/a+$/)
    expect((meta.scriptInvoker as string).length).toBe(60)
  })

  it('invoker-адрес скрипта — без query и hash: токены заказа и метки не уходят', () => {
    const invokerOf = (invokerType: string, invoker: string) =>
      vitalMeta(
        inp({ longestScript: { entry: { sourceURL: '', invokerType, invoker, duration: 60 } } }),
      ).scriptInvoker
    // Инлайн-скрипт: invoker — адрес самой страницы.
    expect(invokerOf('classic-script', `${origin}/order/77?new=1#t=secret-token`)).toBe('/order/77')
    expect(invokerOf('module-script', 'https://cdn.example.com/m.js?utm_source=ya&yclid=123')).toBe(
      'https://cdn.example.com/m.js',
    )
    // Любой invoker, который сам по себе http(s)-адрес.
    expect(invokerOf('user-callback', 'https://example.com/x.js?yclid=1#h')).toBe(
      'https://example.com/x.js',
    )
    // Адрес в [src=…] у обработчика события элемента.
    expect(invokerOf('event-listener', 'IMG[src=https://example.com/a.png?token=abc].onload')).toBe(
      'IMG[src=https://example.com/a.png].onload',
    )
    expect(invokerOf('event-listener', 'IMG[src=/img/x.png?v=1#y].onerror')).toBe(
      'IMG[src=/img/x.png].onerror',
    )
    expect(invokerOf('user-callback', 'Window.setTimeout')).toBe('Window.setTimeout')
  })

  it('не рвёт суррогатную пару при усечении и выкидывает NUL и одиночные суррогаты', () => {
    // API отвергает одиночные суррогаты и NUL (jsonb) — всё событие пропало бы.
    const target = `tail🧪${'a'.repeat(99)}`
    const meta = vitalMeta(inp({ interactionTarget: target }))
    expect(meta.target).toBe('a'.repeat(99))
    const dirty = vitalMeta(inp({ interactionTarget: 'a\u0000b\ud83dc' }))
    expect(dirty.target).toBe('abc')
  })

  it('LCP: элемент, адрес ресурса без query и подфазы', () => {
    const meta = vitalMeta(
      metric({
        name: 'LCP',
        value: 2480.4,
        rating: 'needs-improvement',
        attribution: {
          target: 'img.hero',
          url: `${origin}/img/hero.webp?v=2`,
          timeToFirstByte: 401.2,
          resourceLoadDelay: 120.5,
          resourceLoadDuration: 900.4,
          elementRenderDelay: 1058.3,
        },
      }),
    )
    expect(meta).toEqual({
      name: 'LCP',
      value: 2480,
      rating: 'needs-improvement',
      navigationType: 'navigate',
      target: 'img.hero',
      url: '/img/hero.webp',
      ttfb: 401,
      loadDelay: 121,
      loadDuration: 900,
      renderDelay: 1058,
    })
  })

  it('LCP через next/image: адрес — сама картинка из параметра url', () => {
    const meta = vitalMeta(
      metric({
        name: 'LCP',
        value: 1000,
        attribution: {
          url: `${origin}/_next/image?url=%2Fimg%2Fbanners%2Fkit.webp%3Fv%3D3&w=1080&q=75`,
          timeToFirstByte: 0,
          resourceLoadDelay: 0,
          resourceLoadDuration: 0,
          elementRenderDelay: 0,
        },
      }),
    )
    expect(meta.url).toBe('/img/banners/kit.webp')
  })

  it('LCP-текст без ресурса и data:-картинка не тащат лишнего', () => {
    const text = vitalMeta(
      metric({
        name: 'LCP',
        value: 900,
        attribution: {
          target: 'h1',
          timeToFirstByte: 0,
          resourceLoadDelay: 0,
          resourceLoadDuration: 0,
          elementRenderDelay: 0,
        },
      }),
    )
    expect(text).not.toHaveProperty('url')
    const inline = vitalMeta(
      metric({
        name: 'LCP',
        value: 900,
        attribution: {
          url: `data:image/png;base64,${'A'.repeat(5000)}`,
          timeToFirstByte: 0,
          resourceLoadDelay: 0,
          resourceLoadDuration: 0,
          elementRenderDelay: 0,
        },
      }),
    )
    expect(inline.url).toBe('data:')
  })

  it('FCP и TTFB: только значение, оценка и тип навигации', () => {
    expect(
      vitalMeta(
        metric({
          name: 'FCP',
          value: 1234.5,
          navigationType: 'reload',
          attribution: { timeToFirstByte: 300, firstByteToFCP: 934, loadState: 'dom-interactive' },
        }),
      ),
    ).toEqual({ name: 'FCP', value: 1235, rating: 'good', navigationType: 'reload' })
    expect(
      vitalMeta(
        metric({
          name: 'TTFB',
          value: 412.4,
          attribution: { waitingDuration: 1, dnsDuration: 2, requestDuration: 300 },
        }),
      ),
    ).toEqual({ name: 'TTFB', value: 412, rating: 'good', navigationType: 'navigate' })
  })

  it('CLS: значение с тремя знаками и элемент самого крупного сдвига', () => {
    expect(
      vitalMeta(
        metric({ name: 'CLS', value: 0.123456, attribution: { largestShiftTarget: 'div.banner' } }),
      ),
    ).toEqual({
      name: 'CLS',
      value: 0.123,
      rating: 'good',
      navigationType: 'navigate',
      target: 'div.banner',
    })
  })

  it('meta всегда укладывается в лимит API — иначе остаются только базовые поля', () => {
    // Управляющие символы в JSON раздуваются вшестеро (\u0001).
    const noisy = '\u0001'.repeat(200)
    const meta = vitalMeta(
      inp({
        interactionTarget: noisy,
        loadState: noisy,
        longestScript: { entry: { sourceURL: noisy, invoker: noisy, duration: 1 } },
      }),
    )
    expect(JSON.stringify(meta).length).toBeLessThanOrEqual(WEB_VITAL_META_MAX_CHARS)
    expect(meta).toEqual({ name: 'INP', value: 312, rating: 'poor', navigationType: 'navigate' })
    expect(WEB_VITAL_META_MAX_CHARS).toBe(1000)
  })
})

describe('reportWebVital', () => {
  it('отправляет метрику через trackEvent с типом web_vital и страницей входа', async () => {
    goTo('/catalog')
    await startWebVitals()
    const m = metric({ name: 'TTFB', value: 99.6 })
    reportWebVital(m)
    expect(trackEvent).toHaveBeenCalledTimes(1)
    expect(trackEvent).toHaveBeenCalledWith('web_vital', vitalMeta(m, '/catalog'))
    expect(vi.mocked(trackEvent).mock.calls[0]![1]).toMatchObject({ page: '/catalog' })
  })

  it('TTFB, FCP, LCP и CLS относятся к странице входа, даже если сайт уже ушёл дальше', async () => {
    goTo('/catalog')
    await startWebVitals()
    // Переход внутри сайта: trackEvent проставит path уже новой страницы.
    goTo('/product/kit')
    notePage('/product/kit', 1000)
    for (const name of ['TTFB', 'FCP', 'LCP', 'CLS']) {
      reportWebVital(metric({ name, value: 1, attribution: {} }))
    }
    const pages = vi.mocked(trackEvent).mock.calls.map(([, meta]) => meta?.page)
    expect(pages).toEqual(['/catalog', '/catalog', '/catalog', '/catalog'])
  })

  it('INP — страница, открытая в момент взаимодействия', async () => {
    goTo('/catalog')
    await startWebVitals()
    notePage('/product/kit', 1000)
    notePage('/cart', 2000)
    const pageOf = (interactionTime: number) => {
      vi.mocked(trackEvent).mockClear()
      reportWebVital(inp({ interactionTime }))
      return vi.mocked(trackEvent).mock.calls[0]![1]?.page
    }
    expect(pageOf(500)).toBe('/catalog')
    expect(pageOf(1500)).toBe('/product/kit')
    expect(pageOf(2500)).toBe('/cart')
  })

  it('INP в админке не отправляется', async () => {
    goTo('/catalog')
    await startWebVitals()
    notePage('/admin/orders', 1000)
    reportWebVital(inp({ interactionTime: 1500 }))
    expect(trackEvent).not.toHaveBeenCalled()
    // Клик, сделанный ещё на витрине, уходит.
    reportWebVital(inp({ interactionTime: 900 }))
    expect(trackEvent).toHaveBeenCalledWith(
      'web_vital',
      expect.objectContaining({ name: 'INP', page: '/catalog' }),
    )
  })
})

describe('startWebVitals', () => {
  it('подписывается на пять метрик с атрибуцией, только финальные значения', async () => {
    await startWebVitals()
    for (const fn of [onCLS, onFCP, onINP, onLCP, onTTFB]) {
      expect(fn).toHaveBeenCalledTimes(1)
      expect(fn).toHaveBeenCalledWith(reportWebVital, { reportAllChanges: false })
    }
  })

  it('повторный запуск (StrictMode, смена языка) не дублирует подписки', async () => {
    await startWebVitals()
    await startWebVitals()
    expect(onINP).toHaveBeenCalledTimes(1)
  })

  it('на входе в админку web-vitals не грузится и ничего не шлёт', async () => {
    goTo('/admin/orders')
    await startWebVitals()
    expect(onINP).not.toHaveBeenCalled()
    expect(onLCP).not.toHaveBeenCalled()
  })

  it('отчёт подписки уходит событием web_vital', async () => {
    await startWebVitals()
    const report = vi.mocked(onLCP).mock.calls[0]![0] as (m: MetricWithAttribution) => void
    report(metric({ name: 'LCP', value: 1500, attribution: { target: 'img' } }))
    expect(trackEvent).toHaveBeenCalledWith(
      'web_vital',
      expect.objectContaining({ name: 'LCP', value: 1500, target: 'img' }),
    )
  })
})
